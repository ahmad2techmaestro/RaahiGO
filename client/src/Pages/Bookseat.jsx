import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { FiArrowRight, FiMail, FiPhone, FiAlertTriangle, FiWifi, FiWifiOff } from "react-icons/fi";
import SeatMap from "../Components/Seats/SeatMap";
import EmptyState from "../ui/EmptyState";
import { API_BASE_URL } from "../config/api";
import { getSocket } from "../config/socket";
import { authHeader } from "../lib/session";
import { formatDate, formatHour, formatINR, titleCase } from "../lib/format";
import { error, info } from "../Utils/notification";
import { removeData, saveData1 } from "../Redux/ticket/ticket.action";
import styles from "../Styles/bookseat.module.css";

const MAX_SEATS = 6;

export default function Bookseat() {
  const [searchParams] = useSearchParams();
  const { id: busId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const date = searchParams.get("date");

  const ticket = useSelector((s) => s.ticket.ticketNo);
  const [bus, setBus] = useState(null);
  const [booked, setBooked] = useState([]);
  const [locked, setLocked] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [connected, setConnected] = useState(false);
  const [holding, setHolding] = useState(false);
  const mine = useRef(new Set()); // seats this user just put on hold — their own lock broadcast must not deselect them

  const load = useCallback(async () => {
    if (!date) return setStatus("error");
    try {
      const res = await axios.post(`${API_BASE_URL}/bus/one`, { id: busId });
      const doc = res.data?.[0];
      if (!doc) return setStatus("error");
      setBus(doc);
      // One entry per booking ("date@seats@gender") — merge every booking made for this date.
      const taken = (doc.seats || [])
        .map((e) => e.split("@"))
        .filter(([d]) => d === date)
        .flatMap(([, seats]) => (seats || "").split(",").filter(Boolean));
      setBooked(Array.from(new Set(taken)));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [busId, date]);

  useEffect(() => { document.title = "Choose seats · RaahiGo"; load(); }, [load]);

  // Live seat availability for this bus + date.
  useEffect(() => {
    if (!date || !busId) return undefined;
    const socket = getSocket();
    const room = { busId, date };
    const strs = (seats) => seats.map(String);

    const join = () => { setConnected(true); socket.emit("seatmap:join", room); };
    const leave = () => setConnected(false);
    const onLocked = ({ seats }) => setLocked((p) => Array.from(new Set([...p, ...strs(seats)])));
    const onReleased = ({ seats }) => setLocked((p) => p.filter((s) => !strs(seats).includes(s)));
    // A cancelled booking puts seats back on sale for everyone watching this map.
    const onFreed = ({ seats }) => setBooked((p) => p.filter((s) => !strs(seats).includes(s)));
    const onBooked = ({ seats }) => {
      setBooked((p) => Array.from(new Set([...p, ...strs(seats)])));
      setLocked((p) => p.filter((s) => !strs(seats).includes(s)));
    };

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("disconnect", leave);
    socket.on("seats:locked", onLocked);
    socket.on("seats:released", onReleased);
    socket.on("seats:booked", onBooked);
    socket.on("seats:freed", onFreed);
    return () => {
      socket.emit("seatmap:leave", room);
      socket.off("connect", join);
      socket.off("disconnect", leave);
      socket.off("seats:locked", onLocked);
      socket.off("seats:released", onReleased);
      socket.off("seats:booked", onBooked);
      socket.off("seats:freed", onFreed);
    };
  }, [busId, date]);

  const isUnavailable = useCallback((id) => booked.includes(String(id)) || locked.includes(String(id)), [booked, locked]);

  // If someone else takes a seat you'd selected, drop it and say so — never let a stale seat reach checkout.
  useEffect(() => {
    const taken = ticket.filter((s) => isUnavailable(s) && !mine.current.has(String(s)));
    if (taken.length) {
      taken.forEach((s) => dispatch(removeData(s)));
      info(`Seat ${taken.join(", ")} was just taken by another traveller`);
    }
  }, [ticket, isUnavailable, dispatch]);

  const toggle = useCallback((id) => {
    if (ticket.includes(id)) return dispatch(removeData(id));
    if (ticket.length >= MAX_SEATS) return error(`You can book up to ${MAX_SEATS} seats at a time`);
    dispatch(saveData1(id));
  }, [ticket, dispatch]);

  const sorted = useMemo(() => [...ticket].sort((a, b) => a - b), [ticket]);
  const fare = bus ? ticket.length * bus.price : 0;

  async function proceed() {
    if (!ticket.length) return error("Select at least one seat to continue");
    setHolding(true);
    mine.current = new Set(ticket.map(String));
    try {
      // Hold the seats before checkout so nobody else can pay for them meanwhile.
      const { data: lock } = await axios.post(
        `${API_BASE_URL}/seats/lock`,
        { busId, date, seats: ticket.map(String) },
        authHeader()
      );
      sessionStorage.setItem("busData", JSON.stringify([bus]));
      sessionStorage.setItem("seatLock", JSON.stringify({
        lockToken: lock.lockToken,
        expiresAt: Date.now() + lock.expiresInSeconds * 1000,
        busId, date, seats: ticket.map(String),
      }));
      navigate({ pathname: `/details/${busId}`, search: `?date=${date}&ticket=${ticket.join(",")}&amount=${fare}` });
    } catch (err) {
      mine.current = new Set();
      error(err?.response?.data?.message || "Couldn't hold those seats. Please try again.");
      if (err?.response?.status === 409) load();
    } finally {
      setHolding(false);
    }
  }

  if (status === "loading") {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.layout}>
          <div className="skel" style={{ height: 560, borderRadius: 24 }} />
          <div className="skel" style={{ height: 420, borderRadius: 24 }} />
        </div>
      </div>
    );
  }

  if (status === "error" || !bus) {
    return (
      <div className="container" style={{ padding: "64px 0" }}>
        <EmptyState icon={<FiAlertTriangle size={24} />} title="We couldn't open this bus"
          action={<Link to="/" className="btn btn-primary">Start a new search</Link>}>
          The bus or date is missing or no longer available.
        </EmptyState>
      </div>
    );
  }

  const free = 30 - booked.length - locked.length;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.top}>
        <div>
          <span className="eyebrow">Step 1 of 2 · Choose seats</span>
          <h1>{bus.from} <FiArrowRight style={{ verticalAlign: "-0.1em", color: "var(--accent)" }} /> {bus.to}</h1>
          <p className="muted">{titleCase(bus.companyname)} Travels · {formatDate(date)}</p>
        </div>
        <span className={`badge ${connected ? "badge-success" : "badge-warn"} badge-dot`} title="Seat availability updates in real time">
          {connected ? <><FiWifi /> Live availability</> : <><FiWifiOff /> Reconnecting…</>}
        </span>
      </div>

      <div className={styles.layout}>
        <div className={`card ${styles.mapCard}`}>
          <ul className={styles.legend} aria-label="Seat legend">
            <li><i className={styles.keyFree} /> Available</li>
            <li><i className={styles.keySel} /> Selected</li>
            <li><i className={styles.keyTaken} /> Taken</li>
            <li className={styles.freeCount}>{free} free</li>
          </ul>
          <SeatMap isUnavailable={isUnavailable} selected={ticket} onToggle={toggle} />
        </div>

        <aside className={`card ${styles.summary}`} aria-label="Booking summary">
          <h2>{titleCase(bus.companyname)}</h2>
          <div className={styles.timing}>
            <div><time>{formatHour(bus.departure)}</time><span>{bus.from}</span></div>
            <i />
            <div style={{ textAlign: "right" }}><time>{formatHour(bus.arrival)}</time><span>{bus.to}</span></div>
          </div>

          <div className={styles.contact}>
            {bus.email && <a href={`mailto:${bus.email}`}><FiMail size={14} /> {bus.email}</a>}
            {bus.phone && <a href={`tel:${bus.phone}`}><FiPhone size={14} /> {bus.phone}</a>}
          </div>

          <div className={styles.picked}>
            <span className="field-label">Your seats</span>
            <div className={styles.chosen} aria-live="polite">
              {sorted.length ? sorted.map((s) => <b key={s} className="mono">{s}</b>) : <em>None selected yet</em>}
            </div>
          </div>

          <dl className={styles.fare}>
            <div><dt>{formatINR(bus.price)} × {ticket.length || 0}</dt><dd>{formatINR(fare)}</dd></div>
            <div className={styles.total}><dt>Total</dt><dd>{formatINR(fare)}</dd></div>
          </dl>

          <button className="btn btn-accent btn-lg btn-block" onClick={proceed} disabled={holding || !ticket.length}>
            {holding ? <><span className="spinner" /> Holding seats…</> : <>Continue to passenger details <FiArrowRight /></>}
          </button>
          <p className={styles.note}>Seats are held for 10 minutes once you continue.</p>
        </aside>
      </div>

      {/* Mobile sticky bar */}
      <div className={styles.bar}>
        <div><small>{ticket.length} seat{ticket.length === 1 ? "" : "s"}</small><strong>{formatINR(fare)}</strong></div>
        <button className="btn btn-accent" onClick={proceed} disabled={holding || !ticket.length}>
          {holding ? <span className="spinner" /> : <>Continue <FiArrowRight /></>}
        </button>
      </div>
    </div>
  );
}
