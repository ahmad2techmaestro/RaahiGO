const express = require("express");
const UserModel = require("../models/user.model");
const BusModel = require("../models/bus.model");
const Order = require("../models/order.model");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { summarizeOrders } = require("../services/operatorStats.service");
const { computePopularRoutes, computeUserGrowth, cancellationRate } = require("../services/adminStats.service");
const { getSystemHealth } = require("../services/systemHealth.service");

const app = express.Router();
app.use(requireAuth, requireRole("ADMIN"));

/**
 * GET /admin/overview — the platform-wide numbers a real admin dashboard
 * leads with, all computed from actual collections.
 */
app.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [totalUsers, totalOperators, totalBuses, activeBuses, orders] = await Promise.all([
      UserModel.countDocuments({ role: "PASSENGER" }),
      UserModel.countDocuments({ role: "OPERATOR" }),
      BusModel.countDocuments({}),
      BusModel.countDocuments({ status: "ACTIVE" }),
      Order.find({}).lean(),
    ]);

    const summary = summarizeOrders(orders);

    res.json({
      totalUsers,
      totalOperators,
      totalBuses,
      activeBuses,
      ...summary,
      cancellationRatePercent: cancellationRate(summary),
    });
  })
);

/** GET /admin/users — paginated user list. */
app.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const [users, total] = await Promise.all([
      UserModel.find({})
        .select("email role gender createdAt loyaltyPoints operatorProfile")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments({}),
    ]);

    res.json({ users, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

/**
 * PUT /admin/users/:userId/role — admin-driven role change. This is the
 * verified counterpart to the self-service POST /operator/apply: an admin
 * granting OPERATOR here is a real judgment call by a real admin account,
 * versus the self-service path's honestly-disclosed lack of verification.
 */
app.put(
  "/users/:userId/role",
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!["PASSENGER", "OPERATOR", "ADMIN"].includes(role)) {
      throw new AppError("role must be PASSENGER, OPERATOR or ADMIN", 400);
    }
    if (String(req.params.userId) === String(req.user._id) && role !== "ADMIN") {
      throw new AppError("You cannot demote your own account", 400);
    }

    const user = await UserModel.findByIdAndUpdate(
      req.params.userId,
      { role },
      { new: true }
    ).select("email role");

    if (!user) throw new AppError("User not found", 404);
    res.json(user);
  })
);

/** GET /admin/popular-routes */
app.get(
  "/popular-routes",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({}).select("status busDetails").lean();
    res.json(computePopularRoutes(orders));
  })
);

/** GET /admin/user-growth?days=30 */
app.get(
  "/user-growth",
  asyncHandler(async (req, res) => {
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 30));
    const users = await UserModel.find({}).select("createdAt").lean();
    res.json(computeUserGrowth(users, days));
  })
);

/** GET /admin/health — real system health, not simulated. */
app.get(
  "/health",
  asyncHandler(async (req, res) => {
    res.json(getSystemHealth());
  })
);

module.exports = app;
