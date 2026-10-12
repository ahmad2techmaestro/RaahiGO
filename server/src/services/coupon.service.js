const CouponModel = require("../models/coupon.model");

/** Pure discount math — kept separate from DB lookups so it's trivial to test. */
function calculateDiscount(coupon, amount) {
  const value = Number(amount);
  let discount =
    coupon.discountType === "PERCENT" ? (value * coupon.value) / 100 : coupon.value;

  if (coupon.discountType === "PERCENT" && coupon.maxDiscount != null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  // A discount can never exceed the order amount (no negative totals) and
  // is rounded to the nearest rupee for a clean checkout display.
  discount = Math.max(0, Math.min(discount, value));
  return Math.round(discount);
}

/**
 * Validates a coupon code against an order amount and, if valid, returns
 * the discount to apply. Every failure reason is distinct and user-facing
 * so "expired" reads differently to a user than "minimum order not met".
 */
async function validateCoupon(code, amount) {
  if (!code || typeof code !== "string") {
    return { valid: false, reason: "No coupon code provided" };
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, reason: "Invalid order amount" };
  }

  const coupon = await CouponModel.findOne({ code: code.trim().toUpperCase() });
  if (!coupon) {
    return { valid: false, reason: "Coupon code not found" };
  }
  if (!coupon.active) {
    return { valid: false, reason: "This coupon is no longer active" };
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { valid: false, reason: "This coupon has expired" };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, reason: "This coupon has reached its usage limit" };
  }
  if (value < coupon.minAmount) {
    return {
      valid: false,
      reason: `This coupon requires a minimum order of ₹${coupon.minAmount}`,
    };
  }

  const discount = calculateDiscount(coupon, value);
  return {
    valid: true,
    coupon,
    discount,
    finalAmount: Math.max(0, Math.round(value - discount)),
  };
}

/**
 * Atomically increments usedCount only if the coupon is still under its
 * limit — a findOneAndUpdate with the limit check baked into the query
 * filter, so two concurrent redemptions of the last available use can't
 * both succeed (the same all-or-nothing principle as seat locking).
 */
async function redeemCoupon(couponId) {
  const filter = {
    _id: couponId,
    $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
  };
  const updated = await CouponModel.findOneAndUpdate(
    filter,
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  return { redeemed: Boolean(updated), coupon: updated };
}

module.exports = { validateCoupon, calculateDiscount, redeemCoupon };
