const { callLLM } = require("./llmClient");
const { answerLocal } = require("./localEngine");
const { retrieve, confidenceOf } = require("./rag");

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

  const hits = retrieve(question);
  const relevantPolicies = hits.map((h) => h.policy);
  const confidence = confidenceOf(hits);
  const citations = relevantPolicies.map((p) => ({ id: p.id, topic: p.topic }));

  // Nothing relevant in the knowledge base and no booking to talk about: say so instead of letting a
  // model improvise a policy. This is the grounded "I don't know" path.
  if (relevantPolicies.length === 0 && !userBookingContext) {
    return {
      answer: "I don't have that in RaahiGo's policies, so I won't guess. Please contact RaahiGo support and they'll help you directly.",
      sources: [], citations: [], confidence: 0, engine: "grounded",
    };
  }

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
    return { answer: answer.trim(), sources: relevantPolicies.map((p) => p.topic), citations, confidence, engine: "llm" };
  } catch (err) {
    // No API key or LLM unreachable: answer straight from the policy notes.
    const local = answerLocal(question, userBookingContext);
    return { ...local, citations, confidence, engine: "smart" };
  }
}

module.exports = { answerSupportQuestion };
