const { Schema, model } = require("mongoose");

const NOTIFICATION_TYPES = [
  "BOOKING_CONFIRMATION",
  "PAYMENT_FAILED",
  "JOURNEY_REMINDER",
  "BOARDING_REMINDER",
  "BUS_DELAYED",
  "BUS_ARRIVED",
  "CANCELLATION_REFUND",
];

const notificationLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    channel: { type: String, enum: ["EMAIL"], default: "EMAIL" },
    recipient: { type: String, required: true },
    subject: String,
    body: String,
    // SENT = actually delivered via a configured provider.
    // SIMULATED = no provider configured, logged instead of sent — the
    //   honest default in this environment, same pattern as AI/Redis/tracking.
    // FAILED = a provider was configured but the send itself errored.
    status: { type: String, enum: ["SENT", "SIMULATED", "FAILED"], required: true },
    errorMessage: String,
  },
  { timestamps: true }
);

notificationLogSchema.index({ user: 1, createdAt: -1 });

const NotificationLog = model("NotificationLog", notificationLogSchema);
NotificationLog.TYPES = NOTIFICATION_TYPES;

module.exports = NotificationLog;
