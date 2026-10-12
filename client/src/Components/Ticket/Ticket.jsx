import { QRCodeSVG } from "qrcode.react";
import { formatDate, formatHour, formatINR, genderLabel, titleCase } from "../../lib/format";
import { Brand } from "../../ui/Icons";
import styles from "../../Styles/ticket.module.css";

const STATUS = {
  CONFIRMED: ["Confirmed", "ok"], CANCELLED: ["Cancelled", "bad"], PENDING: ["Pending", "warn"],
  PAYMENT_PENDING: ["Payment pending", "warn"], EXPIRED: ["Expired", "mute"], COMPLETED: ["Completed", "mute"],
};

export default function Ticket({ order, verificationUrl }) {
  if (!order) return null;
  const { busDetails: b, ticketSummary: t, userDetails: u, paymentDetails: p, coupon } = order;
  const [statusText, tone] = STATUS[order.status] || [order.status, "mute"];
  const seats = String(t?.ticket || "").split(",").filter(Boolean);

  return (
    <article className={styles.ticket} id="rg-printable-ticket" aria-label="Boarding pass">
      <div className={styles.main}>
        <header className={styles.top}>
          <Brand size={28} light />
          <span className={`${styles.status} ${styles[tone]}`}>{statusText}</span>
        </header>

        <div className={styles.route}>
          <div><span className={styles.code}>{(b?.from || "").slice(0, 3).toUpperCase()}</span><time>{formatHour(b?.departure)}</time><small>{b?.from}</small></div>
          <div className={styles.flight} aria-hidden="true"><i /><span>🚌</span><i /></div>
          <div style={{ textAlign: "right" }}><span className={styles.code}>{(b?.to || "").slice(0, 3).toUpperCase()}</span><time>{formatHour(b?.arrival)}</time><small>{b?.to}</small></div>
        </div>

        <dl className={styles.grid}>
          <div><dt>Passenger</dt><dd>{u?.name}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(t?.date)}</dd></div>
          <div><dt>Seat{seats.length > 1 ? "s" : ""}</dt><dd className="mono">{seats.join(", ")}</dd></div>
          <div><dt>Operator</dt><dd>{titleCase(b?.name)}</dd></div>
          <div><dt>Age / Gender</dt><dd>{u?.age} · {genderLabel(u?.gender)}</dd></div>
          <div><dt>Paid</dt><dd className="mono">{formatINR(t?.amount)}{coupon?.code && <em> · {coupon.code}</em>}</dd></div>
        </dl>
      </div>

      <div className={styles.cut} aria-hidden="true" />

      <aside className={styles.stub}>
        <div className={styles.qr}>
          {verificationUrl ? <QRCodeSVG value={verificationUrl} size={116} level="M" /> : <div className={styles.qrPh} />}
        </div>
        <strong className="mono">#{String(order._id).slice(-8).toUpperCase()}</strong>
        <small>Scan to verify</small>
        {p?.razorpayPaymentId && <small className={styles.ref}>Ref {p.razorpayPaymentId.slice(-10)}</small>}
      </aside>
    </article>
  );
}
