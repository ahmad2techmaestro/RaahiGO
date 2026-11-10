/**
 * Demand forecasting from real booking history. Everything here is an ESTIMATE.
 *
 * Model: a weekday profile (average seats for each weekday over the lookback) scaled by a recent-level
 * factor (last 14 days vs what the profile predicted for them, clamped to 0.7–1.3). The interval is
 * +/- 1.28 residual standard deviations from a backtest on the most recent 14 days. The backtest also
 * scores a naive baseline ("same weekday last week"); if the model doesn't beat it the result says so.
 * With under 21 days of history it refuses to forecast.
 */
const MIN_HISTORY_DAYS = 21;
const LOOKBACK_DAYS = 90;
const HORIZON = 7;
const BACKTEST_DAYS = 14;
const SEATS_PER_BUS = 30;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const seats = (o) => String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length;
const counts = (o) => o.status === "CONFIRMED" || o.status === "COMPLETED";
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function dailySeries(orders, today) {
  const by = new Map();
  for (const o of orders) {
    if (!counts(o)) continue;
    const d = new Date(o.ticketSummary?.date);
    if (Number.isNaN(d.getTime())) continue;
    const k = iso(d);
    by.set(k, (by.get(k) || 0) + seats(o));
  }
  const days = [...by.keys()].filter((k) => k < today).sort();
  if (!days.length) return { series: [], span: 0 };
  const start = days[0] > addDays(today, -LOOKBACK_DAYS) ? days[0] : addDays(today, -LOOKBACK_DAYS);
  const series = [];
  for (let d = start; d < today; d = addDays(d, 1)) series.push({ date: d, seats: by.get(d) || 0 });
  return { series, span: series.length };
}

const weekday = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
function profileOf(series) {
  const sums = new Array(7).fill(0), n = new Array(7).fill(0);
  series.forEach((p) => { const w = weekday(p.date); sums[w] += p.seats; n[w]++; });
  return sums.map((s, i) => (n[i] ? s / n[i] : 0));
}
function levelFactor(series, profile) {
  const recent = series.slice(-14);
  const actual = recent.reduce((s, p) => s + p.seats, 0);
  const expected = recent.reduce((s, p) => s + profile[weekday(p.date)], 0);
  return expected > 0 ? Math.min(1.3, Math.max(0.7, actual / expected)) : 1;
}

function forecastRoute({ orders, buses = 1, today = iso(new Date()) }) {
  const { series, span } = dailySeries(orders, today);
  if (span < MIN_HISTORY_DAYS) {
    return { ok: false, reason: `Only ${span} day${span === 1 ? "" : "s"} of booking history. At least ${MIN_HISTORY_DAYS} are needed for an estimate.`, historyDays: span };
  }
  const train = series.slice(0, -BACKTEST_DAYS), test = series.slice(-BACKTEST_DAYS);
  const trainProfile = profileOf(train);
  const trainLevel = levelFactor(train, trainProfile);
  const errs = test.map((p) => p.seats - trainProfile[weekday(p.date)] * trainLevel);
  const mae = mean(errs.map(Math.abs));
  const sd = Math.sqrt(mean(errs.map((e) => e * e)));
  const naiveMae = mean(test.map((p, i) => Math.abs(p.seats - (series[series.length - BACKTEST_DAYS + i - 7]?.seats ?? p.seats))));

  const profile = profileOf(series);
  const level = levelFactor(series, profile);
  const capacity = Math.max(1, buses) * SEATS_PER_BUS;
  const forecast = [];
  for (let i = 0; i < HORIZON; i++) {
    const date = addDays(today, i);
    const mid = profile[weekday(date)] * level;
    const low = Math.max(0, mid - 1.28 * sd);
    const high = Math.min(capacity, mid + 1.28 * sd);
    forecast.push({ date, seats: Math.round(Math.min(capacity, mid)), low: Math.round(low), high: Math.round(high), loadPercent: Math.round((Math.min(capacity, mid) / capacity) * 100) });
  }
  return {
    ok: true, estimate: true, historyDays: span, capacity, forecast,
    backtest: { days: BACKTEST_DAYS, mae: Math.round(mae * 10) / 10, naiveMae: Math.round(naiveMae * 10) / 10, beatsNaive: mae < naiveMae },
    trend: level > 1.08 ? "up" : level < 0.92 ? "down" : "flat",
  };
}

/** Per-route forecasts for an operator's buses. `orders` carry busDetails.from/to. */
function forecastForBuses({ buses, orders, today }) {
  const routes = new Map();
  for (const b of buses) {
    const k = `${b.from}>${b.to}`;
    if (!routes.has(k)) routes.set(k, { from: b.from, to: b.to, ids: new Set(), buses: 0 });
    const r = routes.get(k); r.ids.add(String(b._id)); r.buses++;
  }
  const out = [];
  for (const r of routes.values()) {
    const list = orders.filter((o) => r.ids.has(String(o.bus)));
    const f = forecastRoute({ orders: list, buses: r.buses, today });
    const tips = [];
    if (f.ok) {
      const hot = f.forecast.filter((d) => d.loadPercent >= 80);
      if (hot.length) tips.push(`Expected load is 80% or more on ${hot.map((d) => d.date).join(", ")}. An extra departure could be worth considering.`);
      const cold = f.forecast.filter((d) => d.loadPercent <= 25);
      if (cold.length >= 3) tips.push("Several quiet days ahead. A short-run discount may help fill seats.");
    }
    out.push({ from: r.from, to: r.to, buses: r.buses, ...f, tips });
  }
  return out;
}

module.exports = { forecastRoute, forecastForBuses, MIN_HISTORY_DAYS, HORIZON };
