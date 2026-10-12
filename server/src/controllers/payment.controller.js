const router = require("express").Router();
const crypto = require("crypto");
const PaymentIntent = require("../models/paymentIntent.model");
const gateway = require("../services/payment/gateway");
const booking = require("../services/booking.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");

const DEMO_METHODS = ["UPI", "CARD", "NETBANKING", "WALLET"];

/** Public: which gateway the client should open. Only the publishable key id is ever exposed. */
router.get("/config", (req, res) => {
  const mode = gateway.mode();
  res.json({ mode, keyId: mode === "razorpay" ? process.env.RAZORPAY_KEY_ID : null });
});

const parseSeats = (value) => (Array.isArray(value) ? value : String(value || "").split(",")).map((s) => String(s).trim()).filter(Boolean);

/** Read-only price quote: totals, wallet usage and the cashback each payment method would earn. */
router.get(
  "/quote",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { busId, date, seats, couponCode, useWallet } = req.query;
    const quote = await booking.quoteCheckout({
      userId: req.user._id, busId, date, seats: parseSeats(seats), couponCode: couponCode || undefined, useWallet: useWallet === "true",
    });
    res.json(quote);
  })
);

/**
 * Opens a checkout. The server prices it from the bus's own fare — the browser sends WHAT to book
 * (bus, date, seats, coupon, wallet choice), never HOW MUCH it costs.
 */
router.post(
  "/ticket",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { busId, date, seats, couponCode, useWallet, from, to, email, name } = req.body;
    const checkout = await booking.createCheckout({
      userId: req.user._id, busId, date, seats: parseSeats(seats), couponCode: couponCode || undefined, useWallet: Boolean(useWallet),
      notes: { from: from || "", to: to || "", email: email || "", name: name || "" },
    });
    res.status(201).json(checkout);
  })
);

/**
 * Demo gateway only: stands in for the card/UPI authorisation step. It hands back a signed payment
 * so that /verify below runs exactly the same checks it runs for Razorpay. Disabled in razorpay mode.
 */
router.post(
  "/demo/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (gateway.mode() !== "demo") throw new AppError("Demo payments are disabled", 404);
    const { orderId, method } = req.body;
    const key = String(method || "").toUpperCase();
    if (!DEMO_METHODS.includes(key)) throw new AppError("Choose a payment method", 400);

    const paymentId = `pay_demo_${crypto.randomBytes(8).toString("hex")}`;
    const intent = await PaymentIntent.findOneAndUpdate(
      { gatewayOrderId: orderId, user: req.user._id, status: "CREATED", gateway: "demo" },
      { $set: { demoPaymentId: paymentId, demoMethod: key } },
      { new: true }
    );
    if (!intent) throw new AppError("This checkout is no longer active", 409);

    res.json({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: gateway.sign(orderId, paymentId),
    });
  })
);

/** Releases a checkout the traveller walked away from, returning any wallet amount immediately. */
router.post(
  "/abandon",
  requireAuth,
  asyncHandler(async (req, res) => {
    const intent = await PaymentIntent.findOne({ gatewayOrderId: req.body.orderId, user: req.user._id });
    if (intent && intent.status === "CREATED") await booking.releaseIntentWallet(intent);
    res.json({ ok: true });
  })
);

/**
 * Verifies the payment signature and, only then, creates the booking from the server-side intent.
 * This is the one path that creates a CONFIRMED order.
 */
router.post(
  "/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userDetails, lockToken } = req.body;
    if (!userDetails || !userDetails.name || !userDetails.email) throw new AppError("Missing passenger details", 400);

    const { order, cashback, repeated } = await booking.confirmBooking({
      userId: req.user._id,
      gatewayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      userDetails: {
        name: String(userDetails.name).slice(0, 80), age: String(userDetails.age || ""), gender: String(userDetails.gender || ""),
        email: String(userDetails.email).slice(0, 120), phone: String(userDetails.phone || ""),
      },
      lockToken,
    });

    res.status(repeated ? 200 : 201).json({
      message: repeated ? "Payment already processed" : "Payment verified and booking confirmed",
      order,
      cashback,
    });
  })
);

module.exports = router;
