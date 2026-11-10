/**
 * Journey planner: finds ways to get from A to B when a direct bus is missing or sold out.
 *
 * Pure and deterministic. It works only on real buses handed to it (the caller fetches them from
 * MongoDB) and real per-date seat availability, so every connection it returns is a trip that can
 * actually be booked. No AI is needed to be correct here; an LLM, when configured, may only phrase
 * the explanation.
 *
 * Time model: a bus departs and arrives on whole hours. A journey leaves on `date`; the second leg
 * of a connection may leave the same day or up to two days later, as long as the traveller has the
 * minimum layover and no more than the maximum.
 */
const { decorate, journeyDuration } = require("../busSearch.service");

const MIN_LAYOVER_H = 2;
const MAX_LAYOVER_H = 10;
const MAX_CONNECTIONS = 6;

const titleCase = (s = "") => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const slimLeg = (b, date) => ({
  busId: String(b._id),
  operator: b.companyname,
  from: b.from,
  to: b.to,
  date,
  departure: Number(b.departure),
  arrival: Number(b.arrival),
  durationHours: b.durationHours,
  price: b.price,
  rating: b.rating,
  seatsAvailable: b.seatsAvailable,
  amenities: b.aminites || [],
});

/** Direct buses that still have seats, cheapest first. */
function directOptions(buses, from, to, date) {
  return buses
    .filter((b) => b.from === from && b.to === to)
    .map((b) => decorate(b, date))
    .filter((b) => b.seatsAvailable > 0)
    .sort((a, b) => a.price - b.price || a.durationHours - b.durationHours)
    .map((b) => slimLeg(b, date));
}

/** One-stop connections, each with a layover inside the allowed window. */
function connectionOptions(buses, from, to, date, { minLayover = MIN_LAYOVER_H, maxLayover = MAX_LAYOVER_H } = {}) {
  const firstLegs = buses.filter((b) => b.from === from && b.to !== to);
  const secondByOrigin = new Map();
  buses.filter((b) => b.to === to && b.from !== from).forEach((b) => {
    if (!secondByOrigin.has(b.from)) secondByOrigin.set(b.from, []);
    secondByOrigin.get(b.from).push(b);
  });

  const out = [];
  for (const raw1 of firstLegs) {
    const seconds = secondByOrigin.get(raw1.to);
    if (!seconds) continue;
    const l1 = decorate(raw1, date);
    if (l1.seatsAvailable <= 0) continue;
    const dep1 = Number(l1.departure);
    const arr1 = dep1 + l1.durationHours; // hours since midnight of `date`, may pass 24

    for (const raw2 of seconds) {
      const dep2h = Number(raw2.departure);
      // Earliest day on which the second bus leaves late enough for the minimum layover.
      let day = 0;
      while (day * 24 + dep2h < arr1 + minLayover) day += 1;
      if (day > 2) continue;
      const layover = day * 24 + dep2h - arr1;
      if (layover > maxLayover) continue;

      const date2 = addDaysISO(date, day);
      const l2 = decorate(raw2, date2);
      if (l2.seatsAvailable <= 0) continue;

      const totalHours = day * 24 + dep2h + l2.durationHours - dep1;
      out.push({
        via: l1.to,
        legs: [slimLeg(l1, date), slimLeg(l2, date2)],
        layoverHours: layover,
        totalHours,
        totalPrice: l1.price + l2.price,
      });
    }
  }

  // Keep a spread: quickest first, then cheapest, without repeating the same pair of buses.
  const byTime = [...out].sort((a, b) => a.totalHours - b.totalHours || a.totalPrice - b.totalPrice);
  const byPrice = [...out].sort((a, b) => a.totalPrice - b.totalPrice || a.totalHours - b.totalHours);
  const seen = new Set();
  const picked = [];
  for (const c of [...byTime.slice(0, 4), ...byPrice.slice(0, 4)]) {
    const key = c.legs.map((l) => l.busId).join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
    if (picked.length >= MAX_CONNECTIONS) break;
  }
  const fastest = byTime[0] && byTime[0].legs.map((l) => l.busId).join(">");
  const cheapest = byPrice[0] && byPrice[0].legs.map((l) => l.busId).join(">");
  return picked
    .sort((a, b) => a.totalHours - b.totalHours || a.totalPrice - b.totalPrice)
    .map((c) => {
      const key = c.legs.map((l) => l.busId).join(">");
      const tags = [];
      if (key === fastest) tags.push("Fastest");
      if (key === cheapest) tags.push("Cheapest");
      return { ...c, tags };
    });
}

/** How the direct route looks on nearby dates, to suggest moving the trip when today is full. */
function alternativeDates(buses, from, to, date, span = 2) {
  const out = [];
  for (let n = -span; n <= span; n++) {
    if (n === 0) continue;
    const d = addDaysISO(date, n);
    if (new Date(`${d}T23:59:59Z`) < new Date()) continue; // never suggest a past day
    const open = directOptions(buses, from, to, d);
    if (open.length) {
      out.push({ date: d, buses: open.length, cheapest: open[0].price, seatsLeft: open.reduce((s, b) => s + b.seatsAvailable, 0) });
    }
  }
  return out;
}

/**
 * @param {object} p
 * @param {string} p.from @param {string} p.to @param {string} p.date YYYY-MM-DD
 * @param {object[]} p.buses all active buses (raw documents)
 */
function planJourneys({ from, to, date, buses }) {
  const f = titleCase(from);
  const t = titleCase(to);
  if (!f || !t || f === t) return { from: f, to: t, date, direct: [], connections: [], alternatives: [], summary: "Pick two different cities." };
  const active = (buses || []).filter((b) => b.status !== "INACTIVE");

  const direct = directOptions(active, f, t, date);
  const connections = connectionOptions(active, f, t, date);
  const alternatives = direct.length ? [] : alternativeDates(active, f, t, date);

  let summary;
  if (direct.length) {
    summary = `${direct.length} direct bus${direct.length > 1 ? "es" : ""} from ${f} to ${t} with seats.`;
  } else if (connections.length) {
    summary = `No direct bus with seats from ${f} to ${t} on this date. ${connections.length} connection${connections.length > 1 ? "s" : ""} via ${[...new Set(connections.map((c) => c.via))].join(", ")} found.`;
  } else if (alternatives.length) {
    summary = `Nothing bookable on this date. Direct buses have seats on ${alternatives.map((a) => a.date).join(", ")}.`;
  } else {
    summary = `No bookable route from ${f} to ${t} within the next few days.`;
  }
  return { from: f, to: t, date, direct, connections, alternatives, summary };
}

module.exports = { planJourneys, directOptions, connectionOptions, alternativeDates, addDaysISO, MIN_LAYOVER_H, MAX_LAYOVER_H, journeyDuration };
