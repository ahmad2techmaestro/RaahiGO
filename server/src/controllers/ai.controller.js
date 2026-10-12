const express = require("express");
const rateLimit = require("express-rate-limit");
const BusModel = require("../models/bus.model");
const Order = require("../models/order.model");
const UserModel = require("../models/user.model");
const { asyncHandler, AppError } = require("../utils/errors");
const { isAIEnabled } = require("../services/ai/llmClient");
const { parseSearchQuery } = require("../services/ai/searchParser");
const { recommendFromResults } = require("../services/ai/recommender");
const { planTrip } = require("../services/ai/tripPlanner");
const { answerSupportQuestion } = require("../services/ai/supportAgent");
const { searchBuses, decorate } = require("../services/busSearch.service");

const app = express.Router();

/** Lets the frontend check once, cheaply, whether to show AI features at
 * all — kept outside the rate limiter below since a page load checking
 * this shouldn't compete with a user's actual AI request budget. */
app.get("/status", (req, res) => {
  // The smart engine is always on; an API key upgrades it to the LLM.
  res.json({ aiEnabled: true, engine: isAIEnabled() ? "llm" : "smart" });
});

// LLM calls cost real money per request, so everything else here is
// rate-limited more tightly than ordinary API routes.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many AI requests. Please try again in a few minutes." },
});
app.use(aiLimiter);

/** Every route returns this shape when no API key is configured, instead
 * of a confusing 500 — the rest of the app must keep working either way. */
function requireAIEnabled(req, res, next) {
  if (!isAIEnabled()) {
    return res.status(503).json({
      message:
        "AI features are not configured on this server. Set ANTHROPIC_API_KEY to enable them.",
      aiEnabled: false,
    });
  }
  next();
}

/**
 * POST /ai/search
 * Natural-language search. The LLM only ever produces structured
 * parameters — the actual database query runs through the exact same,
 * already-tested searchBuses() service Phase 4 uses for the regular
 * filter UI. The LLM has no path to touch the database directly.
 */
app.post(
  "/search",
  asyncHandler(async (req, res) => {
    const { query } = req.body;
    if (!query) throw new AppError("query is required", 400);

    const parsed = await parseSearchQuery(query);

    if (!parsed.from || !parsed.to || parsed.clarificationNeeded) {
      return res.json({
        needsClarification: true,
        message:
          parsed.clarificationNeeded ||
          "I need both a starting city and a destination to search.",
        parsed,
      });
    }

    const searchDate = parsed.date || new Date().toISOString().split("T")[0];
    const results = await searchBuses({
      from: parsed.from,
      to: parsed.to,
      date: searchDate,
      maxPrice: parsed.maxPrice,
      busType: parsed.busType,
      seatType: parsed.seatType,
      departureWindows: parsed.departureWindows,
      arrivalWindows: parsed.arrivalWindows,
      minRating: parsed.minRating,
      sortBy: parsed.sortBy || "departure",
      sortOrder: "asc",
      page: 1,
      limit: 10,
    });

    res.json({
      needsClarification: false,
      interpretation: {
        from: parsed.from,
        to: parsed.to,
        date: searchDate,
        maxPrice: parsed.maxPrice,
        busType: parsed.busType,
        seatType: parsed.seatType,
        departureWindows: parsed.departureWindows,
        arrivalWindows: parsed.arrivalWindows,
        minRating: parsed.minRating,
        sortBy: parsed.sortBy,
      },
      engine: parsed.engine,
      ...results,
    });
  })
);

/**
 * POST /ai/recommend
 * "Help me choose". Re-runs the real search server-side (never trusts a
 * client-supplied bus list) and asks the LLM to explain the top picks.
 */
app.post(
  "/recommend",
  asyncHandler(async (req, res) => {
    const { from, to, date, preferenceText } = req.body;
    if (!from || !to || !date) {
      throw new AppError("from, to and date are required", 400);
    }

    // If the user is logged in and didn't type a preference, fall back to
    // their saved preferences — a real personalization signal, not just a
    // display field. An invalid/expired token here just means "no fallback",
    // never a hard failure, since /ai/recommend works for anonymous users too.
    let effectivePreference = preferenceText || "";
    if (!effectivePreference) {
      const authHeader = req.headers.authorization || "";
      if (authHeader.startsWith("Bearer ")) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
          const user = await UserModel.findById(decoded.user._id).lean();
          const prefs = user?.preferences;
          if (prefs) {
            const parts = [];
            if (prefs.seatType) parts.push(`prefers ${prefs.seatType.toLowerCase()} seats`);
            if (prefs.busType) parts.push(`prefers ${prefs.busType} buses`);
            if (prefs.budget) parts.push(`budget around ₹${prefs.budget}`);
            if (prefs.preferredDepartureWindow)
              parts.push(`prefers departing in the ${prefs.preferredDepartureWindow} window`);
            if (parts.length > 0) effectivePreference = `Traveller's saved preferences: ${parts.join(", ")}.`;
          }
        } catch {
          // no fallback available — proceed with an empty preference
        }
      }
    }

    const { buses } = await searchBuses({ from, to, date, limit: 20, page: 1 });
    const result = await recommendFromResults(buses, effectivePreference);

    // Attach full bus details for each pick so the client doesn't need a
    // second round trip.
    const picksWithDetails = result.picks.map((p) => ({
      ...p,
      bus: buses.find((b) => String(b._id) === p.id) || null,
    }));

    res.json({ ...result, picks: picksWithDetails });
  })
);

/**
 * POST /ai/trip-planner
 * Grounded strictly in a bus the backend fetches itself.
 */
app.post(
  "/trip-planner",
  requireAIEnabled,
  asyncHandler(async (req, res) => {
    const { busId, date } = req.body;
    if (!busId || !date) throw new AppError("busId and date are required", 400);

    const bus = await BusModel.findById(busId).lean();
    if (!bus) throw new AppError("Bus not found", 404);

    const decorated = decorate(bus, date);
    const plan = await planTrip(decorated, date);
    res.json(plan);
  })
);

/**
 * POST /ai/support
 * RAG-lite support. Works without auth (general policy questions), but
 * when a valid token is present the controller itself fetches the user's
 * own bookings and passes them as context — the LLM never queries the
 * database, it only sees what this route explicitly hands it.
 */
app.post(
  "/support",
  asyncHandler(async (req, res) => {
    const { question } = req.body;
    if (!question) throw new AppError("question is required", 400);

    let bookingContext = null;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        const orders = await Order.find({ user: decoded.user._id })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
        bookingContext = orders.map((o) => ({
          route: `${o.busDetails?.from} to ${o.busDetails?.to}`,
          date: o.ticketSummary?.date,
          status: o.status,
          refundStatus: o.refund?.status,
        }));
      } catch {
        // Invalid/expired token on a public support endpoint — fine,
        // just answer without personal context rather than failing.
        bookingContext = null;
      }
    }

    const result = await answerSupportQuestion(question, bookingContext);
    res.json(result);
  })
);

module.exports = app;
