import { motion } from "framer-motion";
import { FiStar, FiWifi, FiZap, FiWind, FiArrowRight } from "react-icons/fi";
import { formatHour, formatINR, titleCase } from "../../lib/format";
import styles from "../../Styles/search.module.css";

const AMENITY = {
  AC: { label: "AC", icon: FiWind },
  NONAC: { label: "Non-AC" },
  SLEEPER: { label: "Sleeper" },
  SEATER: { label: "Seater" },
  WIFI: { label: "Wi-Fi", icon: FiWifi },
  CHARGING_POINT: { label: "Charging", icon: FiZap },
};

export default function BusCard({ bus, index, onBook, picks = [] }) {
  const seatsLeft = bus.seatsAvailable ?? null;
  const low = seatsLeft !== null && seatsLeft > 0 && seatsLeft <= 5;
  const soldOut = seatsLeft === 0;
  const rating = Number(bus.rating);

  return (
    <motion.article
      className={`${styles.card} ${soldOut ? styles.soldOut : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <div className={styles.cardMain}>
        {picks.length > 0 && (
          <div className={styles.picks}>{picks.map((p) => <span key={p} data-pick={p}>{p}</span>)}</div>
        )}
        <header className={styles.cardHead}>
          <h3>{titleCase(bus.companyname)}</h3>
          {!Number.isNaN(rating) && (
            <span className={styles.rating} title="Average rating">
              <FiStar size={13} fill="currentColor" /> {rating.toFixed(1)}
            </span>
          )}
        </header>

        <div className={styles.journey}>
          <div className={styles.stop}>
            <time>{formatHour(bus.departure)}</time>
            <span>{bus.from}</span>
          </div>
          <div className={styles.span} aria-label={bus.durationHours != null ? `${bus.durationHours} hours` : undefined}>
            <span className={styles.dur}>{bus.durationHours != null ? `${bus.durationHours}h` : ""}</span>
            <div className={styles.line}><i /><i /></div>
          </div>
          <div className={`${styles.stop} ${styles.stopEnd}`}>
            <time>{formatHour(bus.arrival)}</time>
            <span>{bus.to}</span>
          </div>
        </div>

        <ul className={styles.tags}>
          {(bus.aminites || []).map((a) => {
            const meta = AMENITY[a] || { label: a };
            const Icon = meta.icon;
            return (
              <li key={a}>{Icon && <Icon size={12} />}{meta.label}</li>
            );
          })}
        </ul>
      </div>

      <aside className={styles.cardSide}>
        <div className={styles.price}><small>from</small>{formatINR(bus.price)}</div>
        {seatsLeft !== null && (
          <span className={`${styles.seats} ${low ? styles.low : ""} ${soldOut ? styles.sold : ""}`}>
            {soldOut ? "Sold out" : low ? `Only ${seatsLeft} left` : `${seatsLeft} seats left`}
          </span>
        )}
        <button className="btn btn-primary" onClick={() => onBook(bus)} disabled={soldOut}>
          {soldOut ? "Unavailable" : <>Select seats <FiArrowRight size={16} /></>}
        </button>
      </aside>
    </motion.article>
  );
}
