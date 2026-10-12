/**
 * Bus search logic tests.
 *
 * Run with: node src/tests/busSearch.test.js
 *
 * These cover the pure, DB-independent parts of the search service:
 * duration maths (including overnight journeys), time-window matching,
 * per-date seat counting and facet building. The MongoDB query construction
 * in searchBuses() is exercised separately against a real database.
 */
const {
  journeyDuration,
  bookedSeatsForDate,
  decorate,
  matchesAnyWindow,
  buildFacets,
  TOTAL_SEATS,
} = require("../services/busSearch.service");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log("\nJourney duration");

assert(journeyDuration(8, 14) === 6, "same-day journey: 08:00 → 14:00 is 6 hours");
assert(journeyDuration(22, 6) === 8, "overnight journey: 22:00 → 06:00 is 8 hours (not negative)");
assert(journeyDuration(23, 1) === 2, "crosses midnight: 23:00 → 01:00 is 2 hours");
assert(journeyDuration(6, 6) === 0, "same hour is 0");
assert(journeyDuration(0, 5) === 5, "midnight departure works");
assert(journeyDuration("20", "4") === 8, "string inputs are coerced");
assert(journeyDuration(undefined, 5) === 0, "missing value degrades to 0 rather than NaN");

console.log("\nTime windows");

assert(matchesAnyWindow(3, ["BEFORE_6"]) === true, "03:00 is in BEFORE_6");
assert(matchesAnyWindow(6, ["BEFORE_6"]) === false, "06:00 is NOT in BEFORE_6 (boundary)");
assert(matchesAnyWindow(6, ["6_TO_12"]) === true, "06:00 is in 6_TO_12 (inclusive start)");
assert(matchesAnyWindow(12, ["6_TO_12"]) === true, "12:00 is in 6_TO_12 (inclusive end)");
assert(matchesAnyWindow(13, ["12_TO_18"]) === true, "13:00 is in 12_TO_18");
assert(matchesAnyWindow(12, ["12_TO_18"]) === false, "12:00 does not double-count into 12_TO_18");
assert(matchesAnyWindow(19, ["AFTER_18"]) === true, "19:00 is in AFTER_18");
assert(
  matchesAnyWindow(3, ["6_TO_12", "BEFORE_6"]) === true,
  "matches when any selected window fits"
);
assert(matchesAnyWindow(14, ["BEFORE_6", "6_TO_12"]) === false, "no match when none fit");
assert(matchesAnyWindow(5, ["NOT_A_REAL_WINDOW"]) === false, "unknown window name is ignored safely");

console.log("\nPer-date seat availability");

const bus = {
  companyname: "Test Travels",
  price: 900,
  rating: 4.2,
  departure: "20",
  arrival: "6",
  aminites: ["AC", "SLEEPER"],
  seats: [
    "2026-10-15@1,2,3@male",
    "2026-10-16@7,8@female",
  ],
};

assert(
  bookedSeatsForDate(bus, "2026-10-15").length === 3,
  "counts only the seats booked on the requested date"
);
assert(
  bookedSeatsForDate(bus, "2026-10-16").length === 2,
  "a different date has its own independent count"
);
assert(
  bookedSeatsForDate(bus, "2026-10-17").length === 0,
  "a date with no bookings returns none"
);
assert(bookedSeatsForDate(bus, null).length === 0, "missing date returns none rather than throwing");
assert(
  bookedSeatsForDate({ seats: [] }, "2026-10-15").length === 0,
  "a bus with no seat records returns none"
);

{
  const d = decorate(bus, "2026-10-15");
  assert(d.seatsBooked === 3, "decorated bus reports seats booked");
  assert(d.seatsAvailable === TOTAL_SEATS - 3, "decorated bus reports seats available");
  assert(d.durationHours === 10, "decorated bus computes overnight duration (20:00 → 06:00)");
  assert(d.totalSeats === TOTAL_SEATS, "decorated bus reports total capacity");
}

{
  const full = decorate(
    { ...bus, seats: [`2026-10-15@${Array.from({ length: 45 }, (_, i) => i + 1).join(",")}@male`] },
    "2026-10-15"
  );
  assert(full.seatsAvailable === 0, "availability never goes negative when overbooked");
}

console.log("\nFacets");

{
  const buses = [
    decorate({ companyname: "Alpha", price: 500, rating: 4, departure: "8", arrival: "14", aminites: ["AC", "SEATER"], seats: [] }, null),
    decorate({ companyname: "Beta", price: 1500, rating: 3, departure: "22", arrival: "6", aminites: ["NONAC", "SLEEPER", "WIFI"], seats: [] }, null),
    decorate({ companyname: "Alpha", price: 900, rating: 5, departure: "10", arrival: "20", aminites: ["AC", "SLEEPER"], seats: [] }, null),
  ];
  const f = buildFacets(buses);

  assert(f.priceRange.min === 500 && f.priceRange.max === 1500, "price range spans the results");
  assert(f.durationRange.min === 6 && f.durationRange.max === 10, "duration range spans the results");
  assert(f.operators.length === 2, "operators are de-duplicated");
  assert(f.operators[0] === "Alpha", "operators are sorted");
  assert(f.amenities.includes("WIFI") && f.amenities.includes("AC"), "amenities are collected");
  assert(f.totalBuses === 3, "total bus count is reported");
}

{
  const f = buildFacets([]);
  assert(
    f.priceRange.min === 0 && f.operators.length === 0,
    "empty result set produces safe empty facets instead of crashing"
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
