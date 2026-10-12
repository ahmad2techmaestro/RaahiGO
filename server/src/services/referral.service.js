const crypto = require("crypto");
const UserModel = require("../models/user.model");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes
const CODE_LENGTH = 7;

function randomCode() {
  let code = "";
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Generates a referral code and guarantees it's unique in the database
 * before returning — collisions are astronomically unlikely at this
 * alphabet/length, but "unlikely" isn't a uniqueness guarantee, so this
 * actually checks rather than assuming.
 */
async function generateUniqueReferralCode(maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = randomCode();
    const existing = await UserModel.findOne({ referralCode: code }).lean();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code after several attempts");
}

/**
 * Returns the user's referral code, generating and persisting one on
 * first use if they don't have one yet (covers users created before this
 * feature existed, without needing a migration script).
 */
async function ensureReferralCode(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");
  if (user.referralCode) return user.referralCode;

  const code = await generateUniqueReferralCode();
  user.referralCode = code;
  await user.save();
  return code;
}

module.exports = {
  randomCode,
  generateUniqueReferralCode,
  ensureReferralCode,
  CODE_ALPHABET,
  CODE_LENGTH,
};
