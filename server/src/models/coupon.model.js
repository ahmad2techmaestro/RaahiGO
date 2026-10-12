const { Schema, model } = require("mongoose");

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ["PERCENT", "FLAT"], required: true },
    value: { type: Number, required: true }, // percent (0-100) or flat rupee amount
    maxDiscount: { type: Number, default: null }, // caps a PERCENT discount in rupees
    minAmount: { type: Number, default: 0 }, // order must be at least this much
    usageLimit: { type: Number, default: null }, // null = unlimited
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model("Coupon", couponSchema);
