/**
 * Seat locking tests.
 *
 * Run with: node src/tests/seatLock.test.js
 *
 * These run against ioredis-mock (an in-memory Redis) so they need no
 * running Redis server, but they exercise the same Lua scripts that run
 * against real Redis in production.
 */
const RedisMock = require("ioredis-mock");
const { __setRedisClientForTests } = require("../configs/redis");
const seatLock = require("../services/seatLock.service");

let passed = 0;
let failed = 0;

/**
 * ioredis-mock instances share a single global backing store, so each test
 * must start from a clean slate explicitly — otherwise keys leak between
 * cases and results become order-dependent.
 */
async function freshRedis() {
  const mock = new RedisMock();
  await mock.flushall();
  __setRedisClientForTests(mock);
  return mock;
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function run() {
  const BUS = "507f1f77bcf86cd799439011";
  const DATE = "2026-10-15";

  console.log("\nSeat locking");

  // --- Basic lock ---
  {
    await freshRedis();
    const r = await seatLock.lockSeats(BUS, DATE, ["12", "13"]);
    assert(r.ok === true && !!r.lockToken, "locks free seats and returns a token");
  }

  // --- Second user cannot take a locked seat ---
  {
    await freshRedis();
    const a = await seatLock.lockSeats(BUS, DATE, ["12"]);
    const b = await seatLock.lockSeats(BUS, DATE, ["12"]);
    assert(a.ok === true, "user A locks seat 12");
    assert(b.ok === false, "user B is refused seat 12");
    assert(
      Array.isArray(b.conflictingSeats) && b.conflictingSeats[0] === "12",
      "refusal names the conflicting seat"
    );
  }

  // --- All-or-nothing: partial overlap locks nothing ---
  {
    await freshRedis();
    await seatLock.lockSeats(BUS, DATE, ["5"]);
    const b = await seatLock.lockSeats(BUS, DATE, ["5", "6", "7"]);
    assert(b.ok === false, "overlapping multi-seat request is refused");

    // seats 6 and 7 must still be free for someone else
    const c = await seatLock.lockSeats(BUS, DATE, ["6", "7"]);
    assert(c.ok === true, "non-conflicting seats were NOT left half-locked");
  }

  // --- Concurrency: many simultaneous attempts, exactly one wins ---
  {
    await freshRedis();
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => seatLock.lockSeats(BUS, DATE, ["21"]))
    );
    const winners = attempts.filter((r) => r.ok).length;
    assert(winners === 1, `exactly one of 20 concurrent lock attempts wins (got ${winners})`);
  }

  // --- Different dates are independent ---
  {
    await freshRedis();
    const a = await seatLock.lockSeats(BUS, "2026-10-15", ["9"]);
    const b = await seatLock.lockSeats(BUS, "2026-10-16", ["9"]);
    assert(a.ok && b.ok, "same seat on a different date is independently lockable");
  }

  // --- Different buses are independent ---
  {
    await freshRedis();
    const a = await seatLock.lockSeats("bus-A", DATE, ["9"]);
    const b = await seatLock.lockSeats("bus-B", DATE, ["9"]);
    assert(a.ok && b.ok, "same seat number on a different bus is independent");
  }

  console.log("\nLock verification");

  // --- Verify succeeds for the holder ---
  {
    await freshRedis();
    const a = await seatLock.lockSeats(BUS, DATE, ["30"]);
    const v = await seatLock.verifyLocks(BUS, DATE, ["30"], a.lockToken);
    assert(v.ok === true, "holder can verify its own lock");
  }

  // --- Verify fails for a different token ---
  {
    await freshRedis();
    await seatLock.lockSeats(BUS, DATE, ["30"]);
    const v = await seatLock.verifyLocks(BUS, DATE, ["30"], "some-other-token");
    assert(v.ok === false, "a different token cannot verify someone else's lock");
  }

  // --- Verify fails when the lock never existed (simulates expiry) ---
  {
    await freshRedis();
    const v = await seatLock.verifyLocks(BUS, DATE, ["77"], "token-for-nothing");
    assert(v.ok === false && v.reason === "expired", "expired/absent lock fails verification");
  }

  // --- Missing token is rejected outright ---
  {
    await freshRedis();
    const v = await seatLock.verifyLocks(BUS, DATE, ["30"], null);
    assert(v.ok === false && v.reason === "missing_token", "missing token is rejected");
  }

  console.log("\nRelease");

  // --- Holder can release, freeing the seat ---
  {
    await freshRedis();
    const a = await seatLock.lockSeats(BUS, DATE, ["40"]);
    const rel = await seatLock.releaseSeats(BUS, DATE, ["40"], a.lockToken);
    assert(rel.released === 1, "holder releases its lock");

    const b = await seatLock.lockSeats(BUS, DATE, ["40"]);
    assert(b.ok === true, "released seat becomes available again");
  }

  // --- A stale token cannot release someone else's lock ---
  {
    await freshRedis();
    await seatLock.lockSeats(BUS, DATE, ["41"]);
    const rel = await seatLock.releaseSeats(BUS, DATE, ["41"], "stale-token");
    assert(rel.released === 0, "stale token releases nothing");

    const b = await seatLock.lockSeats(BUS, DATE, ["41"]);
    assert(b.ok === false, "seat is still held by the original owner");
  }

  console.log("\nBooked seats & availability");

  // --- Booked seats block new locks ---
  {
    await freshRedis();
    await seatLock.markSeatsBooked(BUS, DATE, ["50"]);
    const r = await seatLock.lockSeats(BUS, DATE, ["50"]);
    assert(r.ok === false, "a booked seat cannot be locked");
  }

  // --- Availability lookup reports locked + booked seats ---
  {
    await freshRedis();
    await seatLock.lockSeats(BUS, DATE, ["60"]);
    await seatLock.markSeatsBooked(BUS, DATE, ["61"]);
    const unavailable = await seatLock.getUnavailableSeats(BUS, DATE, ["60", "61", "62"]);
    assert(
      unavailable.includes("60") && unavailable.includes("61") && !unavailable.includes("62"),
      "availability lookup reports locked and booked seats only"
    );
  }

  console.log("\nGraceful degradation (no Redis)");

  // --- With Redis disabled, calls succeed instead of crashing ---
  {
    __setRedisClientForTests(null);
    const r = await seatLock.lockSeats(BUS, DATE, ["1"]);
    assert(r.ok === true && r.skipped === true, "lock degrades gracefully when Redis is absent");

    const v = await seatLock.verifyLocks(BUS, DATE, ["1"], null);
    assert(v.ok === true && v.skipped === true, "verify degrades gracefully");

    const rel = await seatLock.releaseSeats(BUS, DATE, ["1"], "x");
    assert(rel.skipped === true, "release degrades gracefully");

    const un = await seatLock.getUnavailableSeats(BUS, DATE, ["1"]);
    assert(Array.isArray(un) && un.length === 0, "availability returns empty when Redis is absent");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
