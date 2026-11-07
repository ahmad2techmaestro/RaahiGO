/**
 * Personalised ranking.
 *
 * Learns a traveller's habits from data RaahiGo already stores (their own bookings, saved
 * preferences, favourite operators) and re-orders real search results to match, with a reason for
 * every pick. Pure functions: the controller fetches the data, this module only scores it.
 *
 * Honest by design: it never invents a preference. With no history and no saved preferences it
 * falls back to a neutral rating/price/time ranking and says so in `basis`.
 */
const { TIME_BUCKETS } = require("../busSearch.service");

const WINDOW_LABELS = { BEFORE_6: "early morning", "6_TO_12": "morning", "12_TO_18": "afternoon", AFTER_18: "evening or night" };

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function windowOf(hour) {
  const h = Number(hour);
  if (Number.isNaN(h)) return null;
  return Object.keys(TIME_BUCKETS).find((k) => TIME_BUCKETS[k](h)) || null;
}

function mode(items) {
  const counts = new Map();
  items.filter(Boolean).forEach((i) => counts.set(i, (counts.get(i) || 0) + 1));
  let best = null;
  counts.forEach((n, k) => { if (!best || n > best.n) best = { k, n }; });
  return best ? { value: best.k, count: best.n, total: items.filter(Boolean).length } : null;
}

/**
 * @param {object} p
 * @param {object[]} p.orders past orders (lean), CONFIRMED/COMPLETED are used
 * @param {object[]} [p.pastBuses] bus documents for those orders (for bus/seat type)
 * @param {object} [p.preferences] saved user preferences
 */
function buildProfile({ orders = [], pastBuses = [], preferences = {} }) {
  const used = orders.filter((o) => ["CONFIRMED", "COMPLETED"].includes(o.status));
  const busById = new Map(pastBuses.map((b) => [String(b._id), b]));

  const operators = new Map();
  used.forEach((o) => {
    const name = o.busDetails?.name;
    if (name) operators.set(name, (operators.get(name) || 0) + 1);
  });

  const farePerSeat = used
    .map((o) => {
      const seats = String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length || 1;
      const value = Number(o.pricing?.ticketValue ?? String(o.ticketSummary?.amount || "").replace(/[^\d.]/g, ""));
      return value > 0 ? value / seats : null;
    })
    .filter(Boolean);

  const pastTags = used.flatMap((o) => (busById.get(String(o.bus))?.aminites || []).map((t) => String(t).toUpperCase()));
  const acShare = pastTags.length ? pastTags.filter((t) => t === "AC").length / Math.max(1, used.length) : null;

  return {
    bookings: used.length,
    operators,
    favouriteOperators: (preferences.favouriteOperators || []).map(String),
    typicalFare: median(farePerSeat),
    budget: preferences.budget || null,
    departureWindow: mode(used.map((o) => windowOf(o.busDetails?.departure))),
    savedWindow: preferences.preferredDepartureWindow || null,
    busType: preferences.busType || (acShare != null ? (acShare >= 0.6 ? "AC" : acShare <= 0.2 ? "NONAC" : null) : null),
    seatType: preferences.seatType || (mode(pastTags.filter((t) => t === "SLEEPER" || t === "SEATER"))?.value ?? null),
  };
}

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Scores one bus 0–100 and records why. */
function scoreBus(bus, profile, ctx) {
  const reasons = [];
  let score = 0;
  const tags = (bus.aminites || []).map((t) => String(t).toUpperCase());

  // Neutral base (up to 40): rating, value for money against this search, and journey time.
  const rating = clamp((Number(bus.rating) || 0) / 5);
  const value = ctx.maxPrice === ctx.minPrice ? 0.5 : 1 - (bus.price - ctx.minPrice) / (ctx.maxPrice - ctx.minPrice);
  const speed = ctx.maxDur === ctx.minDur ? 0.5 : 1 - (bus.durationHours - ctx.minDur) / (ctx.maxDur - ctx.minDur);
  score += 18 * rating + 12 * value + 10 * speed;
  if (bus.rating >= 4.3) reasons.push({ w: 0.3, text: `rated ${Number(bus.rating).toFixed(1)}` });
  if (value >= 0.9 && ctx.maxPrice !== ctx.minPrice) reasons.push({ w: 0.5, text: "cheapest on this route" });
  if (speed >= 0.9 && ctx.maxDur !== ctx.minDur) reasons.push({ w: 0.4, text: "quickest on this route" });

  // Personal signals (up to 60).
  const timesWith = profile.operators.get(bus.companyname) || 0;
  if (timesWith > 0) {
    score += Math.min(18, 8 + timesWith * 4);
    reasons.push({ w: 1, text: `you have travelled with ${bus.companyname} ${timesWith} time${timesWith > 1 ? "s" : ""}` });
  } else if (profile.favouriteOperators.includes(bus.companyname)) {
    score += 14;
    reasons.push({ w: 0.9, text: `${bus.companyname} is one of your favourite operators` });
  }

  const wantedType = profile.busType;
  if (wantedType) {
    const isAc = tags.includes("AC");
    const match = wantedType === "AC" ? isAc : !isAc;
    score += match ? 10 : -6;
    if (match) reasons.push({ w: 0.7, text: wantedType === "AC" ? "AC, as you prefer" : "non-AC, as you prefer" });
  }
  if (profile.seatType) {
    const match = tags.includes(profile.seatType);
    score += match ? 8 : 0;
    if (match) reasons.push({ w: 0.6, text: `${profile.seatType.toLowerCase()} seats, as you prefer` });
  }

  const w = profile.savedWindow || profile.departureWindow?.value;
  if (w && TIME_BUCKETS[w] && TIME_BUCKETS[w](Number(bus.departure))) {
    score += 10;
    reasons.push({ w: 0.8, text: `departs in the ${WINDOW_LABELS[w]}, when you usually travel` });
  }

  const anchor = profile.budget || profile.typicalFare;
  if (anchor) {
    const ratio = bus.price / anchor;
    if (ratio <= 1.05) {
      score += 10;
      reasons.push({ w: 0.6, text: profile.budget ? `within your ₹${profile.budget} budget` : `close to your usual fare of about ₹${Math.round(profile.typicalFare)}` });
    } else if (ratio > 1.4) {
      score -= 8;
    }
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons: reasons.sort((a, b) => b.w - a.w).slice(0, 3).map((r) => r.text) };
}

/**
 * @param {object[]} buses real, already-decorated search results
 * @param {object} profile from buildProfile()
 */
function rankForUser(buses, profile) {
  if (!buses.length) return { picks: [], basis: { personalised: false, bookingsAnalysed: profile.bookings, signals: [] } };

  const prices = buses.map((b) => b.price);
  const durs = buses.map((b) => b.durationHours);
  const ctx = { minPrice: Math.min(...prices), maxPrice: Math.max(...prices), minDur: Math.min(...durs), maxDur: Math.max(...durs) };

  const signals = [];
  if (profile.bookings) signals.push(`${profile.bookings} past trip${profile.bookings > 1 ? "s" : ""}`);
  if (profile.busType || profile.seatType) signals.push("saved bus preferences");
  if (profile.savedWindow || profile.departureWindow) signals.push("usual departure time");
  if (profile.budget || profile.typicalFare) signals.push("usual fare");
  const personalised = signals.length > 0;

  const picks = buses
    .map((b) => ({ id: String(b._id), ...scoreBus(b, profile, ctx) }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1, badge: i === 0 ? (personalised ? "Best for you" : "Best overall") : null }));

  return { picks, basis: { personalised, bookingsAnalysed: profile.bookings, signals } };
}

module.exports = { buildProfile, rankForUser, scoreBus, windowOf, median };
