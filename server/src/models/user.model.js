const { Schema, model } = require("mongoose");

const preferencesSchema = new Schema(
  {
    seatType: { type: String, enum: ["SLEEPER", "SEATER", null], default: null },
    busType: { type: String, enum: ["AC", "NONAC", null], default: null },
    preferredDepartureWindow: {
      type: String,
      enum: ["BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18", null],
      default: null,
    },
    budget: { type: Number, default: null },
    favouriteOperators: { type: [String], default: [] },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    gender: String,

    // Real RBAC: role is embedded in the JWT at login (see user.controller.js),
    // the same established pattern as email/gender already in the token.
    // Trade-off worth stating plainly: a role change takes effect on next
    // login, not instantly — the same staleness trade-off every field in
    // this token already has, not a new inconsistency introduced here.
    role: { type: String, enum: ["PASSENGER", "OPERATOR", "ADMIN"], default: "PASSENGER" },
    operatorProfile: {
      companyName: String,
      appliedAt: Date,
    },

    preferences: { type: preferencesSchema, default: () => ({}) },

    loyaltyPoints: { type: Number, default: 0 },

    // RaahiGo Wallet, in whole rupees. Only ever changed through services/wallet.service.js,
    // which writes a matching WalletTxn ledger row for every movement.
    walletBalance: { type: Number, default: 0, min: 0 },
    lifetimeCashback: { type: Number, default: 0 },

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Tracks whether the referrer's bonus has already been paid out, so it
    // can only ever happen once (on the referred user's first CONFIRMED
    // booking) no matter how many times that condition is re-checked.
    referralBonusPaid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const UserModel = model("User", UserSchema);

module.exports = UserModel;
