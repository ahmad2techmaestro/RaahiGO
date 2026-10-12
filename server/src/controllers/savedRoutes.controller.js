const express = require("express");
const SavedRoute = require("../models/savedRoute.model");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");

const app = express.Router();
app.use(requireAuth);

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

app.get(
  "/",
  asyncHandler(async (req, res) => {
    const routes = await SavedRoute.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(routes);
  })
);

app.post(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = req.body;
    if (!from || !to) throw new AppError("from and to are required", 400);

    try {
      const saved = await SavedRoute.create({
        user: req.user._id,
        from: titleCase(from),
        to: titleCase(to),
      });
      res.status(201).json(saved);
    } catch (err) {
      if (err.code === 11000) {
        throw new AppError("This route is already saved", 409);
      }
      throw err;
    }
  })
);

app.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const route = await SavedRoute.findOne({ _id: req.params.id, user: req.user._id });
    if (!route) throw new AppError("Saved route not found", 404);
    await route.deleteOne();
    res.json({ message: "Removed" });
  })
);

module.exports = app;
