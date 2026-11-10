/**
 * Booking risk signals for HUMAN review. Transparent rules, each with a reason; the score is a sum of
 * the signals that fired. Nothing here blocks, cancels or flags a user automatically, and a high score is
 * not proof of fraud (a family booking six seats is a normal booking).
 */
const WEIGHTS = { velocity: 30, bulk: 15, churn: 25, highValue: 20, sharedPhone: 25, newHighValue: 15 };
const LEVELS = [[60, "high"], [30, "medium"]];
const amount = (o) => Number(o.ticketSummary?.amount) || 0;
const seatsOf = (o) => String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const t = (o) => new Date(o.createdAt || 0).getTime();

function scoreOrders({ orders, users = {}, now = new Date() }) {
  const byUser = new Map(), byPhone = new Map();
  for (const o of orders) {
    const u = String(o.user);
    if (!byUser.has(u)) byUser.set(u, []);
    byUser.get(u).push(o);
    const ph = o.userDetails?.phone;
    if (ph) { if (!byPhone.has(ph)) byPhone.set(ph, new Set()); byPhone.get(ph).add(u); }
  }

  const flagged = [];
  for (const o of orders) {
    if (o.status === "EXPIRED" || o.status === "PENDING") continue;
    const mine = (byUser.get(String(o.user)) || []).slice().sort((a, b) => t(a) - t(b));
    const reasons = [];
    let score = 0;
    const add = (key, text) => { score += WEIGHTS[key]; reasons.push({ signal: key, text }); };

    const burst = mine.filter((x) => Math.abs(t(x) - t(o)) <= 3600000).length;
    if (burst >= 4) add("velocity", `${burst} bookings by this account within one hour`);
    if (seatsOf(o) >= 6) add("bulk", `${seatsOf(o)} seats in one booking`);

    const lastFive = mine.filter((x) => t(x) <= t(o)).slice(-5);
    const cancelled = lastFive.filter((x) => x.status === "CANCELLED").length;
    if (lastFive.length >= 4 && cancelled >= 3) add("churn", `${cancelled} of this account's last ${lastFive.length} bookings were cancelled`);

    const others = mine.filter((x) => x !== o && x.status !== "EXPIRED").map(amount).filter((v) => v > 0);
    if (others.length >= 3 && amount(o) >= 3 * median(others) && amount(o) >= 2000) add("highValue", `₹${amount(o).toLocaleString("en-IN")} is over 3x this account's usual ₹${Math.round(median(others)).toLocaleString("en-IN")}`);

    const phoneUsers = byPhone.get(o.userDetails?.phone);
    if (phoneUsers && phoneUsers.size >= 4) add("sharedPhone", `The same phone number appears on ${phoneUsers.size} different accounts`);

    const ageH = users[String(o.user)]?.ageHours;
    if (ageH != null && ageH < 1 && amount(o) >= 5000) add("newHighValue", "A brand-new account made a high-value booking");

    if (score >= LEVELS[LEVELS.length - 1][0]) {
      flagged.push({ orderId: String(o._id), user: String(o.user), route: `${o.busDetails?.from} to ${o.busDetails?.to}`, amount: amount(o), status: o.status, score: Math.min(100, score), level: LEVELS.find(([min]) => score >= min)[1], reasons });
    }
  }
  flagged.sort((a, b) => b.score - a.score);
  return { flagged, reviewed: orders.length, note: "For human review only. Nothing is blocked automatically and a score is not proof of fraud." };
}

module.exports = { scoreOrders, WEIGHTS };
