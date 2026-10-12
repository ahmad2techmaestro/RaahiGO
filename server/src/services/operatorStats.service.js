/**
 * Pure aggregation math for the operator dashboard — given real order
 * documents (fetched by the controller via a normal Mongoose query), these
 * compute the summary numbers. Kept separate from the DB query so the
 * actual arithmetic is unit-testable without a database.
 */

function countSeats(ticketString) {
  return String(ticketString || "")
    .split(",")
    .filter(Boolean).length;
}

/**
 * Summarizes a set of orders for a single bus (or a set of buses) into
 * the numbers an operator dashboard actually needs.
 */
function summarizeOrders(orders) {
  const summary = {
    totalBookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    totalRevenue: 0,
    totalSeatsSold: 0,
  };

  for (const order of orders) {
    summary.totalBookings++;

    if (order.status === "CONFIRMED" || order.status === "COMPLETED") {
      summary.confirmedBookings++;
      summary.totalRevenue += Number(order.ticketSummary?.amount) || 0;
      summary.totalSeatsSold += countSeats(order.ticketSummary?.ticket);
    } else if (order.status === "CANCELLED") {
      summary.cancelledBookings++;
    }
  }

  return summary;
}

/**
 * Occupancy for one bus on one date: how many of its seats are booked,
 * as a percentage of total capacity.
 */
function occupancyPercent(seatsBooked, totalSeats) {
  if (!totalSeats || totalSeats <= 0) return 0;
  const pct = (seatsBooked / totalSeats) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

/** Groups orders by bus id, for a multi-bus operator dashboard. */
function groupOrdersByBus(orders) {
  const map = new Map();
  for (const order of orders) {
    const busId = String(order.bus);
    if (!map.has(busId)) map.set(busId, []);
    map.get(busId).push(order);
  }
  return map;
}

module.exports = { countSeats, summarizeOrders, occupancyPercent, groupOrdersByBus };
