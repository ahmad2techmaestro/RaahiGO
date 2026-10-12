const nodemailer = require("nodemailer");

let transporter = null;
let initialized = false;

/**
 * Same pattern as Redis (Phase 2) and the LLM client (Phase 5): a real
 * provider is used if configured, and every call degrades to a clear,
 * logged "simulated" result if it isn't — never a crash, never a silent
 * no-op that looks like success.
 */
function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function getTransporter() {
  if (initialized) return transporter;
  initialized = true;

  if (!isEmailConfigured()) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Sends an email if a provider is configured; otherwise returns a
 * SIMULATED result. Never throws — a notification failure should never
 * take down the booking flow that triggered it.
 */
async function sendEmail(to, subject, body) {
  if (!isEmailConfigured()) {
    return { status: "SIMULATED" };
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });
    return { status: "SENT" };
  } catch (err) {
    return { status: "FAILED", errorMessage: err.message };
  }
}

// Test seam
function __setTransporterForTests(mockTransporter) {
  transporter = mockTransporter;
  initialized = true;
}
function __resetForTests() {
  transporter = null;
  initialized = false;
}

module.exports = { sendEmail, isEmailConfigured, __setTransporterForTests, __resetForTests };
