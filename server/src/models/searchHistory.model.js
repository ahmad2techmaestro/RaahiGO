const { Schema, model } = require("mongoose");

const searchHistorySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { timestamps: true }
);

searchHistorySchema.index({ user: 1, createdAt: -1 });

module.exports = model("SearchHistory", searchHistorySchema);
