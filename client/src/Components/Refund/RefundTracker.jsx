import { useEffect, useState } from "react";
import axios from "axios";
import { FiCheck, FiClock, FiAlertTriangle } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import { formatDate, formatINR } from "../../lib/format";
import styles from "../../Styles/refund.module.css";

const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/** Step-by-step refund progress. Polls the server on open so a settled bank refund flips to "Credited". */
export default function RefundTracker({ order, compact = false }) {
  const [state, setState] = useState({ refund: order.refund, cancelledAt: order.cancelledAt });

  useEffect(() => {
    setState({ refund: order.refund, cancelledAt: order.cancelledAt });
    if (order.refund?.status !== "PROCESSING") return;
    axios.get(`${API_BASE_URL}/order/${order._id}/refund`, authHeader()).then(({ data }) => setState({ refund: data.refund, cancelledAt: data.cancelledAt })).catch(() => {});
  }, [order]);

  const { refund, cancelledAt } = state;
  if (!refund || refund.status === "NONE") return null;

  const toBank = refund.gatewayAmount > 0;
  const failed = refund.status === "FAILED";
  const done = refund.status === "COMPLETED";
  const steps = [
    { label: "Ticket cancelled", meta: when(cancelledAt), state: "done" },
    { label: `Refund approved · ${refund.percent ?? 100}% of ticket value`, meta: when(refund.requestedAt), state: failed ? "bad" : "done" },
    ...(refund.walletCredit > 0 ? [{ label: `${formatINR(refund.walletCredit + (refund.bonus || 0))} credited to RaahiGo Wallet`, meta: "Instant", state: failed ? "wait" : "done" }] : []),
    ...(toBank ? [
      { label: `${formatINR(refund.gatewayAmount)} sent to your bank / UPI / card`, meta: when(refund.requestedAt), state: failed ? "wait" : "done" },
      { label: done ? "Credited to your account" : failed ? "Needs manual review" : `Expected by ${formatDate(refund.completesAt, { weekday: undefined })}`, meta: done ? when(refund.completedAt) : "5–7 business days", state: done ? "done" : failed ? "bad" : "now" },
    ] : []),
  ];

  return (
    <div className={`${styles.tracker} ${compact ? styles.compact : ""}`}>
      <div className={styles.total}>
        <span>Total refunded</span>
        <strong>{formatINR(refund.amount || 0)}</strong>
        <small>
          {refund.fee > 0 ? `Cancellation fee ${formatINR(refund.fee)}` : "No cancellation fee"}
          {refund.clawback > 0 ? ` · cashback reversed ${formatINR(refund.clawback)}` : ""}
          {refund.bonus > 0 ? ` · +${formatINR(refund.bonus)} instant bonus` : ""}
        </small>
      </div>
      <ol className={styles.steps}>
        {steps.map((s, i) => (
          <li key={i} data-state={s.state}>
            <span>{s.state === "done" ? <FiCheck size={13} /> : s.state === "bad" ? <FiAlertTriangle size={13} /> : <FiClock size={13} />}</span>
            <div><b>{s.label}</b>{s.meta && <small>{s.meta}</small>}</div>
          </li>
        ))}
      </ol>
      {refund.note && failed && <p className="field-error">{refund.note}</p>}
    </div>
  );
}
