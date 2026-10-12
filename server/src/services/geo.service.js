const EARTH_RADIUS_KM = 6371;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in km. Standard
 * haversine formula — this is real geometry on real coordinates, not a
 * simulated or approximated number.
 */
function haversineDistanceKm(a, b) {
  if (!a || !b) return null;

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

/**
 * How far through the journey we are, as a fraction from 0 (at departure)
 * to 1 (at arrival), clamped to that range. Handles overnight journeys
 * (departure hour > arrival hour) the same way busSearch.service.js does.
 */
function tripProgressFraction(departureDate, durationHours, now = new Date()) {
  if (!departureDate || !durationHours || durationHours <= 0) return null;

  const departure = new Date(departureDate);
  const arrival = new Date(departure.getTime() + durationHours * 60 * 60 * 1000);

  if (now <= departure) return 0;
  if (now >= arrival) return 1;

  const elapsedMs = now - departure;
  const totalMs = arrival - departure;
  return elapsedMs / totalMs;
}

/**
 * Linear interpolation between two coordinates. A straight line is not
 * the real road the bus takes — it's a deliberately simple, clearly-
 * documented simulation of position, not a claim about actual GPS data.
 * See tracking.service.js for how this is labeled to the client.
 */
function interpolatePosition(from, to, fraction) {
  if (!from || !to) return null;
  const f = Math.max(0, Math.min(1, fraction));

  return {
    lat: from.lat + (to.lat - from.lat) * f,
    lng: from.lng + (to.lng - from.lng) * f,
  };
}

module.exports = { haversineDistanceKm, tripProgressFraction, interpolatePosition, EARTH_RADIUS_KM };
