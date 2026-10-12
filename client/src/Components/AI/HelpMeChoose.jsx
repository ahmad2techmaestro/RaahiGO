import { useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { HiSparkles } from "react-icons/hi";
import { API_BASE_URL } from "../../config/api";
import styles from "../../Styles/ai.module.css";

export default function HelpMeChoose({ from, to, date, onBook, aiAvailable }) {
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  if (!aiAvailable) return null;

  async function handleAsk(e) {
    e?.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/ai/recommend`, { from, to, date, preferenceText: preference });
      setResult(data);
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || "Couldn't get a recommendation right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.help}>
      <button className={styles.helpToggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <HiSparkles size={17} /> Not sure? Let AI shortlist the best buses
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div className={styles.helpPanel}>
              <form className={styles.helpForm} onSubmit={handleAsk}>
                <input
                  type="text"
                  className="input"
                  aria-label="Your preferences"
                  placeholder="e.g. window seat, comfort over price, leaving after dinner"
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <span className="spinner" /> : "Recommend"}
                </button>
              </form>

              {errorMsg && <div className={styles.error} role="alert">{errorMsg}</div>}

              {result && (
                <div className={styles.picks}>
                  {result.summary && <p className={styles.summary}>{result.summary}</p>}
                  {result.picks.map((p, i) => (
                    <div key={p.id} className={styles.pick}>
                      <span className={styles.rank}>{i + 1}</span>
                      <div>
                        <strong>{p.bus?.companyname || "Bus"}</strong>
                        <p>{p.reason}</p>
                      </div>
                      {p.bus && <button className="btn btn-sm btn-outline" onClick={() => onBook(p.bus)}>View seats</button>}
                    </div>
                  ))}
                  {result.picks.length === 0 && <p className="muted">No standout pick for these results.</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
