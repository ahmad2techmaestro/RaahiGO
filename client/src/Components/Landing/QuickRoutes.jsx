import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FiClock, FiHeart, FiTrash2, FiArrowRight } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { authHeader, getToken } from "../../lib/session";
import { searchPath, toISODate } from "../../lib/format";
import styles from "../../Styles/landing.module.css";

function RouteRow({ r, trailing }) {
  return (
    <div className={styles.qrRow}>
      <Link to={searchPath(r.from, r.to, toISODate())}>
        {r.from} <FiArrowRight size={14} /> {r.to}
      </Link>
      {trailing}
    </div>
  );
}

/** Personal shortcuts: saved + recent routes for signed-in users. */
export default function QuickRoutes() {
  const loggedIn = Boolean(getToken());
  const [recent, setRecent] = useState([]);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    if (!loggedIn) return;
    axios.get(`${API_BASE_URL}/search-history`, authHeader()).then(({ data }) => setRecent(data)).catch(() => {});
    axios.get(`${API_BASE_URL}/saved-routes`, authHeader()).then(({ data }) => setSaved(data)).catch(() => {});
  }, [loggedIn]);

  async function save(from, to) {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/saved-routes`, { from, to }, authHeader());
      setSaved((s) => [data, ...s]);
    } catch { /* already saved or transient — non-critical */ }
  }

  async function remove(id) {
    const prev = saved;
    setSaved((s) => s.filter((r) => r._id !== id)); // optimistic
    try {
      await axios.delete(`${API_BASE_URL}/saved-routes/${id}`, authHeader());
    } catch {
      setSaved(prev);
    }
  }

  if (!loggedIn || (recent.length === 0 && saved.length === 0)) return null;

  return (
    <section className={styles.quick}>
      <div className={`container ${styles.quickGrid}`}>
        {saved.length > 0 && (
          <div className="card card-pad">
            <h3><FiHeart /> Saved routes</h3>
            {saved.map((r) => (
              <RouteRow
                key={r._id}
                r={r}
                trailing={
                  <button onClick={() => remove(r._id)} aria-label={`Remove ${r.from} to ${r.to}`}>
                    <FiTrash2 size={15} />
                  </button>
                }
              />
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="card card-pad">
            <h3><FiClock /> Recently searched</h3>
            {recent.map((r) => (
              <RouteRow
                key={`${r.from}-${r.to}`}
                r={r}
                trailing={
                  !saved.some((s) => s.from === r.from && s.to === r.to) && (
                    <button className={styles.saveLink} onClick={() => save(r.from, r.to)}>Save</button>
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
