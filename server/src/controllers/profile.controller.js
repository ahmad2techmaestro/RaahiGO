const express = require("express");
const UserModel = require("../models/user.model");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { tierForPoints, pointsToNextTier } = require("../services/loyalty.service");
const { ensureReferralCode } = require("../services/referral.service");
const Order = require("../models/order.model");
const { buildPassport } = require("../services/passport.service");

const app = express.Router();
app.use(requireAuth);

const VALID_SEAT_TYPES = ["SLEEPER", "SEATER", null];
const VALID_BUS_TYPES = ["AC", "NONAC", null];
const VALID_WINDOWS = ["BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18", null];

/** GET /profile — preferences, loyalty status and referral code together,
 * since the account page needs all three at once. */
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user._id).lean();
    if (!user) throw new AppError("User not found", 404);

    const referralCode = user.referralCode || (await ensureReferralCode(user._id));

    res.json({
      email: user.email,
      role: user.role,
      preferences: user.preferences || {},
      loyalty: {
        points: user.loyaltyPoints || 0,
        tier: tierForPoints(user.loyaltyPoints || 0),
        pointsToNextTier: pointsToNextTier(user.loyaltyPoints || 0),
      },
      referralCode,
    });
  })
);

/** GET /profile/passport — the traveller's journey stats, derived from their real bookings. */
app.get(
  "/passport",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).lean();
    res.json(buildPassport(orders));
  })
);

/** PUT /profile/preferences */
app.put(
  "/preferences",
  asyncHandler(async (req, res) => {
    const { seatType, busType, preferredDepartureWindow, budget, favouriteOperators } = req.body;

    if (seatType !== undefined && !VALID_SEAT_TYPES.includes(seatType)) {
      throw new AppError("Invalid seatType", 400);
    }
    if (busType !== undefined && !VALID_BUS_TYPES.includes(busType)) {
      throw new AppError("Invalid busType", 400);
    }
    if (
      preferredDepartureWindow !== undefined &&
      !VALID_WINDOWS.includes(preferredDepartureWindow)
    ) {
      throw new AppError("Invalid preferredDepartureWindow", 400);
    }
    if (budget !== undefined && budget !== null && (typeof budget !== "number" || budget < 0)) {
      throw new AppError("budget must be a non-negative number", 400);
    }
    if (favouriteOperators !== undefined && !Array.isArray(favouriteOperators)) {
      throw new AppError("favouriteOperators must be an array", 400);
    }

    const update = {};
    if (seatType !== undefined) update["preferences.seatType"] = seatType;
    if (busType !== undefined) update["preferences.busType"] = busType;
    if (preferredDepartureWindow !== undefined)
      update["preferences.preferredDepartureWindow"] = preferredDepartureWindow;
    if (budget !== undefined) update["preferences.budget"] = budget;
    if (favouriteOperators !== undefined)
      update["preferences.favouriteOperators"] = favouriteOperators.slice(0, 10);

    const user = await UserModel.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.json({ preferences: user.preferences });
  })
);

module.exports = app;
