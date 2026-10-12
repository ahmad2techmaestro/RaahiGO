/**
 * Personalization logic tests — loyalty points/tiers, coupon discount
 * maths, and referral code generation. Run with:
 *   node src/tests/personalization.test.js
 *
 * These cover pure functions only; DB-dependent parts (coupon lookup,
 * atomic redemption, referral persistence) are exercised via the route
 * smoke tests in the main verification pass, same pattern as busSearch.
 */
const { pointsForAmount, tierForPoints, pointsToNextTier, TIERS } = require("../services/loyalty.service");
const { calculateDiscount } = require("../services/coupon.service");
const { randomCode, CODE_ALPHABET, CODE_LENGTH } = require("../services/referral.service");

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

console.log("\nLoyalty — points");

assert(pointsForAmount(1000) === 10, "₹1000 earns 10 points (1 per ₹100)");
assert(pointsForAmount(999) === 9, "points round down, not up (₹999 → 9, not 10)");
assert(pointsForAmount(50) === 0, "an amount under ₹100 earns 0 points, not a fraction");
assert(pointsForAmount(0) === 0, "₹0 earns 0 points");
assert(pointsForAmount(-500) === 0, "a negative amount earns 0 points rather than deducting");
assert(pointsForAmount("not a number") === 0, "non-numeric input degrades to 0 rather than NaN");
assert(pointsForAmount(undefined) === 0, "missing input degrades to 0 rather than throwing");

console.log("\nLoyalty — tiers");

assert(tierForPoints(0) === "Explorer", "0 points is Explorer");
assert(tierForPoints(49) === "Explorer", "49 points is still Explorer (below the 50 threshold)");
assert(tierForPoints(50) === "Traveller", "exactly 50 points reaches Traveller");
assert(tierForPoints(199) === "Traveller", "199 points is still Traveller");
assert(tierForPoints(200) === "Voyager", "exactly 200 points reaches Voyager");
assert(tierForPoints(500) === "Elite", "exactly 500 points reaches Elite");
assert(tierForPoints(10000) === "Elite", "a very large balance is still just Elite, not an error");
assert(tierForPoints(null) === "Explorer", "null points defaults to Explorer rather than crashing");

{
  // Tiers must be in strictly descending minPoints order, or the "find
  // first tier the user qualifies for" logic silently breaks.
  const sorted = [...TIERS].sort((a, b) => b.minPoints - a.minPoints);
  assert(
    JSON.stringify(TIERS) === JSON.stringify(sorted),
    "TIERS is defined in descending order (a structural guarantee the lookup depends on)"
  );
}

console.log("\nLoyalty — distance to next tier");

assert(pointsToNextTier(0) === 50, "0 points needs 50 more to reach Traveller");
assert(pointsToNextTier(45) === 5, "45 points needs 5 more to reach Traveller");
assert(pointsToNextTier(50) === 150, "50 points (just reached Traveller) needs 150 more for Voyager");
assert(pointsToNextTier(500) === null, "Elite (top tier) has no next tier");
assert(pointsToNextTier(600) === null, "above Elite's threshold still has no next tier");

console.log("\nCoupons — discount calculation");

assert(
  calculateDiscount({ discountType: "PERCENT", value: 10, maxDiscount: null }, 1000) === 100,
  "10% off ₹1000 is ₹100"
);
assert(
  calculateDiscount({ discountType: "FLAT", value: 150 }, 1000) === 150,
  "flat ₹150 off is exactly ₹150"
);
assert(
  calculateDiscount({ discountType: "PERCENT", value: 50, maxDiscount: 100 }, 1000) === 100,
  "a capped percent discount (50% of 1000=500) is limited to maxDiscount (100)"
);
assert(
  calculateDiscount({ discountType: "FLAT", value: 5000 }, 1000) === 1000,
  "a flat discount larger than the order never exceeds the order amount"
);
assert(
  calculateDiscount({ discountType: "PERCENT", value: 10, maxDiscount: null }, 0) === 0,
  "discount on a ₹0 order is ₹0, not negative or NaN"
);
assert(
  calculateDiscount({ discountType: "PERCENT", value: 15.5, maxDiscount: null }, 999) === 155,
  "fractional discounts round to the nearest rupee"
);

console.log("\nReferral codes");

{
  const code = randomCode();
  assert(code.length === CODE_LENGTH, `generated code has the expected length (${CODE_LENGTH})`);
  assert(
    [...code].every((ch) => CODE_ALPHABET.includes(ch)),
    "every character comes from the defined alphabet"
  );
  assert(
    !/[0O1I]/.test(code),
    "the alphabet excludes visually ambiguous characters (0/O/1/I)"
  );
}

{
  // Not a proof of uniqueness (that's the DB check's job — see
  // generateUniqueReferralCode), but confirms randomCode() isn't
  // accidentally deterministic.
  const codes = new Set(Array.from({ length: 200 }, () => randomCode()));
  assert(codes.size > 190, `200 generated codes are overwhelmingly distinct (got ${codes.size} unique)`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
