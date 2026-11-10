import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import { formatINR } from "../../lib/format";
import styles from "../../Styles/dashboard.module.css";

/** Bookings with transparent risk signals. For human review: nothing is blocked automatically. */
export default function AdminRisk() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    axios.get(`${API_BASE_URL}/admin/ai-risk`, authHeader()).then((r) => live && setData(r.data)).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!data) return null;
  return (
    <section className={styles.panel} aria-label="Booking risk review">
      <div className={styles.panelHead}>
        <h2>Booking risk review</h2>
        <small style={{ color: "var(--ink-3)" }}>{data.reviewed} bookings in 30 days · for human review only</small>
      </div>
      {data.flagged.length === 0 ? <p style={{ color: "var(--ink-2)" }}>No bookings matched the risk rules.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Route</th><th>Amount</th><th>Level</th><th>Why</th></tr></thead>
            <tbody>
              {data.flagged.slice(0, 20).map((f) => (
                <tr key={f.orderId}>
                  <td>{f.route}</td><td>{formatINR(f.amount)}</td>
                  <td><span className={`badge ${f.level === "high" ? "badge-accent" : ""}`}>{f.level} · {f.score}</span></td>
                  <td>{f.reasons.map((r) => r.text).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <small style={{ color: "var(--ink-3)" }}>{data.note}</small>
    </section>
  );
}
