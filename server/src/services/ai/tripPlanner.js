const { callLLM, extractJSON } = require("./llmClient");

const SYSTEM_PROMPT = `You write a short, practical pre-journey brief for a bus traveller,
based ONLY on the real journey details given to you.

Respond with ONLY a JSON object:
{
  "summary": "one sentence describing the journey",
  "timeline": [
    { "label": "short phase name", "note": "one sentence" }
  ],
  "checklist": ["short practical item", "..."]
}

Rules:
- Do not invent hotels, restaurants, landmarks or attractions — you don't have reliable data about them and a wrong suggestion could genuinely mislead a traveller.
- The "timeline" should be built from the actual departure time, arrival time and duration given — nothing external.
- The "checklist" should be generic, sensible pre-journey advice (documents, arriving early, charging devices, weather-appropriate clothing for an overnight trip, etc.) — 4 to 6 items.
- Keep it concise. This is a quick brief, not an essay.`;

/**
 * Generates a pre-journey brief from a bus the backend already fetched.
 * Deliberately does NOT ask the model to recommend places to visit or eat —
 * that would be ungrounded generation with no way to verify it's not a
 * hallucinated restaurant that closed in 2019.
 */
async function planTrip(bus, date) {
  if (!bus) throw new Error("A bus is required to plan a trip");

  const journeyFacts = {
    operator: bus.companyname,
    from: bus.from,
    to: bus.to,
    date,
    departure: `${bus.departure}:00`,
    arrival: `${bus.arrival}:00`,
    durationHours: bus.durationHours,
    amenities: bus.aminites,
  };

  const text = await callLLM({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(journeyFacts) }],
    maxTokens: 600,
  });

  const raw = extractJSON(text);
  return validatePlan(raw);
}

function validatePlan(raw) {
  return {
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : "",
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline
          .filter((t) => t && typeof t.label === "string" && typeof t.note === "string")
          .slice(0, 8)
          .map((t) => ({ label: t.label.slice(0, 60), note: t.note.slice(0, 200) }))
      : [],
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist.filter((c) => typeof c === "string").slice(0, 8).map((c) => c.slice(0, 150))
      : [],
  };
}

module.exports = { planTrip, validatePlan };
