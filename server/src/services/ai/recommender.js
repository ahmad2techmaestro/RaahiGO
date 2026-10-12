const { callLLM, extractJSON } = require("./llmClient");
const { recommendLocal } = require("./localEngine");

const SYSTEM_PROMPT = `You help a traveller pick a bus from a list of REAL options a booking
system already found. You are not searching or inventing buses — only
explaining and ranking the ones given to you.

Respond with ONLY a JSON object, no prose outside it:
{
  "picks": [
    { "id": "<the exact id from the list>", "reason": "one sentence, specific to this bus's actual price/time/rating" }
  ],
  "summary": "one or two sentence overview of the trade-offs across these options"
}

Rules:
- "id" must be copied exactly from the list you were given. Never invent an id.
- Pick at most 3 buses, ordered best-fit first.
- Ground every reason in the bus's actual data (price, duration, rating, departure/arrival, amenities) — never claim something not in the data.
- If the traveller gave preferences, weigh picks against them explicitly in the reason.`;

/**
 * Asks the LLM to rank and explain a set of buses the backend already
 * fetched (via the Phase 4 search service). The LLM's job is explanation,
 * not retrieval — every id it returns is checked against the real list
 * before being sent to the client, so a hallucinated id can never surface.
 */
async function recommendFromResults(buses, preferenceText = "") {
  if (!Array.isArray(buses) || buses.length === 0) {
    return { picks: [], summary: "No buses to compare." };
  }

  // Only the fields relevant to a travel decision — keeps the prompt small
  // and avoids leaking internal fields (Mongo timestamps, seat lists, etc).
  const slim = buses.map((b) => ({
    id: String(b._id),
    operator: b.companyname,
    price: b.price,
    rating: b.rating,
    departure: b.departure,
    arrival: b.arrival,
    durationHours: b.durationHours,
    seatsAvailable: b.seatsAvailable,
    amenities: b.aminites,
  }));

  const userMessage = [
    preferenceText ? `Traveller's preference: ${preferenceText}` : "No specific preference stated.",
    "",
    "Available buses:",
    JSON.stringify(slim),
  ].join("\n");

  try {
    const text = await callLLM({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 700,
    });
    const raw = extractJSON(text);
    return { ...validateRecommendation(raw, slim), engine: "llm" };
  } catch (err) {
    // No API key or LLM unreachable: rank the same real buses with the built-in scoring engine.
    return { ...validateRecommendation(recommendLocal(buses, preferenceText), slim), engine: "smart" };
  }
}

/**
 * The trust boundary: drops any pick whose id doesn't match a bus we
 * actually sent, and caps the list. This is what makes "the LLM can't
 * invent a booking option" an enforced guarantee rather than a prompt
 * instruction the model might ignore.
 */
function validateRecommendation(raw, realBuses) {
  const realIds = new Set(realBuses.map((b) => b.id));
  const picks = Array.isArray(raw.picks) ? raw.picks : [];

  const validPicks = picks
    .filter((p) => p && typeof p.id === "string" && realIds.has(p.id))
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      reason: typeof p.reason === "string" ? p.reason.slice(0, 300) : "",
    }));

  return {
    picks: validPicks,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 500) : "",
  };
}

module.exports = { recommendFromResults, validateRecommendation };
