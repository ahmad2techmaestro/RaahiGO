const express = require("express");
const Order = require("../models/order.model");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { generateVerificationToken } = require("../services/ticketVerification.service");

const app = express.Router();

// Every route below requires a valid JWT. req.user._id is the ONLY
// source of truth for "which user is this" — never trust a body/param id.
app.use(requireAuth);

// Get the authenticated user's bookings (all statuses)
app.post(
  "/myticket",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(300).lean();
    res.send(orders);
  })
);

// Today's journeys for the authenticated user
app.post(
  "/myticket/today",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id, status: "CONFIRMED" });
    const today = new Date().toDateString();
    const todays = orders.filter(
      (o) => o.ticketSummary?.date && new Date(o.ticketSummary.date).toDateString() === today
    );
    res.send(todays);
  })
);

// Upcoming journeys for the authenticated user
app.post(
  "/myticket/upcoming",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id, status: "CONFIRMED" });
    // "Upcoming" starts tomorrow — today's journeys have their own list.
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const upcoming = orders.filter(
      (o) => o.ticketSummary?.date && new Date(o.ticketSummary.date) >= startOfTomorrow
    );
    res.send(upcoming);
  })
);

// Past journeys for the authenticated user
app.post(
  "/myticket/past",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({
      user: req.user._id,
      status: { $in: ["CONFIRMED", "COMPLETED"] },
    });
    // "Past" ends at midnight — a journey today is never listed as past.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const past = orders.filter(
      (o) => o.ticketSummary?.date && new Date(o.ticketSummary.date) < startOfToday
    );
    res.send(past);
  })
);

// Full ticket details for display/print/QR — ownership verified against
// the authenticated user, same as every other route in this file.
app.get(
  "/:orderId/ticket",
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) throw new AppError("Booking not found", 404);
    if (String(order.user) !== String(req.user._id)) {
      throw new AppError("You do not have permission to view this booking", 403);
    }

    const clientOrigin = (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, ""); // first entry is the public site
    const token = generateVerificationToken(order._id);
    const verificationUrl = `${clientOrigin}/verify/${order._id}?token=${token}`;

    res.json({ order, verificationUrl });
  })
);

const booking = require("../services/booking.service");
const { REFUND_TIERS, CANCELLATION_CLOSES_HOURS, WALLET_BONUS_PERCENT, WALLET_BONUS_CAP, BANK_REFUND_DAYS } = require("../services/cancellation.service");

const asDestination = (v) => (String(v || "").toUpperCase() === "WALLET" ? "WALLET" : "SOURCE");

async function ownedOrder(req) {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new AppError("Booking not found", 404);
  if (String(order.user) !== String(req.user._id)) {
    throw new AppError("You do not have permission to access this booking", 403);
  }
  return order;
}

// The public cancellation policy, so the UI can show it without hard-coding numbers.
app.get("/policy", (req, res) => {
  res.json({
    tiers: REFUND_TIERS,
    closesHoursBeforeDeparture: CANCELLATION_CLOSES_HOURS,
    walletBonusPercent: WALLET_BONUS_PERCENT,
    walletBonusCap: WALLET_BONUS_CAP,
    bankRefundDays: BANK_REFUND_DAYS,
  });
});

// What would cancelling this booking refund, right now, for each destination?
app.get(
  "/:orderId/cancel-preview",
  asyncHandler(async (req, res) => {
    const order = await ownedOrder(req);
    if (order.status !== "CONFIRMED") throw new AppError(`Booking with status ${order.status} cannot be cancelled`, 409);
    const [source, walletPlan] = await Promise.all([
      booking.previewCancellation(order, req.user._id, "SOURCE"),
      booking.previewCancellation(order, req.user._id, "WALLET"),
    ]);
    res.json({ source, wallet: walletPlan, policy: REFUND_TIERS, paidWithWallet: order.pricing?.walletUsed || 0 });
  })
);

// Refund progress for a cancelled booking. Settles bank refunds lazily on read.
app.get(
  "/:orderId/refund",
  asyncHandler(async (req, res) => {
    const order = await booking.refreshRefund(await ownedOrder(req));
    res.json({ status: order.status, refund: order.refund, cancelledAt: order.cancelledAt });
  })
);

// Cancel a booking: tiered refund to the original method or instantly to the wallet, seats go back on sale.
app.delete(
  "/oneorder/:orderId",
  asyncHandler(async (req, res) => {
    const { order, plan } = await booking.cancelBooking({
      orderId: req.params.orderId,
      userId: req.user._id,
      destination: asDestination(req.body?.destination),
      reason: req.body?.reason,
    });
    res.send({ message: "Booking cancelled", order, plan });
  })
);

module.exports = app;
