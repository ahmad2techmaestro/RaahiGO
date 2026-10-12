import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { HiSparkles } from "react-icons/hi";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { searchPath } from "../../lib/format";
import styles from "../../Styles/ai.module.css";

const EXAMPLES = [
  "Sleeper bus from Mumbai to Delhi tomorrow under ₹1500, after 8pm",
  "AC bus Bengaluru to Chennai this weekend, arriving in the morning",
  "Cheapest bus from Pune to Goa",
];

const WINDOW_LABEL = { BEFORE_6: "before 6 AM", "6_TO_12": "6 AM–12 PM", "12_TO_18": "12–6 PM", AFTER_18: "after 6 PM" };
const TYPE_LABEL = { AC: "AC", NONAC: "Non-AC", SLEEPER: "Sleeper", SEATER: "Seater" };

/** What the planner understood, as readable chips — so the traveller can see exactly what will be searched. */
function chipsFor(i) {
  const chips = [`${i.from} → ${i.to}`, i.date];
  (i.busType || []).forEach((t) => chips.push(TYPE_LABEL[t] || t));
  (i.seatType || []).forEach((t) => chips.push(TYPE_LABEL[t] || t));
  if (i.maxPrice) chips.push(`under ₹${i.maxPrice}`);
  if (i.minRating) chips.push(`${i.minRating}★+`);
  if ((i.departureWindows || []).length) chips.push(`leaves ${i.departureWindows.map((w) => WINDOW_LABEL[w] || w).join(", ")}`);
  if ((i.arrivalWindows || []).length) chips.push(`arrives ${i.arrivalWindows.map((w) => WINDOW_LABEL[w] || w).join(", ")}`);
  if (i.sortBy && i.sortBy !== "departure") chips.push(`sorted by ${i.sortBy}`);
  return chips;
}

/**
 * Natural-language search. It only ever produces search parameters — the results come from the same
 * validated search as the manual form. Works with or without an LLM key (the server falls back to its
 * built-in smart parser), and says which engine answered.
 */
export default function AISearchBox({ compact = false }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [understood, setUnderstood] = useState(null);
  const [clarification, setClarification] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setClarification(null);
    setUnderstood(null);
    setErrorMsg("");
    try {
      const { data } = await axios.post(`${API_BASE_URL}/ai/search`, { query });
      if (data.needsClarification) {
        setClarification(data.message);
        return;
      }
      const i = data.interpretation;
      setUnderstood({ chips: chipsFor(i), engine: data.engine });
      timer.current = setTimeout(() => navigate(searchPath(i.from, i.to, i.date, i)), 900);
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || "Couldn't understand that one — try rephrasing it.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${styles.search} ${compact ? styles.compact : ""}`}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <HiSparkles size={20} className={styles.spark} aria-hidden="true" />
        <label htmlFor={compact ? "ai-q-demo" : "ai-q"} className="sr-only">Describe your trip in plain English</label>
        <input
          id={compact ? "ai-q-demo" : "ai-q"}
          type="text"
          placeholder="Or just describe it — “sleeper Mumbai to Delhi tomorrow under ₹1500”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? <span className="spinner" /> : <>Plan it <FiArrowRight size={16} /></>}
        </button>
      </form>

      {!query && !understood && (
        <div className={styles.examples}>
          {(compact ? EXAMPLES.slice(0, 2) : EXAMPLES).map((ex) => (
            <button key={ex} type="button" onClick={() => setQuery(ex)}>{ex}</button>
          ))}
        </div>
      )}
      {understood && (
        <div className={styles.understood} role="status">
          <span className={styles.understoodHead}><FiCheck size={14} /> Understood{understood.engine === "llm" ? " (AI)" : ""} — opening results…</span>
          <span className={styles.chips}>{understood.chips.map((c) => <i key={c}>{c}</i>)}</span>
        </div>
      )}
      {clarification && <div className={styles.clarify} role="status">{clarification}</div>}
      {errorMsg && <div className={styles.error} role="alert">{errorMsg}</div>}
    </div>
  );
}
