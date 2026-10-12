import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { FiCheck, FiPrinter, FiCalendar, FiArrowRight, FiGift, FiAlertTriangle, FiShield, FiRadio, FiLock, FiZap } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { authHeader } from "../lib/session";
import { downloadICS } from "../lib/calendar";
import { formatINR } from "../lib/format";
import Ticket from "../Components/Ticket/Ticket";
import EmptyState from "../ui/EmptyState";
import styles from "../Styles/success.module.css";

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100, delay: (i % 7) * 0.08, rot: (i * 53) % 360, color: ["#f2a93b", "#0d4a42", "#4fd1a0", "#e0eeea"][i % 4],
}));

export default function BookingSuccess() {
  const { orderId } = useParams();
  const { state } = useLocation();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = "Booking confirmed · RaahiGo";
    axios.get(`${API_BASE_URL}/order/${orderId}/ticket`, authHeader()).then(({ data: d }) => setData(d)).catch(() => setFailed(true));
  }, [orderId]);

  if (failed) {
    return <div className="container" style={{ padding: "64px 0" }}><EmptyState icon={<FiAlertTriangle size={24} />} title="We couldn't open this booking" action={<Link to="/myticket" className="btn btn-primary">Go to my trips</Link>}>Your booking is safe — find it in My trips.</EmptyState></div>;
  }

  const cashback = state?.cashback?.amount > 0 ? state.cashback : data?.order?.pricing?.cashback?.amount > 0 ? data.order.pricing.cashback : null;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.confetti} aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <motion.i key={i} style={{ left: `${c.left}%`, background: c.color }}
            initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: 420, opacity: 0, rotate: c.rot + 240 }}
            transition={{ duration: 2.2, delay: c.delay, ease: "easeIn" }} />
        ))}
      </div>

      <motion.div className={styles.head} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <motion.span className={styles.tick} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.1 }}><FiCheck size={30} /></motion.span>
        <span className="eyebrow">Payment successful</span>
        <h1>You're all set. Happy journey!</h1>
        <p className="muted">A confirmation is on its way to your email. Show the QR code below when you board.</p>
      </motion.div>

      {cashback && (
        <motion.div className={styles.cashback} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
          <FiGift size={22} />
          <div><strong>{formatINR(cashback.amount)} cashback added to your wallet</strong><small>{cashback.percent}% back on your payment — use it on your next trip.</small></div>
          <Link to="/profile#wallet" className="btn btn-sm btn-outline">View wallet</Link>
        </motion.div>
      )}

      {data && (
        <section className={styles.proof} aria-label="How your booking was protected">
          <h2>How your booking was protected</h2>
          <ul>
            <li><FiLock size={18} /><span><b>Seats locked atomically</b>Your seats were held with a Redis lock, so nobody else could pay for them.</span></li>
            <li><FiShield size={18} /><span><b>Payment verified on our server</b>The price was computed server-side and the payment signature checked before this ticket was written.</span></li>
            <li><FiZap size={18} /><span><b>Seat map updated live</b>Everyone viewing this bus saw your seats turn unavailable instantly.</span></li>
            <li><FiGift size={18} /><span><b>+{Math.floor((data.order?.pricing?.ticketValue || 0) / 100)} loyalty points earned</b>Points add up to higher tiers and bigger cashback — see them on your profile.</span></li>
            <li><FiRadio size={18} /><span><b>Live tracking is ready</b>Open My trips → Track bus to follow this journey with ETA and delay status.</span></li>
          </ul>
        </section>
      )}

      {data ? <Ticket order={data.order} verificationUrl={data.verificationUrl} /> : <div className="skel" style={{ height: 260, borderRadius: 20 }} />}

      {data && (
        <div className={styles.actions}>
          <Link to={`/pass/${orderId}`} className="btn btn-primary"><FiPrinter /> Printable boarding pass</Link>
          <button className="btn btn-outline" onClick={() => downloadICS(data.order)}><FiCalendar /> Add to calendar</button>
          <Link to="/myticket" className="btn btn-outline">My trips <FiArrowRight /></Link>
        </div>
      )}
    </div>
  );
}
