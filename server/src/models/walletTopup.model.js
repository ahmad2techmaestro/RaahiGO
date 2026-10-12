const { Schema, model } = require("mongoose");

/** A wallet top-up in flight. The amount is fixed server-side when the order is created, and credited once. */
const walletTopupSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    gateway: { type: String, enum: ["razorpay", "demo"], required: true },
    gatewayOrderId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["CREATED", "PAID"], default: "CREATED" },
    demoPaymentId: String,
    demoMethod: String,
    paymentId: String,
  },
  { timestamps: true, versionKey: false }
);

module.exports = model("WalletTopup", walletTopupSchema);
