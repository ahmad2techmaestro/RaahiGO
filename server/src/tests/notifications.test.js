/**
 * Notification tests. Run with: node src/tests/notifications.test.js
 *
 * No real SMTP or webhook calls are made — emailProvider degrades to
 * SIMULATED without SMTP_* env vars set (checked explicitly), and webhook
 * signature verification is tested against locally-computed HMACs, the
 * same way a real Razorpay webhook would be verified.
 */
const crypto = require("crypto");

delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const templates = require("../services/notifications/templates");
const {
  needsJourneyReminder,
  needsBoardingReminder,
  needsArrivalNotice,
} = require("../services/notifications/reminderEligibility");
const { verifyWebhookSignature } = require("../services/razorpayWebhook.service");
const { sendEmail, isEmailConfigured, __resetForTests } = require("../services/notifications/emailProvider");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

const sampleOrder = {
  _id: "68f0000000000000000000ab",
  user: "68f0000000000000000000cd",
  status: "CONFIRMED",
  busDetails: {
    name: "Purple Voyager",
    from: "Mumbai",
    to: "Pune",
    departure: "20",
    arrival: "23",
  },
  ticketSummary: { date: new Date("2026-10-15"), ticket: "12,13", amount: "900" },
  userDetails: { name: "Asha Rao", email: "asha@example.com", phone: "9876543210" },
  refund: { status: "PROCESSING", amount: 90000 },
};

console.log("\nTemplates — grounded in real order data, nothing invented");

{
  const { subject, body } = templates.bookingConfirmation(sampleOrder);
  assert(subject.includes("Mumbai") && subject.includes("Pune"), "confirmation subject includes the real route");
  assert(body.includes("Asha Rao"), "confirmation body addresses the real passenger by name");
  assert(body.includes("12,13"), "confirmation body includes the real seat numbers");
  assert(body.includes("900"), "confirmation body includes the real amount paid");
  assert(!body.toLowerCase().includes("hotel") && !body.toLowerCase().includes("restaurant"), "confirmation never invents hotel/restaurant suggestions");
}

{
  const { subject, body } = templates.paymentFailed(sampleOrder, "insufficient funds");
  assert(subject.toLowerCase().includes("failed"), "payment-failed subject says failed");
  assert(body.includes("insufficient funds"), "payment-failed body includes the real failure reason when given");
}

{
  const { body } = templates.paymentFailed({ busDetails: sampleOrder.busDetails, userDetails: null });
  assert(body.includes("Hi there"), "payment-failed handles a missing passenger name without crashing");
}

{
  const { body } = templates.cancellationRefund(sampleOrder);
  assert(body.includes("Mumbai") && body.includes("Pune"), "cancellation body includes the real route");
  assert(body.toLowerCase().includes("refund"), "cancellation body mentions the refund");
}

{
  const failedRefundOrder = { ...sampleOrder, refund: { status: "FAILED" } };
  const { body } = templates.cancellationRefund(failedRefundOrder);
  assert(
    body.includes("manual") || body.includes("follow up"),
    "a failed automatic refund is disclosed honestly, not silently claimed as processed"
  );
}

{
  const { body } = templates.busDelayed(sampleOrder, 25);
  assert(body.includes("25 minutes"), "delay notice includes the real, reported delay amount");
}

{
  const { body } = templates.journeyReminder(sampleOrder, 3);
  assert(body.includes("3 hours"), "journey reminder includes the real hours-until-departure");
  assert(body.includes("12,13"), "journey reminder includes the real seat numbers");
}

console.log("\nReminder eligibility — pure scheduling logic");

function orderAt(hoursFromNow, overrides = {}) {
  const departure = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return {
    status: "CONFIRMED",
    departureDateTime: departure,
    notificationsSent: { journeyReminder: false, boardingReminder: false, arrivalNotice: false },
    ...overrides,
  };
}

assert(needsJourneyReminder(orderAt(3)) === true, "3 hours out is inside the journey-reminder window");
assert(needsJourneyReminder(orderAt(10)) === false, "10 hours out is too early for a journey reminder");
assert(needsJourneyReminder(orderAt(0.5)) === false, "30 minutes out is too late for the journey reminder (boarding reminder's job instead)");
assert(
  needsJourneyReminder(orderAt(3, { notificationsSent: { journeyReminder: true } })) === false,
  "a journey reminder already sent is never sent twice"
);
assert(
  needsJourneyReminder(orderAt(3, { status: "CANCELLED" })) === false,
  "a cancelled booking never gets a journey reminder"
);

assert(needsBoardingReminder(orderAt(0.3)) === true, "18 minutes out is inside the boarding-reminder window");
assert(needsBoardingReminder(orderAt(2)) === false, "2 hours out is too early for a boarding reminder");
assert(needsBoardingReminder(orderAt(-0.1)) === false, "a bus that already departed doesn't get a boarding reminder");
assert(
  needsBoardingReminder(orderAt(0.3, { notificationsSent: { boardingReminder: true } })) === false,
  "a boarding reminder already sent is never sent twice"
);

{
  const arrived = {
    status: "CONFIRMED",
    arrivalDateTime: new Date(Date.now() - 60 * 60 * 1000),
    notificationsSent: { arrivalNotice: false },
  };
  assert(needsArrivalNotice(arrived) === true, "a journey whose arrival time has passed needs an arrival notice");
}
{
  const notYet = {
    status: "CONFIRMED",
    arrivalDateTime: new Date(Date.now() + 60 * 60 * 1000),
    notificationsSent: { arrivalNotice: false },
  };
  assert(needsArrivalNotice(notYet) === false, "a journey still in progress doesn't get an arrival notice yet");
}
{
  const alreadySent = {
    status: "CONFIRMED",
    arrivalDateTime: new Date(Date.now() - 60 * 60 * 1000),
    notificationsSent: { arrivalNotice: true },
  };
  assert(needsArrivalNotice(alreadySent) === false, "an arrival notice already sent is never sent twice");
}

console.log("\nRazorpay webhook signature verification");

{
  const secret = "whsec_test123";
  const body = Buffer.from(JSON.stringify({ event: "payment.failed" }));
  const validSig = crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert(verifyWebhookSignature(body, validSig, secret) === true, "a genuine signature verifies successfully");
  assert(verifyWebhookSignature(body, "0".repeat(64), secret) === false, "a wrong signature fails verification");
  assert(verifyWebhookSignature(body, validSig, "wrong-secret") === false, "the right signature with the wrong secret fails");
}

{
  const body = Buffer.from(JSON.stringify({ event: "payment.failed" }));
  const tamperedBody = Buffer.from(JSON.stringify({ event: "payment.captured" }));
  const secret = "whsec_test123";
  const sigForOriginal = crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert(
    verifyWebhookSignature(tamperedBody, sigForOriginal, secret) === false,
    "a signature computed for one body fails against a different (tampered) body"
  );
}

assert(verifyWebhookSignature(Buffer.from("x"), null, "secret") === false, "a missing signature fails verification rather than throwing");
assert(verifyWebhookSignature(null, "sig", "secret") === false, "a missing body fails verification rather than throwing");
assert(verifyWebhookSignature(Buffer.from("x"), "sig", null) === false, "a missing secret fails verification rather than throwing");

console.log("\nEmail provider — graceful degradation without SMTP configured");

async function runAsync() {
  __resetForTests();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  assert(isEmailConfigured() === false, "without SMTP_* env vars, email is reported as not configured");

  const result = await sendEmail("someone@example.com", "Subject", "Body");
  assert(result.status === "SIMULATED", "sending without a configured provider returns SIMULATED, not a crash or a silent success");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runAsync().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
