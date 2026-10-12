import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { FiArrowRight, FiRadio, FiXCircle, FiCalendar, FiUsers, FiPrinter } from "react-icons/fi";
import { RiTicketLine } from "react-icons/ri";
import { API_BASE_URL } from "../config/api";
import { authHeader, clearSession } from "../lib/session";
import { logoutAPI } from "../Redux/authentication/auth.action";
import { formatDate, formatHour, formatINR, titleCase } from "../lib/format";
import { error } from "../Utils/notification";
import PageHeader from "../ui/PageHeader";
import Tabs from "../ui/Tabs";
import EmptyState from "../ui/EmptyState";
import TicketModal from "../Components/Ticket/TicketModal";
import CancelModal from "../Components/Refund/CancelModal";
import RefundTracker from "../Components/Refund/RefundTracker";
import styles from "../Styles/myticket.module.css";

const TrackingModal = lazy(() => import("../Components/Tracking/TrackingModal")); // Leaflet is heavy — only fetched when "Track bus" is used

function TripCard({ order, kind, onView, onTrack, onCancel }) {
  const { busDetails: b, ticketSummary: t } = order;
  const seats = String(t.ticket || "").split(",").filter(Boolean);
  const cancelled = kind === "cancelled";

  return (
    <motion.article
      className={`${styles.trip} ${kind === "past" || cancelled ? styles.past : ""}`}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.tripMain}>
        <header>
          <span className={`badge ${kind === "today" ? "badge-success badge-dot" : kind === "upcoming" ? "badge-brand" : cancelled ? "badge-danger" : ""}`}>
            {kind === "today" ? "Travelling today" : kind === "upcoming" ? "Upcoming" : cancelled ? "Cancelled" : "Completed"}
          </span>
          <span className={styles.operator}>{titleCase(b.name)} Travels</span>
        </header>

        <div className={styles.route}>
          <div><time>{formatHour(b.departure)}</time><span>{b.from}</span></div>
          <div className={styles.rail}><i /><FiArrowRight size={15} /><i /></div>
          <div style={{ textAlign: "right" }}><time>{formatHour(b.arrival)}</time><span>{b.to}</span></div>
        </div>

        <ul className={styles.meta}>
          <li><FiCalendar size={14} /> {formatDate(t.date)}</li>
          <li><FiUsers size={14} /> Seat{seats.length > 1 ? "s" : ""} <b className="mono">{seats.join(", ")}</b></li>
          <li className="mono"><b>{formatINR(t.amount)}</b></li>
          {order.pricing?.cashback?.amount > 0 && !cancelled && <li className={styles.cb}>+{formatINR(order.pricing.cashback.amount)} cashback</li>}
        </ul>
        {cancelled && <RefundTracker order={order} compact />}
      </div>

      <div className={styles.actions}>
        <button className="btn btn-primary btn-sm" onClick={() => onView(order._id)}><RiTicketLine size={15} /> View ticket</button>
        <Link to={`/pass/${order._id}`} className="btn btn-outline btn-sm"><FiPrinter size={15} /> Boarding pass</Link>
        {(kind === "today" || kind === "upcoming") && <button className="btn btn-accent btn-sm" onClick={() => onTrack(order._id)}><FiRadio size={15} /> Track bus</button>}
        {(kind === "today" || kind === "upcoming") && (
          <button className="btn btn-danger btn-sm" onClick={() => onCancel(order)}><FiXCircle size={15} /> Cancel &amp; refund</button>
        )}
      </div>
    </motion.article>
  );
}

export default function Myticket() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [lists, setLists] = useState({ today: [], upcoming: [], past: [], cancelled: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming");
  const [ticketId, setTicketId] = useState(null);
  const [trackId, setTrackId] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const expire = useCallback(() => {
    error("Your session expired. Please sign in again.");
    clearSession();
    dispatch(logoutAPI());
    navigate("/signin");
  }, [dispatch, navigate]);

  const load = useCallback(async () => {
    try {
      // One request, sorted into tabs here — this used to be four round-trips before anything could render.
      const { data: all } = await axios.post(`${API_BASE_URL}/order/myticket`, {}, authHeader());
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      const dated = (o) => (o.ticketSummary?.date ? new Date(o.ticketSummary.date) : null);
      const confirmed = all.filter((o) => o.status === "CONFIRMED");
      const today = confirmed.filter((o) => { const d = dated(o); return d && d >= startOfToday && d < startOfTomorrow; });
      const upcoming = confirmed.filter((o) => { const d = dated(o); return d && d >= startOfTomorrow; });
      const past = all.filter((o) => ["CONFIRMED", "COMPLETED"].includes(o.status) && dated(o) && dated(o) < startOfToday);
      const cancelled = all.filter((o) => o.status === "CANCELLED");
      setLists({ today, upcoming, past, cancelled });
      return { today, upcoming };
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) expire();
      else error("Couldn't load your trips. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [expire]);

  useEffect(() => {
    document.title = "My trips · RaahiGo";
    load().then((r) => {
      if (r?.today.length) setTab("today");
      else if (!r?.upcoming.length) setTab("upcoming");
    });
  }, [load]);

  const tabs = useMemo(() => [
    { key: "today", label: "Today", count: lists.today.length || null },
    { key: "upcoming", label: "Upcoming", count: lists.upcoming.length || null },
    { key: "past", label: "Past", count: null },
    { key: "cancelled", label: "Cancelled", count: lists.cancelled.length || null },
  ], [lists]);

  const items = lists[tab];
  const emptyCopy = {
    today: ["Nothing on the road today", "When you have a journey today, you'll be able to track the bus live from here."],
    upcoming: ["No upcoming trips", "Plan your next journey — seats are held for ten minutes while you check out."],
    past: ["No completed journeys yet", "Trips you've taken will appear here for your records."],
    cancelled: ["Nothing cancelled", "Cancelled tickets and their refund progress will show up here."],
  }[tab];

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Your journeys" title="My trips" subtitle="Tickets, live tracking and cancellations in one place."
        actions={<Link to="/" className="btn btn-accent">Book a new trip</Link>} />
      <div className="container">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Trip lists" />
        <p className={styles.policy}>Cancel any time up to 2 hours before departure — 100% back until 48 hours, then 90 / 75 / 50 / 25%. Refund instantly to your RaahiGo Wallet and earn a bonus.</p>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.list}>
          {loading ? (
            [0, 1].map((i) => <div key={i} className="skel" style={{ height: 168, borderRadius: 20 }} />)
          ) : items.length === 0 ? (
            <EmptyState icon={<RiTicketLine size={24} />} title={emptyCopy[0]} action={(tab === "today" || tab === "upcoming") && <Link to="/" className="btn btn-primary">Search buses</Link>}>
              {emptyCopy[1]}
            </EmptyState>
          ) : (
            <AnimatePresence mode="popLayout">
              {items.map((o) => (
                <TripCard key={o._id} order={o} kind={tab} onView={setTicketId} onTrack={setTrackId} onCancel={setCancelling} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      <TicketModal orderId={ticketId} onClose={() => setTicketId(null)} />
      {trackId && <Suspense fallback={null}><TrackingModal orderId={trackId} onClose={() => setTrackId(null)} /></Suspense>}

      <CancelModal order={cancelling} onClose={() => setCancelling(null)} onDone={load} />
    </div>
  );
}
