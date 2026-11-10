/**
 * AI operator insights: rule-based observations computed from the operator's real orders.
 * Every insight carries the numbers behind it (`evidence`) and a `confidence` that depends on sample size.
 * Suggestions are advice, never automatic changes. With too little data it says so instead of inventing trends.
 */
const MIN_SAMPLE = 5;
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isConfirmed = (o) => o.status === "CONFIRMED" || o.status === "COMPLETED";
const seatCount = (o) => String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length;
const amount = (o) => Number(o.ticketSummary?.amount) || 0;
const confidenceFor = (n) => (n >= 30 ? "high" : n >= 12 ? "medium" : "low");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const label = (b) => `${b.companyname} (${b.from} to ${b.to})`;

function insightsFor({ buses = [], orders = [], now = new Date() }) {
  const out = [];
  const byBus = new Map();
  for (const o of orders) {
    const k = String(o.bus);
    if (!byBus.has(k)) byBus.set(k, []);
    byBus.get(k).push(o);
  }

  if (!buses.length) {
    return { insights: [], sample: { buses: 0, orders: 0 }, note: "No buses yet. Add a bus to start getting insights." };
  }
  if (orders.length < MIN_SAMPLE) {
    return { insights: [], sample: { buses: buses.length, orders: orders.length }, note: `Only ${orders.length} booking${orders.length === 1 ? "" : "s"} so far. Insights start at ${MIN_SAMPLE}, so nothing is guessed from too little data.` };
  }

  // 1. Cancellation hot-spots.
  for (const b of buses) {
    const list = byBus.get(String(b._id)) || [];
    const cancelled = list.filter((o) => o.status === "CANCELLED").length;
    if (list.length >= MIN_SAMPLE && pct(cancelled, list.length) >= 25) {
      out.push({
        id: `cancel-${b._id}`, type: "cancellations", severity: "warning", confidence: confidenceFor(list.length),
        title: `${label(b)} has a high cancellation rate`,
        detail: `${cancelled} of ${list.length} bookings (${pct(cancelled, list.length)}%) were cancelled. Check timing, fare and bus details for this trip.`,
        evidence: { bookings: list.length, cancelled },
      });
    }
  }

  // 2. Buses with no bookings in the last 30 days.
  const cutoff = now.getTime() - 30 * 86400000;
  for (const b of buses) {
    if (b.status === "INACTIVE") continue;
    const recent = (byBus.get(String(b._id)) || []).filter((o) => isConfirmed(o) && new Date(o.createdAt || 0).getTime() >= cutoff);
    if (!recent.length) {
      out.push({
        id: `idle-${b._id}`, type: "no-demand", severity: "info", confidence: "medium",
        title: `${label(b)} had no confirmed bookings in 30 days`,
        detail: "Consider reviewing its fare, departure time or listing details. This is a suggestion, nothing is changed automatically.",
        evidence: { confirmedLast30Days: 0 },
      });
    }
  }

  // 3. Best route by revenue.
  const revenue = buses
    .map((b) => ({ b, rev: (byBus.get(String(b._id)) || []).filter(isConfirmed).reduce((s, o) => s + amount(o), 0) }))
    .filter((r) => r.rev > 0)
    .sort((x, y) => y.rev - x.rev);
  if (revenue.length >= 2) {
    const total = revenue.reduce((s, r) => s + r.rev, 0);
    out.push({
      id: "top-route", type: "revenue", severity: "good", confidence: confidenceFor(orders.length),
      title: `${label(revenue[0].b)} earns the most`,
      detail: `₹${revenue[0].rev.toLocaleString("en-IN")} is ${pct(revenue[0].rev, total)}% of your confirmed revenue.`,
      evidence: { revenue: revenue[0].rev, share: pct(revenue[0].rev, total) },
    });
  }

  // 4. Busiest weekday of travel.
  const days = new Array(7).fill(0);
  let dated = 0;
  for (const o of orders.filter(isConfirmed)) {
    const d = new Date(o.ticketSummary?.date);
    if (Number.isNaN(d.getTime())) continue;
    days[d.getUTCDay()] += seatCount(o) || 1;
    dated++;
  }
  if (dated >= MIN_SAMPLE * 2) {
    const max = Math.max(...days);
    const day = days.indexOf(max);
    out.push({
      id: "busy-day", type: "demand-pattern", severity: "info", confidence: confidenceFor(dated),
      title: `${DAY[day]} is your busiest travel day`,
      detail: `${max} of ${days.reduce((a, b) => a + b, 0)} seats booked so far are for ${DAY[day]}. Past pattern only, not a forecast.`,
      evidence: { seatsByWeekday: Object.fromEntries(DAY.map((n, i) => [n, days[i]])) },
    });
  }

  return { insights: out, sample: { buses: buses.length, orders: orders.length }, note: out.length ? null : "Nothing unusual in your data right now." };
}

module.exports = { insightsFor, MIN_SAMPLE };
