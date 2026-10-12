import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiArrowRight, FiCalendar, FiRepeat, FiNavigation } from "react-icons/fi";
import CityField from "./CityField";
import AISearchBox from "../AI/AISearchBox";
import RouteArt from "./RouteArt";
import { loadCities, matchCity } from "../../lib/cities";
import { addDays, searchPath, toISODate } from "../../lib/format";
import { error } from "../../Utils/notification";
import styles from "../../Styles/landing.module.css";

export default function Hero() {
  const navigate = useNavigate();
  const today = toISODate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const toRef = useRef(null);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  async function submit(e) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return error("Choose where you're leaving from and heading to");
    if (!date) return error("Pick a travel date");
    if (date < today) return error("Travel date can't be in the past");
    setBusy(true);
    const list = await loadCities();
    const a = matchCity(list, from);
    const b = matchCity(list, to);
    setBusy(false);
    if (!a) return error(`We don't serve "${from}" yet — pick a city from the list`);
    if (!b) return error(`We don't serve "${to}" yet — pick a city from the list`);
    if (a.name === b.name) return error("Origin and destination can't be the same city");
    navigate(searchPath(a.name, b.name, date));
  }

  const chips = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "In 3 days", value: addDays(today, 3) },
  ];

  return (
    <section className={styles.hero}>
      <RouteArt />
      <div className={`container ${styles.heroInner}`}>
        <motion.div
          className={styles.heroCopy}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles.kicker}><FiNavigation size={13} /> Intercity travel across 18+ cities</span>
          <h1>
            Every road has a <em>calmer</em> way to travel.
          </h1>
          <p>
            Compare buses, choose your exact seat on a live map, and track your journey in real time — all in
            under two minutes.
          </p>
        </motion.div>

        <motion.form
          className={styles.searchCard}
          onSubmit={submit}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Search buses"
        >
          <div className={styles.searchGrid}>
            <CityField label="From" value={from} onChange={setFrom} placeholder="Leaving from" />
            <button type="button" className={styles.swap} onClick={swap} aria-label="Swap origin and destination">
              <FiRepeat size={17} />
            </button>
            <CityField label="To" value={to} onChange={setTo} placeholder="Going to" inputRef={toRef} />
            <div className={styles.cityField}>
              <label htmlFor="travel-date" className={styles.fieldLabel}>Date</label>
              <div className={styles.fieldBox}>
                <span className={styles.fieldIcon}><FiCalendar size={18} /></span>
                <input id="travel-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <button type="submit" className={`btn btn-accent btn-lg ${styles.go}`} disabled={busy}>
              {busy ? <span className="spinner" /> : <>Search buses <FiArrowRight size={18} /></>}
            </button>
          </div>
          <div className={styles.chips}>
            <span>Quick pick</span>
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                className={date === c.value ? styles.chipOn : ""}
                onClick={() => setDate(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </motion.form>

        <AISearchBox />
      </div>
    </section>
  );
}
