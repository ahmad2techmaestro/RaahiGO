import { useEffect, useState } from "react";
import axios from "axios";
import { FiZap, FiCreditCard, FiAlertTriangle, FiCheck } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import { formatDate, formatINR } from "../../lib/format";
import { error } from "../../Utils/notification";
import { notifyWalletChanged } from "../../lib/wallet";
import Modal from "../../ui/Modal";
import RefundTracker from "./RefundTracker";
import styles from "../../Styles/refund.module.css";

/** Cancel flow: live refund preview from the server → choose where the money goes → confirm → tracker. */
export default function CancelModal({ order, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState("");
  const [dest, setDest] = useState("WALLET");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setPreview(null); setProblem(""); setResult(null); setDest("WALLET");
    if (!order) return;
    axios.get(`${API_BASE_URL}/order/${order._id}/cancel-preview`, authHeader())
      .then(({ data }) => { setPreview(data); if (!(data.source.gatewayRefund > 0 || data.source.walletCredit < data.source.refundable)) setDest("WALLET"); })
      .catch((err) => setProblem(err?.response?.data?.message || "Couldn't load the refund details"));
  }, [order]);

  async function confirm() {
    setBusy(true);
    try {
      const { data } = await axios.delete(`${API_BASE_URL}/order/oneorder/${order._id}`, { ...authHeader(), data: { destination: dest } });
      setResult(data.order);
      notifyWalletChanged();
      onDone?.();
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't cancel this ticket");
    } finally {
      setBusy(false);
    }
  }

  const plan = preview ? (dest === "WALLET" ? preview.wallet : preview.source) : null;
  const bankPossible = preview?.source?.gatewayRefund > 0 || (preview?.wallet?.bonus > 0);
  const close = () => !busy && onClose();

  return (
    <Modal open={Boolean(order)} onClose={close} title={result ? "Ticket cancelled" : "Cancel this ticket?"} width={540}>
      {order && result && (
        <div className={styles.done}>
          <span className={styles.doneTick}><FiCheck size={26} /></span>
          <p className="muted">{order.busDetails.from} → {order.busDetails.to} · {formatDate(order.ticketSummary.date)}. The seats are back on sale.</p>
          <RefundTracker order={result} />
          <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
        </div>
      )}

      {order && !result && (
        <>
          <p className="muted" style={{ lineHeight: 1.6 }}>{order.busDetails.from} → {order.busDetails.to} · {formatDate(order.ticketSummary.date)} · seat {order.ticketSummary.ticket}</p>
          {problem && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{problem}</p>}
          {!preview && !problem && <div className="skel" style={{ height: 220, borderRadius: 14, marginTop: 16 }} />}

          {preview && !preview.source.cancellable && (
            <div className={styles.blocked}><FiAlertTriangle size={20} /><div><strong>This ticket can't be cancelled</strong><span>{preview.source.reason}</span></div></div>
          )}

          {preview && preview.source.cancellable && plan && (
            <>
              <ol className={styles.ladder} aria-label="Refund policy">
                {preview.policy.map((t) => (
                  <li key={t.minHours} className={t.percent === plan.percent ? styles.on : ""}>
                    <b>{t.percent}%</b><span>{t.label}</span>
                  </li>
                ))}
              </ol>

              <fieldset className={styles.dest}>
                <legend className="field-label">Where should the refund go?</legend>
                <label className={dest === "WALLET" ? styles.picked : ""}>
                  <input type="radio" name="dest" checked={dest === "WALLET"} onChange={() => setDest("WALLET")} />
                  <FiZap size={18} />
                  <div><strong>RaahiGo Wallet · instant</strong><small>{preview.wallet.bonus > 0 ? `Includes a +${formatINR(preview.wallet.bonus)} instant-refund bonus` : "Available to spend right away"}</small></div>
                  <b>{formatINR(preview.wallet.net)}</b>
                </label>
                {bankPossible && preview.source.gatewayRefund > 0 && (
                  <label className={dest === "SOURCE" ? styles.picked : ""}>
                    <input type="radio" name="dest" checked={dest === "SOURCE"} onChange={() => setDest("SOURCE")} />
                    <FiCreditCard size={18} />
                    <div><strong>Original payment method</strong><small>UPI / card / bank · 5–7 business days</small></div>
                    <b>{formatINR(preview.source.net)}</b>
                  </label>
                )}
              </fieldset>

              <dl className={styles.sum}>
                <div><dt>You paid</dt><dd>{formatINR(plan.totalPaid)}</dd></div>
                <div className={styles.minus}><dt>Cancellation fee ({100 - plan.percent}%)</dt><dd>−{formatINR(plan.fee)}</dd></div>
                {plan.clawback > 0 && <div className={styles.minus}><dt>Cashback reversed</dt><dd>−{formatINR(plan.clawback)}</dd></div>}
                {plan.bonus > 0 && <div className={styles.plus}><dt>Instant wallet bonus</dt><dd>+{formatINR(plan.bonus)}</dd></div>}
                <div className={styles.net}><dt>You get back</dt><dd>{formatINR(plan.net)}</dd></div>
              </dl>
            </>
          )}

          <div className={styles.foot}>
            <button className="btn btn-outline" onClick={close} disabled={busy}>Keep ticket</button>
            {preview?.source?.cancellable && (
              <button className="btn btn-danger" onClick={confirm} disabled={busy}>{busy ? <span className="spinner" /> : `Cancel & refund ${formatINR(plan?.net ?? 0)}`}</button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
