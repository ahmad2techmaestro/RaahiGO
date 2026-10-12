const express = require("express");
const { validateCoupon } = require("../services/coupon.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");

const app = express.Router();
app.use(requireAuth);

/**
 * POST /coupons/validate
 * Read-only preview — lets the checkout UI show the discount before
 * payment. The actual, authoritative discount application and usage
 * increment happens server-side again inside /api/payment/ticket, so a
 * client can never trust its own preview call to be the final word.
 */
app.post(
  "/validate",
  asyncHandler(async (req, res) => {
    const { code, amount } = req.body;
    if (!code || amount == null) throw new AppError("code and amount are required", 400);

    const result = await validateCoupon(code, amount);
    res.json(result);
  })
);

module.exports = app;
