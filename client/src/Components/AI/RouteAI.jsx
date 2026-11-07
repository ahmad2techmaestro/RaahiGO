import { useEffect, useState } from "react";
import axios from "axios";
import { HiSparkles } from "react-icons/hi";
import { API_BASE_URL } from "../../config/api";
import { getToken, authHeader } from "../../lib/session";
import { formatHour, formatINR } from "../../lib/format";
import styles from "../../Styles/ai.module.css";

const dur = (h) => (h == null ? "" : `${Math.floor(h)}h${Math.round((h % 1) * 60) ? ` ${Math.round((h % 1) * 60)}m` : ""}`);

/** "For you": ranks the buses on this route using the signed-in traveller's own booking history. Hidden for guests. */
export function ForYouStrip({ from, to, date, onPick }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!getToken() || !from || !to || !date) { setData(null); return undefined; }
    let live = true;
    axios.post(`${API_BASE_URL}/ai/personal-picks`, { from, to, date }, authHeader())
      .then((r) => { if (live) setData(r.data); })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [from, to, date]);

  if (!data?.picks?.length) return null;
  const { personalised, bookingsAnalysed } = data.basis || {};
  return (
    <section className={styles.forYou} aria-label="Picked for you">
      <h3><HiSparkles /> {personalised ? "Picked for you" : "Top picks"}</h3>
      <small>
        {personalised
          ? `Based on ${bookingsAnalysed} of your past booking${bookingsAnalysed === 1 ? "" : "s"} and saved preferences. These are suggestions, not guarantees.`
          : "Book a trip or two and these will adapt to your habits."}
      </small>
      {data.picks.slice(0, 3).map((p) => (
        <div className={styles.cardRow} key={p.id}>
          <div>
            <strong>{p.operator}{p.badge && <i className={styles.tag}>{p.badge}</i>}</strong>
            <span>{formatHour(p.departure)} → {formatHour(p.arrival)} · {dur(p.durationHours)} · {p.seatsAvailable} seats</span>
            {p.reasons?.length > 0 && <em>{p.reasons.join(", ")}</em>}
          </div>
          <div className={styles.cardEnd}>
            <b>{formatINR(p.price)}</b>
            <button onClick={() => onPick(p.id)}>Select</button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** When a route has no bus for the date: connections via another city and nearby dates, from real schedules. */
export function JourneyOptions({ from, to, date, onDate }) {
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    if (!from || !to || !date) return undefined;
    let live = true;
    axios.post(`${API_BASE_URL}/ai/journey`, { from, to, date })
      .then((r) => { if (live) setPlan(r.data); })
      .catch(() => { if (live) setPlan(null); });
    return () => { live = false; };
  }, [from, to, date]);

  if (!plan || (!plan.connections?.length && !plan.alternatives?.length)) return null;
  return (
    <div className={styles.journeyBox}>
      <small>{plan.summary}</small>
      {plan.connections.slice(0, 3).map((c, i) => (
        <div className={styles.cardRow} key={i}>
          <div>
            <strong>via {c.via}{c.tags?.map((t) => <i key={t} className={styles.tag}>{t}</i>)}</strong>
            {c.legs.map((l) => <span key={l.busId}>{l.from} → {l.to}: {l.operator}, {l.date} {formatHour(l.departure)}</span>)}
            <em>Layover {dur(c.layoverHours)} · total {dur(c.totalHours)}. Each leg is booked separately.</em>
          </div>
          <div className={styles.cardEnd}><b>{formatINR(c.totalPrice)}</b></div>
        </div>
      ))}
      {plan.alternatives.map((a) => (
        <div className={styles.cardRow} key={a.date}>
          <div><strong>{a.date}</strong><span>{a.buses} direct bus{a.buses > 1 ? "es" : ""} · from {formatINR(a.cheapest)}</span></div>
          <div className={styles.cardEnd}><button onClick={() => onDate(a.date)}>View</button></div>
        </div>
      ))}
    </div>
  );
}
