/**
 * Disruption preview: if a bus is delayed or cancelled on a date, who is affected and what could be offered.
 * Read-only. It sends nothing, refunds nothing and changes nothing; the operator reviews and acts.
 */
const { directOptions } = require("./journeyPlanner");
const seatCount = (o) => String(o.ticketSummary?.ticket || "").split(",").filter(Boolean).length;
const amount = (o) => Number(o.ticketSummary?.amount) || 0;
const sameDay = (d, date) => { const x = new Date(d); return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === date; };

function previewDisruption({ bus, orders, date, type, delayMinutes = 0, buses = [] }) {
  if (!["DELAYED", "CANCELLED"].includes(type)) return { error: "type must be DELAYED or CANCELLED" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return { error: "date must be YYYY-MM-DD" };
  const delay = Math.round(Number(delayMinutes) || 0);
  if (type === "DELAYED" && (delay < 15 || delay > 720)) return { error: "delayMinutes must be between 15 and 720" };

  const affected = orders.filter((o) => String(o.bus) === String(bus._id) && o.status === "CONFIRMED" && sameDay(o.ticketSummary?.date, date));
  const passengers = affected.reduce((s, o) => s + seatCount(o), 0);
  const value = affected.reduce((s, o) => s + amount(o), 0);
  const others = directOptions(buses.filter((b) => String(b._id) !== String(bus._id)), bus.from, bus.to, date).slice(0, 4);

  const preview = {
    type, date, route: `${bus.from} to ${bus.to}`, operator: bus.companyname,
    affected: { bookings: affected.length, passengers, ticketValue: value },
    alternatives: others,
    proposals: [],
    drafts: {},
  };
  if (type === "CANCELLED") {
    preview.proposals.push(`Offer all ${affected.length} booking${affected.length === 1 ? "" : "s"} a full refund (₹${value.toLocaleString("en-IN")}) because the operator cancelled. Refunds are not issued by this preview.`);
    if (others.length) preview.proposals.push(`${others.length} other direct bus${others.length > 1 ? "es have" : " has"} seats that day, from ₹${others[0].price}.`);
    preview.drafts.message = `Your ${preview.route} bus on ${date} has been cancelled by the operator. You are entitled to a full refund. Alternative buses may be available on RaahiGo.`;
  } else {
    preview.proposals.push(`Tell ${affected.length} booking${affected.length === 1 ? "" : "s"} about the ${delay}-minute delay and the new departure time.`);
    if (delay >= 180) preview.proposals.push("A delay of 3 hours or more may justify offering a fee-free cancellation.");
    preview.drafts.message = `Your ${preview.route} bus on ${date} is running about ${delay} minutes late. We'll keep you updated.`;
  }
  return preview;
}

module.exports = { previewDisruption };
