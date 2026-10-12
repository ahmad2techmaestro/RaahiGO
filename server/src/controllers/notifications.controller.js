const express = require("express");
const NotificationLog = require("../models/notificationLog.model");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler } = require("../utils/errors");

const app = express.Router();
app.use(requireAuth);

/**
 * GET /notifications
 * A user's own notification history — genuinely useful in its own right
 * (an in-app record of "what have you told me"), and also makes this
 * whole feature visibly demonstrable without needing real SMTP configured:
 * every SIMULATED entry is still a real, inspectable log row.
 */
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const logs = await NotificationLog.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(logs);
  })
);

module.exports = app;
