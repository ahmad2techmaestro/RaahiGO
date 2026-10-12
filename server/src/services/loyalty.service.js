/**
 * 1 point per ₹100 spent on a confirmed booking — simple, transparent,
 * and easy for a user to verify against their own receipts.
 */
const POINTS_PER_RUPEE = 1 / 100;

/** Points a booking of this amount earns. Always a whole number. */
function pointsForAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value * POINTS_PER_RUPEE);
}

/**
 * Tiers are derived from total lifetime points, not stored separately —
 * so there's no way for a user's displayed tier to drift out of sync with
 * their actual points balance.
 */
const TIERS = [
  { name: "Elite", minPoints: 500 },
  { name: "Voyager", minPoints: 200 },
  { name: "Traveller", minPoints: 50 },
  { name: "Explorer", minPoints: 0 },
];

function tierForPoints(points) {
  const value = Number(points) || 0;
  const tier = TIERS.find((t) => value >= t.minPoints);
  return tier.name;
}

/** Points needed to reach the next tier, or null if already at the top. */
function pointsToNextTier(points) {
  const value = Number(points) || 0;
  const currentIndex = TIERS.findIndex((t) => value >= t.minPoints);
  const nextTier = TIERS[currentIndex - 1]; // TIERS is ordered highest-first
  if (!nextTier) return null;
  return nextTier.minPoints - value;
}

module.exports = { pointsForAmount, tierForPoints, pointsToNextTier, TIERS, POINTS_PER_RUPEE };
