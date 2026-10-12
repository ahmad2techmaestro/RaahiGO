const express = require("express");
const Order = require("../models/order.model");
const BusModel = require("../models/bus.model");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { getLiveTrackingInfo, reportDelay } = require("../services/tracking.service");
const { decorate } = require("../services/busSearch.service");
const { notify } = require("../services/notifications/notify");

const app = express.Router();
app.use(requireAuth);

/**
 * GET /tracking/:orderId
 * Ownership-checked, same pattern as the ticket endpoint — a booking's
 * live tracking is only visible to the passenger who holds it.
 */
app.get(
  "/:orderId",
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) throw new AppError("Booking not found", 404);
    if (String(order.user) !== String(req.user._id)) {
      throw new AppError("You do not have permission to view this tracking", 403);
    }
    if (order.status !== "CONFIRMED") {
      throw new AppError("Tracking is only available for confirmed bookings", 400);
    }

    const busDoc = await BusModel.findById(order.bus).lean();
    if (!busDoc) throw new AppError("Bus not found", 404);

    const decorated = decorate(busDoc, order.ticketSummary.date);
    const info = await getLiveTrackingInfo(decorated, order.ticketSummary.date);

    res.json(info);
  })
);

/**
 * POST /tracking/:busId/delay
 * FIXED in Phase 10: this used to be open to any authenticated user, with
 * that gap stated plainly rather than hidden. Now it genuinely requires
 * the OPERATOR role AND ownership of this specific bus — not just "has
 * some role", but "owns this exact resource".
 */
app.post(
  "/:busId/delay",
  requireRole("OPERATOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { date, delayMinutes } = req.body;
    if (!date || delayMinutes == null) {
      throw new AppError("date and delayMinutes are required", 400);
    }

    const bus = await BusModel.findById(req.params.busId).lean();
    if (!bus) throw new AppError("Bus not found", 404);
    if (req.user.role !== "ADMIN" && String(bus.operator) !== String(req.user._id)) {
      throw new AppError("You can only report delays for your own buses", 403);
    }

    const result = await reportDelay(req.params.busId, date, delayMinutes);

    // Notify every passenger with a CONFIRMED booking on this bus/date —
    // a genuinely real fan-out trigger, not a per-user action.
    if (result.stored && Number(delayMinutes) > 0) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const affectedOrders = await Order.find({
        bus: req.params.busId,
        status: "CONFIRMED",
        "ticketSummary.date": { $gte: dayStart, $lte: dayEnd },
      });

      affectedOrders.forEach((order) => notify("BUS_DELAYED", order, { delayMinutes }));
    }

    res.json(result);
  })
);

module.exports = app;
