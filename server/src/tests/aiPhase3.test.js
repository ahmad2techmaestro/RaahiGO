/**
 * Phase 3 tests: demand forecast, fraud risk, disruption preview, MCP server. No DB, no network.
 * Run with: node src/tests/aiPhase3.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase3-test-secret";
const { forecastRoute, forecastForBuses } = require("../services/ai/demandForecast");
const { scoreOrders } = require("../services/ai/fraudRisk");
const { previewDisruption } = require("../services/ai/disruption");
const { createServer, PUBLIC_TOOLS } = require("../mcp/server");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { decorate, bookedSeatsForDate } = require("../services/busSearch.service");

let passed = 0, failed = 0;
const assert = (c, l) => { if (c) { console.log(`  ✓ ${l}`); passed++; } else { console.error(`  ✗ ${l}`); failed++; } };
const id = (n) => String(n).padStart(24, "0");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const TODAY = "2026-11-08";
const wd = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const ord = (bus, date, seats, extra = {}) => ({ _id: id(Math.floor(Math.random() * 1e6)), bus: id(bus), status: "CONFIRMED", ticketSummary: { date, ticket: Array.from({ length: seats }, (_, i) => i + 1).join(","), amount: String(seats * 400) }, createdAt: new Date(), user: id(50), ...extra });

async function run() {
  console.log("\nDemand forecast");
  const hist = [];
  for (let i = 60; i >= 1; i--) { const d = addDays(TODAY, -i); const weekend = [0, 5, 6].includes(wd(d)); hist.push(ord(1, d, weekend ? 26 : 3)); }
  const f = forecastRoute({ orders: hist, buses: 1, today: TODAY });
  assert(f.ok && f.estimate === true, "a forecast is always labelled an estimate");
  assert(f.forecast.length === 7 && f.forecast[0].date === TODAY, "seven days starting today");
  const sat = f.forecast.find((d) => wd(d.date) === 6), tue = f.forecast.find((d) => wd(d.date) === 2);
  assert(sat.seats > tue.seats * 2, "weekend demand is forecast higher than midweek, matching the history");
  assert(f.forecast.every((d) => d.low <= d.seats && d.seats <= d.high && d.high <= 30), "intervals bracket the estimate and respect capacity");
  assert(f.backtest.mae <= f.backtest.naiveMae + 0.01 && typeof f.backtest.beatsNaive === "boolean", "the backtest is reported against a naive baseline");
  const thin = forecastRoute({ orders: hist.slice(-10), today: TODAY });
  assert(!thin.ok && /history/.test(thin.reason), "too little history refuses to forecast");
  assert(!forecastRoute({ orders: [], today: TODAY }).ok, "no orders gives no forecast");
  const cancelledOnly = forecastRoute({ orders: hist.map((o) => ({ ...o, status: "CANCELLED" })), today: TODAY });
  assert(!cancelledOnly.ok, "cancelled bookings are not demand");
  const buses = [{ _id: id(1), from: "Delhi", to: "Jaipur" }, { _id: id(2), from: "Pune", to: "Goa" }];
  const per = forecastForBuses({ buses, orders: hist, today: TODAY });
  assert(per.length === 2 && per[0].ok && !per[1].ok, "forecasts are per route; a route with no history says so");
  assert(per[0].tips.some((t) => /extra departure/.test(t)), "a busy day produces a suggestion, not an action");

  console.log("\nFraud risk");
  const now = Date.now();
  const mk = (o, uid, mins, extra = {}) => ({ _id: id(o), user: id(uid), status: "CONFIRMED", createdAt: new Date(now - mins * 60000), ticketSummary: { ticket: "1", amount: "500" }, userDetails: { phone: "9000000000" }, busDetails: { from: "A", to: "B" }, ...extra });
  const normal = [mk(1, 1, 5000), mk(2, 1, 3000), mk(3, 2, 100)];
  assert(scoreOrders({ orders: normal }).flagged.length === 0, "ordinary bookings are not flagged");
  const burst = Array.from({ length: 5 }, (_, i) => mk(10 + i, 3, i * 5, { ticketSummary: { ticket: "1,2,3,4,5,6", amount: "3000" } }));
  const r = scoreOrders({ orders: burst });
  assert(r.flagged.length > 0 && r.flagged[0].level === "medium", "a burst of bulk bookings is flagged for review");
  assert(r.flagged[0].reasons.every((x) => x.text && x.signal), "every flag explains itself");
  assert(/human review/.test(r.note), "the output says it is for human review only");
  const churn = [0, 1, 2, 3].map((i) => mk(20 + i, 4, 400 - i * 100, { status: "CANCELLED" }));
  churn.push(mk(24, 4, 1, { ticketSummary: { ticket: "1,2,3,4,5,6", amount: "2400" } }));
  assert(scoreOrders({ orders: churn }).flagged.some((x) => x.reasons.some((y) => y.signal === "churn")), "repeated book-and-cancel is detected");
  const shared = [1, 2, 3, 4].map((u) => mk(30 + u, 60 + u, u * 1000));
  assert(scoreOrders({ orders: shared }).flagged.length === 0, "a shared phone alone stays below the review threshold");
  const hv = [mk(40, 7, 9000, { ticketSummary: { ticket: "1", amount: "400" } }), mk(41, 7, 8000, { ticketSummary: { ticket: "1", amount: "450" } }), mk(42, 7, 7000, { ticketSummary: { ticket: "1", amount: "500" } }), mk(43, 7, 10, { ticketSummary: { ticket: "1", amount: "9000" } })];
  assert(scoreOrders({ orders: hv, users: { [id(7)]: { ageHours: 0.2 } } }).flagged.some((x) => x.orderId === id(43)), "a sudden jump in value on a new account is flagged");
  assert(scoreOrders({ orders: [mk(50, 8, 1, { status: "EXPIRED" })] }).reviewed === 1, "expired holds are ignored");

  console.log("\nDisruption preview");
  const bus = { _id: id(1), companyname: "RedLine", from: "Delhi", to: "Jaipur", departure: "9", arrival: "14", price: 400, aminites: [], seats: [], rating: 4 };
  const alt = { ...bus, _id: id(2), companyname: "NightOwl", price: 350 };
  const date = addDays(new Date().toISOString().slice(0, 10), 2);
  const orders = [ord(1, date, 2), ord(1, date, 3), ord(1, addDays(date, 1), 4), ord(1, date, 1, { status: "CANCELLED" })];
  const c = previewDisruption({ bus, orders, date, type: "CANCELLED", buses: [bus, alt] });
  assert(c.affected.bookings === 2 && c.affected.passengers === 5, "only confirmed bookings on that date are affected");
  assert(c.alternatives.length === 1 && c.alternatives[0].operator === "NightOwl", "other buses on the route are offered, not the disrupted one");
  assert(/full refund/.test(c.proposals[0]) && /not issued/.test(c.proposals[0]), "a cancellation proposes a refund but issues none");
  const d = previewDisruption({ bus, orders, date, type: "DELAYED", delayMinutes: 200, buses: [bus] });
  assert(d.proposals.some((p) => /fee-free/.test(p)), "a 3 hour delay suggests fee-free cancellation");
  assert(previewDisruption({ bus, orders, date, type: "DELAYED", delayMinutes: 5 }).error, "a trivial delay is rejected");
  assert(previewDisruption({ bus, orders, date: "soon", type: "CANCELLED" }).error, "a bad date is rejected");
  assert(previewDisruption({ bus, orders, date, type: "EXPLODED" }).error, "an unknown type is rejected");

  console.log("\nMCP server (official SDK, in-memory transport)");
  const deps = {
    searchBuses: async (p) => ({ buses: [bus].map((b) => decorate(b, p.date)), pagination: { total: 1 } }),
    allBuses: async () => [bus], bookedSeatsForDate, decorate,
  };
  const server = createServer(deps);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const tools = (await client.listTools()).tools.map((x) => x.name).sort();
  assert(JSON.stringify(tools) === JSON.stringify([...PUBLIC_TOOLS].sort()), "exactly the three public read-only tools are exposed");
  assert(!tools.some((n) => /book|pay|cancel|lock|hold|refund|booking/.test(n)), "nothing that books, pays, cancels or reads private data is exposed");
  const res = await client.callTool({ name: "search_buses", arguments: { from: "Delhi", to: "Jaipur", date } });
  assert(!res.isError && JSON.parse(res.content[0].text).buses.length === 1, "search_buses works over MCP");
  const pol = await client.callTool({ name: "policy_lookup", arguments: { question: "how do refunds work" } });
  assert(JSON.parse(pol.content[0].text).found === true, "policy_lookup works over MCP");
  const bad = await client.callTool({ name: "search_buses", arguments: { from: "Atlantis", to: "Jaipur" } });
  assert(bad.isError === true, "an unknown city is reported as a tool error");
  let rejected = false;
  try { const x = await client.callTool({ name: "search_buses", arguments: { from: "Delhi" } }); rejected = x.isError === true; } catch { rejected = true; }
  assert(rejected, "invalid arguments are rejected by the schema");
  await client.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
