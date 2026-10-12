const UserModel = require("../models/user.model");
const WalletTxn = require("../models/walletTxn.model");

/** Largest share of a ticket that can be paid from the wallet — the rest always goes through the gateway. */
const MAX_WALLET_SHARE_PERCENT = 50;

/** Pure: how many rupees of a ticket may be paid from the wallet. */
function maxWalletUse(ticketValue, balance) {
  const cap = Math.floor((Math.max(0, Number(ticketValue) || 0) * MAX_WALLET_SHARE_PERCENT) / 100);
  return Math.max(0, Math.min(cap, Math.floor(Number(balance) || 0)));
}

async function credit(userId, amount, reason, { note, order = null } = {}) {
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return null;
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $inc: { walletBalance: value, ...(reason === "CASHBACK" ? { lifetimeCashback: value } : {}) } },
    { new: true }
  );
  if (!user) return null;
  await WalletTxn.create({ user: userId, type: "CREDIT", amount: value, reason, note, order, balanceAfter: user.walletBalance });
  return user.walletBalance;
}

/** Atomic: succeeds only if the balance covers the amount, so two checkouts can't both spend the same rupees. */
async function debit(userId, amount, reason, { note, order = null } = {}) {
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, balance: null };
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, walletBalance: { $gte: value } },
    { $inc: { walletBalance: -value } },
    { new: true }
  );
  if (!user) return { ok: false, balance: null };
  await WalletTxn.create({ user: userId, type: "DEBIT", amount: value, reason, note, order, balanceAfter: user.walletBalance });
  return { ok: true, balance: user.walletBalance };
}

/** Debit up to `amount`, never below zero — used for cashback reversal. Returns what was actually taken. */
async function debitUpTo(userId, amount, reason, meta) {
  const user = await UserModel.findById(userId).select("walletBalance").lean();
  const take = Math.min(Math.round(Number(amount) || 0), user?.walletBalance || 0);
  if (take <= 0) return 0;
  const res = await debit(userId, take, reason, meta);
  return res.ok ? take : 0;
}

async function getBalance(userId) {
  const user = await UserModel.findById(userId).select("walletBalance lifetimeCashback loyaltyPoints").lean();
  return user || { walletBalance: 0, lifetimeCashback: 0, loyaltyPoints: 0 };
}

async function history(userId, limit = 50) {
  return WalletTxn.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { MAX_WALLET_SHARE_PERCENT, maxWalletUse, credit, debit, debitUpTo, getBalance, history };
