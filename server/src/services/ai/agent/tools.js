/**
 * Tools the travel assistant may call.
 *
 * The rule that keeps the assistant safe: a model (or the built-in planner) only *asks* for a tool.
 * Each tool validates its own arguments, runs an existing, already-tested service, and returns data.
 * No tool changes money, bookings or seats. The two actions that matter (holding seats, cancelling)
 * come back as a *proposal* that the traveller must confirm with a button, which then calls the
 * normal authenticated endpoints. So the assistant can find and prepare, never spend.
 */
const { normalizeCity, localISO } = require("../searchParser");
const { retrieve, confidenceOf } = require("../rag");
const { planJourneys } = require("../journeyPlanner");
const { buildProfile, rankForUser } = require("../personalRank");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS = ["BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18"];
const MAX_SEATS = 6;
const TOTAL_SEATS = 30;

/** Real services, loaded lazily so tests can inject fakes and never need a database. */
function defaultDeps() {
  const BusModel = require("../../../models/bus.model");
  const Order = require("../../../models/order.model");
  const UserModel = require("../../../models/user.model");
  const bus = require("../../busSearch.service");
  const booking = require("../../booking.service");
  return {
    searchBuses: bus.searchBuses,
    bookedSeatsForDate: bus.bookedSeatsForDate,
    decorate: bus.decorate,
    findBus: (id) => BusModel.findById(id).lean(),
    allBuses: () => BusModel.find({ status: { $ne: "INACTIVE" } }).lean(),
    recentOrders: (userId, limit = 5) => Order.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    findOrder: (orderId, userId) => Order.findOne({ _id: orderId, user: userId }),
    previewCancellation: booking.previewCancellation,
    userPreferences: async (userId) => (await UserModel.findById(userId).select("preferences").lean())?.preferences || {},
    pastBuses: (ids) => BusModel.find({ _id: { $in: ids } }).lean(),
  };
}

const slimBus = (b) => ({
  id: String(b._id),
  operator: b.companyname,
  from: b.from,
  to: b.to,
  price: b.price,
  rating: b.rating,
  departure: Number(b.departure),
  arrival: Number(b.arrival),
  durationHours: b.durationHours,
  seatsAvailable: b.seatsAvailable,
  amenities: b.aminites || [],
});

function parseDate(value) {
  if (value == null || value === "") return localISO(new Date());
  if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) return null;
  return value;
}

function parseCity(value, label) {
  const city = normalizeCity(value);
  if (!city) return { error: `I don't recognise "${value ?? ""}" as a ${label} city I cover.` };
  return { city };
}

function needUser(ctx) {
  return ctx.user && ctx.user._id ? null : { data: { error: "login_required", message: "The traveller must sign in for this." } };
}

/* ── tool definitions (the `input_schema` is what the model sees) ── */

const TOOLS = {
  search_buses: {
    description: "Search real buses between two cities on a date, with optional filters. Returns only buses that exist in the system.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Departure city" },
        to: { type: "string", description: "Destination city" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        maxPrice: { type: "number" },
        busType: { type: "array", items: { type: "string", enum: ["AC", "NONAC"] } },
        seatType: { type: "array", items: { type: "string", enum: ["SLEEPER", "SEATER"] } },
        departureWindows: { type: "array", items: { type: "string", enum: WINDOWS } },
        sortBy: { type: "string", enum: ["price", "duration", "rating", "departure"] },
      },
      required: ["from", "to"],
    },
    async run(args, ctx) {
      const f = parseCity(args.from, "departure");
      const t = parseCity(args.to, "destination");
      if (f.error || t.error) return { data: { error: f.error || t.error } };
      const date = parseDate(args.date);
      if (!date) return { data: { error: "date must be YYYY-MM-DD" } };

      const pick = (arr, allowed) => (Array.isArray(arr) ? arr.filter((x) => allowed.includes(x)) : []);
      const result = await ctx.deps.searchBuses({
        from: f.city, to: t.city, date,
        maxPrice: Number.isFinite(Number(args.maxPrice)) && Number(args.maxPrice) > 0 ? Number(args.maxPrice) : undefined,
        busType: pick(args.busType, ["AC", "NONAC"]),
        seatType: pick(args.seatType, ["SLEEPER", "SEATER"]),
        departureWindows: pick(args.departureWindows, WINDOWS),
        sortBy: ["price", "duration", "rating", "departure"].includes(args.sortBy) ? args.sortBy : "departure",
        sortOrder: args.sortBy === "rating" ? "desc" : "asc",
        page: 1, limit: 8,
      });
      const items = result.buses.map(slimBus);
      return {
        data: { from: f.city, to: t.city, date, total: result.pagination.total, buses: items },
        card: { type: "buses", from: f.city, to: t.city, date, items, total: result.pagination.total },
      };
    },
  },

  find_journey: {
    description: "Find ways to reach a city when no direct bus has seats: connections via another city (with layover times) and nearby dates. Uses real buses only.",
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["from", "to"],
    },
    async run(args, ctx) {
      const f = parseCity(args.from, "departure");
      const t = parseCity(args.to, "destination");
      if (f.error || t.error) return { data: { error: f.error || t.error } };
      const date = parseDate(args.date);
      if (!date) return { data: { error: "date must be YYYY-MM-DD" } };
      const plan = planJourneys({ from: f.city, to: t.city, date, buses: await ctx.deps.allBuses() });
      return { data: plan, card: { type: "journeys", ...plan } };
    },
  },

  personal_picks: {
    description: "Rank real buses on a route for the signed-in traveller using their own past trips and saved preferences, with a reason for each pick.",
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, date: { type: "string" } },
      required: ["from", "to"],
    },
    async run(args, ctx) {
      const denied = needUser(ctx);
      if (denied) return denied;
      const f = parseCity(args.from, "departure");
      const t = parseCity(args.to, "destination");
      if (f.error || t.error) return { data: { error: f.error || t.error } };
      const date = parseDate(args.date);
      if (!date) return { data: { error: "date must be YYYY-MM-DD" } };

      const { buses } = await ctx.deps.searchBuses({ from: f.city, to: t.city, date, page: 1, limit: 30 });
      const open = buses.filter((b) => b.seatsAvailable > 0);
      const orders = await ctx.deps.recentOrders(ctx.user._id, 30);
      const past = await ctx.deps.pastBuses(orders.map((o) => o.bus).filter(Boolean));
      const profile = buildProfile({ orders, pastBuses: past, preferences: await ctx.deps.userPreferences(ctx.user._id) });
      const ranked = rankForUser(open, profile);
      const byId = new Map(open.map((b) => [String(b._id), b]));
      const items = ranked.picks.slice(0, 4).map((p) => ({ ...slimBus(byId.get(p.id)), score: p.score, reasons: p.reasons, badge: p.badge }));
      return {
        data: { from: f.city, to: t.city, date, basis: ranked.basis, picks: items },
        card: { type: "buses", from: f.city, to: t.city, date, items, total: open.length, personalised: ranked.basis.personalised, basis: ranked.basis },
      };
    },
  },

  get_my_bookings: {
    description: "The signed-in traveller's most recent bookings.",
    input_schema: { type: "object", properties: {} },
    async run(_args, ctx) {
      const denied = needUser(ctx);
      if (denied) return denied;
      const orders = await ctx.deps.recentOrders(ctx.user._id, 5);
      const items = orders.map((o) => ({
        orderId: String(o._id),
        route: `${o.busDetails?.from} to ${o.busDetails?.to}`,
        operator: o.busDetails?.name,
        date: o.ticketSummary?.date,
        seats: o.ticketSummary?.ticket,
        status: o.status,
        refundStatus: o.refund?.status,
      }));
      return { data: { bookings: items }, card: { type: "bookings", items } };
    },
  },

  refund_preview: {
    description: "What a cancellation would refund right now for one of the traveller's own bookings. Read-only; it never cancels anything.",
    input_schema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
    async run(args, ctx) {
      const denied = needUser(ctx);
      if (denied) return denied;
      if (typeof args.orderId !== "string" || !/^[a-f0-9]{24}$/i.test(args.orderId)) return { data: { error: "orderId is not valid" } };
      // Ownership is part of the query: another traveller's booking simply isn't found.
      const order = await ctx.deps.findOrder(args.orderId, ctx.user._id);
      if (!order) return { data: { error: "Booking not found" } };
      if (order.status !== "CONFIRMED") return { data: { error: `This booking is ${String(order.status).toLowerCase()}, so there is nothing to cancel.` } };
      const plan = await ctx.deps.previewCancellation(order, ctx.user._id, "SOURCE");
      const view = {
        orderId: String(order._id),
        route: `${order.busDetails?.from} to ${order.busDetails?.to}`,
        date: order.ticketSummary?.date,
        cancellable: plan.cancellable,
        reason: plan.reason,
        percent: plan.percent,
        totalPaid: plan.totalPaid,
        refundable: plan.refundable,
        fee: plan.fee,
        net: plan.net,
      };
      return { data: view, card: { type: "refund", ...view }, action: plan.cancellable ? { type: "open_cancel", orderId: view.orderId, label: "Go to My Tickets to cancel" } : undefined };
    },
  },

  policy_lookup: {
    description: "Look up RaahiGo's real policies (cancellation, refunds, wallet, cashback, tracking, tickets). Returns the matching policy text, or nothing if the topic is not covered.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
    async run(args) {
      const hits = retrieve(String(args.question || ""));
      const policies = hits.map((h) => ({ id: h.policy.id, topic: h.policy.topic, content: h.policy.content }));
      return {
        data: { found: policies.length > 0, confidence: confidenceOf(hits), policies },
        card: policies.length ? { type: "sources", items: policies.map((p) => ({ id: p.id, topic: p.topic })) } : undefined,
      };
    },
  },

  propose_seat_hold: {
    description: "Prepare holding specific seats on a bus for a date. This only PROPOSES; the traveller confirms with a button before anything is held.",
    input_schema: {
      type: "object",
      properties: { busId: { type: "string" }, date: { type: "string" }, seats: { type: "array", items: { type: "string" } } },
      required: ["busId", "date", "seats"],
    },
    async run(args, ctx) {
      const denied = needUser(ctx);
      if (denied) return denied;
      if (typeof args.busId !== "string" || !/^[a-f0-9]{24}$/i.test(args.busId)) return { data: { error: "busId is not valid" } };
      const date = parseDate(args.date);
      if (!date) return { data: { error: "date must be YYYY-MM-DD" } };
      const seats = [...new Set((Array.isArray(args.seats) ? args.seats : []).map(String))];
      if (!seats.length || seats.length > MAX_SEATS) return { data: { error: `Choose between 1 and ${MAX_SEATS} seats.` } };
      if (seats.some((s) => !/^\d{1,2}$/.test(s) || Number(s) < 1 || Number(s) > TOTAL_SEATS)) return { data: { error: `Seat numbers run from 1 to ${TOTAL_SEATS}.` } };

      const bus = await ctx.deps.findBus(args.busId);
      if (!bus || bus.status === "INACTIVE") return { data: { error: "Bus not found" } };
      const taken = seats.filter((s) => ctx.deps.bookedSeatsForDate(bus, date).includes(s));
      if (taken.length) return { data: { error: `Seat${taken.length > 1 ? "s" : ""} ${taken.join(", ")} already booked on that date.` } };

      const action = {
        type: "hold_seats",
        busId: String(bus._id), date, seats,
        summary: `${seats.length} seat${seats.length > 1 ? "s" : ""} (${seats.join(", ")}) on ${bus.companyname}, ${bus.from} to ${bus.to}, ${date}`,
        price: bus.price * seats.length,
      };
      return { data: { proposed: true, awaitingConfirmation: true, ...action }, action };
    },
  },
};

/** Tool list in the shape the Anthropic API expects. */
function toolSpecs({ signedIn }) {
  return Object.entries(TOOLS)
    .filter(([name]) => signedIn || !["personal_picks", "get_my_bookings", "refund_preview", "propose_seat_hold"].includes(name))
    .map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }));
}

async function runTool(name, args, ctx) {
  const tool = TOOLS[name];
  if (!tool) return { data: { error: `Unknown tool ${name}` } };
  const context = { ...ctx, deps: ctx.deps || defaultDeps() };
  try {
    return await tool.run(args && typeof args === "object" ? args : {}, context);
  } catch (err) {
    return { data: { error: "That lookup failed. Please try again." }, failed: String(err.message || err) };
  }
}

module.exports = { TOOLS, toolSpecs, runTool, defaultDeps, slimBus };
