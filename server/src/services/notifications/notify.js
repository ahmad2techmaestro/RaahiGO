const NotificationLog = require("../../models/notificationLog.model");
const { sendEmail } = require("./emailProvider");
const templates = require("./templates");

const TEMPLATE_BY_TYPE = {
  BOOKING_CONFIRMATION: (order) => templates.bookingConfirmation(order),
  PAYMENT_FAILED: (order, extra) => templates.paymentFailed(order, extra?.reason),
  CANCELLATION_REFUND: (order) => templates.cancellationRefund(order),
  BUS_DELAYED: (order, extra) => templates.busDelayed(order, extra?.delayMinutes),
  BUS_ARRIVED: (order) => templates.busArrived(order),
  JOURNEY_REMINDER: (order, extra) => templates.journeyReminder(order, extra?.hoursUntilDeparture),
  BOARDING_REMINDER: (order) => templates.boardingReminder(order),
};

/**
 * The single entry point every trigger in the app calls. Composes the
 * right template from real order data, attempts to send it, and always
 * logs the outcome — so even in SIMULATED mode (no SMTP configured) there
 * is a real, inspectable record of what would have been sent to whom.
 *
 * Never throws: a notification failure must never break the booking,
 * cancellation, or delay-reporting flow that triggered it.
 */
async function notify(type, order, extra = {}) {
  try {
    const templateFn = TEMPLATE_BY_TYPE[type];
    if (!templateFn) {
      console.error(`[notify] unknown notification type: ${type}`);
      return null;
    }

    const recipient = order.userDetails?.email;
    if (!recipient) {
      console.error(`[notify] order ${order._id} has no recipient email`);
      return null;
    }

    const { subject, body } = templateFn(order, extra);
    const result = await sendEmail(recipient, subject, body);

    const log = await NotificationLog.create({
      user: order.user,
      order: order._id,
      type,
      channel: "EMAIL",
      recipient,
      subject,
      body,
      status: result.status,
      errorMessage: result.errorMessage,
    });

    return log;
  } catch (err) {
    console.error("[notify] unexpected error:", err.message);
    return null;
  }
}

module.exports = { notify, TEMPLATE_BY_TYPE };
