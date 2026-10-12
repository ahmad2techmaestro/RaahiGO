/**
 * Pure aggregation functions for the admin dashboard. Same philosophy as
 * operatorStats.service.js: given real documents fetched by the
 * controller, compute the numbers — kept separate from the DB query so
 * the arithmetic is unit-testable without a database.
 */

/** Groups CONFIRMED/COMPLETED bookings by route, most popular first. */
function computePopularRoutes(orders, topN = 10) {
  const counts = new Map();

  for (const order of orders) {
    if (order.status !== "CONFIRMED" && order.status !== "COMPLETED") continue;
    const key = `${order.busDetails?.from} → ${order.busDetails?.to}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([route, count]) => ({ route, bookings: count }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, topN);
}

/**
 * Buckets user signups by calendar day over the last `days` days, so the
 * admin dashboard can chart real growth rather than a placeholder curve.
 */
function computeUserGrowth(users, days = 30, now = new Date()) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    buckets.set(key, 0);
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  for (const user of users) {
    const created = new Date(user.createdAt);
    if (created < cutoff) continue;
    const key = created.toISOString().split("T")[0];
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, signups]) => ({ date, signups }));
}

function cancellationRate(summary) {
  if (!summary.totalBookings) return 0;
  return Math.round((summary.cancelledBookings / summary.totalBookings) * 1000) / 10;
}

module.exports = { computePopularRoutes, computeUserGrowth, cancellationRate };
