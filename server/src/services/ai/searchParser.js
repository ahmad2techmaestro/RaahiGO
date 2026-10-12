const { callLLM, extractJSON } = require("./llmClient");
const { parseQueryLocal } = require("./localEngine");

const SYSTEM_PROMPT = `You convert a traveller's natural-language bus search into structured JSON.

Respond with ONLY a JSON object, no prose, no markdown fences. Use this exact shape:
{
  "from": string or null,
  "to": string or null,
  "relativeDate": "today" | "tomorrow" | "this_weekend" | null,
  "maxPrice": number or null,
  "busType": array containing zero or more of "AC", "NONAC",
  "seatType": array containing zero or more of "SLEEPER", "SEATER",
  "departureWindows": array containing zero or more of "BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18",
  "arrivalWindows": array containing zero or more of "BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18",
  "minRating": number or null,
  "clarificationNeeded": string or null
}

Rules:
- Only extract what the user actually said. Never invent a city, price or time they didn't mention.
- If "from" or "to" is missing or ambiguous, put a short, specific question in "clarificationNeeded" (e.g. "Which city are you leaving from?"). Otherwise set it to null.
- "leaving after 8 PM" maps to departureWindows: ["AFTER_18"].
- "reaching in the morning" maps to arrivalWindows: ["BEFORE_6", "6_TO_12"].
- "under ₹1500" or "under 1500" maps to maxPrice: 1500.
- Do not include any field not listed above.`;

/** Cities the platform actually serves — used to sanity-check the parse. */
const KNOWN_CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Ahmedabad", "Hyderabad", "Chennai",
  "Kolkata", "Pune", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur",
  "Patna", "Indore", "Thane", "Bhopal", "Goa",
];

function normalizeCity(name) {
  if (!name || typeof name !== "string") return null;
  const match = KNOWN_CITIES.find((c) => c.toLowerCase() === name.trim().toLowerCase());
  return match || null;
}

/** Local calendar date (YYYY-MM-DD). Not toISOString(): that is the UTC date, which is "yesterday" for the first hours of an Indian morning. */
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function relativeDateToISO(relativeDate) {
  const now = new Date();
  if (relativeDate === "today") return localISO(now);
  if (relativeDate === "tomorrow") {
    now.setDate(now.getDate() + 1);
    return localISO(now);
  }
  if (relativeDate === "this_weekend") {
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    // If today is already Saturday or Sunday, "this weekend" means today.
    if (day === 6 || day === 0) return localISO(now);
    now.setDate(now.getDate() + (6 - day));
    return localISO(now);
  }
  return null;
}

const VALID_WINDOWS = new Set(["BEFORE_6", "6_TO_12", "12_TO_18", "AFTER_18"]);
const VALID_BUS_TYPES = new Set(["AC", "NONAC"]);
const VALID_SEAT_TYPES = new Set(["SLEEPER", "SEATER"]);

function sanitizeArray(arr, allowed) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((v) => allowed.has(v));
}

/**
 * Validates and normalizes whatever the LLM returned. Nothing from the raw
 * LLM output reaches the database unchecked — unknown cities are dropped
 * (become a clarification request instead of a silently wrong search),
 * enum-like fields are filtered to only known values, and numbers are
 * coerced/rejected rather than trusted as-is.
 */
function validateParsed(raw) {
  const from = normalizeCity(raw.from);
  const to = normalizeCity(raw.to);

  const cityIssues = [];
  if (raw.from && !from) cityIssues.push(`I don't recognise "${raw.from}" as a city I cover.`);
  if (raw.to && !to) cityIssues.push(`I don't recognise "${raw.to}" as a city I cover.`);

  const maxPrice =
    typeof raw.maxPrice === "number" && raw.maxPrice > 0 ? raw.maxPrice : null;
  const minRating =
    typeof raw.minRating === "number" && raw.minRating >= 0 && raw.minRating <= 5
      ? raw.minRating
      : null;

  // An explicit calendar date (from the built-in engine) must be a real, not-in-the-past YYYY-MM-DD.
  let explicit = null;
  if (typeof raw.isoDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.isoDate) && raw.isoDate >= localISO(new Date())) {
    explicit = raw.isoDate;
  }
  const sortBy = ["price", "duration", "rating"].includes(raw.sortBy) ? raw.sortBy : null;

  return {
    from,
    to,
    date: explicit || relativeDateToISO(raw.relativeDate),
    sortBy,
    maxPrice,
    busType: sanitizeArray(raw.busType, VALID_BUS_TYPES),
    seatType: sanitizeArray(raw.seatType, VALID_SEAT_TYPES),
    departureWindows: sanitizeArray(raw.departureWindows, VALID_WINDOWS),
    arrivalWindows: sanitizeArray(raw.arrivalWindows, VALID_WINDOWS),
    minRating,
    clarificationNeeded:
      cityIssues.length > 0
        ? cityIssues.join(" ")
        : typeof raw.clarificationNeeded === "string"
        ? raw.clarificationNeeded
        : null,
  };
}

/**
 * Parses a natural-language query into structured search parameters.
 * Throws only on transport/config failure; a poorly-specified query comes
 * back as a normal result with `clarificationNeeded` set, not an error.
 */
async function parseSearchQuery(query) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    throw new Error("Query text is required");
  }
  if (query.length > 500) {
    throw new Error("Query is too long");
  }

  let raw;
  try {
    const text = await callLLM({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }],
      maxTokens: 400,
    });
    raw = extractJSON(text);
    raw.engine = "llm";
  } catch (err) {
    // No API key, or the LLM is unreachable: the built-in engine understands the query instead.
    raw = { ...parseQueryLocal(query), engine: "smart" };
  }
  return { ...validateParsed(raw), engine: raw.engine };
}

module.exports = {
  parseSearchQuery,
  validateParsed,
  normalizeCity,
  relativeDateToISO,
  localISO,
  KNOWN_CITIES,
};
