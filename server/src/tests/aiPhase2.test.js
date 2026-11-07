/**
 * Phase 2 tests: LangGraph multi-agent workflow and operator insights. Fake deps, no DB, no network.
 * Run with: node src/tests/aiPhase2.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase2-test-secret";
const { runWorkflow } = require("../services/ai/agent/graph");
const { insightsFor } = require("../services/ai/operatorInsights");
const { addDaysISO } = require("../services/ai/journeyPlanner");
const { decorate, bookedSeatsForDate } = require("../services/busSearch.service");

let passed = 0, failed = 0;
const assert = (c, l) => { if (c) { console.log(`  ✓ ${l}`); passed++; } else { console.error(`  ✗ ${l}`); failed++; } };
const id = (n) => String(n).padStart(24, "0");
const D = addDaysISO(new Date().toISOString().slice(0, 10), 3);
const bus = (n, from, to, dep, arr, price, op) => ({ _id: id(n), companyname: op || `Op${n}`, from, to, departure: String(dep), arrival: String(arr), price, rating: 4, aminites: ["AC"], seats: [], status: "ACTIVE" });

async function run() {
  console.log("\nLangGraph workflow");
  const buses = [bus(1, "Delhi", "Jaipur", 9, 14, 400, "RedLine"), bus(2, "Delhi", "Jaipur", 22, 4, 300, "NightOwl")];
  const mk = (list) => ({
    searchBuses: async (p) => ({ buses: list.filter((b) => b.from === p.from && b.to === p.to).map((b) => decorate(b, p.date)), pagination: { total: list.length } }),
    bookedSeatsForDate, decorate, findBus: async () => null, allBuses: async () => list,
    recentOrders: async () => [{ _id: id(9), status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur", name: "RedLine" }, ticketSummary: { date: D, ticket: "4" }, bus: id(1) }],
    findOrder: async (o, u) => (o === id(9) && u === "u1" ? { _id: id(9), status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur" }, ticketSummary: { date: D } } : null),
    previewCancellation: async () => ({ cancellable: true, percent: 90, totalPaid: 500, refundable: 450, fee: 50, net: 450 }),
    userPreferences: async () => ({}), pastBuses: async () => [],
  });

  let r = await runWorkflow({ question: `Delhi to Jaipur ${D}`, deps: mk(buses) });
  assert(r.engine === "langgraph", "reports the langgraph engine");
  assert(r.trace[0] === "router:route" && r.trace.includes("search:2") && r.trace.at(-1) === "reviewer:ok", "guest route search goes router, search, reviewer");
  assert(!r.trace.some((t) => t.startsWith("personal")), "guests never reach the personal agent");
  assert(r.cards.filter((c) => c.type === "buses").length === 1 && /2 buses/.test(r.reply), "exactly one buses card and a grounded reply");

  r = await runWorkflow({ question: `Delhi to Jaipur ${D}`, user: { _id: "u1" }, deps: mk(buses) });
  assert(r.trace.includes("personal:ranked"), "signed-in travellers get the personal agent");

  const soldOut = { ...mk(buses), searchBuses: async (p) => ({ buses: buses.map((b) => decorate({ ...b, seats: [`${p.date}@${Array.from({ length: 30 }, (_, i) => i + 1).join(",")}@M`] }, p.date)), pagination: { total: 2 } }) };
  r = await runWorkflow({ question: `Delhi to Jaipur ${D}`, deps: soldOut });
  assert(r.trace.some((t) => t.startsWith("planner")), "a sold-out route is handed to the journey planner");
  assert(!r.cards.some((c) => c.type === "buses"), "the reviewer drops an empty bus card");

  r = await runWorkflow({ question: "how do refunds work?", deps: mk(buses) });
  assert(r.trace.includes("policy:found") && r.cards.some((c) => c.type === "sources"), "policy questions use the policy agent with sources");

  r = await runWorkflow({ question: "what is the airspeed of a swallow", deps: mk(buses) });
  assert(r.trace.includes("policy:none") && /won't guess/.test(r.reply), "unknown questions get an honest 'won't guess'");

  r = await runWorkflow({ question: "refund my ticket", deps: mk(buses) });
  assert(/sign in/i.test(r.reply), "account questions from guests ask to sign in");
  r = await runWorkflow({ question: "refund my ticket", user: { _id: "u1" }, deps: mk(buses) });
  assert(r.action?.type === "open_cancel" && r.cards.some((c) => c.type === "refund"), "refund preview proposes an action, it never cancels");
  r = await runWorkflow({ question: "refund my ticket", user: { _id: "other" }, deps: { ...mk(buses), recentOrders: async () => [] } });
  assert(/no confirmed booking/.test(r.reply), "no booking means nothing to cancel");

  r = await runWorkflow({ question: "buses please", deps: mk(buses) });
  assert(/cities|where/i.test(r.reply), "a route-less search asks for cities");
  let threw = false;
  try { await runWorkflow({ question: "  ", deps: mk(buses) }); } catch (e) { threw = e.status === 400; }
  assert(threw, "an empty question is rejected with 400");
  r = await runWorkflow({ question: "x".repeat(5000) + " refunds", deps: mk(buses) });
  assert(typeof r.reply === "string", "very long input is truncated, not fatal");

  console.log("\nOperator insights");
  const myBuses = [bus(1, "Delhi", "Jaipur", 9, 14, 400, "RedLine"), bus(2, "Delhi", "Agra", 8, 12, 300, "NightOwl"), bus(3, "Pune", "Goa", 7, 17, 900, "Idle")];
  assert(insightsFor({ buses: [], orders: [] }).insights.length === 0, "no buses gives no insights");
  let res = insightsFor({ buses: myBuses, orders: [{ bus: id(1), status: "CONFIRMED" }] });
  assert(res.insights.length === 0 && /Only 1 booking/.test(res.note), "too little data says so instead of inventing trends");

  const now = new Date();
  const o = (b, status, date, amount, ticket = "1,2") => ({ bus: id(b), status, createdAt: now, ticketSummary: { date, amount, ticket } });
  const orders = [
    ...Array.from({ length: 9 }, () => o(1, "CONFIRMED", "2026-11-09", 800)),
    ...Array.from({ length: 3 }, () => o(2, "CANCELLED", "2026-11-10", 600)),
    o(2, "CONFIRMED", "2026-11-09", 600), o(2, "CONFIRMED", "2026-11-09", 600),
  ];
  res = insightsFor({ buses: myBuses, orders, now });
  const types = res.insights.map((i) => i.type);
  assert(types.includes("cancellations"), "a bus with 3 of 5 cancelled is flagged");
  assert(res.insights.find((i) => i.type === "cancellations").evidence.cancelled === 3, "the flag carries its evidence");
  assert(res.insights.some((i) => i.type === "no-demand" && /Idle/.test(i.title)), "a bus with no recent bookings is flagged");
  assert(res.insights.some((i) => i.type === "revenue" && /RedLine/.test(i.title)), "the top route by revenue is named");
  assert(res.insights.some((i) => i.type === "demand-pattern" && /Monday/.test(i.title)), "the busiest travel weekday comes from real dates");
  assert(res.insights.every((i) => ["low", "medium", "high"].includes(i.confidence)), "every insight states its confidence");
  assert(res.insights.every((i) => !/will|guarantee/i.test(i.detail)), "no insight promises an outcome");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
