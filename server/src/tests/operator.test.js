/**
 * Operator dashboard tests — role middleware and pure stat calculations.
 * Run with: node src/tests/operator.test.js
 */
const { requireRole } = require("../middleware/auth.middleware");
const {
  countSeats,
  summarizeOrders,
  occupancyPercent,
  groupOrdersByBus,
} = require("../services/operatorStats.service");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

console.log("\nrequireRole middleware");

{
  const req = { user: { role: "OPERATOR" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("OPERATOR", "ADMIN")(req, res, () => (nextCalled = true));
  assert(nextCalled === true, "a user with an allowed role passes through to next()");
  assert(res.statusCode === null, "no error response is sent for an allowed role");
}

{
  const req = { user: { role: "PASSENGER" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("OPERATOR", "ADMIN")(req, res, () => (nextCalled = true));
  assert(nextCalled === false, "a passenger is blocked from an operator-only route");
  assert(res.statusCode === 403, "a disallowed role gets 403, not silently passed through");
}

{
  const req = { user: undefined };
  const res = mockRes();
  let nextCalled = false;
  requireRole("OPERATOR")(req, res, () => (nextCalled = true));
  assert(nextCalled === false && res.statusCode === 401, "missing req.user (requireAuth didn't run first) is rejected, not crashed");
}

{
  const req = { user: { role: "ADMIN" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("OPERATOR", "ADMIN")(req, res, () => (nextCalled = true));
  assert(nextCalled === true, "an admin passes an operator-or-admin check");
}

{
  const req = { user: { role: "OPERATOR" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("ADMIN")(req, res, () => (nextCalled = true));
  assert(nextCalled === false && res.statusCode === 403, "an operator is blocked from an admin-only route");
}

console.log("\nSeat counting");

assert(countSeats("12,13,14") === 3, "counts comma-separated seats");
assert(countSeats("") === 0, "empty ticket string counts as 0 seats");
assert(countSeats(null) === 0, "missing ticket value counts as 0 rather than throwing");
assert(countSeats("7") === 1, "a single seat counts as 1");

console.log("\nOrder summarization — real revenue/booking math");

{
  const orders = [
    { status: "CONFIRMED", ticketSummary: { amount: "900", ticket: "1,2" } },
    { status: "CONFIRMED", ticketSummary: { amount: "1200", ticket: "5" } },
    { status: "CANCELLED", ticketSummary: { amount: "800", ticket: "9" } },
    { status: "COMPLETED", ticketSummary: { amount: "500", ticket: "3,4" } },
  ];
  const s = summarizeOrders(orders);
  assert(s.totalBookings === 4, "counts every order regardless of status");
  assert(s.confirmedBookings === 3, "CONFIRMED and COMPLETED both count as revenue-generating");
  assert(s.cancelledBookings === 1, "cancelled bookings are counted separately");
  assert(s.totalRevenue === 2600, "revenue sums only confirmed/completed orders (900+1200+500), not cancelled");
  assert(s.totalSeatsSold === 5, "seats sold sums only confirmed/completed orders (2+1+2), not cancelled");
}

assert(
  JSON.stringify(summarizeOrders([])) ===
    JSON.stringify({ totalBookings: 0, confirmedBookings: 0, cancelledBookings: 0, totalRevenue: 0, totalSeatsSold: 0 }),
  "an empty order list produces all-zero stats, not an error"
);

{
  const orders = [{ status: "CONFIRMED", ticketSummary: { amount: "not-a-number", ticket: "1" } }];
  const s = summarizeOrders(orders);
  assert(s.totalRevenue === 0, "a non-numeric amount contributes 0 to revenue rather than NaN-ing the total");
}

console.log("\nOccupancy percentage");

assert(occupancyPercent(20, 40) === 50, "20 of 40 seats is 50% occupancy");
assert(occupancyPercent(0, 40) === 0, "0 seats sold is 0% occupancy");
assert(occupancyPercent(40, 40) === 100, "all seats sold is 100% occupancy");
assert(occupancyPercent(45, 40) === 100, "overbooked data is clamped to 100%, not 112%");
assert(occupancyPercent(10, 0) === 0, "zero total capacity returns 0 rather than dividing by zero");
assert(occupancyPercent(1, 3) === 33.3, "occupancy rounds to one decimal place");

console.log("\nGrouping orders by bus");

{
  const orders = [
    { bus: "bus-a", status: "CONFIRMED" },
    { bus: "bus-b", status: "CONFIRMED" },
    { bus: "bus-a", status: "CANCELLED" },
  ];
  const grouped = groupOrdersByBus(orders);
  assert(grouped.size === 2, "orders are grouped into the correct number of distinct buses");
  assert(grouped.get("bus-a").length === 2, "all orders for the same bus land in the same group");
  assert(grouped.get("bus-b").length === 1, "a different bus gets its own separate group");
}

assert(groupOrdersByBus([]).size === 0, "grouping an empty order list returns an empty map, not an error");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
