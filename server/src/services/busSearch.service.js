const BusModel = require("../models/bus.model");

const TOTAL_SEATS = 30; // matches the 30-berth deck layout in the seat map

/**
 * Duration in hours between a departure and arrival hour, accounting for
 * overnight journeys (depart 22, arrive 6 => 8 hours, not -16).
 */
function journeyDuration(departure, arrival) {
  const d = Number(departure);
  const a = Number(arrival);
  if (Number.isNaN(d) || Number.isNaN(a)) return 0;
  return a >= d ? a - d : 24 - d + a;
}

/** Named time-of-day buckets used by the departure/arrival filters. */
const TIME_BUCKETS = {
  BEFORE_6: (h) => h < 6,
  "6_TO_12": (h) => h >= 6 && h <= 12,
  "12_TO_18": (h) => h > 12 && h <= 18,
  AFTER_18: (h) => h > 18,
};

function matchesAnyWindow(hour, windows) {
  const h = Number(hour);
  return windows.some((w) => {
    const test = TIME_BUCKETS[w];
    return typeof test === "function" ? test(h) : false;
  });
}

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Seats already booked on a bus for a specific journey date.
 * Seat records are stored as "<date>@<comma seats>@<gender>" strings.
 */
function bookedSeatsForDate(bus, date) {
  if (!date) return [];
  const target = new Date(date).toDateString();
  const booked = [];
  (bus.seats || []).forEach((entry) => {
    const [entryDate, entrySeats] = String(entry).split("@");
    if (new Date(entryDate).toDateString() === target) {
      booked.push(...String(entrySeats || "").split(",").filter(Boolean));
    }
  });
  return booked;
}

/** Adds the derived fields the search UI needs on every result. */
function decorate(bus, date) {
  const booked = bookedSeatsForDate(bus, date);
  return {
    ...bus,
    durationHours: journeyDuration(bus.departure, bus.arrival),
    seatsBooked: booked.length,
    seatsAvailable: Math.max(0, TOTAL_SEATS - booked.length),
    totalSeats: TOTAL_SEATS,
  };
}

const SORTERS = {
  price: (a, b) => a.price - b.price,
  rating: (a, b) => a.rating - b.rating,
  duration: (a, b) => a.durationHours - b.durationHours,
  departure: (a, b) => Number(a.departure) - Number(b.departure),
  arrival: (a, b) => Number(a.arrival) - Number(b.arrival),
  seatsAvailable: (a, b) => a.seatsAvailable - b.seatsAvailable,
};

/**
 * Searches buses on a route, then applies filters, sorting and pagination.
 *
 * Route/price/rating/operator filtering happens in MongoDB. Filters that
 * depend on derived values — journey duration, seats left on a given date —
 * are applied in memory afterwards, since they aren't stored fields. At this
 * catalogue size that's the simpler correct trade-off; a much larger dataset
 * would push these into an aggregation pipeline or precomputed fields.
 */
async function searchBuses(params = {}) {
  const {
    from,
    to,
    date,
    minPrice,
    maxPrice,
    busType = [],
    seatType = [],
    amenities = [],
    operators = [],
    departureWindows = [],
    arrivalWindows = [],
    minRating,
    maxDurationHours,
    minSeatsAvailable,
    sortBy = "departure",
    sortOrder = "asc",
    page = 1,
    limit = 10,
  } = params;

  const query = { status: { $ne: "INACTIVE" } };
  if (from) query.from = titleCase(from);
  if (to) query.to = titleCase(to);

  if (minPrice != null || maxPrice != null) {
    query.price = {};
    if (minPrice != null) query.price.$gte = Number(minPrice);
    if (maxPrice != null) query.price.$lte = Number(maxPrice);
  }
  if (minRating != null) {
    query.rating = { $gte: Number(minRating) };
  }
  if (operators.length > 0) {
    query.companyname = { $in: operators };
  }

  // busType, seatType and amenities all live in the `aminites` array.
  // A single choice within a pair is a hard requirement (AND); selecting
  // both options of a pair is equivalent to not filtering on it at all.
  const requiredTags = [...amenities];
  if (busType.length === 1) requiredTags.push(busType[0]);
  if (seatType.length === 1) requiredTags.push(seatType[0]);
  if (requiredTags.length > 0) {
    query.aminites = { $all: requiredTags };
  }

  const raw = await BusModel.find(query).lean();

  let results = raw.map((b) => decorate(b, date));

  if (departureWindows.length > 0) {
    results = results.filter((b) => matchesAnyWindow(b.departure, departureWindows));
  }
  if (arrivalWindows.length > 0) {
    results = results.filter((b) => matchesAnyWindow(b.arrival, arrivalWindows));
  }
  if (maxDurationHours != null) {
    results = results.filter((b) => b.durationHours <= Number(maxDurationHours));
  }
  if (minSeatsAvailable != null) {
    results = results.filter((b) => b.seatsAvailable >= Number(minSeatsAvailable));
  }

  // Facets are computed from the route results *before* pagination so the
  // filter sidebar can show the real range and options for this route.
  const facets = buildFacets(raw.map((b) => decorate(b, date)));

  const sorter = SORTERS[sortBy] || SORTERS.departure;
  results.sort((a, b) => (sortOrder === "desc" ? -sorter(a, b) : sorter(a, b)));

  const total = results.length;
  const pageNum = Math.max(1, Number(page));
  const perPage = Math.min(50, Math.max(1, Number(limit)));
  const start = (pageNum - 1) * perPage;
  const paged = results.slice(start, start + perPage);

  return {
    buses: paged,
    pagination: {
      page: pageNum,
      limit: perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      hasNextPage: start + perPage < total,
      hasPrevPage: pageNum > 1,
    },
    facets,
  };
}

/** Available filter options and ranges for the current route. */
function buildFacets(buses) {
  if (buses.length === 0) {
    return {
      priceRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
      operators: [],
      amenities: [],
    };
  }

  const prices = buses.map((b) => b.price);
  const durations = buses.map((b) => b.durationHours);
  const operatorSet = new Set();
  const amenitySet = new Set();

  buses.forEach((b) => {
    if (b.companyname) operatorSet.add(b.companyname);
    (b.aminites || []).forEach((a) => amenitySet.add(a));
  });

  return {
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    durationRange: { min: Math.min(...durations), max: Math.max(...durations) },
    operators: Array.from(operatorSet).sort(),
    amenities: Array.from(amenitySet).sort(),
    totalBuses: buses.length,
  };
}

module.exports = {
  searchBuses,
  buildFacets,
  journeyDuration,
  bookedSeatsForDate,
  decorate,
  matchesAnyWindow,
  TIME_BUCKETS,
  TOTAL_SEATS,
};
