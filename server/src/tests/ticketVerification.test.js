/**
 * Ticket verification token tests. Run with:
 *   node src/tests/ticketVerification.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-ticket-tests";

const { generateVerificationToken, verifyToken } = require("../services/ticketVerification.service");

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

console.log("\nTicket verification tokens");

{
  const token = generateVerificationToken("order-123");
  assert(typeof token === "string" && token.length === 64, "generates a 64-char hex (sha256) token");
}

{
  const orderId = "order-abc";
  const token = generateVerificationToken(orderId);
  assert(verifyToken(orderId, token) === true, "a genuine token verifies successfully");
}

{
  const token = generateVerificationToken("order-abc");
  assert(
    verifyToken("order-DIFFERENT", token) === false,
    "a token generated for one order fails verification against a different order id"
  );
}

{
  const token = generateVerificationToken("order-abc");
  const tampered = token.slice(0, -2) + "00";
  assert(
    verifyToken("order-abc", tampered === token ? token + "x" : tampered) === false,
    "a tampered token (last byte flipped) fails verification"
  );
}

assert(verifyToken("order-abc", null) === false, "a missing token fails verification rather than throwing");
assert(verifyToken("order-abc", "") === false, "an empty-string token fails verification");
assert(verifyToken("order-abc", "not-even-hex!!") === false, "a malformed non-hex token fails verification without crashing");
assert(verifyToken("order-abc", "ab") === false, "a too-short token fails verification (length mismatch)");

{
  const token = generateVerificationToken("order-123");
  assert(generateVerificationToken("order-123") === token, "token generation is deterministic for the same order id");
}

{
  const a = generateVerificationToken("order-1");
  const b = generateVerificationToken("order-2");
  assert(a !== b, "different order ids produce different tokens");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
