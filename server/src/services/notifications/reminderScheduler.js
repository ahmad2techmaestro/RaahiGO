const Order = require("../../models/order.model");
const { notify } = require("./notify");
const {
  needsJourneyReminder,
  needsBoardingReminder,
  needsArrivalNotice,
  hoursUntil,
} = require("./reminderEligibility");
const { journeyDuration } = require("../busSearch.service");
const { logger } = require("../../configs/logger");

/** Builds the departure/arrival Date objects a real order needs for the
 * pure eligibility checks, from the fields actually stored on an order. */
function withScheduleTimes(order) {
  const departureDateTime = new Date(order.ticketSummary.date);
  departureDateTime.setHours(Number(order.busDetails.departure) || 0, 0, 0, 0);

  const durationHours = journeyDuration(order.busDetails.departure, order.busDetails.arrival);
  const arrivalDateTime = new Date(departureDateTime.getTime() + durationHours * 60 * 60 * 1000);

  return { ...order, departureDateTime, arrivalDateTime };
}

/**
 * One scheduler pass: finds CONFIRMED orders whose journey is within the
 * next few days (keeps the query small — no need to scan the whole
 * collection every tick), checks each against the pure eligibility rules,
 * and sends + marks whatever is due.
 *
 * Returns counts for observability/testing rather than void, so a caller
 * (or a test) can assert on what actually happened this tick.
 */
async function runReminderTick(now = new Date()) {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const candidates = await Order.find({
    status: "CONFIRMED",
    "ticketSummary.date": { $gte: windowStart, $lte: windowEnd },
  });

  const counts = { journeyReminder: 0, boardingReminder: 0, arrivalNotice: 0 };

  for (const orderDoc of candidates) {
    const order = withScheduleTimes(orderDoc.toObject());

    if (needsJourneyReminder(order, now)) {
      const hrs = Math.round(hoursUntil(order.departureDateTime, now));
      await notify("JOURNEY_REMINDER", order, { hoursUntilDeparture: hrs });
      orderDoc.notificationsSent.journeyReminder = true;
      counts.journeyReminder++;
    }

    if (needsBoardingReminder(order, now)) {
      await notify("BOARDING_REMINDER", order);
      orderDoc.notificationsSent.boardingReminder = true;
      counts.boardingReminder++;
    }

    if (needsArrivalNotice(order, now)) {
      await notify("BUS_ARRIVED", order);
      orderDoc.notificationsSent.arrivalNotice = true;
      counts.arrivalNotice++;
    }

    if (orderDoc.isModified()) {
      await orderDoc.save();
    }
  }

  return counts;
}

let intervalHandle = null;

/** Starts the periodic scheduler. Safe to call once at server boot;
 * disabled entirely if REMINDER_SCHEDULER_ENABLED=false, so it never
 * fights with tests or a second instance during development. */
function startReminderScheduler(intervalMs = 15 * 60 * 1000) {
  if (process.env.REMINDER_SCHEDULER_ENABLED === "false") {
    logger.info("[reminders] scheduler disabled via REMINDER_SCHEDULER_ENABLED=false");
    return;
  }
  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    try {
      const counts = await runReminderTick();
      const total = counts.journeyReminder + counts.boardingReminder + counts.arrivalNotice;
      if (total > 0) {
        logger.info({ counts }, "[reminders] tick sent");
      }
    } catch (err) {
      logger.error({ err }, "[reminders] tick failed");
    }
  }, intervalMs);

  // Don't let this timer keep the process alive on its own during shutdown.
  intervalHandle.unref?.();
}

function stopReminderScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  runReminderTick,
  withScheduleTimes,
  startReminderScheduler,
  stopReminderScheduler,
};
