import { useState, useEffect } from "react";
import axios from "axios";
import { FiCopy, FiCheck, FiAward, FiGift, FiSliders, FiBell, FiCompass } from "react-icons/fi";
import { RiWallet3Line } from "react-icons/ri";
import WalletPanel from "../Components/Wallet/WalletPanel";
import Passport from "../Components/Wallet/Passport";
import { API_BASE_URL } from "../config/api";
import { authHeader } from "../lib/session";
import { success, error } from "../Utils/notification";
import PageHeader from "../ui/PageHeader";
import styles from "../Styles/profile.module.css";
import dash from "../Styles/dashboard.module.css";

const SEAT_TYPES = [["", "No preference"], ["SLEEPER", "Sleeper"], ["SEATER", "Seater"]];
const BUS_TYPES = [["", "No preference"], ["AC", "AC"], ["NONAC", "Non-AC"]];
const WINDOWS = [["", "No preference"], ["BEFORE_6", "Before 6 AM"], ["6_TO_12", "6 AM – 12 PM"], ["12_TO_18", "12 PM – 6 PM"], ["AFTER_18", "After 6 PM"]];

function Select({ label, value, options, onChange, id }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        {options.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    document.title = "Profile & rewards · RaahiGo";
    axios.get(`${API_BASE_URL}/profile`, authHeader()).then(({ data }) => setProfile(data)).catch(() => error("Couldn't load your profile"));
    axios.get(`${API_BASE_URL}/notifications`, authHeader()).then(({ data }) => setNotes(data)).catch(() => setNotes([]));
  }, []);

  useEffect(() => {
    if (profile && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [profile]);

  const pref = (key) => (value) => setProfile((p) => ({ ...p, preferences: { ...p.preferences, [key]: value } }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API_BASE_URL}/profile/preferences`, profile.preferences, authHeader());
      success("Preferences saved");
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't save preferences");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error("Couldn't copy — select the code and copy it manually");
    }
  }

  if (!profile) {
    return <div className="container" style={{ padding: "var(--s-8) 0", display: "grid", gap: 16 }}>{[200, 160, 320].map((h) => <div key={h} className="skel" style={{ height: h, borderRadius: 20 }} />)}</div>;
  }

  const { loyalty } = profile;
  const pct = loyalty.pointsToNextTier ? Math.min(100, (loyalty.points / (loyalty.points + loyalty.pointsToNextTier)) * 100) : 100;

  return (
    <div className={dash.page}>
      <PageHeader eyebrow="Your account" title="Profile & rewards" subtitle={profile.email} />
      <div className={`container ${styles.grid}`}>
        <section className={`${styles.loyalty}`}>
          <div className={styles.loyHead}>
            <span><FiAward size={18} /> Loyalty status</span>
            <b className={styles.tier}>{loyalty.tier}</b>
          </div>
          <div className={styles.points}><span>{loyalty.points}</span> points</div>
          <div className={styles.track} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
          <p>{loyalty.pointsToNextTier ? `${loyalty.pointsToNextTier} more points to your next tier` : "You've reached the top tier"}</p>
        </section>

        <section className={dash.panel}>
          <h3><FiGift style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--accent)" }} />Refer a friend</h3>
          <p className={dash.hint}>When a friend signs up with your code and completes a first booking, you earn 100 bonus points.</p>
          <div className={styles.code}>
            <code>{profile.referralCode}</code>
            <button className="btn btn-sm btn-outline" onClick={copy}>{copied ? <><FiCheck /> Copied</> : <><FiCopy /> Copy</>}</button>
          </div>
        </section>

        <section id="wallet" style={{ scrollMarginTop: 96 }} className={`${dash.panel} ${styles.wide}`}>
          <h3><RiWallet3Line style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--brand)" }} />Wallet &amp; cashback</h3>
          <p className={dash.hint} style={{ marginBottom: 20 }}>Cashback from every payment, instant refunds and your full statement.</p>
          <WalletPanel />
        </section>

        <section className={`${dash.panel} ${styles.wide}`}>
          <h3><FiCompass style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--accent-hover)" }} />Journey passport</h3>
          <p className={dash.hint} style={{ marginBottom: 20 }}>Your travel in numbers, calculated from your bookings.</p>
          <Passport />
        </section>

        <form className={`${dash.panel} ${styles.wide}`} onSubmit={save}>
          <h3><FiSliders style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--brand)" }} />Travel preferences</h3>
          <p className={dash.hint} style={{ marginBottom: 20 }}>Used to personalise AI recommendations when you don't state a preference yourself.</p>
          <div className={styles.prefs}>
            <Select id="p-seat" label="Seat type" value={profile.preferences.seatType} options={SEAT_TYPES} onChange={pref("seatType")} />
            <Select id="p-bus" label="Bus type" value={profile.preferences.busType} options={BUS_TYPES} onChange={pref("busType")} />
            <Select id="p-win" label="Preferred departure" value={profile.preferences.preferredDepartureWindow} options={WINDOWS} onChange={pref("preferredDepartureWindow")} />
            <div className="field">
              <label htmlFor="p-budget">Typical budget (₹)</label>
              <input id="p-budget" className="input" type="number" min="0" value={profile.preferences.budget ?? ""}
                onChange={(e) => pref("budget")(e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} disabled={saving}>{saving ? <span className="spinner" /> : "Save preferences"}</button>
        </form>

        {notes.length > 0 && (
          <section className={`${dash.panel} ${styles.wide}`}>
            <h3><FiBell style={{ verticalAlign: "-2px", marginRight: 8, color: "var(--brand)" }} />Notification history</h3>
            <p className={dash.hint} style={{ marginBottom: 16 }}>Every booking, cancellation, delay and reminder sent to you — including simulated entries when no email provider is configured.</p>
            <ul className={styles.notes}>
              {notes.slice(0, 10).map((n) => (
                <li key={n._id}>
                  <span>{n.subject}</span>
                  <span className={`badge ${n.status === "SENT" ? "badge-success" : n.status === "FAILED" ? "badge-danger" : ""}`}>{n.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
