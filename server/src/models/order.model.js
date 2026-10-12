const mongoose = require("mongoose");

const reqString = { type: String, required: true };

const BOOKING_STATUSES = [
  "PENDING",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
];

const orderSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "PENDING",
      required: true,
    },

    busDetails: {
      name: reqString,
      from: reqString,
      to: reqString,
      contactemail: reqString,
      contactphone: reqString,
      arrival: reqString,
      departure: reqString,
    },

    ticketSummary: {
      date: Date,
      ticket: reqString,
      amount: reqString,
    },
    paymentDetails: {
      orderId: reqString,
      razorpayOrderId: reqString,
      razorpayPaymentId: reqString,
    },
    userDetails: {
      name: reqString,
      age: reqString,
      gender: reqString,
      email: reqString,
      phone: reqString,
    },
    coupon: {
      code: String,
      discount: Number,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
    },
    cancelledAt: Date,
    cancellationReason: String,

    // How the booking was paid, in whole rupees. ticketSummary.amount is the ticket value
    // (fare minus coupon); it was paid as walletUsed + gatewayPaid.
    pricing: {
      fare: Number,
      couponDiscount: { type: Number, default: 0 },
      ticketValue: Number,
      walletUsed: { type: Number, default: 0 },
      gatewayPaid: { type: Number, default: 0 },
      method: String,
      gateway: String,
      cashback: {
        percent: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
        reversed: { type: Boolean, default: false },
      },
    },

    // All refund amounts are whole rupees (the gateway boundary converts to paise).
    refund: {
      status: {
        type: String,
        enum: ["NONE", "PROCESSING", "COMPLETED", "FAILED"],
        default: "NONE",
      },
      razorpayRefundId: String,
      amount: Number, // total handed back to the traveller (wallet + bank) after fee and cashback reversal
      note: String,
      destination: { type: String, enum: ["SOURCE", "WALLET"] },
      percent: Number,
      fee: Number,
      walletCredit: Number,
      bonus: Number,
      gatewayAmount: Number,
      clawback: Number,
      requestedAt: Date,
      completesAt: Date,
      completedAt: Date,
    },
    notificationsSent: {
      journeyReminder: { type: Boolean, default: false },
      boardingReminder: { type: Boolean, default: false },
      arrivalNotice: { type: Boolean, default: false },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Speeds up "my bookings" queries (always filtered by user, often by status/date)
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

orderSchema.statics.STATUSES = BOOKING_STATUSES;

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
