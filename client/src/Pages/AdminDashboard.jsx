import { useState, useEffect } from "react";
import axios from "axios";
import { FiLock } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { authHeader } from "../lib/session";
import { formatDate, formatINR } from "../lib/format";
import { success, error } from "../Utils/notification";
import PageHeader from "../ui/PageHeader";
import EmptyState from "../ui/EmptyState";
import styles from "../Styles/dashboard.module.css";

const Dot = ({ ok }) => <i className={`${styles.dot} ${ok ? styles.dotOk : ""}`} />;

export default function AdminDashboard() {
  const [allowed, setAllowed] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    document.title = "Admin console · RaahiGo";
    axios.get(`${API_BASE_URL}/profile`, authHeader()).then(({ data }) => setAllowed(data.role === "ADMIN")).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const get = (path, set) => axios.get(`${API_BASE_URL}/admin/${path}`, authHeader()).then(({ data }) => set(data)).catch(() => {});
    get("overview", setOverview);
    get("users", (d) => setUsers(d.users));
    get("popular-routes", setRoutes);
    get("health", setHealth);
  }, [allowed]);

  async function changeRole(userId, role) {
    const prev = users;
    setUsers((u) => u.map((x) => (x._id === userId ? { ...x, role } : x)));
    try {
      await axios.put(`${API_BASE_URL}/admin/users/${userId}/role`, { role }, authHeader());
      success(`Role updated to ${role.toLowerCase()}`);
    } catch (err) {
      setUsers(prev);
      error(err?.response?.data?.message || "Couldn't update role");
    }
  }

  if (allowed === null) return <div className="container" style={{ padding: "var(--s-8) 0" }}><div className="skel" style={{ height: 240, borderRadius: 20 }} /></div>;
  if (!allowed) {
    return (
      <div className="container">
        <div className={styles.narrow}>
          <EmptyState icon={<FiLock size={24} />} title="Administrators only">This area is restricted to platform administrators.</EmptyState>
        </div>
      </div>
    );
  }

  const maxRoute = Math.max(1, ...routes.map((r) => r.bookings));
  const stat = (label, value) => <div className={styles.stat} key={label}><span className={styles.statLabel}>{label}</span><span className={styles.statValue}>{value}</span></div>;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Admin console" title="Platform overview" subtitle="Users, revenue, popular corridors and system health." />
      <div className="container">
        {overview && (
          <div className={styles.stats}>
            {stat("Users", overview.totalUsers)}
            {stat("Operators", overview.totalOperators)}
            {stat("Active buses", `${overview.activeBuses}/${overview.totalBuses}`)}
            {stat("Revenue", formatINR(overview.totalRevenue))}
            {stat("Bookings", overview.confirmedBookings)}
            {stat("Cancel rate", `${overview.cancellationRatePercent}%`)}
          </div>
        )}

        <div className={styles.stack}>
          {health && (
            <section className={styles.panel}>
              <h2>System health</h2>
              <div className={styles.health}>
                <span><Dot ok={health.database.connected} /> Database · {health.database.state}</span>
                <span><Dot ok={health.redis.configured} /> Redis · {health.redis.configured ? "configured" : "not configured"}</span>
                <span><Dot ok={health.ai.configured} /> AI · {health.ai.configured ? "configured" : "not configured"}</span>
                <span><Dot ok={health.email.configured} /> Email · {health.email.configured ? "configured" : "not configured"}</span>
                <span><Dot ok={health.realtime.active} /> Realtime · {health.realtime.connectedClients} connected</span>
                <span>Uptime {Math.round(health.uptimeSeconds / 60)} min</span>
                <span>Memory {health.memory.usedMB} MB</span>
              </div>
            </section>
          )}

          {routes.length > 0 && (
            <section className={styles.panel}>
              <h2>Popular routes</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Route</th><th style={{ width: "40%" }}>Share</th><th>Bookings</th></tr></thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.route}>
                        <td><b>{r.route}</b></td>
                        <td><div className={styles.bar}><i style={{ width: `${(r.bookings / maxRoute) * 100}%` }} /></div></td>
                        <td className="mono">{r.bookings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <h2>Users</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.email}</td>
                      <td><span className={`badge ${u.role === "ADMIN" ? "badge-accent" : u.role === "OPERATOR" ? "badge-brand" : ""}`}>{u.role}</span></td>
                      <td>{formatDate(u.createdAt, { weekday: undefined })}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {u.role !== "OPERATOR" && <button className={styles.linkBtn} onClick={() => changeRole(u._id, "OPERATOR")}>Make operator</button>}
                        {u.role !== "PASSENGER" && <button className={styles.linkBtn} onClick={() => changeRole(u._id, "PASSENGER")}>Make passenger</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
