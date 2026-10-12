const crypto = require("crypto");

/**
 * QR codes on tickets link to a public verification page. That page must
 * work without login (a bus conductor scanning a QR isn't logged into the
 * passenger's account) but must NOT let anyone view a booking just by
 * guessing/incrementing an order id — so every verification link carries
 * an HMAC token proving it was actually issued by this server for this
 * specific order, not fabricated by a client.
 */
function getSecret() {
  const secret = process.env.TICKET_VERIFY_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("TICKET_VERIFY_SECRET or JWT_SECRET must be set to sign ticket tokens");
  }
  return secret;
}

function generateVerificationToken(orderId) {
  return crypto.createHmac("sha256", getSecret()).update(String(orderId)).digest("hex");
}

/** Constant-time comparison — a naive === would leak timing information
 * about how many leading characters matched, in theory allowing a token
 * to be guessed byte-by-byte. Not a realistic threat at this app's scale,
 * but it's the correct primitive to reach for and costs nothing here. */
function verifyToken(orderId, token) {
  if (!token || typeof token !== "string") return false;

  const expected = generateVerificationToken(orderId);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(token, "hex");

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { generateVerificationToken, verifyToken };
