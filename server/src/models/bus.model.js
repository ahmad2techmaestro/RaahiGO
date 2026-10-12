const { Schema, model } = require("mongoose");

const BusSchema = new Schema({
  companyname: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  price: { type: Number, required: true },
  email: String,
  phone: Number,
  aminites: [String],
  rating: { type: Number, default: 0 },
  arrival: String,
  departure: String,
  seats: [String],

  // Ownership for the operator dashboard (Phase 10). Null means the bus
  // pre-dates operator accounts (e.g. the seeded demo dataset) and isn't
  // manageable through the operator dashboard — only an operator-owned
  // bus can be. This is deliberate: it makes ownership an explicit,
  // checkable fact rather than something inferred from companyname text.
  operator: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
});

BusSchema.index({ from: 1, to: 1 });
BusSchema.index({ operator: 1 });

const BusModel = model("Bus", BusSchema);

module.exports = BusModel;
