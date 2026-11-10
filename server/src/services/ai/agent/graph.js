/**
 * Multi-agent concierge built on LangGraph (@langchain/langgraph).
 *
 *   router ─┬─ route   → search ─┬─ (no seats) → planner ─┐
 *           │                    └─ personal (signed in) ─┤
 *           ├─ account ──────────────────────────────────┤→ reviewer → END
 *           └─ policy  ──────────────────────────────────┘
 *
 * Every specialist is a node that can only call the same validated tools as the single-agent assistant
 * (tools.js). No node books, pays, cancels or locks seats. The reviewer node checks that the final
 * reply is grounded in tool output and drops cards for an empty result. Works without any LLM key.
 */
const { StateGraph, Annotation, START, END } = require("@langchain/langgraph");
const { runTool } = require("./tools");
const { parseQueryLocal } = require("../localEngine");

const concat = (a, b) => (a || []).concat(b || []);
const keep = (_a, b) => b;

const State = Annotation.Root({
  question: Annotation({ reducer: keep, default: () => "" }),
  user: Annotation({ reducer: keep, default: () => null }),
  deps: Annotation({ reducer: keep, default: () => null }),
  intent: Annotation({ reducer: keep, default: () => "policy" }),
  query: Annotation({ reducer: keep, default: () => ({}) }),
  found: Annotation({ reducer: keep, default: () => null }),
  reply: Annotation({ reducer: keep, default: () => "" }),
  cards: Annotation({ reducer: concat, default: () => [] }),
  finalCards: Annotation({ reducer: keep, default: () => [] }),
  action: Annotation({ reducer: keep, default: () => null }),
  trace: Annotation({ reducer: concat, default: () => [] }),
});

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const hour = (h) => `${Number(h) % 12 === 0 ? 12 : Number(h) % 12} ${Number(h) >= 12 ? "PM" : "AM"}`;

async function use(state, name, args) {
  const out = await runTool(name, args, { user: state.user, deps: state.deps });
  return out;
}

/* ───────── nodes ───────── */

function router(state) {
  const q = state.question.toLowerCase();
  const parsed = parseQueryLocal(state.question);
  let intent = "policy";
  if (/\b(my|mera|meri|mere)\b.*\b(booking|bookings|ticket|tickets|trips?|refund|cancel\w*)\b/.test(q)) intent = "account";
  else if (parsed.from || parsed.to || /\b(bus|buses|seat|seats|cheapest|fastest|sasta|jaldi)\b/.test(q)) intent = "route";
  return { intent, query: parsed, trace: [`router:${intent}`] };
}

async function search(state) {
  const p = state.query;
  if (!p.from || !p.to) {
    return { reply: p.clarificationNeeded || "Which cities are you travelling between, and on what date?", found: { total: 0, clarify: true }, trace: ["search:needs-route"] };
  }
  const out = await use(state, "search_buses", {
    from: p.from, to: p.to, date: p.date || undefined, maxPrice: p.maxPrice ?? undefined,
    busType: p.busType, seatType: p.seatType, departureWindows: p.departureWindows, sortBy: p.sortBy || undefined,
  });
  if (out.data.error) return { reply: out.data.error, found: { total: 0, error: true }, trace: ["search:error"] };
  const open = out.data.buses.filter((b) => b.seatsAvailable > 0);
  return { found: { ...out.data, buses: open, total: open.length, from: p.from, to: p.to, date: out.data.date }, cards: out.card ? [out.card] : [], trace: [`search:${open.length}`] };
}

async function planner(state) {
  const { from, to, date } = state.found;
  const out = await use(state, "find_journey", { from, to, date });
  if (out.data.error) return { reply: out.data.error, trace: ["planner:error"] };
  return { reply: out.data.summary, cards: out.card ? [out.card] : [], trace: [`planner:${out.data.connections?.length || 0}-connections`] };
}

async function personal(state) {
  const { from, to, date } = state.found;
  const out = await use(state, "personal_picks", { from, to, date });
  if (out.data.error || !out.data.picks?.length) return { trace: ["personal:skipped"] };
  const top = out.data.picks[0];
  const why = top.reasons?.length ? `: ${top.reasons.join(", ")}` : "";
  return { reply: `My top pick for you is ${top.operator} at ${hour(top.departure)}, ${rupees(top.price)}${why}.`, cards: out.card ? [out.card] : [], trace: ["personal:ranked"] };
}

async function account(state) {
  if (!state.user) return { reply: "Please sign in first, then I can look at your bookings.", trace: ["account:guest"] };
  const mine = await use(state, "get_my_bookings", {});
  const target = (mine.data.bookings || []).find((b) => b.status === "CONFIRMED");
  if (!/refund|cancel|radd|paisa/.test(state.question.toLowerCase())) {
    return { reply: mine.data.bookings?.length ? `Here are your latest ${mine.data.bookings.length} bookings.` : "You have no bookings yet.", cards: mine.card ? [mine.card] : [], trace: ["account:list"] };
  }
  if (!target) return { reply: "You have no confirmed booking that can be cancelled right now.", trace: ["account:none"] };
  const out = await use(state, "refund_preview", { orderId: target.orderId });
  if (out.data.error) return { reply: out.data.error, trace: ["account:error"] };
  const reply = out.data.cancellable
    ? `If you cancel ${out.data.route} now, you get back ${rupees(out.data.net)} (${out.data.percent}% of ${rupees(out.data.totalPaid)}). You can cancel from My Tickets.`
    : `${out.data.route} can't be cancelled any more: ${out.data.reason}.`;
  return { reply, cards: out.card ? [out.card] : [], action: out.action || null, trace: ["account:refund"] };
}

async function policy(state) {
  const out = await use(state, "policy_lookup", { question: state.question });
  if (!out.data.found) return { reply: "I don't have that in RaahiGo's notes, so I won't guess. Try a route like “Delhi to Jaipur tomorrow” or “how do refunds work?”.", trace: ["policy:none"] };
  const text = (out.data.policies[0].content.match(/[^.!?]+[.!?]+/g) || [out.data.policies[0].content]).slice(0, 3).join(" ").trim();
  return { reply: text, cards: out.card ? [out.card] : [], trace: ["policy:found"] };
}

/** Last gate: no reply without grounding, and no cards that contradict an empty result. */
function reviewer(state) {
  let { reply, cards } = state;
  if (!reply) {
    reply = state.found?.total > 0
      ? `${state.found.total} bus${state.found.total > 1 ? "es" : ""} from ${state.found.from} to ${state.found.to}. ${state.found.buses[0].operator} at ${hour(state.found.buses[0].departure)} for ${rupees(state.found.buses[0].price)} is first.`
      : "I couldn't find anything for that. Could you rephrase?";
  }
  if (state.found && state.found.total === 0) cards = cards.filter((c) => c.type === "journeys");
  return { reply, finalCards: cards, trace: ["reviewer:ok"] };
}

/* ───────── wiring ───────── */

function afterSearch(state) {
  if (state.found?.clarify || state.found?.error) return "reviewer";
  if (state.found.total === 0) return "planner";
  return state.user ? "personal" : "reviewer";
}

function build() {
  return new StateGraph(State)
    .addNode("router", router)
    .addNode("search", search)
    .addNode("planner", planner)
    .addNode("personal", personal)
    .addNode("account", account)
    .addNode("policy", policy)
    .addNode("reviewer", reviewer)
    .addEdge(START, "router")
    .addConditionalEdges("router", (s) => ({ route: "search", account: "account", policy: "policy" }[s.intent]), ["search", "account", "policy"])
    .addConditionalEdges("search", afterSearch, ["planner", "personal", "reviewer"])
    .addEdge("planner", "reviewer")
    .addEdge("personal", "reviewer")
    .addEdge("account", "reviewer")
    .addEdge("policy", "reviewer")
    .addEdge("reviewer", END)
    .compile();
}

let compiled;
async function runWorkflow({ question, user = null, deps }) {
  const text = typeof question === "string" ? question.trim().slice(0, 500) : "";
  if (!text) { const e = new Error("A question is required"); e.status = 400; throw e; }
  compiled = compiled || build();
  const out = await compiled.invoke({ question: text, user, deps });
  return { reply: out.reply, cards: out.finalCards, action: out.action, trace: out.trace, engine: "langgraph" };
}

module.exports = { runWorkflow, build };
