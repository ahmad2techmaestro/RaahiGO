const express = require("express");
const SearchHistory = require("../models/searchHistory.model");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");

const app = express.Router();
app.use(requireAuth);

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** GET /search-history — most recent distinct routes, newest first. */
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const recent = await SearchHistory.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // De-duplicate by route so searching Mumbai→Pune five times shows once,
    // capped to the 5 most recent distinct routes.
    const seen = new Set();
    const distinct = [];
    for (const entry of recent) {
      const key = `${entry.from}|${entry.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      distinct.push({ from: entry.from, to: entry.to, searchedAt: entry.createdAt });
      if (distinct.length >= 5) break;
    }

    res.json(distinct);
  })
);

/** POST /search-history — logs a search. Called by the frontend right
 * after a real search happens; never blocks or fails the search itself. */
app.post(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = req.body;
    if (!from || !to) throw new AppError("from and to are required", 400);

    await SearchHistory.create({
      user: req.user._id,
      from: titleCase(from),
      to: titleCase(to),
    });
    res.status(201).json({ ok: true });
  })
);

module.exports = app;
