const { Schema, model } = require("mongoose");

const REASONS = ["CASHBACK", "REFUND", "REFUND_BONUS", "BOOKING", "BOOKING_RELEASE", "CLAWBACK", "REFERRAL", "WELCOME", "TOPUP"];

/**
 * Append-only ledger. A user's walletBalance is always the running sum of these rows;
 * `balanceAfter` is stored so a statement can be rendered without re-adding history.
 * Amounts are whole rupees.
 */
const walletTxnSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["CREDIT", "DEBIT"], required: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: REASONS, required: true },
    note: String,
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

walletTxnSchema.index({ user: 1, createdAt: -1 });

module.exports = model("WalletTxn", walletTxnSchema);
module.exports.REASONS = REASONS;
