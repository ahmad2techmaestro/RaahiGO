/**
 * Cashback, wallet, refund-policy, gateway and passport tests (pure logic, no database).
 * Run with: node src/tests/payments.test.js
 */
const { computeCashback, listOffers, normalizeMethod } = require("../services/offers.service");
const { computeRefund, departureInstant, hoursUntil, tierForHours, REFUND_TIERS } = require("../services/cancellation.service");
const { maxWalletUse } = require("../services/wallet.service");
const gateway = require("../services/payment/gateway");
const { buildPassport, tripHours } = require("../services/passport.service");
const templates = require("../services/notifications/templates");

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; } else { console.error(`  ✗ ${label}`); failed++; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

console.log("\nCashback");
eq(computeCashback({ method: "upi", amountPaid: 400 }).amount, 20, "UPI pays 5% of the amount");
eq(computeCashback({ method: "UPI", amountPaid: 5000 }).amount, 50, "UPI cashback is capped at ₹50");
eq(computeCashback({ method: "card", amountPaid: 1000 }).amount, 70, "cards pay 7%");
eq(computeCashback({ method: "card", amountPaid: 4000 }).amount, 100, "card cashback is capped at ₹100");
assert(!computeCashback({ method: "card", amountPaid: 300 }).eligible, "card cashback needs a ₹500 minimum");
assert(computeCashback({ method: "card", amountPaid: 300 }).reason.includes("500"), "the minimum is explained to the traveller");
assert(!computeCashback({ method: "emi", amountPaid: 2000 }).eligible, "unknown methods earn nothing");
eq(computeCashback({ method: "upi", amountPaid: 400, tier: "Elite" }).amount, 32, "Elite adds 3 points (8% of 400)");
eq(computeCashback({ method: "netbanking", amountPaid: 600 }).method, "NETBANKING", "gateway method names are normalised");
eq(normalizeMethod("debit_card"), "CARD", "debit_card maps to CARD");
eq(listOffers({ amountPaid: 600 }).length, 4, "the offer sheet lists four methods");
assert(listOffers({ amountPaid: 100 }).every((o) => !o.eligible), "tiny payments earn no cashback anywhere");

console.log("\nDeparture time (IST)");
eq(departureInstant(new Date("2026-10-12"), "15").toISOString(), "2026-10-12T09:30:00.000Z", "15:00 IST is 09:30 UTC");
eq(departureInstant("2026-10-12", "0").toISOString(), "2026-10-11T18:30:00.000Z", "00:00 IST rolls back to the previous UTC day");
eq(hoursUntil(new Date("2026-10-12T09:30:00Z"), new Date("2026-10-11T09:30:00Z")), 24, "hoursUntil counts real hours");

console.log("\nRefund tiers");
eq(tierForHours(72).percent, 100, "48h+ → 100%");
eq(tierForHours(48).percent, 100, "exactly 48h → 100%");
eq(tierForHours(30).percent, 90, "24–48h → 90%");
eq(tierForHours(13).percent, 75, "12–24h → 75%");
eq(tierForHours(7).percent, 50, "6–12h → 50%");
eq(tierForHours(3).percent, 25, "2–6h → 25%");
eq(tierForHours(1.9), null, "under 2h is not cancellable");
eq(tierForHours(-3), null, "departed buses are not cancellable");
assert(REFUND_TIERS.every((t, i, a) => i === 0 || a[i - 1].minHours > t.minHours), "tiers are ordered strictly by threshold");

console.log("\nRefund maths");
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 1000, hoursLeft: 30, destination: "SOURCE" });
  eq([r.refundable, r.fee, r.gatewayRefund, r.walletCredit, r.bonus, r.net], [900, 100, 900, 0, 0, 900], "90% back to the bank, ₹100 fee");
}
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 1000, hoursLeft: 30, destination: "WALLET" });
  eq([r.walletCredit, r.gatewayRefund, r.bonus, r.net], [900, 0, 18, 918], "wallet refund is instant and earns a 2% bonus");
}
{
  const r = computeRefund({ totalPaid: 5000, gatewayPaid: 5000, hoursLeft: 100, destination: "WALLET" });
  eq(r.bonus, 25, "the instant-refund bonus is capped at ₹25");
}
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 600, hoursLeft: 50, destination: "SOURCE" });
  eq([r.walletCredit, r.gatewayRefund], [400, 600], "money returns to where it came from (wallet 400 / bank 600)");
}
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 1000, cashbackEarned: 50, walletBalance: 80, hoursLeft: 30 });
  eq([r.clawback, r.clawbackFromWallet, r.gatewayRefund, r.net], [50, 50, 900, 850], "cashback is reversed from the wallet");
}
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 1000, cashbackEarned: 50, walletBalance: 0, hoursLeft: 30 });
  eq([r.clawbackFromWallet, r.clawbackFromRefund, r.gatewayRefund, r.net], [0, 50, 850, 850], "spent cashback is taken from the bank refund instead");
}
{
  const r = computeRefund({ totalPaid: 1000, gatewayPaid: 1000, hoursLeft: 1 });
  assert(!r.cancellable && r.reason.includes("2 hours"), "the cutoff is explained");
  eq(r.net, 0, "nothing is refunded after the cutoff");
}
{
  const r = computeRefund({ totalPaid: 530, gatewayPaid: 265, hoursLeft: 15, destination: "SOURCE" });
  eq(r.walletCredit + r.gatewayRefund, r.refundable, "wallet + bank always add up to the refundable amount");
  eq(r.refundable + r.fee, 530, "refund + fee always equal what was paid");
}
{
  const r = computeRefund({ totalPaid: 0, gatewayPaid: 0, hoursLeft: 40 });
  eq(r.net, 0, "a zero-value ticket refunds zero without NaN");
}

console.log("\nWallet limits");
eq(maxWalletUse(1000, 5000), 500, "wallet pays at most 50% of the ticket");
eq(maxWalletUse(1000, 120), 120, "…or the whole balance if smaller");
eq(maxWalletUse(1000, 0), 0, "an empty wallet pays nothing");
eq(maxWalletUse(-5, 100), 0, "invalid amounts pay nothing");

console.log("\nGateway signatures");
{
  process.env.PAYMENT_MODE = "demo";
  eq(gateway.mode(), "demo", "PAYMENT_MODE=demo selects the sandbox");
  const sig = gateway.sign("order_demo_1", "pay_demo_1");
  assert(gateway.verifySignature("order_demo_1", "pay_demo_1", sig), "a correct signature verifies");
  assert(!gateway.verifySignature("order_demo_1", "pay_demo_2", sig), "a signature for another payment is rejected");
  assert(!gateway.verifySignature("order_demo_1", "pay_demo_1", "deadbeef"), "a forged signature is rejected");
  assert(!gateway.verifySignature("order_demo_1", "pay_demo_1", ""), "an empty signature is rejected");
}

console.log("\nJourney passport");
{
  const orders = [
    { status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur", name: "A", departure: "15", arrival: "20" }, ticketSummary: { ticket: "1,2", date: "2026-01-01", amount: "800" }, pricing: { ticketValue: 800, couponDiscount: 50, cashback: { amount: 30, reversed: false } } },
    { status: "CONFIRMED", busDetails: { from: "Delhi", to: "Jaipur", name: "A", departure: "22", arrival: "3" }, ticketSummary: { ticket: "5", date: "2026-01-02", amount: "400" } },
    { status: "CANCELLED", busDetails: { from: "Pune", to: "Goa", name: "B", departure: "8", arrival: "18" }, ticketSummary: { ticket: "9", date: "2026-02-02", amount: "999" } },
  ];
  const p = buildPassport(orders, new Date("2026-06-01"));
  eq([p.trips, p.cancelled, p.seats], [2, 1, 3], "trips, cancellations and seats are counted");
  eq(p.cities, ["Delhi", "Jaipur"], "cancelled trips don't add cities");
  eq(p.spent, 1200, "spend sums ticket values of kept trips");
  eq(p.saved, 80, "savings = coupon + non-reversed cashback");
  eq(p.topRoute.route, "Delhi → Jaipur", "the favourite route is found");
  assert(p.co2SavedKg > 0, "CO₂ saving is estimated");
  eq(tripHours({ busDetails: { departure: "22", arrival: "3" } }), 5, "overnight trips wrap past midnight");
}

console.log("\nCancellation email");
{
  const order = {
    _id: "507f1f77bcf86cd799439011",
    busDetails: { from: "Delhi", to: "Jaipur" },
    ticketSummary: { date: "2026-10-12", ticket: "4", amount: "500" },
    userDetails: { name: "Ravi" },
    refund: { status: "PROCESSING", percent: 90, fee: 50, walletCredit: 0, bonus: 0, gatewayAmount: 450, clawback: 25, amount: 425 },
  };
  const { body } = templates.cancellationRefund(order);
  assert(body.includes("90%") && body.includes("₹450") && body.includes("₹425"), "the email states the policy, bank amount and total returned");
  assert(body.includes("reversed"), "the email mentions the cashback reversal");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
