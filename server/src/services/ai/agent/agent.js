/**
 * RaahiGo travel assistant: a bounded tool-calling agent.
 *
 *   • With ANTHROPIC_API_KEY it runs a real tool-use loop: the model decides which tools to call,
 *     the server validates and runs them, and the model writes the final answer from the results.
 *   • Without a key (or if the model is unreachable) a deterministic planner chooses the same tools
 *     from the message, so the assistant still works and behaves the same way.
 *
 * Either way: at most MAX_STEPS tool rounds, every tool validates its input, nothing is ever booked,
 * paid or cancelled here (see tools.js), and the cards returned to the UI come from tool results,
 * never from model text.
 */
const { callLLMWithTools, isAIEnabled } = require("../llmClient");
const { parseQueryLocal } = require("../localEngine");
const { localISO } = require("../searchParser");
const { toolSpecs, runTool, defaultDeps } = require("./tools");

const MAX_STEPS = 5;
const MAX_MESSAGES = 8;
const MAX_CHARS = 500;

function systemPrompt({ signedIn }) {
  return `You are RaahiGo's travel assistant for an Indian intercity bus booking app. Today is ${localISO(new Date())}.

You help travellers find buses, compare options, plan connections when there is no direct bus, understand their bookings and refunds, and answer policy questions.

Rules:
- Use tools for every fact about buses, seats, prices, bookings and policies. Never invent a bus, price, time, seat or policy. If a tool returns nothing, say so.
- You cannot book, pay for or cancel anything. To hold seats call propose_seat_hold; the traveller confirms with a button. For cancellation, call refund_preview and tell them to cancel from My Tickets.
- ${signedIn ? "The traveller is signed in, so personal tools work." : "The traveller is not signed in. If they ask about their bookings, refunds or seats, ask them to sign in first."}
- Reply in the traveller's language (English, Hindi or Hinglish), in 1 to 4 short sentences. The UI already shows bus cards, so do not list every bus again; point out the one or two that matter and why.
- If a city is missing or unclear, ask one short question.`;
}

/** Cleans client-supplied history: roles and lengths are enforced, nothing else is trusted. */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }));
}

/* ───────────────────────── LLM loop ───────────────────────── */

async function runWithLLM(history, ctx) {
  const tools = toolSpecs({ signedIn: Boolean(ctx.user) });
  const convo = history.map((m) => ({ role: m.role, content: m.content }));
  const cards = [];
  const toolCalls = [];
  let action = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await callLLMWithTools({ system: systemPrompt({ signedIn: Boolean(ctx.user) }), messages: convo, tools, maxTokens: 700 });
    const uses = turn.content.filter((b) => b.type === "tool_use");
    const text = turn.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

    if (!uses.length) return { reply: text || "I couldn't find an answer to that. Could you rephrase?", cards, action, toolCalls, engine: "llm" };

    convo.push({ role: "assistant", content: turn.content });
    const results = [];
    for (const use of uses) {
      const out = await runTool(use.name, use.input, ctx);
      toolCalls.push(use.name);
      if (out.card) cards.push(out.card);
      if (out.action) action = out.action;
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(out.data).slice(0, 6000) });
    }
    convo.push({ role: "user", content: results });
  }
  return { reply: "That took more steps than I can do in one go. Could you narrow it down, for example with a route and a date?", cards, action, toolCalls, engine: "llm" };
}

/* ───────────────────────── built-in planner ───────────────────────── */

const hourLabel = (h) => `${Number(h) % 12 === 0 ? 12 : Number(h) % 12} ${Number(h) >= 12 ? "PM" : "AM"}`;
const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

/** Newest route mentioned in the conversation, so "cheapest one?" works after "Delhi to Jaipur". */
function routeFromHistory(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const p = parseQueryLocal(history[i].content);
    if (p.from && p.to) return p;
  }
  return null;
}

async function runLocal(history, ctx) {
  const last = history[history.length - 1]?.content || "";
  const q = last.toLowerCase();
  const cards = [];
  const toolCalls = [];
  let action = null;
  const call = async (name, args) => {
    const out = await runTool(name, args, ctx);
    toolCalls.push(name);
    if (out.card) cards.push(out.card);
    if (out.action) action = out.action;
    return out.data;
  };
  const done = (reply) => ({ reply, cards, action, toolCalls, engine: "smart" });
  const signIn = "Please sign in first, then I can look at your bookings.";

  // 1. Refunds / cancelling a booking the traveller already has.
  if (/\b(refund|cancel|cancellation|radd|paisa wapas)\b/.test(q) && /\b(my|mera|meri|mere)\b/.test(q)) {
    if (!ctx.user) return done(signIn);
    const mine = await call("get_my_bookings", {});
    const target = (mine.bookings || []).find((b) => b.status === "CONFIRMED");
    if (!target) return done("You have no confirmed booking that can be cancelled right now.");
    cards.length = 0;
    const view = await call("refund_preview", { orderId: target.orderId });
    if (view.error) return done(view.error);
    if (!view.cancellable) return done(`${view.route} can't be cancelled any more: ${view.reason}.`);
    return done(`If you cancel ${view.route} now, you get back ${rupees(view.net)} (${view.percent}% of ${rupees(view.totalPaid)}). You can cancel from My Tickets.`);
  }

  // 2. "Show my bookings".
  if (/\b(my|mera|meri|mere)\b.*\b(booking|bookings|ticket|tickets|trips?)\b/.test(q)) {
    if (!ctx.user) return done(signIn);
    const mine = await call("get_my_bookings", {});
    return done(mine.bookings?.length ? `Here are your latest ${mine.bookings.length} bookings.` : "You have no bookings yet.");
  }

  // 3. Searching for buses (also follow-ups like "cheapest one?" on the route already discussed).
  const parsed = parseQueryLocal(last);
  const remembered = !parsed.from || !parsed.to ? routeFromHistory(history.slice(0, -1)) : null;
  const from = parsed.from || remembered?.from;
  const to = parsed.to || remembered?.to;
  const looksLikeSearch = parsed.from || parsed.to || /\b(bus|buses|seat|seats|cheapest|fastest|sasta|jaldi|ticket for|book)\b/.test(q);

  if (looksLikeSearch) {
    if (!from || !to) return done(parsed.clarificationNeeded || "Which cities are you travelling between, and on what date?");
    const date = parsed.date || remembered?.date || undefined;
    const base = {
      from, to, date,
      maxPrice: parsed.maxPrice ?? undefined,
      busType: parsed.busType, seatType: parsed.seatType,
      departureWindows: parsed.departureWindows,
      sortBy: parsed.sortBy || undefined,
    };

    const wantsPersonal = ctx.user && /\b(for me|suggest|recommend|best|mere liye|choose)\b/.test(q);
    const found = await call(wantsPersonal ? "personal_picks" : "search_buses", wantsPersonal ? { from, to, date } : base);
    if (found.error) { cards.length = 0; return done(found.error); }

    const list = found.buses || found.picks || [];
    const open = list.filter((b) => b.seatsAvailable > 0);
    if (!open.length) {
      cards.length = 0;
      const plan = await call("find_journey", { from, to, date });
      if (plan.error) return done(plan.error);
      return done(plan.summary + (plan.connections?.length ? " Here are the options." : ""));
    }
    const top = open[0];
    const lead = wantsPersonal && top.reasons?.length ? `My top pick is ${top.operator} at ${hourLabel(top.departure)}, ${rupees(top.price)}: ${top.reasons.join(", ")}.` : `${found.total ?? open.length} bus${(found.total ?? open.length) > 1 ? "es" : ""} from ${from} to ${to}. ${top.operator} at ${hourLabel(top.departure)} for ${rupees(top.price)} is first.`;
    return done(lead);
  }

  // 4. Everything else is a policy / how-it-works question.
  const policy = await call("policy_lookup", { question: last });
  if (!policy.found) {
    cards.length = 0;
    return done("I can search buses, plan connections, show your bookings and refunds, and answer RaahiGo policy questions. I don't have that one in my notes, so I won't guess. Try “Delhi to Jaipur tomorrow” or “how do refunds work?”.");
  }
  const firstTwo = (text) => (text.match(/[^.!?]+[.!?]+/g) || [text]).slice(0, 3).join(" ").trim();
  return done(firstTwo(policy.policies[0].content));
}

/**
 * @param {object} p
 * @param {{role:string,content:string}[]} p.messages
 * @param {object|null} p.user decoded JWT user, or null for a guest
 * @param {object} [p.deps] injected services (tests)
 */
async function runAssistant({ messages, user = null, deps = null }) {
  const history = sanitizeMessages(messages);
  if (!history.length || history[history.length - 1].role !== "user") {
    const err = new Error("A user message is required");
    err.status = 400;
    throw err;
  }
  const ctx = { user, deps: deps || defaultDeps() };

  if (isAIEnabled()) {
    try {
      return await runWithLLM(history, ctx);
    } catch (err) {
      // Model unreachable or misbehaving: fall back to the built-in planner rather than failing.
    }
  }
  return runLocal(history, ctx);
}

module.exports = { runAssistant, sanitizeMessages, MAX_STEPS };
