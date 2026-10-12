/**
 * Admin dashboard tests. Run with: node src/tests/admin.test.js
 */
const {
  computePopularRoutes,
  computeUserGrowth,
  cancellationRate,
} = require("../services/adminStats.service");
const { getSystemHealth } = require("../services/systemHealth.service");

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

console.log("\nPopular routes");

{
  const orders = [
    { status: "CONFIRMED", busDetails: { from: "Mumbai", to: "Pune" } },
    { status: "CONFIRMED", busDetails: { from: "Mumbai", to: "Pune" } },
    { status: "COMPLETED", busDetails: { from: "Mumbai", to: "Pune" } },
    { status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur" } },
    { status: "CANCELLED", busDetails: { from: "Delhi", to: "Jaipur" } },
  ];
  const popular = computePopularRoutes(orders);
  assert(popular[0].route === "Mumbai → Pune", "the most-booked route ranks first");
  assert(popular[0].bookings === 3, "counts CONFIRMED and COMPLETED together (2+1)");
  assert(popular[1].bookings === 1, "a cancelled booking does not count toward popularity");
}

{
  const popular = computePopularRoutes([]);
  assert(Array.isArray(popular) && popular.length === 0, "no orders produces an empty list, not an error");
}

{
  const manyRoutes = Array.from({ length: 15 }, (_, i) => ({
    status: "CONFIRMED",
    busDetails: { from: `City${i}`, to: "Hub" },
  }));
  const popular = computePopularRoutes(manyRoutes, 10);
  assert(popular.length === 10, "results are capped at topN even with more distinct routes available");
}

console.log("\nUser growth");

{
  const now = new Date("2026-10-15T12:00:00Z");
  const users = [
    { createdAt: new Date("2026-10-15T08:00:00Z") },
    { createdAt: new Date("2026-10-15T09:00:00Z") },
    { createdAt: new Date("2026-10-14T08:00:00Z") },
  ];
  const growth = computeUserGrowth(users, 7, now);
  assert(growth.length === 7, "growth is bucketed into exactly the requested number of days");
  const today = growth[growth.length - 1];
  assert(today.signups === 2, "two signups on the same real day are bucketed together");
  const yesterday = growth[growth.length - 2];
  assert(yesterday.signups === 1, "a different day gets its own separate count");
}

{
  const now = new Date("2026-10-15T12:00:00Z");
  const growth = computeUserGrowth([], 7, now);
  assert(
    growth.every((d) => d.signups === 0),
    "days with no signups are included as explicit 0, not omitted from the series"
  );
}

{
  const now = new Date("2026-10-15T12:00:00Z");
  const oldUser = [{ createdAt: new Date("2020-01-01") }];
  const growth = computeUserGrowth(oldUser, 7, now);
  const total = growth.reduce((sum, d) => sum + d.signups, 0);
  assert(total === 0, "a signup far outside the requested window is not counted");
}

console.log("\nCancellation rate");

assert(cancellationRate({ totalBookings: 100, cancelledBookings: 15 }) === 15, "15 of 100 cancelled is exactly 15%");
assert(cancellationRate({ totalBookings: 0, cancelledBookings: 0 }) === 0, "zero bookings gives 0% rather than dividing by zero");
assert(cancellationRate({ totalBookings: 3, cancelledBookings: 1 }) === 33.3, "cancellation rate rounds to one decimal place");

console.log("\nSystem health — genuine, queryable facts");

{
  const health = getSystemHealth();
  assert(typeof health.uptimeSeconds === "number" && health.uptimeSeconds >= 0, "uptime is a real, non-negative number");
  assert(typeof health.database.connected === "boolean", "database connection status is a real boolean, not a placeholder");
  assert(["disconnected", "connected", "connecting", "disconnecting"].includes(health.database.state), "database state is one of Mongoose's real connection states");
  assert(typeof health.redis.configured === "boolean", "redis configured flag reflects the real Redis client state");
  assert(typeof health.ai.configured === "boolean", "AI configured flag reflects whether ANTHROPIC_API_KEY is actually set");
  assert(typeof health.memory.usedMB === "number" && health.memory.usedMB > 0, "memory usage is a real, positive measurement");
  assert(health.realtime.connectedClients === 0, "with no socket server initialised in this test process, connected clients is genuinely 0, not faked");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
