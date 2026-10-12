const express = require("express");
const BusModel = require("../models/bus.model");
const UserModel = require("../models/user.model");
const Order = require("../models/order.model");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { summarizeOrders, occupancyPercent, groupOrdersByBus } = require("../services/operatorStats.service");
const { TOTAL_SEATS, journeyDuration } = require("../services/busSearch.service");

const app = express.Router();
app.use(requireAuth);

/**
 * POST /operator/apply
 * Turns the current PASSENGER account into an OPERATOR account.
 *
 * Being upfront about scope here: this is a self-service role change with
 * no verification, KYC, or admin approval step — a real transport-operator
 * onboarding flow would need one. Building a fake "pending review" state
 * that doesn't actually gate anything would be worse than just being
 * honest that this app doesn't yet verify operator identity.
 */
app.post(
  "/apply",
  asyncHandler(async (req, res) => {
    const { companyName } = req.body;
    if (!companyName || companyName.trim().length < 2) {
      throw new AppError("companyName is required", 400);
    }

    const user = await UserModel.findByIdAndUpdate(
      req.user._id,
      {
        role: "OPERATOR",
        operatorProfile: { companyName: companyName.trim(), appliedAt: new Date() },
      },
      { new: true }
    );

    res.json({
      message: "You are now an operator. Log in again for this to take effect on your session.",
      role: user.role,
      companyName: user.operatorProfile.companyName,
    });
  })
);

// Every route below requires an operator (or admin) account.
app.use(requireRole("OPERATOR", "ADMIN"));

/** GET /operator/buses — the operator's own bus listings. */
app.get(
  "/buses",
  asyncHandler(async (req, res) => {
    const filter = req.user.role === "ADMIN" ? {} : { operator: req.user._id };
    const buses = await BusModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(buses);
  })
);

/** POST /operator/buses — create a new bus/route, owned by this operator. */
app.post(
  "/buses",
  asyncHandler(async (req, res) => {
    const { companyname, from, to, price, departure, arrival, aminites, email, phone } = req.body;

    if (!companyname || !from || !to || !price || !departure || !arrival) {
      throw new AppError(
        "companyname, from, to, price, departure and arrival are required",
        400
      );
    }
    if (Number(price) <= 0) throw new AppError("price must be positive", 400);
    if (Number(departure) < 0 || Number(departure) > 23 || Number(arrival) < 0 || Number(arrival) > 23) {
      throw new AppError("departure and arrival must be hours 0-23", 400);
    }

    const bus = await BusModel.create({
      companyname,
      from,
      to,
      price: Number(price),
      departure: String(departure),
      arrival: String(arrival),
      aminites: Array.isArray(aminites) ? aminites : [],
      email,
      phone,
      operator: req.user._id,
      status: "ACTIVE",
    });

    res.status(201).json(bus);
  })
);

/** Shared ownership check used by every :busId route below. */
async function loadOwnedBus(req) {
  const bus = await BusModel.findById(req.params.busId);
  if (!bus) throw new AppError("Bus not found", 404);
  if (req.user.role !== "ADMIN" && String(bus.operator) !== String(req.user._id)) {
    throw new AppError("You do not have permission to manage this bus", 403);
  }
  return bus;
}

/** PUT /operator/buses/:busId — update fare, schedule or amenities. */
app.put(
  "/buses/:busId",
  asyncHandler(async (req, res) => {
    const bus = await loadOwnedBus(req);

    const { price, departure, arrival, aminites } = req.body;
    if (price != null) {
      if (Number(price) <= 0) throw new AppError("price must be positive", 400);
      bus.price = Number(price);
    }
    if (departure != null) bus.departure = String(departure);
    if (arrival != null) bus.arrival = String(arrival);
    if (Array.isArray(aminites)) bus.aminites = aminites;

    await bus.save();
    res.json(bus);
  })
);

/** PUT /operator/buses/:busId/status — activate/deactivate a route.
 * A deactivated bus genuinely disappears from /bus/search (Phase 4's
 * query now filters status !== INACTIVE) — not a cosmetic toggle. */
app.put(
  "/buses/:busId/status",
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      throw new AppError("status must be ACTIVE or INACTIVE", 400);
    }
    const bus = await loadOwnedBus(req);
    bus.status = status;
    await bus.save();
    res.json(bus);
  })
);

/** GET /operator/buses/:busId/bookings — passenger manifest for one bus. */
app.get(
  "/buses/:busId/bookings",
  asyncHandler(async (req, res) => {
    const bus = await loadOwnedBus(req);
    const orders = await Order.find({ bus: bus._id }).sort({ "ticketSummary.date": 1 }).lean();
    res.json(orders);
  })
);

/**
 * GET /operator/dashboard — revenue and occupancy across every bus this
 * operator owns, computed from real Order data via summarizeOrders().
 */
app.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const busFilter = req.user.role === "ADMIN" ? {} : { operator: req.user._id };
    const buses = await BusModel.find(busFilter).lean();
    const busIds = buses.map((b) => b._id);

    const orders = await Order.find({ bus: { $in: busIds } }).lean();
    const overall = summarizeOrders(orders);
    const byBus = groupOrdersByBus(orders);

    const perBus = buses.map((bus) => {
      const busOrders = byBus.get(String(bus._id)) || [];
      const stats = summarizeOrders(busOrders);
      return {
        busId: bus._id,
        companyname: bus.companyname,
        from: bus.from,
        to: bus.to,
        status: bus.status,
        ...stats,
        occupancyPercent: occupancyPercent(stats.totalSeatsSold, TOTAL_SEATS),
        durationHours: journeyDuration(bus.departure, bus.arrival),
      };
    });

    res.json({ overall, buses: perBus });
  })
);

module.exports = app;
