const express = require("express");
const { verifyWebhookSignature } = require("../services/razorpayWebhook.service");
const { sendEmail } = require("../services/notifications/emailProvider");
const templates = require("../services/notifications/templates");
const NotificationLog = require("../models/notificationLog.model");

const app = express.Router();

/**
 * POST /webhooks/razorpay
 *
 * Configure this URL in the Razorpay Dashboard (Settings → Webhooks) for
 * the `payment.failed` event, with RAZORPAY_WEBHOOK_SECRET set to match.
 *
 * This is the production-correct way to learn about a failed payment —
 * the client-side `payment.failed` handler in razorpay.js can be closed
 * or lost before it fires, but Razorpay's server-to-server webhook is
 * reliable. Requires the raw request body for signature verification,
 * which is why this route is mounted with express.raw() in index.js
 * BEFORE the app-wide express.json() middleware.
 */
app.post("/razorpay", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      // Not configured — acknowledge so Razorpay doesn't retry forever,
      // but do nothing. Same graceful-degradation stance as everywhere
      // else: an unconfigured optional feature must not error out.
      return res.status(200).json({ received: true, processed: false });
    }

    const rawBody = req.body; // Buffer, thanks to express.raw()
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      const notes = payment?.notes || {};

      const pseudoOrder = {
        busDetails: { from: notes.from || "your route", to: notes.to || "" },
        userDetails: { name: notes.name || "there", email: notes.email || payment?.email },
      };

      if (pseudoOrder.userDetails.email) {
        const { subject, body } = templates.paymentFailed(
          pseudoOrder,
          payment?.error_description
        );
        const result = await sendEmail(pseudoOrder.userDetails.email, subject, body);

        if (notes.userId) {
          await NotificationLog.create({
            user: notes.userId,
            order: null,
            type: "PAYMENT_FAILED",
            channel: "EMAIL",
            recipient: pseudoOrder.userDetails.email,
            subject,
            body,
            status: result.status,
          });
        }
      }
    }

    res.status(200).json({ received: true, processed: true });
  } catch (err) {
    console.error("[webhook] razorpay handler error:", err.message);
    // Still 200 — Razorpay retries on non-2xx, and a bug on our side
    // shouldn't cause runaway webhook retries.
    res.status(200).json({ received: true, processed: false });
  }
});

module.exports = app;
