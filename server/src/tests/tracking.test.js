/**
 * Live tracking tests — geo math (haversine, interpolation, progress) and
 * the tracking service that combines them with schedule data. Run with:
 *   node src/tests/tracking.test.js
 *
 * Redis-dependent parts (delay storage) are tested against ioredis-mock,
 * same pattern as seatLock.test.js.
 */
const RedisMock = require("ioredis-mock");
const { __setRedisClientForTests } = require("../configs/redis");
const {
  haversineDistanceKm,
  tripProgressFraction,
  interpolatePosition,
} = require("../services/geo.service");
const { coordinatesFor, CITY_COORDINATES } = require("../data/cityCoordinates");

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

console.log("\nCity coordinates");

assert(Object.keys(CITY_COORDINATES).length === 18, "all 18 served cities have coordinates");
assert(coordinatesFor("Mumbai").lat > 18 && coordinatesFor("Mumbai").lat < 20, "Mumbai's latitude is in the real, expected range");
assert(coordinatesFor("Atlantis") === null, "an unserved/fictional city returns null rather than a guess");

console.log("\nHaversine distance");

{
  const mumbai = coordinatesFor("Mumbai");
  const pune = coordinatesFor("Pune");
  const distance = haversineDistanceKm(mumbai, pune);
  assert(distance > 100 && distance < 170, `Mumbai-Pune distance is realistic (got ${distance.toFixed(1)}km)`);
}

{
  const mumbai = coordinatesFor("Mumbai");
  const delhi = coordinatesFor("Delhi");
  const distance = haversineDistanceKm(mumbai, delhi);
  assert(distance > 1000 && distance < 1300, `Mumbai-Delhi distance is realistic (got ${distance.toFixed(1)}km)`);
}

assert(haversineDistanceKm(coordinatesFor("Mumbai"), coordinatesFor("Mumbai")) === 0, "distance from a point to itself is 0");
assert(haversineDistanceKm(null, coordinatesFor("Mumbai")) === null, "missing a coordinate returns null rather than throwing");

{
  const a = coordinatesFor("Mumbai");
  const b = coordinatesFor("Delhi");
  assert(
    Math.abs(haversineDistanceKm(a, b) - haversineDistanceKm(b, a)) < 0.001,
    "distance is symmetric (A→B equals B→A)"
  );
}

console.log("\nTrip progress fraction");

{
  const departure = new Date("2026-10-15T20:00:00");
  const midpoint = new Date("2026-10-16T02:00:00");
  assert(
    tripProgressFraction(departure, 12, midpoint) === 0.5,
    "halfway through a 12-hour journey gives exactly 0.5 progress"
  );
}

{
  const departure = new Date("2026-10-15T20:00:00");
  const before = new Date("2026-10-15T19:00:00");
  assert(tripProgressFraction(departure, 8, before) === 0, "before departure, progress is 0 (not negative)");
}

{
  const departure = new Date("2026-10-15T20:00:00");
  const wayAfter = new Date("2026-10-20T20:00:00");
  assert(tripProgressFraction(departure, 8, wayAfter) === 1, "long after arrival, progress caps at 1 (not >1)");
}

assert(tripProgressFraction(null, 8) === null, "missing departure time returns null rather than throwing");
assert(tripProgressFraction(new Date(), 0) === null, "zero duration returns null rather than dividing by zero");
assert(tripProgressFraction(new Date(), -5) === null, "negative duration returns null rather than a nonsense fraction");

console.log("\nPosition interpolation");

{
  const from = { lat: 0, lng: 0 };
  const to = { lat: 10, lng: 20 };
  const mid = interpolatePosition(from, to, 0.5);
  assert(mid.lat === 5 && mid.lng === 10, "0.5 fraction gives the exact midpoint");
}

{
  const from = { lat: 19.076, lng: 72.8777 };
  const to = { lat: 28.7041, lng: 77.1025 };
  const start = interpolatePosition(from, to, 0);
  const end = interpolatePosition(from, to, 1);
  assert(start.lat === from.lat && start.lng === from.lng, "fraction 0 is exactly the start point");
  assert(end.lat === to.lat && end.lng === to.lng, "fraction 1 is exactly the end point");
}

{
  const from = { lat: 0, lng: 0 };
  const to = { lat: 10, lng: 10 };
  const clampedHigh = interpolatePosition(from, to, 1.5);
  const clampedLow = interpolatePosition(from, to, -0.5);
  assert(clampedHigh.lat === 10, "a fraction above 1 clamps to the end point, not overshooting");
  assert(clampedLow.lat === 0, "a fraction below 0 clamps to the start point, not undershooting");
}

assert(interpolatePosition(null, { lat: 1, lng: 1 }, 0.5) === null, "missing a coordinate returns null rather than throwing");

console.log("\nTracking service — delay storage (Redis-backed)");

async function runAsync() {
  const { getDelayMinutes, reportDelay, getLiveTrackingInfo } = require("../services/tracking.service");

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const before = await getDelayMinutes("bus-1", "2026-10-15");
    assert(before === 0, "a trip with no reported delay defaults to 0 minutes");

    const result = await reportDelay("bus-1", "2026-10-15", 25);
    assert(result.stored === true && result.delayMinutes === 25, "reporting a delay stores it");

    const after = await getDelayMinutes("bus-1", "2026-10-15");
    assert(after === 25, "the stored delay is retrievable");
  }

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const result = await reportDelay("bus-1", "2026-10-15", 99999);
    assert(result.delayMinutes === 600, "an absurd delay value is clamped to a sane maximum (600 min / 10h)");
  }

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const result = await reportDelay("bus-1", "2026-10-15", -50);
    assert(result.delayMinutes === 0, "a negative delay is clamped to 0, not allowed to speed up the schedule");
  }

  console.log("\nTracking service — end to end");

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const now = new Date();
    const departureHour = now.getHours();
    const bus = {
      _id: "bus-mid-journey",
      from: "Mumbai",
      to: "Delhi",
      departure: String(departureHour),
      durationHours: 10,
    };
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // local calendar day, matching setHours() in the service

    const info = await getLiveTrackingInfo(bus, today);
    assert(info.simulated === true, "response is explicitly labeled as simulated");
    assert(info.trackingAvailable === true, "a journey that has started has tracking available");
    assert(
      typeof info.disclosure === "string" && info.disclosure.length > 0,
      "response discloses that position is simulated, not real GPS"
    );
    assert(info.currentPosition.lat !== undefined, "a current position is returned");
    assert(info.totalDistanceKm > 1000, "Mumbai-Delhi total distance is realistic");
    assert(info.status === "ON_SCHEDULE", "no reported delay means ON_SCHEDULE status");
  }

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // local calendar day, matching setHours() in the service
    await reportDelay("bus-delayed", today, 30);

    const bus = {
      _id: "bus-delayed",
      from: "Mumbai",
      to: "Pune",
      departure: String(now.getHours()),
      durationHours: 4,
    };
    const info = await getLiveTrackingInfo(bus, today);

    assert(info.delayMinutes === 30, "a reported delay is reflected in the tracking response");
    assert(info.status === "DELAYED", "a positive delay produces DELAYED status");
  }

  {
    const mock = new RedisMock();
    await mock.flushall();
    __setRedisClientForTests(mock);

    const bus = { _id: "bus-x", from: "Atlantis", to: "Pune", departure: "20", durationHours: 4 };
    let threw = false;
    try {
      await getLiveTrackingInfo(bus, "2026-10-15");
    } catch {
      threw = true;
    }
    assert(threw, "a route with no known coordinates throws rather than returning a fabricated position");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runAsync().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
