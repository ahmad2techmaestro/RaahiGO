import { QRCodeSVG } from "qrcode.react";
import { Brand } from "../../ui/Icons";
import { formatDate, formatHour, formatINR, genderLabel, titleCase } from "../../lib/format";
import styles from "../../Styles/pass.module.css";

const STATUS = { CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed", PENDING: "Pending", PAYMENT_PENDING: "Payment pending", EXPIRED: "Expired" };

/** The full-page boarding pass: sized for A4, prints cleanly, and doubles as the on-screen ticket. */
export default function PassSheet({ order, verificationUrl }) {
  const { busDetails: b, ticketSummary: t, userDetails: u, pricing: p, coupon } = order;
  const seats = String(t.ticket || "").split(",").filter(Boolean);
  const id = String(order._id).slice(-8).toUpperCase();
  const cancelled = order.status === "CANCELLED";
  const ticketValue = Number(p?.ticketValue ?? t.amount) || 0;
  const discount = Number(p?.couponDiscount ?? coupon?.discount) || 0;

  return (
    <article id="rg-printable-ticket" className={`${styles.pass} ${cancelled ? styles.void : ""}`} aria-label="Boarding pass">
      {cancelled && <div className={styles.stamp} aria-hidden="true">Cancelled</div>}

      <header className={styles.band}>
        <Brand size={30} light />
        <div>
          <span>Boarding pass</span>
          <b className={`${styles.chip} ${cancelled ? styles.chipBad : ""}`}>{STATUS[order.status] || order.status}</b>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.city}>
          <small>From</small>
          <strong>{b.from}</strong>
          <time>{formatHour(b.departure)}</time>
        </div>
        <div className={styles.link} aria-hidden="true"><i /><span>🚌</span><i /></div>
        <div className={`${styles.city} ${styles.cityEnd}`}>
          <small>To</small>
          <strong>{b.to}</strong>
          <time>{formatHour(b.arrival)}</time>
        </div>
      </section>

      <section className={styles.body}>
        <dl className={styles.facts}>
          <div><dt>Passenger</dt><dd>{u.name}</dd></div>
          <div><dt>Journey date</dt><dd>{formatDate(t.date)}</dd></div>
          <div><dt>Seat{seats.length > 1 ? "s" : ""}</dt><dd className={styles.seats}>{seats.map((s) => <b key={s} className="mono">{s}</b>)}</dd></div>
          <div><dt>Operator</dt><dd>{titleCase(b.name)} Travels</dd></div>
          <div><dt>Age · Gender</dt><dd>{u.age} · {genderLabel(u.gender)}</dd></div>
          <div><dt>Contact</dt><dd className="mono">{u.phone}</dd></div>
        </dl>

        <aside className={styles.qrBox}>
          <div className={styles.qr}>{verificationUrl ? <QRCodeSVG value={verificationUrl} size={148} level="M" /> : null}</div>
          <strong className="mono">#{id}</strong>
          <small>Show this code to the conductor</small>
        </aside>
      </section>

      <div className={styles.perf} aria-hidden="true" />

      <section className={styles.lower}>
        <div>
          <h4>Payment</h4>
          <table className={styles.table}>
            <tbody>
              <tr><td>Fare</td><td>{formatINR(p?.fare ?? ticketValue + discount)}</td></tr>
              {discount > 0 && <tr className={styles.good}><td>Coupon {coupon?.code || ""}</td><td>−{formatINR(discount)}</td></tr>}
              {p?.walletUsed > 0 && <tr className={styles.good}><td>RaahiGo Wallet</td><td>−{formatINR(p.walletUsed)}</td></tr>}
              <tr className={styles.sum}><td>{p?.walletUsed > 0 ? "Paid by gateway" : "Total paid"}</td><td>{formatINR(p?.gatewayPaid ?? ticketValue)}</td></tr>
              {p?.cashback?.amount > 0 && !cancelled && <tr className={styles.good}><td>Cashback earned ({p.cashback.percent}%)</td><td>+{formatINR(p.cashback.amount)}</td></tr>}
            </tbody>
          </table>
          {order.paymentDetails?.razorpayPaymentId && <small className={`${styles.ref} mono`}>Ref {order.paymentDetails.razorpayPaymentId}</small>}
        </div>
        <div>
          <h4>Before you board</h4>
          <ul className={styles.notes}>
            <li>Reach the boarding point 15 minutes before departure.</li>
            <li>Carry a government photo ID matching the passenger name.</li>
            <li>Operator: {b.contactphone} · {b.contactemail}</li>
            <li>Free cancellation until 48 h before departure; partial refunds up to 2 h.</li>
          </ul>
        </div>
      </section>

      <footer className={styles.foot}>
        <span>RaahiGo · intercity bus tickets</span>
        <span className="mono">Booked {formatDate(order.createdAt, { weekday: undefined })}</span>
      </footer>
    </article>
  );
}
