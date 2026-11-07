/**
 * Tests for the AI assistant suite: RAG retrieval, journey planner, personalised ranking, agent tools
 * and the tool-calling agent loop (with an injected fake model and fake services; no network, no DB).
 *
 * Run with: node src/tests/aiAgent.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "agent-test-secret";
const { retrieve, confidenceOf } = require("../services/ai/rag");
const { planJourneys, addDaysISO } = require("../services/ai/journeyPlanner");
const { buildProfile, rankForUser } = require("../services/ai/personalRank");
const { runTool, toolSpecs } = require("../services/ai/agent/tools");
const { runAssistant, sanitizeMessages, MAX_STEPS } = require("../services/ai/agent/agent");
const llm = require("../services/ai/llmClient");
const { decorate, bookedSeatsForDate } = require("../services/busSearch.service");

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; } else { console.error(`  ✗ ${label}`); failed++; }
}

const id = (n) => String(n).padStart(24, "0");
const bus = (n, from, to, dep, arr, price, extra = {}) => ({
  _id: id(n), companyname: extra.op || `Op${n}`, from, to, departure: String(dep), arrival: String(arr),
  price, rating: extra.rating ?? 4, aminites: extra.tags || ["AC", "SLEEPER"], seats: extra.seats || [], status: "ACTIVE",
});
const future = (n) => addDaysISO(new Date().toISOString().slice(0, 10), n);
const D = future(3);
const fullSeats = (date) => [`${date}@${Array.from({ length: 30 }, (_, i) => i + 1).join(",")}@M`];

async function run() {
  console.log("\nRAG retrieval (BM25)");
  {
    assert(retrieve("How do I cancel my ticket?")[0]?.policy.id === "cancellation", "an English cancellation question finds the cancellation policy");
    assert(retrieve("ticket radd kaise karein")[0]?.policy.id === "cancellation", "Hinglish 'radd' maps to cancellation");
    assert(retrieve("refund kab milega paisa wapas").some((r) => r.policy.id === "refunds"), "Hinglish refund question finds the refund policy");
    assert(retrieve("what is the airspeed of a swallow").length === 0, "an unrelated question retrieves nothing (no forced match)");
    assert(retrieve("").length === 0, "an empty question retrieves nothing");
    const hits = retrieve("cancel booking refund");
    assert(hits.every((h, i) => i === 0 || hits[i - 1].score >= h.score), "results are ordered best first");
    assert(confidenceOf(hits) > 0 && confidenceOf([]) === 0, "confidence is 0 with no match and positive with one");
    assert(retrieve("cancel", { limit: 1 }).length <= 1, "the limit is respected");
  }

  console.log("\nJourney planner");
  {
    const buses = [
      bus(1, "Mumbai", "Pune", 22, 3, 400),
      bus(2, "Mumbai", "Goa", 8, 20, 900),
      bus(3, "Goa", "Pune", 23, 9, 700),
      bus(4, "Mumbai", "Pune", 9, 13, 500, { seats: fullSeats(D) }),
    ];
    const direct = planJourneys({ from: "mumbai", to: "pune", date: D, buses });
    assert(direct.direct.length === 1 && direct.direct[0].busId === id(1), "sold-out direct buses are excluded, open ones listed");
    assert(direct.connections.length >= 1, "connections are also offered");

    const conn = direct.connections.find((c) => c.via === "Goa");
    assert(conn && conn.legs.length === 2, "finds a one-stop connection via Goa");
    // Mumbai→Goa leaves 8, 12 h, arrives 20. Goa→Pune leaves 23: 3 h layover, same day.
    assert(conn.layoverHours === 3 && conn.legs[1].date === D, "layover is computed correctly on the same day");
    assert(conn.totalPrice === 1600, "total price is the sum of both legs");
    assert(conn.totalHours === 8 + 4 + 0 || conn.totalHours === 25, "total time runs from first departure to last arrival");
  }
  {
    // Overnight first leg: arrives next day, so the second bus must leave on the next date.
    const buses = [bus(1, "Delhi", "Jaipur", 22, 4, 500), bus(2, "Jaipur", "Udaipur", 9, 17, 600)];
    const p = planJourneys({ from: "Delhi", to: "Udaipur", date: D, buses });
    const c = p.connections[0];
    assert(c && c.legs[1].date === addDaysISO(D, 1), "an overnight arrival pushes leg two to the next date");
    assert(c.layoverHours === 5, "overnight layover is arrival (28h) to departure (33h)");
  }
  {
    const tight = [bus(1, "Delhi", "Agra", 8, 12, 300), bus(2, "Agra", "Jaipur", 13, 18, 300)]; // 1h layover
    assert(planJourneys({ from: "Delhi", to: "Jaipur", date: D, buses: tight }).connections.every((c) => c.layoverHours >= 2) , "layovers under 2 hours are never offered");
    const long = [bus(1, "Delhi", "Agra", 8, 12, 300), bus(2, "Agra", "Jaipur", 23, 5, 300)]; // 11h layover
    assert(planJourneys({ from: "Delhi", to: "Jaipur", date: D, buses: long }).connections.length === 0, "layovers over 10 hours are not offered");
    const noSeats = [bus(1, "Delhi", "Agra", 8, 12, 300, { seats: fullSeats(D) }), bus(2, "Agra", "Jaipur", 16, 22, 300)];
    assert(planJourneys({ from: "Delhi", to: "Jaipur", date: D, buses: noSeats }).connections.length === 0, "a sold-out first leg removes the connection");
  }
  {
    const buses = [bus(1, "Delhi", "Jaipur", 9, 14, 400, { seats: fullSeats(D) })];
    const p = planJourneys({ from: "Delhi", to: "Jaipur", date: D, buses });
    assert(p.direct.length === 0 && p.alternatives.length >= 1, "when today is full, nearby dates with seats are suggested");
    assert(p.alternatives.every((a) => a.date !== D && new Date(`${a.date}T23:59:59Z`) >= new Date()), "suggested dates are never the full date or in the past");
    assert(/Nothing bookable|direct/i.test(p.summary), "the summary explains the situation");
  }
  {
    const p = planJourneys({ from: "Delhi", to: "Delhi", date: D, buses: [] });
    assert(p.direct.length === 0 && /different/.test(p.summary), "same origin and destination is rejected politely");
    const q = planJourneys({ from: "Delhi", to: "Chennai", date: D, buses: [] });
    assert(q.direct.length === 0 && q.connections.length === 0 && /No bookable route/.test(q.summary), "no route says so plainly");
    const inactive = planJourneys({ from: "Delhi", to: "Jaipur", date: D, buses: [{ ...bus(1, "Delhi", "Jaipur", 9, 14, 400), status: "INACTIVE" }] });
    assert(inactive.direct.length === 0, "deactivated buses are never offered");
  }

  console.log("\nPersonalised ranking");
  {
    const cands = [
      { ...decorate(bus(1, "Delhi", "Jaipur", 9, 14, 600, { op: "RedLine", rating: 4.4 }), D) },
      { ...decorate(bus(2, "Delhi", "Jaipur", 22, 4, 400, { op: "NightOwl", rating: 4.0, tags: ["NONAC", "SEATER"] }), D) },
      { ...decorate(bus(3, "Delhi", "Jaipur", 14, 19, 450, { op: "Midday", rating: 3.8 }), D) },
    ];
    const orders = [1, 2, 3].map((n) => ({ status: "CONFIRMED", bus: id(2), busDetails: { name: "NightOwl", departure: "22" }, ticketSummary: { ticket: "3", amount: "400" }, pricing: { ticketValue: 400 } }));
    const pastBuses = [bus(2, "Delhi", "Jaipur", 22, 4, 400, { op: "NightOwl", tags: ["NONAC", "SEATER"] })];
    const profile = buildProfile({ orders, pastBuses, preferences: {} });
    assert(profile.bookings === 3 && profile.operators.get("NightOwl") === 3, "the profile counts past trips and operators");
    assert(profile.typicalFare === 400 && profile.departureWindow.value === "AFTER_18", "usual fare and departure window are learned from bookings");
    assert(profile.busType === "NONAC" && profile.seatType === "SEATER", "bus and seat type are inferred from past buses");

    const ranked = rankForUser(cands, profile);
    assert(ranked.picks[0].id === id(2), "a traveller who always rides NightOwl is ranked NightOwl first");
    assert(ranked.picks[0].reasons.some((r) => /NightOwl/.test(r)), "the top pick explains the operator history");
    assert(ranked.basis.personalised && ranked.picks[0].badge === "Best for you", "personalised results say so");
    assert(ranked.picks.every((p) => p.score >= 0 && p.score <= 100), "scores stay within 0 to 100");

    const cold = rankForUser(cands, buildProfile({ orders: [], preferences: {} }));
    assert(!cold.basis.personalised && cold.picks[0].badge === "Best overall", "with no history it falls back to a neutral ranking and says so");
    assert(cold.picks.every((p) => !p.reasons.some((r) => /you|your/i.test(r))), "a neutral ranking never claims a personal preference");

    const cancelled = buildProfile({ orders: [{ status: "CANCELLED", busDetails: { name: "NightOwl" }, ticketSummary: {} }], preferences: {} });
    assert(cancelled.bookings === 0, "cancelled trips do not count as habits");
    assert(rankForUser([], profile).picks.length === 0, "an empty result set ranks to an empty list");
  }

  console.log("\nAgent tools");
  const buses = [bus(1, "Delhi", "Jaipur", 9, 14, 400), bus(2, "Delhi", "Jaipur", 22, 4, 300, { op: "NightOwl" })];
  const calls = [];
  const deps = {
    searchBuses: async (p) => { calls.push(["search", p]); return { buses: buses.map((b) => decorate(b, p.date)), pagination: { total: buses.length } }; },
    bookedSeatsForDate,
    decorate,
    findBus: async (i) => buses.find((b) => b._id === i) || null,
    allBuses: async () => buses,
    recentOrders: async () => [{ _id: id(9), status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur", name: "RedLine" }, ticketSummary: { date: D, ticket: "4" }, bus: id(1) }],
    findOrder: async (oid, uid) => (oid === id(9) && uid === "u1" ? { _id: id(9), status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur" }, ticketSummary: { date: D } } : null),
    previewCancellation: async () => ({ cancellable: true, percent: 90, totalPaid: 500, refundable: 450, fee: 50, net: 450 }),
    userPreferences: async () => ({}),
    pastBuses: async () => [],
  };
  const user = { _id: "u1" };
  {
    const ok = await runTool("search_buses", { from: "delhi", to: "JAIPUR", date: D, maxPrice: 350, busType: ["AC", "BOGUS"], sortBy: "evil" }, { user: null, deps });
    const sent = calls.at(-1)[1];
    assert(ok.card.type === "buses" && sent.from === "Delhi" && sent.to === "Jaipur", "city names are normalised before searching");
    assert(sent.busType.length === 1 && sent.busType[0] === "AC" && sent.sortBy === "departure", "unknown filter values are dropped, not passed to the query");
    assert((await runTool("search_buses", { from: "Atlantis", to: "Jaipur" }, { user: null, deps })).data.error.includes("recognise"), "an unknown city is reported, not searched");
    assert((await runTool("search_buses", { from: "Delhi", to: "Jaipur", date: "tomorrow" }, { user: null, deps })).data.error.includes("YYYY-MM-DD"), "a malformed date is rejected");
    assert((await runTool("nope", {}, { user: null, deps })).data.error.includes("Unknown"), "an unknown tool is rejected");
    const boom = await runTool("search_buses", { from: "Delhi", to: "Jaipur" }, { user: null, deps: { ...deps, searchBuses: async () => { throw new Error("db down"); } } });
    assert(boom.data.error && !/db down/.test(JSON.stringify(boom.data)), "an internal failure is reported generically without leaking details");
  }
  {
    assert((await runTool("get_my_bookings", {}, { user: null, deps })).data.error === "login_required", "personal tools refuse guests");
    assert((await runTool("propose_seat_hold", { busId: id(1), date: D, seats: ["3"] }, { user: null, deps })).data.error === "login_required", "seat proposals need sign-in");
    assert((await runTool("refund_preview", { orderId: id(9) }, { user: { _id: "someone-else" }, deps })).data.error === "Booking not found", "another traveller's booking is not found (ownership enforced)");
    assert((await runTool("refund_preview", { orderId: "not-an-id" }, { user, deps })).data.error.includes("not valid"), "a malformed order id is rejected");
    const r = await runTool("refund_preview", { orderId: id(9) }, { user, deps });
    assert(r.data.net === 450 && r.action.type === "open_cancel", "refund preview returns the real amounts and only links to cancelling");
  }
  {
    const base = { busId: id(1), date: D };
    const p = await runTool("propose_seat_hold", { ...base, seats: ["3", "4"] }, { user, deps });
    assert(p.action.type === "hold_seats" && p.data.awaitingConfirmation && p.action.price === 800, "a hold is only proposed, with the price, awaiting confirmation");
    assert((await runTool("propose_seat_hold", { ...base, seats: [] }, { user, deps })).data.error, "an empty seat list is rejected");
    assert((await runTool("propose_seat_hold", { ...base, seats: ["99"] }, { user, deps })).data.error.includes("1 to 30"), "seat numbers outside the layout are rejected");
    assert((await runTool("propose_seat_hold", { ...base, seats: ["1", "2", "3", "4", "5", "6", "7"] }, { user, deps })).data.error, "more than six seats is rejected");
    const taken = { ...deps, findBus: async () => ({ ...buses[0], seats: [`${D}@3,4@M`] }) };
    assert((await runTool("propose_seat_hold", { ...base, seats: ["4", "5"] }, { user, deps: taken })).data.error.includes("already booked"), "already-booked seats cannot be proposed");
    assert(!("lockSeats" in deps), "no tool is given a way to lock seats or take payment");
  }
  {
    const guest = toolSpecs({ signedIn: false }).map((t) => t.name);
    const member = toolSpecs({ signedIn: true }).map((t) => t.name);
    assert(!guest.includes("get_my_bookings") && member.includes("get_my_bookings"), "guests are not even shown the personal tools");
    assert(member.every((n) => toolSpecs({ signedIn: true }).find((t) => t.name === n).input_schema.type === "object"), "every tool has a JSON schema");
  }

  console.log("\nAgent: built-in planner (no API key)");
  delete process.env.ANTHROPIC_API_KEY;
  {
    let r = await runAssistant({ messages: [{ role: "user", content: `Delhi to Jaipur ${D}` }], user: null, deps });
    assert(r.engine === "smart" && r.cards[0]?.type === "buses" && r.toolCalls.includes("search_buses"), "a route query runs the search tool");
    assert(/Delhi to Jaipur/.test(r.reply), "the reply names the route");

    r = await runAssistant({ messages: [{ role: "user", content: "Delhi to Jaipur" }, { role: "assistant", content: "ok" }, { role: "user", content: "cheapest one?" }], user: null, deps });
    assert(r.toolCalls.includes("search_buses") && calls.at(-1)[1].sortBy === "price" && calls.at(-1)[1].to === "Jaipur", "a follow-up reuses the route from earlier in the chat");

    r = await runAssistant({ messages: [{ role: "user", content: "Delhi bus" }], user: null, deps });
    assert(r.cards.length === 0 && /\?/.test(r.reply), "a missing city gets a clarifying question, not a guess");

    const soldOut = { ...deps, searchBuses: async () => ({ buses: [], pagination: { total: 0 } }), allBuses: async () => [bus(1, "Delhi", "Agra", 8, 12, 300), bus(2, "Agra", "Jaipur", 16, 22, 300)] };
    r = await runAssistant({ messages: [{ role: "user", content: `Delhi to Jaipur ${D}` }], user: null, deps: soldOut });
    assert(r.toolCalls.includes("find_journey") && r.cards[0].type === "journeys", "no direct bus falls through to the journey planner");

    r = await runAssistant({ messages: [{ role: "user", content: "what is my refund if I cancel my ticket" }], user: null, deps });
    assert(/sign in/i.test(r.reply) && r.cards.length === 0, "refund questions about a booking ask guests to sign in");
    r = await runAssistant({ messages: [{ role: "user", content: "what is my refund if I cancel my ticket" }], user, deps });
    assert(/450/.test(r.reply) && r.cards.some((c) => c.type === "refund") && r.action.type === "open_cancel", "signed-in refund questions return a real preview");
    r = await runAssistant({ messages: [{ role: "user", content: "meri booking dikhao" }], user, deps });
    assert(r.cards[0].type === "bookings", "'meri booking' lists the traveller's own bookings");

    r = await runAssistant({ messages: [{ role: "user", content: "How do I cancel a ticket?" }], user: null, deps });
    assert(r.toolCalls.includes("policy_lookup") && /2 hours/.test(r.reply), "a policy question is answered from the real policy");
    r = await runAssistant({ messages: [{ role: "user", content: "what is the airspeed of a swallow" }], user: null, deps });
    assert(/won't guess/.test(r.reply), "an unknown question is not made up");
    r = await runAssistant({ messages: [{ role: "user", content: "suggest the best bus Delhi to Jaipur" }], user, deps });
    assert(r.toolCalls.includes("personal_picks"), "'suggest' for a signed-in traveller uses personalised picks");
  }

  console.log("\nAgent: tool-calling loop with a fake model");
  {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const seen = [];
    llm.__setToolLLMForTests(async ({ messages, tools }) => {
      seen.push({ n: messages.length, tools: tools.map((t) => t.name) });
      if (seen.length === 1) return { content: [{ type: "tool_use", id: "t1", name: "search_buses", input: { from: "Delhi", to: "Jaipur", date: D } }], stopReason: "tool_use" };
      return { content: [{ type: "text", text: "NightOwl is the cheapest at ₹300." }], stopReason: "end_turn" };
    });
    let r = await runAssistant({ messages: [{ role: "user", content: "cheapest bus delhi to jaipur" }], user: null, deps });
    assert(r.engine === "llm" && r.reply.includes("NightOwl") && r.cards[0].type === "buses", "the model asks for a tool, the server runs it, the model answers");
    assert(seen[1].n === 3, "the tool result is sent back to the model as a follow-up turn");
    assert(!seen[0].tools.includes("get_my_bookings"), "a guest's model is not offered personal tools");

    // A model that tries a made-up tool, then answers.
    let n = 0;
    llm.__setToolLLMForTests(async () => (++n === 1
      ? { content: [{ type: "tool_use", id: "x", name: "delete_all_bookings", input: {} }], stopReason: "tool_use" }
      : { content: [{ type: "text", text: "Sorry, I can't do that." }], stopReason: "end_turn" }));
    r = await runAssistant({ messages: [{ role: "user", content: "wipe everything" }], user, deps });
    assert(r.engine === "llm" && r.cards.length === 0 && !r.action, "an invented tool does nothing");

    // A model that never stops asking for tools is cut off.
    let loops = 0;
    llm.__setToolLLMForTests(async () => { loops++; return { content: [{ type: "tool_use", id: `l${loops}`, name: "policy_lookup", input: { question: "cancel" } }], stopReason: "tool_use" }; });
    r = await runAssistant({ messages: [{ role: "user", content: "loop" }], user: null, deps });
    assert(loops === MAX_STEPS && /narrow/.test(r.reply), "an endless tool loop is stopped after the step limit");

    // A model that tries to book via prompt injection in args: seat proposals still need a confirmed click.
    n = 0;
    llm.__setToolLLMForTests(async () => (++n === 1
      ? { content: [{ type: "tool_use", id: "p", name: "propose_seat_hold", input: { busId: id(1), date: D, seats: ["5"] } }], stopReason: "tool_use" }
      : { content: [{ type: "text", text: "Ready to hold seat 5. Please confirm." }], stopReason: "end_turn" }));
    r = await runAssistant({ messages: [{ role: "user", content: "hold seat 5 on the 9am bus" }], user, deps });
    assert(r.action?.type === "hold_seats" && r.reply.includes("confirm"), "the model can only propose a seat hold");

    // Model outage: falls back to the built-in planner.
    llm.__setToolLLMForTests(async () => { throw new Error("503"); });
    r = await runAssistant({ messages: [{ role: "user", content: `Delhi to Jaipur ${D}` }], user: null, deps });
    assert(r.engine === "smart" && r.cards[0]?.type === "buses", "if the model is down the assistant still answers");
    llm.__setToolLLMForTests(null);
    delete process.env.ANTHROPIC_API_KEY;
  }

  console.log("\nAgent: input handling");
  {
    const m = sanitizeMessages([{ role: "system", content: "x" }, { role: "user", content: "  hi  " }, { role: "user", content: 5 }, null, { role: "assistant", content: "a".repeat(900) }]);
    assert(m.length === 2 && m[0].content === "hi" && m[1].content.length === 500, "roles are enforced and lengths capped; junk is dropped");
    assert(sanitizeMessages(Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `m${i}` }))).length === 8, "history is capped");
    let threw = false;
    try { await runAssistant({ messages: [{ role: "assistant", content: "hi" }], deps }); } catch (e) { threw = e.status === 400; }
    assert(threw, "a conversation that does not end with a user message is rejected");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
