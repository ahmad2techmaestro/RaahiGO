const express = require("express");
const rateLimit = require("express-rate-limit");
const Order = require("../models/order.model");
const { asyncHandler, AppError } = require("../utils/errors");
const { verifyToken } = require("../services/ticketVerification.service");

const app = express.Router();

// Public and unauthenticated by design (a conductor scanning a QR isn't
// logged into the passenger's account) — rate-limited instead, since it's
// the one order-related endpoint that doesn't require a JWT.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /verify/:orderId?token=...
 *
 * Deliberately returns less than the authenticated ticket endpoint: no
 * email, no phone, no payment details — just enough for someone checking
 * a ticket to confirm it's real. The token (not a session) is what proves
 * the requester actually holds this ticket's QR code.
 */
app.get(
  "/:orderId",
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { token } = req.query;

    if (!verifyToken(orderId, token)) {
      throw new AppError("Invalid or tampered verification link", 400);
    }

    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new AppError("Booking not found", 404);
    }

    res.json({
      valid: true,
      status: order.status,
      passengerName: order.userDetails?.name,
      route: `${order.busDetails?.from} → ${order.busDetails?.to}`,
      operator: order.busDetails?.name,
      journeyDate: order.ticketSummary?.date,
      seats: order.ticketSummary?.ticket,
      bookingId: String(order._id),
    });
  })
);

module.exports = app;
