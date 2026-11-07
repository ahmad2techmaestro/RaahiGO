const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

/**
 * Whether real AI calls can be made. Every AI route checks this first and
 * returns a clear "not configured" response instead of crashing — the same
 * graceful-degradation pattern used for Redis (Phase 2). A portfolio
 * reviewer without an API key should still see the rest of the app work.
 */
function isAIEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Calls the Anthropic Messages API and returns the assistant's text.
 * Kept as a thin, single-purpose wrapper (not a class, no hidden state) so
 * it's trivial to swap for a mock in tests — see src/tests/ai.test.js.
 */
async function callLLM({ system, messages, maxTokens = 1024 }) {
  if (!isAIEnabled()) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("LLM response contained no text content");
  }
  return textBlock.text;
}

/**
 * Extracts and parses a single JSON object from an LLM response. Models
 * occasionally wrap JSON in prose or code fences despite instructions not
 * to — this pulls out the first {...} block rather than trusting the
 * whole response to be valid JSON on its own.
 */
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in LLM response");
  }
  return JSON.parse(match[0]);
}

/**
 * One turn of Anthropic's tool-use API. Returns the raw content blocks so the agent loop can see
 * both text and tool_use requests. The model only ever *asks* for a tool; the server decides whether
 * and how to run it.
 */
async function callLLMWithTools({ system, messages, tools, maxTokens = 1024 }) {
  if (!isAIEnabled()) throw new Error("AI_NOT_CONFIGURED");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages, tools }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return { content: data.content || [], stopReason: data.stop_reason };
}

let overrideToolLLM = null;
function __setToolLLMForTests(fn) {
  overrideToolLLM = fn;
}
async function callLLMWithToolsDispatch(args) {
  if (overrideToolLLM) return overrideToolLLM(args);
  return callLLMWithTools(args);
}

// Test seam: lets the test suite inject a fake LLM without network calls.
let overrideCallLLM = null;
function __setLLMForTests(fn) {
  overrideCallLLM = fn;
}
const realCallLLM = callLLM;
async function callLLMDispatch(args) {
  if (overrideCallLLM) return overrideCallLLM(args);
  return realCallLLM(args);
}

module.exports = {
  isAIEnabled,
  callLLM: callLLMDispatch,
  callLLMWithTools: callLLMWithToolsDispatch,
  extractJSON,
  __setLLMForTests,
  __setToolLLMForTests,
  MODEL,
};
