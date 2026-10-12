const { Schema, model } = require("mongoose");

const savedRouteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { timestamps: true }
);

// A user can save a given route only once.
savedRouteSchema.index({ user: 1, from: 1, to: 1 }, { unique: true });

module.exports = model("SavedRoute", savedRouteSchema);
