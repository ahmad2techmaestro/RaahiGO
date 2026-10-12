/**
 * Pure functions deciding whether a specific scheduled notification
 * should fire right now, given a departure time and what's already been
 * sent. Kept separate from any DB/scheduling code so this — the actual
 * business logic — is fully unit-testable without mocking Mongo or timers.
 */

const JOURNEY_REMINDER_WINDOW_HOURS = [2, 4]; // fires once, 2-4h before departure
const BOARDING_REMINDER_WINDOW_MINUTES = [0, 45]; // fires once, 0-45min before departure

function hoursUntil(departureDateTime, now = new Date()) {
  return (new Date(departureDateTime) - now) / (1000 * 60 * 60);
}

function needsJourneyReminder(order, now = new Date()) {
  if (order.status !== "CONFIRMED") return false;
  if (order.notificationsSent?.journeyReminder) return false;

  const hrs = hoursUntil(order.departureDateTime, now);
  return hrs <= JOURNEY_REMINDER_WINDOW_HOURS[1] && hrs >= JOURNEY_REMINDER_WINDOW_HOURS[0];
}

function needsBoardingReminder(order, now = new Date()) {
  if (order.status !== "CONFIRMED") return false;
  if (order.notificationsSent?.boardingReminder) return false;

  const minutesUntil = hoursUntil(order.departureDateTime, now) * 60;
  return (
    minutesUntil <= BOARDING_REMINDER_WINDOW_MINUTES[1] &&
    minutesUntil >= BOARDING_REMINDER_WINDOW_MINUTES[0]
  );
}

function needsArrivalNotice(order, now = new Date()) {
  if (order.status !== "CONFIRMED") return false;
  if (order.notificationsSent?.arrivalNotice) return false;
  if (!order.arrivalDateTime) return false;

  return now >= new Date(order.arrivalDateTime);
}

module.exports = {
  needsJourneyReminder,
  needsBoardingReminder,
  needsArrivalNotice,
  hoursUntil,
  JOURNEY_REMINDER_WINDOW_HOURS,
  BOARDING_REMINDER_WINDOW_MINUTES,
};
