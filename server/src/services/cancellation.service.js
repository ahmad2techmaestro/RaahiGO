/**
 * Cancellation & refund policy.
 *
 * The refund a traveller sees in the "Cancel ticket" preview and the refund
 * actually issued are produced by the same pure function, so they can never
 * disagree. All money is whole rupees. Departure time is interpreted in IST
 * (UTC+05:30) — every bus in the catalogue runs on Indian time.
 */

/** Highest threshold first. A booking falls in the first tier whose minHours it still satisfies. */
const REFUND_TIERS = [
  { minHours: 48, percent: 100, label: "48+ hours before departure" },
  { minHours: 24, percent: 90, label: "24–48 hours before departure" },
  { minHours: 12, percent: 75, label: "12–24 hours before departure" },
  { minHours: 6, percent: 50, label: "6–12 hours before departure" },
  { minHours: 2, percent: 25, label: "2–6 hours before departure" },
];

/** Cancellation closes this many hours before departure. */
const CANCELLATION_CLOSES_HOURS = 2;

/** Refunding to the RaahiGo Wallet is instant and earns a small bonus on the bank-bound portion. */
const WALLET_BONUS_PERCENT = 2;
const WALLET_BONUS_CAP = 25;

/** Card/UPI refunds are settled by banks — we promise a window, not a minute. */
const BANK_REFUND_DAYS = 5;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The instant a bus departs. `journeyDate` is the stored date (midnight UTC of the calendar day the
 * traveller picked); `departureHour` is the bus's 24-hour departure hour in IST ("15" → 15:00 IST).
 */
function departureInstant(journeyDate, departureHour) {
  const d = new Date(journeyDate);
  if (Number.isNaN(d.getTime())) return null;
  const hour = Number(departureHour);
  const safeHour = Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 0;
  const midnightUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(midnightUtc + safeHour * 3600 * 1000 - IST_OFFSET_MS);
}

function hoursUntil(departure, now = new Date()) {
  if (!departure) return null;
  return (departure.getTime() - now.getTime()) / 3600000;
}

function tierForHours(hoursLeft) {
  if (hoursLeft == null || hoursLeft < CANCELLATION_CLOSES_HOURS) return null;
  return REFUND_TIERS.find((t) => hoursLeft >= t.minHours) || null;
}

/**
 * @param {object} p
 * @param {number} p.totalPaid       ticket value the traveller paid (wallet + gateway)
 * @param {number} p.gatewayPaid     portion paid through the payment gateway
 * @param {number} p.cashbackEarned  cashback credited for this booking (reversed on cancellation)
 * @param {number} p.walletBalance   traveller's current wallet balance
 * @param {number} p.hoursLeft       hours until departure
 * @param {"SOURCE"|"WALLET"} p.destination where the bank-bound portion should go
 */
function computeRefund({ totalPaid, gatewayPaid = 0, cashbackEarned = 0, walletBalance = 0, hoursLeft, destination = "SOURCE" }) {
  const paid = Math.max(0, Math.round(Number(totalPaid) || 0));
  const gateway = Math.min(paid, Math.max(0, Math.round(Number(gatewayPaid) || 0)));
  const dest = destination === "WALLET" ? "WALLET" : "SOURCE";
  const tier = tierForHours(hoursLeft);

  if (!tier) {
    return {
      cancellable: false,
      reason: hoursLeft != null && hoursLeft < 0
        ? "This journey has already departed"
        : `Cancellation closes ${CANCELLATION_CLOSES_HOURS} hours before departure`,
      hoursLeft, percent: 0, tierLabel: null, totalPaid: paid, refundable: 0, fee: paid,
      walletCredit: 0, gatewayRefund: 0, bonus: 0, clawback: 0, net: 0, destination: dest,
    };
  }

  const refundable = Math.round((paid * tier.percent) / 100);
  const fee = paid - refundable;

  // Split the refund the way the money came in: the wallet part goes back to the wallet, the rest to the bank.
  const gatewayShare = paid > 0 ? Math.round((refundable * gateway) / paid) : 0;
  const walletShare = refundable - gatewayShare;

  let walletCredit = walletShare;
  let gatewayRefund = gatewayShare;
  let bonus = 0;
  if (dest === "WALLET") {
    walletCredit = refundable;
    gatewayRefund = 0;
    bonus = Math.min(WALLET_BONUS_CAP, Math.floor((gatewayShare * WALLET_BONUS_PERCENT) / 100));
  }

  // Cashback earned on this booking is reversed. Take it from the wallet first; if the traveller already
  // spent it, the shortfall comes out of the bank-bound refund instead.
  const available = Math.max(0, Number(walletBalance) || 0) + walletCredit + bonus;
  const wanted = Math.max(0, Math.round(Number(cashbackEarned) || 0));
  const clawback = Math.min(wanted, available);
  const shortfall = Math.min(wanted - clawback, gatewayRefund);
  gatewayRefund -= shortfall;

  return {
    cancellable: true,
    reason: null,
    hoursLeft,
    percent: tier.percent,
    tierLabel: tier.label,
    totalPaid: paid,
    refundable,
    fee,
    walletCredit,
    gatewayRefund,
    bonus,
    clawback: clawback + shortfall,
    clawbackFromWallet: clawback,
    clawbackFromRefund: shortfall,
    net: walletCredit + bonus - clawback + gatewayRefund,
    destination: dest,
  };
}

/** When the bank is expected to have settled a gateway refund. */
function bankRefundEta(from = new Date()) {
  return new Date(from.getTime() + BANK_REFUND_DAYS * 24 * 3600 * 1000);
}

module.exports = {
  REFUND_TIERS, CANCELLATION_CLOSES_HOURS, WALLET_BONUS_PERCENT, WALLET_BONUS_CAP, BANK_REFUND_DAYS,
  departureInstant, hoursUntil, tierForHours, computeRefund, bankRefundEta,
};
