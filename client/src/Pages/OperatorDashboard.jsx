import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { FiPlus, FiUsers, FiPower } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { authHeader } from "../lib/session";
import { formatDate, formatHour, formatINR, titleCase } from "../lib/format";
import { success, error } from "../Utils/notification";
import PageHeader from "../ui/PageHeader";
import Modal from "../ui/Modal";
import EmptyState from "../ui/EmptyState";
import styles from "../Styles/dashboard.module.css";

const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Ahmedabad", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Patna", "Indore", "Thane", "Bhopal", "Goa"];

function ApplyForm({ onApplied }) {
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

  async function apply(e) {
    e.preventDefault();
    if (!companyName.trim()) return error("Enter a company name");
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/operator/apply`, { companyName }, authHeader());
      success("You're now an operator. Sign out and back in to refresh your access.");
      onApplied();
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't submit your application");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={`${styles.panel} ${styles.narrow}`} onSubmit={apply}>
      <span className="eyebrow">Partner programme</span>
      <h2 style={{ margin: "12px 0" }}>Run buses on RaahiGo</h2>
      <p className={styles.hint} style={{ marginBottom: 20 }}>
        Self-service for this demo — a production platform would verify your business before granting operator access.
      </p>
      <div className="field">
        <label htmlFor="company">Company name</label>
        <input id="company" className="input" placeholder="e.g. Sunrise Travels" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={loading}>
        {loading ? <span className="spinner" /> : "Apply as operator"}
      </button>
    </form>
  );
}

const blank = { companyname: "", from: "", to: "", price: "", departure: "", arrival: "" };

function NewBusForm({ onCreated }) {
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    if (!form.companyname || !form.from || !form.to || !form.price || form.departure === "" || form.arrival === "") return error("Please fill every field");
    if (form.from === form.to) return error("Origin and destination must differ");
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/operator/buses`, form, authHeader());
      success("Bus added to your fleet");
      setForm(blank);
      onCreated();
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't create the bus");
    } finally {
      setLoading(false);
    }
  }

  const cityOpts = CITIES.map((c) => <option key={c} value={c}>{c}</option>);
  return (
    <form className={styles.panel} onSubmit={create}>
      <div className={styles.panelHead}><h2>Add a bus</h2></div>
      <div className={styles.formGrid}>
        <div className="field"><label htmlFor="nb-co">Operator name</label><input id="nb-co" className="input" value={form.companyname} onChange={set("companyname")} /></div>
        <div className="field"><label htmlFor="nb-from">From</label><select id="nb-from" className="select" value={form.from} onChange={set("from")}><option value="">Choose city</option>{cityOpts}</select></div>
        <div className="field"><label htmlFor="nb-to">To</label><select id="nb-to" className="select" value={form.to} onChange={set("to")}><option value="">Choose city</option>{cityOpts}</select></div>
        <div className="field"><label htmlFor="nb-price">Fare (₹)</label><input id="nb-price" className="input" type="number" min="1" value={form.price} onChange={set("price")} /></div>
        <div className="field"><label htmlFor="nb-dep">Departure hour (0–23)</label><input id="nb-dep" className="input" type="number" min="0" max="23" value={form.departure} onChange={set("departure")} /></div>
        <div className="field"><label htmlFor="nb-arr">Arrival hour (0–23)</label><input id="nb-arr" className="input" type="number" min="0" max="23" value={form.arrival} onChange={set("arrival")} /></div>
      </div>
      <button className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner" /> : <><FiPlus /> Create bus</>}</button>
    </form>
  );
}

function BookingsModal({ busId, onClose }) {
  const [bookings, setBookings] = useState(null);
  useEffect(() => {
    if (!busId) return;
    setBookings(null);
    axios.get(`${API_BASE_URL}/operator/buses/${busId}/bookings`, authHeader()).then(({ data }) => setBookings(data)).catch(() => setBookings([]));
  }, [busId]);

  return (
    <Modal open={Boolean(busId)} onClose={onClose} title="Passenger manifest" width={720}>
      {!bookings && <div className="skel" style={{ height: 120 }} />}
      {bookings?.length === 0 && <p className={styles.hint}>No bookings yet for this bus.</p>}
      {bookings?.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Passenger</th><th>Date</th><th>Seats</th><th>Status</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id}>
                  <td>{b.userDetails?.name}</td>
                  <td>{formatDate(b.ticketSummary?.date)}</td>
                  <td className="mono">{b.ticketSummary?.ticket}</td>
                  <td><span className={`badge ${b.status === "CONFIRMED" ? "badge-success" : b.status === "CANCELLED" ? "badge-danger" : ""}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function OperatorDashboard() {
  const [role, setRole] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [buses, setBuses] = useState([]);
  const [bookingsBusId, setBookingsBusId] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((k) => k + 1), []);

  useEffect(() => {
    document.title = "Partner dashboard · RaahiGo";
    axios.get(`${API_BASE_URL}/profile`, authHeader()).then(({ data }) => setRole(data.role)).catch(() => setRole("PASSENGER"));
  }, []);

  useEffect(() => {
    if (role !== "OPERATOR" && role !== "ADMIN") return;
    axios.get(`${API_BASE_URL}/operator/dashboard`, authHeader()).then(({ data }) => setDashboard(data)).catch(() => {});
    axios.get(`${API_BASE_URL}/operator/buses`, authHeader()).then(({ data }) => setBuses(data)).catch(() => {});
  }, [role, tick]);

  async function toggleStatus(bus) {
    const next = bus.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBuses((bs) => bs.map((b) => (b._id === bus._id ? { ...b, status: next } : b))); // optimistic
    try {
      await axios.put(`${API_BASE_URL}/operator/buses/${bus._id}/status`, { status: next }, authHeader());
      success(`Bus ${next === "ACTIVE" ? "activated" : "deactivated"}`);
    } catch (err) {
      setBuses((bs) => bs.map((b) => (b._id === bus._id ? bus : b)));
      error(err?.response?.data?.message || "Couldn't update status");
    }
  }

  if (role === null) return <div className="container" style={{ padding: "var(--s-8) 0" }}><div className="skel" style={{ height: 240, borderRadius: 20 }} /></div>;
  if (role !== "OPERATOR" && role !== "ADMIN") return <div className="container"><ApplyForm onApplied={() => setRole("OPERATOR")} /></div>;

  const o = dashboard?.overall;
  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Partner dashboard" title="Your fleet at a glance" subtitle="Revenue, bookings and every route you operate." />
      <div className="container">
        {o && (
          <div className={styles.stats}>
            <div className={styles.stat}><span className={styles.statLabel}>Revenue</span><span className={styles.statValue}>{formatINR(o.totalRevenue)}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Confirmed bookings</span><span className={styles.statValue}>{o.confirmedBookings}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Seats sold</span><span className={styles.statValue}>{o.totalSeatsSold}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Cancellations</span><span className={styles.statValue}>{o.cancelledBookings}</span></div>
          </div>
        )}

        <div className={styles.stack}>
          <NewBusForm onCreated={refresh} />
          <section className={styles.panel}>
            <div className={styles.panelHead}><h2>Your buses</h2><span className="badge">{buses.length} total</span></div>
            {buses.length === 0 ? (
              <EmptyState title="No buses yet">Add your first bus above and it appears in search instantly.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Operator</th><th>Route</th><th>Timing</th><th>Fare</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {buses.map((bus) => (
                      <tr key={bus._id}>
                        <td><b>{titleCase(bus.companyname)}</b></td>
                        <td>{bus.from} → {bus.to}</td>
                        <td className="mono">{formatHour(bus.departure)} – {formatHour(bus.arrival)}</td>
                        <td className="mono">{formatINR(bus.price)}</td>
                        <td><span className={`badge badge-dot ${bus.status === "ACTIVE" ? "badge-success" : ""}`}>{bus.status}</span></td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className={styles.linkBtn} onClick={() => setBookingsBusId(bus._id)}><FiUsers size={13} /> Bookings</button>
                          <button className={styles.linkBtn} onClick={() => toggleStatus(bus)}><FiPower size={13} /> {bus.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      <BookingsModal busId={bookingsBusId} onClose={() => setBookingsBusId(null)} />
    </div>
  );
}
