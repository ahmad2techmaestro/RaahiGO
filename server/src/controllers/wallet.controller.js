const express = require("express");
const wallet = require("../services/wallet.service");
const booking = require("../services/booking.service");
const { tierForPoints, pointsToNextTier } = require("../services/loyalty.service");
const { tierBonus, METHOD_OFFERS } = require("../services/offers.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const crypto = require("crypto");
const gateway = require("../services/payment/gateway");
const WalletTopup = require("../models/walletTopup.model");

const TOPUP_MIN = 100;
const TOPUP_MAX = 10000;
const WALLET_CAP = 50000;

const app = express.Router();
app.use(requireAuth);

/** GET /wallet — balance, membership tier and the latest ledger entries. */
app.get(
  "/",
  asyncHandler(async (req, res) => {
    await booking.expireStaleIntents(req.user._id);
    const [account, transactions] = await Promise.all([wallet.getBalance(req.user._id), wallet.history(req.user._id, 60)]);
    const points = account.loyaltyPoints || 0;
    const tier = tierForPoints(points);
    res.json({
      balance: account.walletBalance || 0,
      lifetimeCashback: account.lifetimeCashback || 0,
      tier,
      tierBonusPercent: tierBonus(tier),
      pointsToNextTier: pointsToNextTier(points),
      maxSharePercent: wallet.MAX_WALLET_SHARE_PERCENT,
      offers: Object.entries(METHOD_OFFERS).map(([method, o]) => ({ method, label: o.label, percent: o.percent + tierBonus(tier), cap: o.cap, minAmount: o.minAmount })),
      transactions,
    });
  })
);

/** POST /wallet/topup/order { amount } — opens a gateway order for adding money. */
app.post(
  "/topup/order",
  asyncHandler(async (req, res) => {
    const amount = Math.floor(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
      throw new AppError(`Add between ₹${TOPUP_MIN} and ₹${TOPUP_MAX.toLocaleString("en-IN")} at a time`, 400);
    }
    const { walletBalance = 0 } = await wallet.getBalance(req.user._id);
    if (walletBalance + amount > WALLET_CAP) throw new AppError(`Wallet balance can't exceed ₹${WALLET_CAP.toLocaleString("en-IN")}`, 400);
    const order = await gateway.createOrder({ amount, receipt: `wt_${Date.now().toString(36)}`, notes: { userId: String(req.user._id), purpose: "wallet_topup" } });
    await WalletTopup.create({ user: req.user._id, amount, gateway: order.gateway, gatewayOrderId: order.id });
    const mode = gateway.mode();
    res.status(201).json({ id: order.id, amount: order.amount, currency: order.currency, gateway: order.gateway, keyId: mode === "razorpay" ? process.env.RAZORPAY_KEY_ID : null });
  })
);

/** POST /wallet/topup/demo-confirm { orderId, method } — sandbox stand-in for the payment step. */
app.post(
  "/topup/demo-confirm",
  asyncHandler(async (req, res) => {
    const { orderId, method } = req.body;
    if (!["UPI", "CARD", "NETBANKING", "WALLET"].includes(String(method || "").toUpperCase())) throw new AppError("Choose a payment method", 400);
    const paymentId = `pay_demo_${crypto.randomBytes(8).toString("hex")}`;
    const topup = await WalletTopup.findOneAndUpdate(
      { gatewayOrderId: orderId, user: req.user._id, status: "CREATED", gateway: "demo" },
      { $set: { demoPaymentId: paymentId, demoMethod: String(method).toUpperCase() } },
      { new: true }
    );
    if (!topup) throw new AppError("This top-up is no longer active", 409);
    res.json({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: gateway.sign(orderId, paymentId) });
  })
);

/** POST /wallet/topup/verify — checks the signature, then credits the wallet exactly once. */
app.post(
  "/topup/verify",
  asyncHandler(async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!gateway.verifySignature(orderId, paymentId, signature)) throw new AppError("Payment signature could not be verified", 400);
    const topup = await WalletTopup.findOneAndUpdate(
      { gatewayOrderId: orderId, user: req.user._id, status: "CREATED" },
      { $set: { status: "PAID", paymentId } },
      { new: true }
    );
    if (!topup) {
      const existing = await WalletTopup.findOne({ gatewayOrderId: orderId, user: req.user._id, status: "PAID" }).lean();
      if (!existing) throw new AppError("Unknown top-up", 404);
      const { walletBalance } = await wallet.getBalance(req.user._id);
      return res.json({ ok: true, repeated: true, added: existing.amount, balance: walletBalance });
    }
    const balance = await wallet.credit(req.user._id, topup.amount, "TOPUP", { note: `Added via ${topup.demoMethod || "payment gateway"}` });
    res.json({ ok: true, added: topup.amount, balance });
  })
);

module.exports = app;
