/**
 * Payment gateway abstraction.
 *
 *  - razorpay : real Razorpay Orders / Payments / Refunds (needs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET)
 *  - demo     : a self-contained sandbox that moves no real money, so the whole booking → cashback →
 *               cancellation → refund journey can be run end to end without any gateway account.
 *
 * PAYMENT_MODE=razorpay|demo forces a mode; otherwise it is `razorpay` when keys exist, else `demo`.
 * Signatures in demo mode are real HMACs, so /verify exercises the same code path in both modes.
 */
const crypto = require("crypto");

// Set when Razorpay rejects our credentials at runtime, so checkout keeps working in the sandbox instead of erroring.
let degraded = false;
const PLACEHOLDER = /^(your_|<|xxx|changeme|test_key|rzp_test_x)/i;
const realKey = (v) => Boolean(v) && !PLACEHOLDER.test(String(v).trim());

function mode() {
  const forced = String(process.env.PAYMENT_MODE || "").toLowerCase();
  const hasKeys = realKey(process.env.RAZORPAY_KEY_ID) && realKey(process.env.RAZORPAY_KEY_SECRET) && !degraded;
  if (forced === "demo") return "demo";
  if (forced === "razorpay") return hasKeys ? "razorpay" : "demo";
  return hasKeys ? "razorpay" : "demo";
}

function secret() {
  return mode() === "razorpay"
    ? process.env.RAZORPAY_KEY_SECRET
    : process.env.DEMO_PAYMENT_SECRET || process.env.JWT_SECRET || "raahigo-demo-secret";
}

function sign(orderId, paymentId) {
  return crypto.createHmac("sha256", secret()).update(`${orderId}|${paymentId}`).digest("hex");
}

function verifySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = Buffer.from(sign(orderId, paymentId));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function razorpayClient() {
  const Razorpay = require("razorpay");
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

/** Creates a gateway order for `amount` rupees. */
async function createOrder({ amount, receipt, notes }) {
  const paise = Math.round(amount * 100);
  if (mode() === "demo") {
    return { id: `order_demo_${crypto.randomBytes(8).toString("hex")}`, amount: paise, currency: "INR", gateway: "demo" };
  }
  try {
    const order = await razorpayClient().orders.create({ amount: paise, currency: "INR", receipt, notes });
    return { ...order, gateway: "razorpay" };
  } catch (err) {
    // 401 = the configured keys are wrong. Fall back to the sandbox rather than blocking every payment.
    if (err?.statusCode === 401 || /authentication/i.test(String(err?.error?.description || err?.message))) {
      degraded = true;
      console.warn("[payment] Razorpay rejected the configured keys — falling back to the demo sandbox. Fix RAZORPAY_KEY_ID/SECRET.");
      return createOrder({ amount, receipt, notes });
    }
    throw err;
  }
}

/** Which method (upi / card / netbanking / wallet…) the traveller actually paid with. */
async function fetchPaymentMethod(paymentId, intent) {
  if (intent?.gateway === "demo") return intent.demoMethod || null;
  try {
    const payment = await razorpayClient().payments.fetch(paymentId);
    return payment?.method || null;
  } catch {
    return null;
  }
}

/** Refunds `amount` rupees of a captured payment. Returns { id, status } where status is processed|pending. */
async function refund({ paymentId, amount, gateway, notes }) {
  if (gateway === "demo" || mode() === "demo") {
    return { id: `rfnd_demo_${crypto.randomBytes(7).toString("hex")}`, status: "pending", amount };
  }
  const result = await razorpayClient().payments.refund(paymentId, {
    amount: Math.round(amount * 100),
    speed: "optimum",
    notes,
  });
  return { id: result.id, status: result.status === "processed" ? "processed" : "pending", amount };
}

/** Settles a gateway refund's status. Razorpay is asked; demo refunds settle once their ETA has passed. */
async function refundStatus({ refundId, gateway, completesAt }) {
  if (gateway === "demo" || String(refundId || "").startsWith("rfnd_demo_")) {
    return completesAt && new Date(completesAt) <= new Date() ? "processed" : "pending";
  }
  try {
    const r = await razorpayClient().refunds.fetch(refundId);
    return r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending";
  } catch {
    return "pending";
  }
}

module.exports = { mode, sign, verifySignature, createOrder, fetchPaymentMethod, refund, refundStatus };
