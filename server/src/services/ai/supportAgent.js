const { callLLM } = require("./llmClient");
const { answerLocal } = require("./localEngine");
const { retrieveRelevantPolicies } = require("./policyKB");

const SYSTEM_PROMPT = `You are RaahiGo's customer support assistant. Answer ONLY using the
policy information and (if given) booking details provided to you below.

Rules:
- If the answer isn't in the provided information, say so plainly and suggest
  contacting human support — do not guess or make up a policy.
- Never claim to be taking an action (cancelling, refunding, changing a booking).
  You can explain how the user can do that themselves, but you cannot do it for them.
- Keep answers short — 2-4 sentences unless the question genuinely needs more.
- Be direct and factual, not salesy.`;

/**
 * Answers a support question, grounded in retrieved policy snippets and,
 * for a logged-in user, their own real booking data (fetched by the
 * controller via normal authenticated Mongoose queries — never by the LLM
 * itself). The LLM only ever explains; it has no ability to call any
 * function that changes data.
 */
async function answerSupportQuestion(question, userBookingContext = null) {
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    throw new Error("A question is required");
  }
  if (question.length > 500) {
    throw new Error("Question is too long");
  }

  const relevantPolicies = retrieveRelevantPolicies(question);

  const contextParts = [
    "Relevant RaahiGo policies:",
    JSON.stringify(relevantPolicies.map((p) => ({ topic: p.topic, content: p.content }))),
  ];

  if (userBookingContext) {
    contextParts.push("", "This user's own recent bookings:", JSON.stringify(userBookingContext));
  }

  contextParts.push("", `User's question: ${question}`);

  try {
    const answer = await callLLM({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextParts.join("\n") }],
      maxTokens: 400,
    });
    return { answer: answer.trim(), sources: relevantPolicies.map((p) => p.topic), engine: "llm" };
  } catch (err) {
    // No API key or LLM unreachable: answer straight from the policy notes.
    return { ...answerLocal(question, userBookingContext), engine: "smart" };
  }
}

module.exports = { answerSupportQuestion };
