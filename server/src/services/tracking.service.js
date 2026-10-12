const { coordinatesFor } = require("../data/cityCoordinates");
const { haversineDistanceKm, tripProgressFraction, interpolatePosition } = require("./geo.service");
const { getRedis, isRedisEnabled } = require("../configs/redis");

/**
 * IMPORTANT: this platform has no GPS hardware on any real bus — there is
 * no driver app sending live coordinates. What follows is a deliberately
 * honest simulation: real departure city, real destination city, real
 * geographic distance and a real elapsed-time fraction, linearly
 * interpolated into a position. The API response says `simulated: true`
 * on every payload so nothing pretends to be live telemetry it isn't.
 *
 * The `reportDelay` function below IS wired to real, operator-settable
 * data (stored in Redis, same as seat locks) — this is the seam where a
 * real driver/operator app could post real GPS + delay data in future,
 * without changing this function's contract.
 */

function delayKey(busId, date) {
  const day = new Date(date).toISOString().split("T")[0];
  return `tripdelay:${busId}:${day}`;
}

async function getDelayMinutes(busId, date) {
  if (!isRedisEnabled()) return 0;
  const redis = getRedis();
  const value = await redis.get(delayKey(busId, date));
  return value ? Number(value) : 0;
}

/**
 * Lets an operator/driver report a delay for a specific trip. There's no
 * role-based access control yet (that's Phase 10 — operator accounts) so
 * this is deliberately gated to "any authenticated user" for now, with
 * that limitation stated plainly rather than faked with a role check that
 * doesn't actually verify anything.
 */
async function reportDelay(busId, date, delayMinutes) {
  if (!isRedisEnabled()) return { stored: false, reason: "Redis not configured" };
  const redis = getRedis();
  const clamped = Math.max(0, Math.min(600, Number(delayMinutes) || 0));
  await redis.set(delayKey(busId, date), String(clamped), "EX", 60 * 60 * 24);
  return { stored: true, delayMinutes: clamped };
}

/**
 * Builds the live tracking payload for a bus on a specific journey date.
 */
async function getLiveTrackingInfo(bus, date) {
  const fromCoords = coordinatesFor(bus.from);
  const toCoords = coordinatesFor(bus.to);

  if (!fromCoords || !toCoords) {
    throw new Error(`No coordinates available for route ${bus.from} → ${bus.to}`);
  }

  const durationHours = bus.durationHours;
  const delayMinutes = await getDelayMinutes(bus._id, date);

  // Combine the journey date with the bus's scheduled departure hour into
  // an actual moment in time to measure elapsed progress against.
  // A bare YYYY-MM-DD is the journey's calendar day, so build it in local time — new Date("YYYY-MM-DD")
  // is UTC midnight, which lands on the previous day for servers west of UTC.
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date));
  const departureDateTime = dayMatch
    ? new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]))
    : new Date(date);
  departureDateTime.setHours(Number(bus.departure) || 0, 0, 0, 0);

  // A reported delay shifts the effective progress backwards — the bus is
  // "behind" where a fully on-time journey would place it.
  const now = new Date();
  const delayedNow = new Date(now.getTime() - delayMinutes * 60 * 1000);
  const progress = tripProgressFraction(departureDateTime, durationHours, delayedNow);

  const totalDistanceKm = haversineDistanceKm(fromCoords, toCoords);

  if (progress === null) {
    return {
      simulated: true,
      trackingAvailable: false,
      reason: "Journey has not started or schedule data is incomplete",
    };
  }

  const currentPosition = interpolatePosition(fromCoords, toCoords, progress);
  const distanceRemainingKm =
    Math.round(haversineDistanceKm(currentPosition, toCoords) * 10) / 10;

  const totalMinutes = durationHours * 60;
  const remainingMinutes = Math.max(0, Math.round(totalMinutes * (1 - progress) + delayMinutes));

  return {
    simulated: true,
    trackingAvailable: true,
    disclosure:
      "Position is simulated from schedule and real city coordinates — this route has no live GPS device.",
    from: { name: bus.from, coordinates: fromCoords },
    to: { name: bus.to, coordinates: toCoords },
    currentPosition,
    progress: Math.round(progress * 1000) / 1000,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    distanceRemainingKm,
    etaMinutes: remainingMinutes,
    delayMinutes,
    // Before departure the bus sits at its origin; these let the UI say "leaves in 2d 4h" instead of a bare 0%.
    departureAt: new Date(departureDateTime.getTime() + delayMinutes * 60000).toISOString(),
    startsInMinutes: now < departureDateTime ? Math.round((departureDateTime - now) / 60000) : null,
    status: progress >= 1 ? "ARRIVED" : delayMinutes > 0 ? "DELAYED" : "ON_SCHEDULE",
  };
}

module.exports = { getLiveTrackingInfo, reportDelay, getDelayMinutes, delayKey };
