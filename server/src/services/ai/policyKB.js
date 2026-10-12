/**
 * The knowledge base the support agent is grounded in. Every entry here
 * describes behaviour that actually exists in this codebase — this file
 * is the thing that keeps the AI honest, so if a policy changes in code
 * (e.g. the cancellation cutoff), update it here too.
 */
const POLICIES = [
  {
    id: "ticket-verification",
    topic: "Ticket QR verification",
    keywords: ["qr", "verify", "verification", "scan", "conductor", "boarding pass", "print", "print ticket", "printed"],
    content:
      "Every confirmed ticket carries a signed QR code. Scanning it opens a public verification page showing the " +
      "passenger, route, date and seats, so the conductor can confirm it in seconds. You can open a printable A4 " +
      "boarding pass from My Trips, print it or save it as a PDF, and add the journey to your calendar.",
  },
  {
    id: "tracking",
    topic: "Live tracking",
    keywords: ["track", "tracking", "where is my bus", "eta", "delay", "delayed", "live location"],
    content:
      "Confirmed trips can be tracked from My Trips. The map shows the route, distance remaining, ETA and delay status. " +
      "Positions are simulated from the bus's schedule and real city coordinates because buses have no GPS device " +
      "yet, and the screen says so. Operators can report delays, which shift the ETA.",
  },
  {
    id: "loyalty",
    topic: "Loyalty points, tiers and referrals",
    keywords: ["points", "loyalty", "tier", "referral", "refer", "invite", "explorer", "voyager", "elite"],
    content:
      "You earn 1 loyalty point for every Rs 100 of ticket value. Tiers are Explorer (0 points), Traveller (50), " +
      "Voyager (200) and Elite (500), and each tier adds extra cashback percentage points on every payment. Share your " +
      "referral code from the Profile page: when a friend signs up with it and completes a first booking, you earn 100 bonus points.",
  },
  {
    id: "live-seats",
    topic: "Live seat availability",
    keywords: ["live seat", "real time", "real-time", "seat map", "availability", "seats left", "sold out"],
    content:
      "The seat map updates in real time over WebSockets, scoped to the exact bus and date you are viewing. When someone " +
      "else holds or books a seat it greys out immediately, and a cancelled booking puts its seats back on sale live.",
  },
  {
    id: "cancellation",
    topic: "Cancellation policy",
    keywords: ["cancel", "cancellation", "cancel my ticket", "cancel booking"],
    content:
      "You can cancel a CONFIRMED booking from My Tickets until 2 hours before departure. The refund depends on how " +
      "early you cancel: 100% at 48+ hours, 90% at 24-48 hours, 75% at 12-24 hours, 50% at 6-12 hours and 25% at " +
      "2-6 hours before departure. Within 2 hours of departure a booking can no longer be cancelled. The exact refund " +
      "is shown before you confirm. Cashback earned on the booking is reversed when it is cancelled.",
  },
  {
    id: "refunds",
    topic: "Refund timing and process",
    keywords: ["refund", "money back", "get my money", "how long refund"],
    content:
      "When you cancel you choose where the refund goes. Refunding to your RaahiGo Wallet is instant and adds a small " +
      "bonus (2% of the bank-bound amount, up to Rs 25). Refunding to your original payment method (UPI, card or " +
      "net banking) is started immediately and typically settles in 5-7 business days depending on your bank. Any part " +
      "you paid from your wallet always returns to the wallet. If a bank refund cannot be started, the amount is " +
      "credited to your wallet instead so it is never lost. You can follow the progress in My Tickets.",
  },
  {
    id: "cashback",
    topic: "Cashback and the RaahiGo Wallet",
    keywords: ["cashback", "wallet", "offer", "upi offer", "card offer", "reward"],
    content:
      "Paying through the gateway earns instant cashback in your RaahiGo Wallet: 5% on UPI (up to Rs 50), 7% on cards " +
      "(up to Rs 100), 3% on net banking (up to Rs 40) and 4% on mobile wallets (up to Rs 30), each with a minimum " +
      "payment. Loyalty tiers add 1 to 3 extra percentage points. Wallet money can pay up to 50% of a ticket on a " +
      "later booking. Cashback is reversed if the booking is cancelled.",
  },
  {
    id: "seat-hold",
    topic: "Seat holding during checkout",
    keywords: ["seat hold", "seats held", "held", "hold", "timer", "seat lock", "how long do I have", "checkout time", "expire"],
    content:
      "Once you select seats and proceed to checkout, they are held for 10 minutes while you " +
      "complete passenger details and payment. If the timer expires before payment is completed, " +
      "the seats are automatically released and become available to other passengers again.",
  },
  {
    id: "payment-security",
    topic: "Payment security",
    keywords: ["payment safe", "secure", "signature", "trust", "card details"],
    content:
      "Payments are processed through Razorpay. After checkout, RaahiGo verifies the payment's " +
      "cryptographic signature on the server before confirming any booking — a booking is never " +
      "created from an unverified client-side payment claim. Card and payment details are handled " +
      "entirely by Razorpay; RaahiGo's servers never see or store your card number.",
  },
  {
    id: "booking-confirmation",
    topic: "How a booking gets confirmed",
    keywords: ["confirm", "confirmation", "is my booking confirmed", "booking status"],
    content:
      "A booking only reaches CONFIRMED status after payment signature verification succeeds on " +
      "the server. Before that it does not exist as a real booking — there is no way to create a " +
      "confirmed booking without a verified payment.",
  },
  {
    id: "account-security",
    topic: "Account and password security",
    keywords: ["password", "account safe", "login security"],
    content:
      "Passwords are hashed with bcrypt before being stored — RaahiGo never stores or can see your " +
      "plain-text password. Login sessions use a signed JWT token.",
  },
  {
    id: "concurrent-booking",
    topic: "What happens if two people pick the same seat",
    keywords: ["same seat", "someone else booked", "double booking", "seat taken"],
    content:
      "Seat selection is protected by an atomic lock, so if two passengers try to select the same " +
      "seat at the same time, only one of them can hold it — the other is told immediately that " +
      "the seat is unavailable and asked to pick a different one.",
  },
];

/**
 * Simple keyword-overlap retrieval — no embeddings or vector database.
 * At this knowledge-base size that's the right trade-off: it's fast,
 * has zero infra cost, is trivial to test deterministically, and is
 * honest about not being a full vector-search RAG pipeline.
 */
function retrieveRelevantPolicies(question, maxResults = 3) {
  const q = question.toLowerCase();
  const scored = POLICIES.map((p) => {
    const score = p.keywords.reduce(
      (acc, kw) => (q.includes(kw.toLowerCase()) ? acc + 1 : acc),
      0
    );
    return { policy: p, score };
  });

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  // If nothing matched by keyword, fall back to giving the model a little
  // context rather than nothing — better to attempt a grounded answer with
  // partial context than force a hard "I don't know" for a near-miss query.
  const chosen = matched.length > 0 ? matched : scored.slice(0, 2);

  return chosen.slice(0, maxResults).map((s) => s.policy);
}

module.exports = { POLICIES, retrieveRelevantPolicies };
