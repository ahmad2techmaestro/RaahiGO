import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { FiArrowDownLeft, FiArrowUpRight, FiZap, FiPlus, FiCheck } from "react-icons/fi";
import { RiWallet3Line } from "react-icons/ri";
import { API_BASE_URL } from "../../config/api";
import { authHeader, getToken } from "../../lib/session";
import { notifyWalletChanged } from "../../lib/wallet";
import { success, error } from "../../Utils/notification";
import DemoPaymentSheet from "../Checkout/DemoPaymentSheet";
import { createTopup, demoTopupAuthorise, verifyTopup, openRazorpay } from "../../Pages/payment/checkout";
import { formatINR } from "../../lib/format";
import { METHOD_ICON } from "../Checkout/PaymentOffers";
import styles from "../../Styles/wallet.module.css";

const REASON = {
  CASHBACK: "Cashback", REFUND: "Refund", REFUND_BONUS: "Refund bonus", BOOKING: "Used for booking",
  BOOKING_RELEASE: "Returned", CLAWBACK: "Cashback reversed", TOPUP: "Money added", REFERRAL: "Referral", WELCOME: "Welcome gift",
};

const when = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function WalletPanel() {
  const [w, setW] = useState(null);
  const [failed, setFailed] = useState(false);
  const [amount, setAmount] = useState(500);
  const [method, setMethod] = useState("UPI");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);

  const load = useCallback(() => axios.get(`${API_BASE_URL}/wallet`, authHeader()).then(({ data }) => setW(data)).catch(() => setFailed(true)), []);
  useEffect(() => { load(); }, [load]);

  async function settle(payment) {
    try {
      const r = await verifyTopup({ payment, token: getToken() });
      notifyWalletChanged();
      await load();
      setSheet(null);
      success(`${formatINR(r.added)} added to your wallet`);
    } catch (err) {
      error(err?.response?.data?.message || "We couldn't confirm that top-up. If money was debited it will be refunded.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function addMoney() {
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value < 100 || value > 10000) return error("Add between ₹100 and ₹10,000 at a time");
    setBusy(true);
    try {
      const order = await createTopup({ amount: value, token: getToken() });
      if (order.gateway === "demo") return setSheet(order);
      openRazorpay({
        keyId: order.keyId, checkout: order, creds: {}, preferred: method,
        onPaid: (response) => settle(response).catch(() => {}),
        onDismiss: () => setBusy(false),
        onFailed: (msg) => { error(msg); setBusy(false); },
      });
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't start the top-up. Please try again.");
      setBusy(false);
    }
  }

  if (failed) return <p className="field-error">Couldn't load your wallet.</p>;
  if (!w) return <div className="skel" style={{ height: 320, borderRadius: 20 }} />;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.label}><RiWallet3Line size={18} /> RaahiGo Wallet</span>
        <strong className={styles.balance}>{formatINR(w.balance)}</strong>
        <p>Spend up to {w.maxSharePercent}% of any ticket from your wallet. Cashback and refunds land here instantly.</p>
        <dl>
          <div><dt>Lifetime cashback</dt><dd>{formatINR(w.lifetimeCashback)}</dd></div>
          <div><dt>{w.tier} bonus</dt><dd>+{w.tierBonusPercent}% on every offer</dd></div>
        </dl>
      </div>

      <div className={styles.side}>
        <h4><FiZap /> Your cashback rates</h4>
        <p className={styles.hint}>Tap a method to use it for adding money or to see its rate.</p>
        <ul className={styles.rates} role="radiogroup" aria-label="Payment method">
          {w.offers.map((o) => {
            const Icon = METHOD_ICON[o.method];
            return (
              <li key={o.method}>
                <button type="button" role="radio" aria-checked={method === o.method} className={method === o.method ? styles.rateOn : ""} onClick={() => setMethod(o.method)}>
                  <Icon size={16} /> <span>{o.label}</span>
                  <b>{o.percent}%</b><small>up to {formatINR(o.cap)} · min {formatINR(o.minAmount)}</small>
                  {method === o.method && <FiCheck className={styles.rateTick} size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.topup}>
        <h4><FiPlus /> Add money to wallet</h4>
        <div className={styles.presets} role="group" aria-label="Amount">
          {[200, 500, 1000, 2000].map((v) => (
            <button key={v} type="button" aria-pressed={Number(amount) === v} className={Number(amount) === v ? styles.presetOn : ""} onClick={() => setAmount(v)}>{formatINR(v)}</button>
          ))}
        </div>
        <div className={styles.topRow}>
          <label htmlFor="topup-amt" className="sr-only">Amount in rupees</label>
          <span className={styles.rs}>₹</span>
          <input id="topup-amt" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Amount" />
          <button type="button" className="btn btn-accent" onClick={addMoney} disabled={busy}>{busy ? <span className="spinner" /> : <>Add {formatINR(Number(amount) || 0)}</>}</button>
        </div>
        <small className={styles.hint}>₹100 – ₹10,000 per top-up · usable on up to {w.maxSharePercent}% of any ticket · refunds and cashback also land here.</small>
      </div>

      <DemoPaymentSheet
        open={Boolean(sheet)} amount={sheet ? sheet.amount / 100 : 0} offers={[]} initialMethod={method} title="Add money"
        onClose={() => { setSheet(null); setBusy(false); }}
        onPay={async (m) => { const payment = await demoTopupAuthorise({ orderId: sheet.id, method: m, token: getToken() }); await settle(payment); }}
      />

      <div className={styles.history}>
        <h4>Recent activity</h4>
        {w.transactions.length === 0 ? (
          <p className={styles.empty}>No wallet activity yet — your first cashback will appear here after you book.</p>
        ) : (
          <ul>
            {w.transactions.map((t) => (
              <li key={t._id}>
                <span className={`${styles.dot} ${t.type === "CREDIT" ? styles.in : styles.out}`}>{t.type === "CREDIT" ? <FiArrowDownLeft size={15} /> : <FiArrowUpRight size={15} />}</span>
                <div><strong>{REASON[t.reason] || t.reason}</strong><small>{t.note || ""} · {when(t.createdAt)}</small></div>
                <div className={styles.amt}><b className={t.type === "CREDIT" ? styles.pos : ""}>{t.type === "CREDIT" ? "+" : "−"}{formatINR(t.amount)}</b><small>Bal {formatINR(t.balanceAfter)}</small></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
