const { Schema, model } = require("mongoose");

/**
 * Server-side record of a checkout. Prices are computed on the server when the intent is
 * created and the booking is confirmed from THIS record — never from numbers the browser sends.
 */
const paymentIntentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bus: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    seats: { type: [String], required: true },

    fare: { type: Number, required: true },
    couponId: { type: String, default: null },
    couponCode: { type: String, default: null },
    couponDiscount: { type: Number, default: 0 },
    ticketValue: { type: Number, required: true },
    walletUsed: { type: Number, default: 0 },
    payable: { type: Number, required: true },

    gateway: { type: String, enum: ["razorpay", "demo"], required: true },
    gatewayOrderId: { type: String, required: true, unique: true },
    demoPaymentId: String,
    demoMethod: String,

    status: { type: String, enum: ["CREATED", "PAID", "REFUNDED", "EXPIRED"], default: "CREATED", index: true },
    walletReleased: { type: Boolean, default: false },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  },
  { timestamps: true, versionKey: false }
);

module.exports = model("PaymentIntent", paymentIntentSchema);
