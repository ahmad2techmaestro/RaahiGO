import { useEffect, useState } from "react";
import axios from "axios";
import { HiSparkles } from "react-icons/hi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import { formatDate, toISODate } from "../../lib/format";
import styles from "../../Styles/dashboard.module.css";

const TREND = { up: "trending up", down: "trending down", flat: "steady" };

/** 7-day demand ESTIMATE per route, plus a read-only disruption preview. */
export default function OperatorForecast() {
  const [routes, setRoutes] = useState(null);
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState({ busId: "", date: toISODate(), type: "DELAYED", delayMinutes: 60 });
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    axios.get(`${API_BASE_URL}/operator/ai-forecast`, authHeader()).then((r) => live && setRoutes(r.data.routes)).catch(() => live && setRoutes([]));
    axios.get(`${API_BASE_URL}/operator/buses`, authHeader()).then((r) => { if (live) { setBuses(r.data); setForm((f) => ({ ...f, busId: r.data[0]?._id || "" })); } }).catch(() => {});
    return () => { live = false; };
  }, []);

  async function runPreview(e) {
    e.preventDefault();
    setErr(""); setPreview(null);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/operator/buses/${form.busId}/disruption-preview`, { date: form.date, type: form.type, delayMinutes: Number(form.delayMinutes) }, authHeader());
      setPreview(data);
    } catch (ex) { setErr(ex?.response?.data?.message || "Couldn't build the preview."); }
  }

  if (!routes || !buses.length) return null;
  return (
    <>
      <section className={styles.panel} aria-label="Demand forecast" style={{ marginBottom: "var(--s-5)" }}>
        <div className={styles.panelHead}>
          <h2><HiSparkles style={{ verticalAlign: "-2px" }} /> Demand forecast <small style={{ fontSize: 12, color: "var(--ink-3)" }}>estimate</small></h2>
        </div>
        {routes.map((r) => (
          <div key={`${r.from}-${r.to}`} style={{ marginBottom: 16 }}>
            <strong>{r.from} → {r.to}</strong>
            {!r.ok ? <p style={{ color: "var(--ink-2)" }}>{r.reason}</p> : (
              <>
                <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
                  Based on {r.historyDays} days of bookings, {TREND[r.trend]}. Back-test error {r.backtest.mae} seats/day{r.backtest.beatsNaive ? ", better than a simple same-day-last-week guess" : ", not better than a simple same-day-last-week guess, so treat it loosely"}.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: 8 }}>
                  {r.forecast.map((d) => (
                    <div key={d.date} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 10, textAlign: "center" }}>
                      <small>{formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</small>
                      <div style={{ fontWeight: 800 }}>~{d.seats} seats</div>
                      <small style={{ color: "var(--ink-3)" }}>{d.low}–{d.high} · {d.loadPercent}% load</small>
                    </div>
                  ))}
                </div>
                {r.tips.map((t) => <p key={t} style={{ margin: "8px 0 0", fontSize: "var(--fs-sm)" }}>💡 {t}</p>)}
              </>
            )}
          </div>
        ))}
      </section>

      <section className={styles.panel} aria-label="Disruption preview" style={{ marginBottom: "var(--s-5)" }}>
        <div className={styles.panelHead}><h2>Disruption preview</h2><small style={{ color: "var(--ink-3)" }}>Read-only. Sends and refunds nothing.</small></div>
        <form onSubmit={runPreview} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="select" value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} aria-label="Bus">
            {buses.map((b) => <option key={b._id} value={b._id}>{b.from} → {b.to} · {b.companyname}</option>)}
          </select>
          <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">
            <option value="DELAYED">Delayed</option><option value="CANCELLED">Cancelled</option>
          </select>
          {form.type === "DELAYED" && <input className="input" type="number" min="15" max="720" value={form.delayMinutes} onChange={(e) => setForm({ ...form, delayMinutes: e.target.value })} aria-label="Delay in minutes" style={{ width: 110 }} />}
          <button className="btn btn-primary" type="submit">Preview impact</button>
        </form>
        {err && <p role="alert" style={{ color: "var(--danger)" }}>{err}</p>}
        {preview && (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <p><strong>{preview.affected.bookings}</strong> booking(s), <strong>{preview.affected.passengers}</strong> passenger(s) affected on {preview.route}.</p>
            {preview.proposals.map((p) => <p key={p} style={{ margin: 0 }}>• {p}</p>)}
            {preview.alternatives.length > 0 && <small>Other buses with seats: {preview.alternatives.map((a) => `${a.operator} ₹${a.price}`).join(", ")}</small>}
            <small style={{ color: "var(--ink-3)" }}>Draft message: “{preview.drafts.message}”</small>
          </div>
        )}
      </section>
    </>
  );
}
