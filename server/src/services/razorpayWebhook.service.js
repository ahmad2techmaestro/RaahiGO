const crypto = require("crypto");

/**
 * Verifies a Razorpay webhook's signature. This is a DIFFERENT secret and
 * scheme from the payment.controller.js checkout signature check — that
 * one verifies a client-reported payment id/order id pair; this one
 * verifies that an incoming HTTP request genuinely came from Razorpay's
 * servers, over the raw request body bytes (which is why the webhook
 * route needs raw-body parsing — see index.js).
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(String(signature), "hex");

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { verifyWebhookSignature };
