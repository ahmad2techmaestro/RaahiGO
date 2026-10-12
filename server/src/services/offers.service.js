/**
 * Payment-method cashback.
 *
 * Every rule here is a pure function of (method, amount paid, loyalty tier) so
 * the numbers a traveller sees at checkout are exactly the numbers credited
 * after payment — there is no second code path that could disagree.
 *
 * All money is in whole rupees. Cashback is credited to the RaahiGo Wallet.
 */
const { tierForPoints } = require("./loyalty.service");

/** Base cashback per payment method: percent of the amount paid through the gateway. */
const METHOD_OFFERS = {
  UPI: { label: "UPI", percent: 5, cap: 50, minAmount: 250, blurb: "GPay, PhonePe, Paytm and any UPI app" },
  CARD: { label: "Credit / Debit card", percent: 7, cap: 100, minAmount: 500, blurb: "Visa, Mastercard, RuPay, Amex" },
  NETBANKING: { label: "Net banking", percent: 3, cap: 40, minAmount: 300, blurb: "All major Indian banks" },
  WALLET: { label: "Mobile wallets", percent: 4, cap: 30, minAmount: 200, blurb: "Paytm, Amazon Pay, Mobikwik and more" },
};

/** Loyalty tiers add percentage points on top of the method's base rate. */
const TIER_BONUS_POINTS = { Explorer: 0, Traveller: 1, Voyager: 2, Elite: 3 };

const METHOD_ALIASES = {
  upi: "UPI",
  card: "CARD",
  credit_card: "CARD",
  debit_card: "CARD",
  netbanking: "NETBANKING",
  net_banking: "NETBANKING",
  wallet: "WALLET",
};

/** Maps whatever a gateway reports ("upi", "card", "netbanking"…) onto our method keys, or null. */
function normalizeMethod(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (METHOD_OFFERS[key.toUpperCase()]) return key.toUpperCase();
  return METHOD_ALIASES[key] || null;
}

function tierBonus(tierName) {
  return TIER_BONUS_POINTS[tierName] || 0;
}

/**
 * Cashback for paying `amountPaid` rupees through `method` as a member of `tierName`.
 * Returns { eligible, method, percent, amount, cap, reason }.
 */
function computeCashback({ method, amountPaid, tier = "Explorer" }) {
  const key = normalizeMethod(method);
  const paid = Math.floor(Number(amountPaid) || 0);
  if (!key) {
    return { eligible: false, method: null, percent: 0, amount: 0, cap: 0, reason: "No cashback offer for this payment method" };
  }
  const offer = METHOD_OFFERS[key];
  const percent = offer.percent + tierBonus(tier);
  if (paid < offer.minAmount) {
    return {
      eligible: false, method: key, percent, amount: 0, cap: offer.cap,
      reason: `Pay at least ₹${offer.minAmount} via ${offer.label} to earn cashback`,
    };
  }
  const amount = Math.min(offer.cap, Math.floor((paid * percent) / 100));
  return { eligible: amount > 0, method: key, percent, amount, cap: offer.cap, reason: null };
}

/** The full offer sheet for a given payable amount and tier — used by the checkout UI. */
function listOffers({ amountPaid, tier = "Explorer" }) {
  return Object.keys(METHOD_OFFERS).map((key) => {
    const offer = METHOD_OFFERS[key];
    const result = computeCashback({ method: key, amountPaid, tier });
    return {
      method: key,
      label: offer.label,
      blurb: offer.blurb,
      percent: result.percent,
      cap: offer.cap,
      minAmount: offer.minAmount,
      cashback: result.amount,
      eligible: result.eligible,
      reason: result.reason,
    };
  });
}

module.exports = { METHOD_OFFERS, TIER_BONUS_POINTS, normalizeMethod, computeCashback, listOffers, tierBonus, tierForPoints };
