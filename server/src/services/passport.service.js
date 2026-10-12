/**
 * "Journey Passport": a traveller's stats, computed purely from their own bookings.
 * Nothing here is stored — it can't drift from the real records.
 */
const AVG_BUS_SPEED_KMPH = 50;
// Rough per-passenger emissions in kg CO₂ per km: a petrol car with one occupant vs. an intercity bus.
const CAR_KG_PER_KM = 0.17;
const BUS_KG_PER_KM = 0.03;

const rupees = (v) => Number(v) || 0;

function tripHours(order) {
  const dep = Number(order.busDetails?.departure);
  const arr = Number(order.busDetails?.arrival);
  if (!Number.isFinite(dep) || !Number.isFinite(arr)) return 0;
  const diff = (arr - dep + 24) % 24;
  return diff === 0 ? 24 : diff;
}

function buildPassport(orders, now = new Date()) {
  const completed = orders.filter((o) => o.status !== "CANCELLED" && o.status !== "PAYMENT_PENDING" && o.status !== "PENDING" && o.status !== "EXPIRED");
  const cancelled = orders.filter((o) => o.status === "CANCELLED");
  const cities = new Set();
  const routes = new Map();
  const operators = new Map();
  let spent = 0, saved = 0, hours = 0, km = 0, co2 = 0, seatsTotal = 0, upcoming = 0;
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  completed.forEach((o) => {
    const { from, to, name } = o.busDetails || {};
    if (from) cities.add(from);
    if (to) cities.add(to);
    const route = `${from} → ${to}`;
    routes.set(route, (routes.get(route) || 0) + 1);
    if (name) operators.set(name, (operators.get(name) || 0) + 1);

    const seats = String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length || 1;
    const h = tripHours(o);
    const distance = h * AVG_BUS_SPEED_KMPH;
    seatsTotal += seats;
    hours += h;
    km += distance * seats;
    co2 += distance * seats * (CAR_KG_PER_KM - BUS_KG_PER_KM);
    spent += rupees(o.pricing?.ticketValue ?? o.ticketSummary?.amount);
    saved += rupees(o.pricing?.couponDiscount ?? o.coupon?.discount) + (o.pricing?.cashback?.reversed ? 0 : rupees(o.pricing?.cashback?.amount));
    if (o.ticketSummary?.date && new Date(o.ticketSummary.date) >= today) upcoming += 1;
  });

  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const topRoute = top(routes);
  const topOperator = top(operators);

  return {
    trips: completed.length,
    upcoming,
    cancelled: cancelled.length,
    seats: seatsTotal,
    cities: [...cities].sort(),
    hoursOnRoad: hours,
    kmTravelled: Math.round(km),
    spent: Math.round(spent),
    saved: Math.round(saved),
    co2SavedKg: Math.round(co2 * 10) / 10,
    topRoute: topRoute ? { route: topRoute[0], trips: topRoute[1] } : null,
    topOperator: topOperator ? { name: topOperator[0], trips: topOperator[1] } : null,
  };
}

module.exports = { buildPassport, tripHours };
