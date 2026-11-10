import { useEffect, useState } from "react";
import axios from "axios";
import { HiSparkles } from "react-icons/hi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import styles from "../../Styles/dashboard.module.css";

const TONE = { warning: "var(--danger)", good: "#1f9d6b", info: "var(--brand)" };

/** Rule-based observations from the operator's real orders. Suggestions only: nothing is changed automatically. */
export default function OperatorInsights({ refreshKey }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    axios.get(`${API_BASE_URL}/operator/ai-insights`, authHeader())
      .then((r) => { if (live) { setData(r.data); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey]);

  if (failed || !data) return null;
  return (
    <section className={styles.panel} aria-label="AI insights" style={{ marginBottom: "var(--s-5)" }}>
      <div className={styles.panelHead}>
        <h2><HiSparkles style={{ verticalAlign: "-2px" }} /> AI insights</h2>
        <small style={{ color: "var(--ink-3)" }}>From {data.sample.orders} real bookings · suggestions, not forecasts</small>
      </div>
      {data.note && <p style={{ color: "var(--ink-2)" }}>{data.note}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {data.insights.map((i) => (
          <div key={i.id} style={{ padding: 12, border: "1px solid var(--line)", borderLeft: `4px solid ${TONE[i.severity] || TONE.info}`, borderRadius: 10 }}>
            <strong>{i.title}</strong>
            <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: "var(--fs-sm)" }}>{i.detail}</p>
            <small style={{ color: "var(--ink-3)" }}>Confidence: {i.confidence}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
