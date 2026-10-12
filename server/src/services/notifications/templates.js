/**
 * Every template here is a pure function: given real order/bus/user data,
 * it returns {subject, body}. No template invents facts not present in
 * the data it's given — the same "never fabricate" principle as the AI
 * trip planner in Phase 5.
 */

function bookingConfirmation(order) {
  const { busDetails, ticketSummary, userDetails } = order;
  return {
    subject: `Booking confirmed — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails.name},\n\n` +
      `Your booking is confirmed.\n\n` +
      `Route: ${busDetails.from} → ${busDetails.to}\n` +
      `Operator: ${busDetails.name}\n` +
      `Date: ${new Date(ticketSummary.date).toDateString()}\n` +
      `Departure: ${busDetails.departure}:00\n` +
      `Seat(s): ${ticketSummary.ticket}\n` +
      `Amount paid: ₹${ticketSummary.amount}\n` +
      (order.pricing?.cashback?.amount > 0
        ? `Cashback earned: ₹${order.pricing.cashback.amount} (credited to your RaahiGo Wallet)\n`
        : "") +
      `\nBooking ID: ${String(order._id).slice(-8).toUpperCase()}\n\n` +
      `Safe travels,\nRaahiGo`,
  };
}

function paymentFailed(order, reason) {
  const { busDetails, userDetails } = order;
  return {
    subject: `Payment failed — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails?.name || "there"},\n\n` +
      `Your payment for ${busDetails.from} → ${busDetails.to} could not be completed` +
      `${reason ? ` (${reason})` : ""}.\n\n` +
      `Your seat hold has not been converted to a booking. If you still want to travel, ` +
      `please search again and retry the payment.\n\n` +
      `RaahiGo`,
  };
}

function cancellationRefund(order) {
  const { busDetails, ticketSummary, userDetails, refund } = order;
  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
  const lines = [];

  if (refund?.status === "FAILED") {
    lines.push("We could not automatically process your refund — our team will follow up manually.");
  } else if (refund && refund.percent != null) {
    lines.push(`Refund policy applied: ${refund.percent}% of the ticket value (cancellation fee ${inr(refund.fee)}).`);
    if (refund.walletCredit > 0) lines.push(`${inr(refund.walletCredit)} was credited to your RaahiGo Wallet instantly.`);
    if (refund.bonus > 0) lines.push(`Instant-refund bonus: ${inr(refund.bonus)}.`);
    if (refund.gatewayAmount > 0) lines.push(`${inr(refund.gatewayAmount)} is on its way to your original payment method (about 5-7 business days).`);
    if (refund.clawback > 0) lines.push(`Cashback of ${inr(refund.clawback)} earned on this booking was reversed.`);
    lines.push(`Total returned to you: ${inr(refund.amount)}.`);
  } else {
    lines.push("Your refund is being processed.");
  }

  return {
    subject: `Booking cancelled — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails.name},\n\n` +
      `Your booking for ${busDetails.from} → ${busDetails.to} on ` +
      `${new Date(ticketSummary.date).toDateString()} has been cancelled.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Booking ID: ${String(order._id).slice(-8).toUpperCase()}\n\n` +
      `RaahiGo`,
  };
}

function busDelayed(order, delayMinutes) {
  const { busDetails, userDetails } = order;
  return {
    subject: `Delay notice — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails.name},\n\n` +
      `Your bus from ${busDetails.from} to ${busDetails.to} is running approximately ` +
      `${delayMinutes} minutes behind schedule.\n\n` +
      `RaahiGo`,
  };
}

function busArrived(order) {
  const { busDetails, userDetails } = order;
  return {
    subject: `You've arrived — ${busDetails.to}`,
    body: `Hi ${userDetails.name},\n\nYour bus has reached ${busDetails.to}. We hope you had a comfortable journey.\n\nRaahiGo`,
  };
}

function journeyReminder(order, hoursUntilDeparture) {
  const { busDetails, ticketSummary, userDetails } = order;
  return {
    subject: `Upcoming journey — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails.name},\n\n` +
      `Reminder: your bus from ${busDetails.from} to ${busDetails.to} departs in about ` +
      `${hoursUntilDeparture} hours, at ${busDetails.departure}:00 on ` +
      `${new Date(ticketSummary.date).toDateString()}.\n\n` +
      `Seat(s): ${ticketSummary.ticket}\n\n` +
      `RaahiGo`,
  };
}

function boardingReminder(order) {
  const { busDetails, ticketSummary, userDetails } = order;
  return {
    subject: `Boarding soon — ${busDetails.from} to ${busDetails.to}`,
    body:
      `Hi ${userDetails.name},\n\n` +
      `Your bus departs shortly at ${busDetails.departure}:00. Please be at the boarding point ` +
      `for ${busDetails.from} in good time.\n\n` +
      `Seat(s): ${ticketSummary.ticket}\n\n` +
      `RaahiGo`,
  };
}

module.exports = {
  bookingConfirmation,
  paymentFailed,
  cancellationRefund,
  busDelayed,
  busArrived,
  journeyReminder,
  boardingReminder,
};
