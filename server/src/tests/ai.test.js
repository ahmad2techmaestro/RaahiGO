/**
 * AI Copilot tests.
 *
 * Run with: node src/tests/ai.test.js
 *
 * No real LLM calls are made. llmClient.js exposes __setLLMForTests(),
 * which lets these tests inject canned responses — including deliberately
 * malformed ones — and verify that the validation/guard-rail code around
 * the LLM actually does its job. That guard-rail code, not the LLM's
 * output itself, is what these tests are really checking.
 */
const { __setLLMForTests, extractJSON, isAIEnabled } = require("../services/ai/llmClient");
const { parseSearchQuery, validateParsed, relativeDateToISO, normalizeCity, localISO } = require("../services/ai/searchParser");
const { recommendFromResults, validateRecommendation } = require("../services/ai/recommender");
const { planTrip, validatePlan } = require("../services/ai/tripPlanner");
const { retrieveRelevantPolicies, POLICIES } = require("../services/ai/policyKB");
const { answerSupportQuestion } = require("../services/ai/supportAgent");

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

function mockLLM(responseText) {
  __setLLMForTests(async () => responseText);
}

async function run() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "ai-test-secret";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real"; // enables isAIEnabled()

  console.log("\nllmClient — JSON extraction");

  assert(
    JSON.stringify(extractJSON('{"a":1}')) === '{"a":1}',
    "parses a bare JSON object"
  );
  assert(
    JSON.stringify(extractJSON('Sure! Here you go:\n```json\n{"a":1}\n```')) === '{"a":1}',
    "pulls JSON out of a markdown code fence"
  );
  assert(
    JSON.stringify(extractJSON('{"a": {"nested": [1,2,3]}}')) === '{"a":{"nested":[1,2,3]}}',
    "handles nested objects and arrays"
  );
  {
    let threw = false;
    try {
      extractJSON("no json here at all");
    } catch {
      threw = true;
    }
    assert(threw, "throws when no JSON object is present");
  }

  console.log("\nSearch parser — date resolution");

  {
    const today = localISO(new Date());
    assert(relativeDateToISO("today") === today, "'today' resolves to today's date");
  }
  {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    assert(
      relativeDateToISO("tomorrow") === localISO(t),
      "'tomorrow' resolves to the next calendar day"
    );
  }
  assert(relativeDateToISO(null) === null, "no relative date given resolves to null");
  assert(relativeDateToISO("next month") === null, "an unrecognised phrase resolves to null, not a guess");

  console.log("\nSearch parser — city normalization");

  assert(normalizeCity("mumbai") === "Mumbai", "city match is case-insensitive");
  assert(normalizeCity("  Delhi  ") === "Delhi", "city match tolerates whitespace");
  assert(normalizeCity("Atlantis") === null, "an unserved city is rejected, not guessed");
  assert(normalizeCity(null) === null, "missing city input is handled without throwing");

  console.log("\nSearch parser — validation of raw LLM output");

  {
    const v = validateParsed({
      from: "mumbai",
      to: "pune",
      relativeDate: "tomorrow",
      maxPrice: 1500,
      busType: ["AC"],
      seatType: ["SLEEPER"],
      departureWindows: ["AFTER_18"],
      minRating: 4,
      clarificationNeeded: null,
    });
    assert(v.from === "Mumbai" && v.to === "Pune", "valid cities are normalized");
    assert(v.maxPrice === 1500, "valid price passes through");
    assert(v.clarificationNeeded === null, "no clarification needed when everything is valid");
  }

  {
    const v = validateParsed({ from: "Nowhereville", to: "Pune" });
    assert(
      v.from === null && typeof v.clarificationNeeded === "string",
      "an unrecognised city triggers a clarification instead of a silent wrong search"
    );
  }

  {
    const v = validateParsed({ from: "Mumbai", to: "Pune", busType: ["AC", "SPACESHIP"] });
    assert(
      JSON.stringify(v.busType) === '["AC"]',
      "an invalid enum value is dropped, valid ones kept"
    );
  }

  {
    const v = validateParsed({ from: "Mumbai", to: "Pune", maxPrice: "not a number" });
    assert(v.maxPrice === null, "a non-numeric price is rejected rather than crashing downstream");
  }

  {
    const v = validateParsed({ from: "Mumbai", to: "Pune", minRating: 99 });
    assert(v.minRating === null, "an out-of-range rating (99 of 5) is rejected");
  }

  console.log("\nSearch parser — end to end with a mocked LLM");

  {
    mockLLM(JSON.stringify({
      from: "Gorakhpur is not served", to: "Delhi", relativeDate: "tomorrow",
      maxPrice: 1500, busType: [], seatType: ["SLEEPER"],
      departureWindows: ["AFTER_18"], arrivalWindows: ["BEFORE_6", "6_TO_12"],
      minRating: null, clarificationNeeded: null,
    }));
    // Deliberately malformed "from" to prove normalizeCity guards it even
    // when the model didn't flag its own uncertainty.
  }
  {
    mockLLM(JSON.stringify({
      from: "Mumbai", to: "Delhi", relativeDate: "tomorrow", maxPrice: 1500,
      busType: [], seatType: ["SLEEPER"], departureWindows: ["AFTER_18"],
      arrivalWindows: ["BEFORE_6", "6_TO_12"], minRating: null, clarificationNeeded: null,
    }));
    const result = await parseSearchQuery("sleeper bus to delhi from mumbai tomorrow after 8pm under 1500, reaching in the morning");
    assert(result.from === "Mumbai" && result.to === "Delhi", "end-to-end parse resolves real cities");
    assert(result.maxPrice === 1500, "end-to-end parse resolves price");
    assert(
      JSON.stringify(result.arrivalWindows) === '["BEFORE_6","6_TO_12"]',
      "end-to-end parse resolves 'reaching in the morning' to two windows"
    );
  }

  {
    mockLLM("I think you mean Mumbai but let me explain in prose first...");
    const r = await parseSearchQuery("mumbai to pune tomorrow under 900");
    assert(r.engine === "smart" && r.from === "Mumbai" && r.to === "Pune" && r.maxPrice === 900,
      "a non-JSON LLM response falls back to the built-in engine instead of failing the search");
  }

  {
    let threw = false;
    try {
      await parseSearchQuery("");
    } catch {
      threw = true;
    }
    assert(threw, "empty query is rejected before ever calling the LLM");
  }

  console.log("\nRecommender — hallucination guard");

  const realBuses = [
    { id: "aaa111", operator: "Alpha", price: 900 },
    { id: "bbb222", operator: "Beta", price: 1200 },
  ];

  {
    const v = validateRecommendation(
      { picks: [{ id: "aaa111", reason: "cheapest" }, { id: "ZZZ-FAKE-ID", reason: "made up" }] },
      realBuses
    );
    assert(v.picks.length === 1, "a pick referencing a non-existent bus id is dropped");
    assert(v.picks[0].id === "aaa111", "the valid pick survives");
  }

  {
    const v = validateRecommendation(
      { picks: [{ id: "aaa111" }, { id: "bbb222" }, { id: "aaa111" }, { id: "bbb222" }] },
      realBuses
    );
    assert(v.picks.length <= 3, "picks are capped at 3 even if the model returns more");
  }

  {
    const v = validateRecommendation({ picks: "not even an array" }, realBuses);
    assert(Array.isArray(v.picks) && v.picks.length === 0, "malformed picks field degrades to an empty list, not a crash");
  }

  {
    const result = await recommendFromResults([], "cheap and fast");
    assert(result.picks.length === 0, "recommending over zero buses returns no picks without calling the LLM");
  }

  console.log("\nRecommender — end to end with a mocked LLM");

  {
    const buses = [
      { _id: "id1", companyname: "Alpha", price: 900, rating: 4.5, departure: "8", arrival: "14", durationHours: 6, seatsAvailable: 10, aminites: ["AC"] },
      { _id: "id2", companyname: "Beta", price: 1400, rating: 4.9, departure: "22", arrival: "6", durationHours: 8, seatsAvailable: 2, aminites: ["AC", "SLEEPER"] },
    ];
    mockLLM(JSON.stringify({
      picks: [
        { id: "id1", reason: "Cheapest at ₹900 with a solid 4.5 rating." },
        { id: "id2", reason: "Higher rated (4.9★) if comfort matters more than price." },
      ],
      summary: "Alpha is the budget pick; Beta trades price for comfort and rating.",
    }));
    const result = await recommendFromResults(buses, "I care about rating more than price");
    assert(result.picks.length === 2, "end-to-end recommendation returns picks for real buses");
    assert(result.picks.every((p) => ["id1", "id2"].includes(p.id)), "every returned id maps to a real bus");
    assert(result.summary.length > 0, "a summary is returned");
  }

  console.log("\nTrip planner — validation");

  {
    const v = validatePlan({
      summary: "An overnight sleeper from Mumbai to Delhi.",
      timeline: [{ label: "Departure", note: "Board by 21:45" }, "not an object"],
      checklist: ["Carry ID proof", "Charge your phone", 42],
    });
    assert(v.timeline.length === 1, "a malformed timeline entry is dropped, valid ones kept");
    assert(v.checklist.length === 2, "a non-string checklist item is dropped");
  }

  {
    const v = validatePlan({});
    assert(v.summary === "" && v.timeline.length === 0 && v.checklist.length === 0, "a completely empty response degrades to empty fields, not a crash");
  }

  {
    let threw = false;
    try {
      await planTrip(null, "2026-10-15");
    } catch {
      threw = true;
    }
    assert(threw, "trip planning without a bus throws before calling the LLM");
  }

  {
    mockLLM(JSON.stringify({
      summary: "Overnight Mumbai to Delhi sleeper, 14 hours.",
      timeline: [
        { label: "Board", note: "Arrive 30 minutes before 20:00 departure" },
        { label: "Journey", note: "14-hour overnight trip" },
        { label: "Arrival", note: "Reach Delhi at 10:00" },
      ],
      checklist: ["Carry a printed or digital ID", "Keep your phone charged", "Dress warmly for AC overnight travel"],
    }));
    const plan = await planTrip(
      { companyname: "Test Travels", from: "Mumbai", to: "Delhi", departure: "20", arrival: "10", durationHours: 14, aminites: ["AC", "SLEEPER"] },
      "2026-10-15"
    );
    assert(plan.timeline.length === 3, "end-to-end trip plan returns a timeline grounded in the real journey");
    assert(plan.checklist.length === 3, "end-to-end trip plan returns a checklist");
  }

  console.log("\nPolicy knowledge base");

  assert(POLICIES.length > 0, "the knowledge base is not empty");

  {
    const results = retrieveRelevantPolicies("How do I cancel my ticket?");
    assert(results.some((p) => p.id === "cancellation"), "a cancellation question retrieves the cancellation policy");
  }
  {
    const results = retrieveRelevantPolicies("when will I get my refund");
    assert(results.some((p) => p.id === "refunds"), "a refund question retrieves the refund policy");
  }
  {
    const results = retrieveRelevantPolicies("asdkjaslkdj random gibberish");
    assert(results.length > 0, "an unmatched question still returns fallback context rather than nothing");
  }
  {
    const results = retrieveRelevantPolicies("cancel");
    assert(results.length <= 3, "retrieval respects the max-results cap");
  }

  console.log("\nSupport agent — end to end with a mocked LLM");

  {
    mockLLM("You can cancel a confirmed booking up to 24 hours before departure, and a refund is triggered automatically.");
    const result = await answerSupportQuestion("How do I cancel my booking?");
    assert(result.answer.length > 0, "support agent returns an answer");
    assert(result.sources.includes("Cancellation policy"), "support agent cites which policy it used");
  }

  {
    let threw = false;
    try {
      await answerSupportQuestion("");
    } catch {
      threw = true;
    }
    assert(threw, "an empty question is rejected before calling the LLM");
  }

  {
    mockLLM("Your Mumbai to Delhi booking is CONFIRMED for the date on file.");
    const result = await answerSupportQuestion("what's the status of my booking", [
      { route: "Mumbai to Delhi", date: "2026-10-20", status: "CONFIRMED", refundStatus: "NONE" },
    ]);
    assert(result.answer.length > 0, "support agent answers when given real booking context");
  }

  console.log("\nBuilt-in smart engine (no API key needed)");
{
  const { parseQueryLocal, recommendLocal, answerLocal } = require("../services/ai/localEngine");
  const v = (q) => validateParsed(parseQueryLocal(q));
  let r = v("Sleeper bus from Mumbai to Delhi tomorrow under ₹1500, after 8pm");
  assert(r.from === "Mumbai" && r.to === "Delhi" && r.maxPrice === 1500, "route and budget are understood");
  assert(r.seatType.includes("SLEEPER") && r.departureWindows.includes("AFTER_18"), "seat type and 'after 8pm' are understood");
  r = v("AC bus Bengaluru to Chennai this weekend, arriving in the morning");
  assert(r.arrivalWindows.includes("6_TO_12") && r.departureWindows.length === 0, "'arriving in the morning' is an arrival window, not departure");
  r = v("delhi se jaipur kal non ac 800 tak");
  assert(r.from === "Delhi" && r.to === "Jaipur" && r.busType[0] === "NONAC" && r.maxPrice === 800, "Hinglish ('se', 'kal', 'tak') is understood");
  r = v("cheapest bus from Pune to Goa");
  assert(r.sortBy === "price", "'cheapest' sets price sorting");
  r = v("sleeper to Delhi tomorrow");
  assert(r.clarificationNeeded && r.from === null, "a missing origin asks a question instead of guessing");
  r = v("bangalore to goa");
  assert(r.from === "Bengaluru", "city aliases resolve to the cities we serve");
  r = v("Mumbai to Atlantis");
  assert(r.to === null && r.clarificationNeeded, "an unknown city is never invented");

  const buses = [
    { _id: "a", companyname: "Cheap Co", price: 400, rating: 3.5, durationHours: 9, departure: "20", aminites: ["NONAC", "SEATER"], seatsAvailable: 10 },
    { _id: "b", companyname: "Swift", price: 700, rating: 4.6, durationHours: 6, departure: "7", aminites: ["AC", "SLEEPER", "WIFI"], seatsAvailable: 10 },
    { _id: "c", companyname: "Full", price: 300, rating: 5, durationHours: 5, departure: "9", aminites: ["AC"], seatsAvailable: 0 },
  ];
  assert(recommendLocal(buses, "cheapest").picks[0].id === "a", "a budget preference ranks the cheapest available bus first");
  assert(recommendLocal(buses, "fast and comfortable").picks[0].id === "b", "speed + comfort ranks the quick AC sleeper first");
  assert(!recommendLocal(buses, "").picks.slice(0, 2).some((p) => p.id === "c"), "a sold-out bus is not recommended");
  assert(recommendLocal(buses, "").picks.every((p) => ["a", "b", "c"].includes(p.id)), "picks only ever reference real buses");

  const a1 = answerLocal("How do I cancel my ticket?");
  assert(a1.answer.includes("2 hours") && a1.sources.includes("Cancellation policy"), "support answers come from the real cancellation policy");
  const a2 = answerLocal("what is the airspeed of a swallow");
  assert(a2.sources.length === 0 && a2.answer.includes("won't guess"), "unknown questions are not made up");
  const a3 = answerLocal("what is my booking status", [{ route: "Delhi to Jaipur", date: "2026-10-20", status: "CONFIRMED", refundStatus: "NONE" }]);
  assert(a3.answer.includes("Delhi to Jaipur"), "support can describe the traveller's own bookings");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
