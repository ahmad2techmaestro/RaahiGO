/**
 * Booking lifecycle: price a checkout, confirm a paid booking, cancel + refund.
 *
 * Controllers stay thin; every rule that touches money or seats lives here so it
 * reads top-to-bottom and can be reasoned about in one place.
 */
const Order = require("../models/order.model");
const BusModel = require("../models/bus.model");
const UserModel = require("../models/user.model");
const PaymentIntent = require("../models/paymentIntent.model");
const seatLock = require("./seatLock.service");
const gateway = require("./payment/gateway");
const wallet = require("./wallet.service");
const { validateCoupon, redeemCoupon } = require("./coupon.service");
const { pointsForAmount, tierForPoints } = require("./loyalty.service");
const { computeCashback, listOffers } = require("./offers.service");
const { departureInstant, hoursUntil, computeRefund, bankRefundEta } = require("./cancellation.service");
const { AppError } = require("../utils/errors");
const { emitSeatsBooked, emitSeatsFreed, emitBookingUpdate } = require("../configs/socket");
const { notify } = require("./notifications/notify");
const { logger } = require("../configs/logger");

const TOTAL_SEATS = 30;
const MAX_SEATS_PER_BOOKING = 6;
const INTENT_TTL_MS = 20 * 60 * 1000;

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const seatList = (str) => String(str || "").split(",").map((s) => s.trim()).filter(Boolean);

function takenSeats(busDoc, date) {
  const taken = [];
  (busDoc.seats || []).forEach((entry) => {
    const [entryDate, entrySeats] = entry.split("@");
    if (sameDay(entryDate, date)) taken.push(...seatList(entrySeats));
  });
  return taken;
}

/* ───────────────────────── checkout ───────────────────────── */

/** Gives a stale checkout's wallet reservation back. Safe to call repeatedly — it only fires once. */
async function releaseIntentWallet(intent, status = "EXPIRED") {
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, walletReleased: false, status: "CREATED" },
    { $set: { walletReleased: true, status } },
    { new: true }
  );
  if (claimed && claimed.walletUsed > 0) {
    await wallet.credit(claimed.user, claimed.walletUsed, "BOOKING_RELEASE", { note: "Checkout expired — wallet amount returned" });
  }
  return Boolean(claimed);
}

async function expireStaleIntents(userId) {
  const cutoff = new Date(Date.now() - INTENT_TTL_MS);
  const stale = await PaymentIntent.find({ user: userId, status: "CREATED", walletReleased: false, createdAt: { $lt: cutoff } });
  for (const intent of stale) await releaseIntentWallet(intent);
}

/** Validates a checkout request and prices it on the server. Pure read — nothing is reserved. */
async function priceCheckout({ userId, busId, date, seats, couponCode, useWallet }) {
  const seatNums = Array.from(new Set((seats || []).map(String)));
  if (!busId || !date || !seatNums.length) throw new AppError("busId, date and seats are required", 400);
  if (seatNums.length > MAX_SEATS_PER_BOOKING) throw new AppError(`You can book at most ${MAX_SEATS_PER_BOOKING} seats at a time`, 400);
  if (seatNums.some((s) => !/^\d+$/.test(s) || Number(s) < 1 || Number(s) > TOTAL_SEATS)) {
    throw new AppError("One or more seat numbers are invalid", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new AppError("date must be YYYY-MM-DD", 400);

  const bus = await BusModel.findById(busId);
  if (!bus || bus.status === "INACTIVE") throw new AppError("Bus not found", 404);

  const departure = departureInstant(date, bus.departure);
  if (!departure || hoursUntil(departure) <= 0) throw new AppError("This bus has already departed", 409);

  if (takenSeats(bus, date).some((s) => seatNums.includes(s))) {
    throw new AppError("One or more selected seats were just booked by someone else.", 409);
  }

  await expireStaleIntents(userId);
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError("User not found", 404);
  const tier = tierForPoints(user.loyaltyPoints || 0);

  const fare = bus.price * seatNums.length;
  let couponDiscount = 0;
  let coupon = null;
  if (couponCode) {
    const result = await validateCoupon(couponCode, fare);
    if (!result.valid) throw new AppError(result.reason, 400);
    couponDiscount = result.discount;
    coupon = result.coupon;
  }
  const ticketValue = fare - couponDiscount;
  const walletBalance = user.walletBalance || 0;
  const walletUsed = useWallet ? wallet.maxWalletUse(ticketValue, walletBalance) : 0;
  const payable = ticketValue - walletUsed;
  if (payable < 1) throw new AppError("Nothing to pay for this booking", 400);

  return {
    bus, seatNums, tier, fare, coupon, couponDiscount, ticketValue, walletBalance, walletUsed, payable,
    walletCanCover: wallet.maxWalletUse(ticketValue, walletBalance),
    offers: listOffers({ amountPaid: payable, tier }),
  };
}

/** Read-only price quote for the checkout screen: totals, wallet and per-method cashback. */
async function quoteCheckout(input) {
  const q = await priceCheckout(input);
  return {
    pricing: { fare: q.fare, couponDiscount: q.couponDiscount, ticketValue: q.ticketValue, walletUsed: q.walletUsed, payable: q.payable },
    wallet: { balance: q.walletBalance, usable: q.walletCanCover },
    offers: q.offers,
    tier: q.tier,
    coupon: q.coupon ? { code: q.coupon.code, discount: q.couponDiscount } : null,
    mode: gateway.mode(),
  };
}

/** Prices the checkout, reserves any wallet amount, and opens a gateway order for the payable amount. */
async function createCheckout({ userId, busId, date, seats, couponCode, useWallet, notes }) {
  const { seatNums, tier, fare, coupon, couponDiscount, ticketValue, walletUsed, payable, offers } =
    await priceCheckout({ userId, busId, date, seats, couponCode, useWallet });
  const bus = { from: "", to: "" };
  const busDoc = await BusModel.findById(busId).select("from to");
  bus.from = busDoc.from; bus.to = busDoc.to;

  if (walletUsed > 0) {
    const res = await wallet.debit(userId, walletUsed, "BOOKING", { note: `Reserved for ${bus.from} → ${bus.to} booking` });
    if (!res.ok) throw new AppError("Your wallet balance changed. Please review the total and try again.", 409);
  }

  const releaseOnFailure = () => (walletUsed > 0
    ? wallet.credit(userId, walletUsed, "BOOKING_RELEASE", { note: "Checkout could not start — wallet amount returned" })
    : null);

  let gatewayOrder;
  try {
    gatewayOrder = await gateway.createOrder({
      amount: payable,
      receipt: `rg_${Date.now().toString(36)}`,
      notes: { userId: String(userId), ...(notes || {}) },
    });
  } catch (err) {
    await releaseOnFailure();
    logger.error({ err }, "Gateway order creation failed");
    throw new AppError("The payment gateway is unavailable right now. Please try again in a moment.", 502);
  }

  let intent;
  try {
    intent = await PaymentIntent.create({
      user: userId, bus: busId, date, seats: seatNums, fare,
      couponId: coupon ? String(coupon._id) : null, couponCode: coupon ? coupon.code : null, couponDiscount,
      ticketValue, walletUsed, payable, gateway: gatewayOrder.gateway, gatewayOrderId: gatewayOrder.id,
    });
  } catch (err) {
    await releaseOnFailure();
    throw err;
  }

  return {
    ...gatewayOrder,
    intentId: String(intent._id),
    pricing: { fare, couponDiscount, ticketValue, walletUsed, payable },
    discount: coupon ? { code: coupon.code, discount: couponDiscount, couponId: String(coupon._id) } : null,
    offers,
    tier,
  };
}

/* ───────────────────────── confirmation ───────────────────────── */

/** Money back to the traveller when a payment was taken but the booking can't be honoured. */
async function autoRefundIntent(intent, paymentId, why) {
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: { $in: ["CREATED", "PAID", "EXPIRED"] }, order: null },
    { $set: { status: "REFUNDED" } },
    { new: true }
  );
  if (!claimed) return;
  try {
    await gateway.refund({ paymentId, amount: intent.payable, gateway: intent.gateway, notes: { reason: why } });
  } catch (err) {
    logger.error({ err, intent: String(intent._id) }, "Auto-refund to gateway failed — crediting wallet instead");
    await wallet.credit(intent.user, intent.payable, "REFUND", { note: "Payment couldn't be honoured — refunded to wallet" });
  }
  if (intent.walletUsed > 0 && !intent.walletReleased) {
    await wallet.credit(intent.user, intent.walletUsed, "BOOKING_RELEASE", { note: "Booking couldn't be completed — wallet amount returned" });
  }
}

async function confirmBooking({ userId, gatewayOrderId, paymentId, signature, userDetails, lockToken }) {
  if (!gatewayOrderId || !paymentId || !signature) throw new AppError("Missing payment verification fields", 400);
  if (!gateway.verifySignature(gatewayOrderId, paymentId, signature)) throw new AppError("Invalid payment signature", 400);

  // Idempotent: a retried request returns the booking it already created.
  const existing = await Order.findOne({ "paymentDetails.razorpayPaymentId": paymentId });
  if (existing) return { order: existing, cashback: existing.pricing?.cashback || null, repeated: true };

  const intent = await PaymentIntent.findOne({ gatewayOrderId, user: userId });
  if (!intent) throw new AppError("We couldn't find this checkout. Please contact support with your payment ID.", 404);
  if (intent.status === "PAID" && intent.order) {
    const order = await Order.findById(intent.order);
    if (order) return { order, cashback: order.pricing?.cashback || null, repeated: true };
  }
  if (intent.status !== "CREATED") {
    await autoRefundIntent(intent, paymentId, "checkout expired");
    throw new AppError("This checkout expired before payment completed. Your money is being refunded automatically.", 409);
  }

  // Claim the intent atomically so two concurrent verify calls can't both create a booking.
  const claimed = await PaymentIntent.findOneAndUpdate({ _id: intent._id, status: "CREATED" }, { $set: { status: "PAID" } }, { new: true });
  if (!claimed) throw new AppError("This payment is already being processed.", 409);

  const bus = await BusModel.findById(intent.bus);
  if (!bus) {
    await autoRefundIntent({ ...intent.toObject(), status: "PAID" }, paymentId, "bus removed");
    throw new AppError("This bus is no longer available. Your payment is being refunded.", 409);
  }

  const refundNote = "Your payment is being refunded automatically";
  if (takenSeats(bus, intent.date).some((s) => intent.seats.includes(s))) {
    await autoRefundIntent(intent, paymentId, "seats taken");
    throw new AppError(`Those seats were just booked by someone else. ${refundNote}.`, 409);
  }
  const lockCheck = await seatLock.verifyLocks(intent.bus, intent.date, intent.seats, lockToken);
  if (!lockCheck.ok && !lockCheck.skipped) {
    await autoRefundIntent(intent, paymentId, "seat hold expired");
    const detail = lockCheck.reason === "expired" ? "Your seat hold expired during checkout." : "Those seats were taken by another passenger.";
    throw new AppError(`${detail} ${refundNote}.`, 409);
  }

  const user = await UserModel.findById(userId).lean();
  const tier = tierForPoints(user?.loyaltyPoints || 0);
  const method = await gateway.fetchPaymentMethod(paymentId, intent);
  const cashback = computeCashback({ method, amountPaid: intent.payable, tier });

  const order = await Order.create({
    status: "CONFIRMED",
    busDetails: {
      name: bus.companyname, from: bus.from, to: bus.to,
      contactemail: bus.email || "-", contactphone: String(bus.phone || "-"),
      arrival: bus.arrival, departure: bus.departure,
    },
    ticketSummary: { date: intent.date, ticket: intent.seats.join(","), amount: String(intent.ticketValue) },
    paymentDetails: { orderId: gatewayOrderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: paymentId },
    userDetails,
    user: userId,
    bus: intent.bus,
    pricing: {
      fare: intent.fare, couponDiscount: intent.couponDiscount, ticketValue: intent.ticketValue,
      walletUsed: intent.walletUsed, gatewayPaid: intent.payable, method: cashback.method || method || null,
      gateway: intent.gateway, cashback: { percent: cashback.percent, amount: cashback.amount, reversed: false },
    },
  });
  await PaymentIntent.updateOne({ _id: intent._id }, { $set: { order: order._id } });

  if (intent.couponId) {
    const { redeemed, coupon } = await redeemCoupon(intent.couponId);
    if (redeemed && coupon) {
      order.coupon = { code: coupon.code, discount: intent.couponDiscount };
      await order.save();
    }
  }

  const points = pointsForAmount(intent.ticketValue);
  if (points > 0) await UserModel.findByIdAndUpdate(userId, { $inc: { loyaltyPoints: points } });

  if (cashback.eligible && cashback.amount > 0) {
    await wallet.credit(userId, cashback.amount, "CASHBACK", {
      order: order._id, note: `${cashback.percent}% cashback on ${cashback.method} payment`,
    });
  }

  const buyer = await UserModel.findById(userId);
  if (buyer?.referredBy && !buyer.referralBonusPaid) {
    if ((await Order.countDocuments({ user: userId, status: "CONFIRMED" })) === 1) {
      await UserModel.findByIdAndUpdate(buyer.referredBy, { $inc: { loyaltyPoints: 100 } });
      buyer.referralBonusPaid = true;
      await buyer.save();
    }
  }

  await BusModel.findByIdAndUpdate(intent.bus, { $push: { seats: `${intent.date}@${intent.seats.join(",")}@${userDetails.gender || ""}` } });
  await seatLock.markSeatsBooked(intent.bus, intent.date, intent.seats);
  emitSeatsBooked(intent.bus, intent.date, intent.seats);
  emitBookingUpdate(userId, { status: "CONFIRMED", orderId: order._id, seats: intent.seats });
  notify("BOOKING_CONFIRMATION", order);

  return { order, cashback, repeated: false };
}

/* ───────────────────────── cancellation ───────────────────────── */

function orderMoney(order) {
  const ticketValue = Number(order.pricing?.ticketValue ?? order.ticketSummary?.amount) || 0;
  const walletUsed = Number(order.pricing?.walletUsed) || 0;
  const gatewayPaid = order.pricing ? Number(order.pricing.gatewayPaid) || 0 : ticketValue;
  return { ticketValue, walletUsed, gatewayPaid };
}

async function previewCancellation(order, userId, destination = "SOURCE") {
  const departure = departureInstant(order.ticketSummary?.date, order.busDetails?.departure);
  const { ticketValue, gatewayPaid } = orderMoney(order);
  const user = await wallet.getBalance(userId);
  const cashbackEarned = order.pricing?.cashback?.reversed ? 0 : Number(order.pricing?.cashback?.amount) || 0;
  const plan = computeRefund({
    totalPaid: ticketValue,
    gatewayPaid,
    cashbackEarned,
    walletBalance: user.walletBalance,
    hoursLeft: hoursUntil(departure),
    destination,
  });
  return { ...plan, departure };
}

/** Takes the cancelled booking's seats off the bus document and the Redis map, and tells live seat maps. */
async function releaseOrderSeats(order) {
  const seats = seatList(order.ticketSummary?.ticket);
  const date = order.ticketSummary?.date;
  const busDoc = await BusModel.findById(order.bus);
  if (busDoc) {
    const want = [...seats].sort().join(",");
    const entry = (busDoc.seats || []).find((e) => {
      const [d, s] = e.split("@");
      return sameDay(d, date) && seatList(s).sort().join(",") === want;
    });
    if (entry) await BusModel.updateOne({ _id: busDoc._id }, { $pull: { seats: entry } });
  }
  const day = new Date(date).toISOString().split("T")[0];
  await seatLock.unmarkSeatsBooked(order.bus, day, seats);
  emitSeatsFreed(String(order.bus), day, seats);
}

async function cancelBooking({ orderId, userId, destination = "SOURCE", reason }) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Booking not found", 404);
  if (String(order.user) !== String(userId)) throw new AppError("You do not have permission to cancel this booking", 403);
  if (order.status === "CANCELLED") throw new AppError("This booking is already cancelled", 409);
  if (order.status !== "CONFIRMED") throw new AppError(`Booking with status ${order.status} cannot be cancelled`, 409);

  const plan = await previewCancellation(order, userId, destination);
  if (!plan.cancellable) throw new AppError(plan.reason, 409);

  // Flip the status first and atomically: a double click or two tabs can never refund twice.
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, user: userId, status: "CONFIRMED" },
    { $set: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: String(reason || "").slice(0, 200) || undefined } },
    { new: true }
  );
  if (!claimed) throw new AppError("This booking is already cancelled", 409);

  const refund = {
    status: "COMPLETED", destination: plan.destination, percent: plan.percent, fee: plan.fee,
    walletCredit: plan.walletCredit, bonus: plan.bonus, gatewayAmount: plan.gatewayRefund,
    clawback: plan.clawback, amount: plan.net, requestedAt: new Date(), note: undefined,
  };

  try {
    if (plan.walletCredit > 0) await wallet.credit(userId, plan.walletCredit, "REFUND", { order: orderId, note: `Refund · ${plan.percent}% of ticket value` });
    if (plan.bonus > 0) await wallet.credit(userId, plan.bonus, "REFUND_BONUS", { order: orderId, note: "Instant wallet refund bonus" });
    if (plan.clawbackFromWallet > 0) await wallet.debitUpTo(userId, plan.clawbackFromWallet, "CLAWBACK", { order: orderId, note: "Cashback reversed on cancellation" });

    if (plan.gatewayRefund > 0) {
      try {
        const money = orderMoney(claimed);
        const result = await gateway.refund({
          paymentId: claimed.paymentDetails?.razorpayPaymentId,
          amount: Math.min(plan.gatewayRefund, money.gatewayPaid),
          gateway: claimed.pricing?.gateway || (String(claimed.paymentDetails?.razorpayPaymentId).startsWith("pay_demo_") ? "demo" : "razorpay"),
          notes: { orderId: String(orderId) },
        });
        refund.razorpayRefundId = result.id;
        refund.status = "PROCESSING";
        refund.completesAt = bankRefundEta();
        refund.note = "Refund sent to your original payment method";
      } catch (err) {
        logger.error({ err, orderId }, "Gateway refund failed — falling back to wallet");
        await wallet.credit(userId, plan.gatewayRefund, "REFUND", { order: orderId, note: "Bank refund couldn't be started — credited to wallet instead" });
        refund.walletCredit += plan.gatewayRefund;
        refund.gatewayAmount = 0;
        refund.destination = "WALLET";
        refund.note = "We couldn't reach your bank, so the refund was credited to your RaahiGo Wallet instantly";
      }
    } else {
      refund.completedAt = new Date();
      refund.note = plan.destination === "WALLET" ? "Refunded to your RaahiGo Wallet instantly" : "Refunded to your RaahiGo Wallet";
    }
  } catch (err) {
    logger.error({ err, orderId }, "Cancellation refund failed part-way");
    refund.status = "FAILED";
    refund.note = "Your booking is cancelled but the refund needs a manual review. Our team will contact you.";
  }

  claimed.refund = refund;
  if (claimed.pricing?.cashback && plan.clawback > 0) claimed.pricing.cashback.reversed = true;
  await claimed.save();

  try { await releaseOrderSeats(claimed); } catch (err) { logger.error({ err, orderId }, "Seat release failed"); }
  emitBookingUpdate(userId, { status: "CANCELLED", orderId: claimed._id });
  notify("CANCELLATION_REFUND", claimed);

  return { order: claimed, plan };
}

/** Moves a bank-bound refund along: PROCESSING → COMPLETED once the gateway reports it settled. */
async function refreshRefund(order) {
  if (order.refund?.status !== "PROCESSING" || !order.refund.razorpayRefundId) return order;
  const status = await gateway.refundStatus({
    refundId: order.refund.razorpayRefundId,
    gateway: order.pricing?.gateway,
    completesAt: order.refund.completesAt,
  });
  if (status === "processed") {
    order.refund.status = "COMPLETED";
    order.refund.completedAt = new Date();
    order.refund.note = "Refund settled to your original payment method";
    await order.save();
  } else if (status === "failed") {
    order.refund.status = "FAILED";
    order.refund.note = "The bank rejected this refund. Our team will contact you.";
    await order.save();
  }
  return order;
}

module.exports = {
  createCheckout, quoteCheckout, confirmBooking, releaseIntentWallet, autoRefundIntent, previewCancellation, cancelBooking, refreshRefund,
  releaseOrderSeats, takenSeats, expireStaleIntents, TOTAL_SEATS,
};
