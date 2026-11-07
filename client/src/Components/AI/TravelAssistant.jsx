import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HiSparkles } from "react-icons/hi";
import { FiX, FiSend } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { getToken, authHeader } from "../../lib/session";
import { getAiStatus } from "../../lib/aiStatus";
import { formatHour, formatINR } from "../../lib/format";
import styles from "../../Styles/ai.module.css";

const GREETING = {
  role: "assistant",
  text: "Hi, I'm RaahiGo's travel assistant. I can find buses, plan a journey when a route is sold out, check refunds for your bookings and answer policy questions.",
};
const SUGGESTIONS = [
  "Buses from Delhi to Jaipur tomorrow",
  "Suggest the best bus for me",
  "How do cancellations work?",
];

const dur = (h) => (h == null ? "" : `${Math.floor(h)}h${Math.round((h % 1) * 60) ? ` ${Math.round((h % 1) * 60)}m` : ""}`);

function BusRow({ b, date, onBook }) {
  return (
    <div className={styles.cardRow}>
      <div>
        <strong>{b.operator}</strong>
        <span>{formatHour(b.departure)} → {formatHour(b.arrival)} · {dur(b.durationHours)} · {b.seatsAvailable} seats</span>
        {b.reasons?.length > 0 && <em>{b.badge ? `${b.badge}: ` : ""}{b.reasons.join(", ")}</em>}
      </div>
      <div className={styles.cardEnd}>
        <b>{formatINR(b.price)}</b>
        <button onClick={() => onBook(b.id, date)}>Select</button>
      </div>
    </div>
  );
}

function Card({ card, onBook, onDate }) {
  if (card.type === "buses") {
    return (
      <div className={styles.card}>
        <h4>{card.from} → {card.to} · {card.date}{card.personalised ? " · for you" : ""}</h4>
        {card.items.map((b) => <BusRow key={b.id} b={b} date={card.date} onBook={onBook} />)}
        {card.total > card.items.length && <small>Showing {card.items.length} of {card.total}</small>}
      </div>
    );
  }
  if (card.type === "journeys") {
    return (
      <div className={styles.card}>
        <h4>{card.from} → {card.to} · {card.date}</h4>
        {card.direct?.map((b) => <BusRow key={b.busId} b={{ ...b, id: b.busId, operator: b.operator }} date={card.date} onBook={onBook} />)}
        {card.connections?.map((c, i) => (
          <div className={styles.cardRow} key={i}>
            <div>
              <strong>via {c.via} {c.tags?.map((t) => <i key={t} className={styles.tag}>{t}</i>)}</strong>
              {c.legs.map((l) => (
                <span key={l.busId}>{l.from} → {l.to}: {l.operator}, {l.date} {formatHour(l.departure)}</span>
              ))}
              <em>Layover {dur(c.layoverHours)} · total {dur(c.totalHours)}. Book each leg separately.</em>
            </div>
            <div className={styles.cardEnd}><b>{formatINR(c.totalPrice)}</b></div>
          </div>
        ))}
        {card.alternatives?.map((a) => (
          <div className={styles.cardRow} key={a.date}>
            <div><strong>{a.date}</strong><span>{a.buses} bus{a.buses > 1 ? "es" : ""} · from {formatINR(a.cheapest)}</span></div>
            <div className={styles.cardEnd}><button onClick={() => onDate(card.from, card.to, a.date)}>View</button></div>
          </div>
        ))}
      </div>
    );
  }
  if (card.type === "bookings") {
    return (
      <div className={styles.card}>
        <h4>Your recent bookings</h4>
        {card.items.map((o) => (
          <div className={styles.cardRow} key={o.orderId}>
            <div><strong>{o.route}</strong><span>{o.operator} · {o.date ? String(o.date).slice(0, 10) : ""} · seats {o.seats}</span></div>
            <div className={styles.cardEnd}><small>{o.status}</small></div>
          </div>
        ))}
      </div>
    );
  }
  if (card.type === "refund") {
    return (
      <div className={styles.card}>
        <h4>Refund preview · {card.route}</h4>
        {card.cancellable
          ? <p>Refund {card.percent}%: <b>{formatINR(card.refundable)}</b> of {formatINR(card.totalPaid)} (fee {formatINR(card.fee)}). Nothing is cancelled until you confirm in My Tickets.</p>
          : <p>{card.reason || "This booking can't be cancelled."}</p>}
      </div>
    );
  }
  if (card.type === "sources") {
    return <small className={styles.sources}>Based on: {card.items.map((s) => s.topic).join(", ")}</small>;
  }
  return null;
}

export default function TravelAssistant() {
  const navigate = useNavigate();
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // The assistant works without an AI key (built-in engine); status only tells us which engine is active.
  useEffect(() => { getAiStatus().catch(() => setAvailable(true)); }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  const goBook = (id, date) => { setOpen(false); navigate(`/bookticket/${id}?date=${date}`); };
  const goDate = (from, to, date) => { setOpen(false); navigate(`/selectbus?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`); };

  async function confirmHold(action, idx) {
    if (!getToken()) { navigate("/signin"); return; }
    try {
      const { data: lock } = await axios.post(`${API_BASE_URL}/seats/lock`, { busId: action.busId, date: action.date, seats: action.seats.map(String) }, authHeader());
      const { data: bus } = await axios.post(`${API_BASE_URL}/bus/one`, { id: action.busId });
      sessionStorage.setItem("busData", JSON.stringify([bus[0]]));
      sessionStorage.setItem("seatLock", JSON.stringify({
        lockToken: lock.lockToken, expiresAt: Date.now() + lock.expiresInSeconds * 1000,
        busId: action.busId, date: action.date, seats: action.seats.map(String),
      }));
      setOpen(false);
      navigate({ pathname: `/details/${action.busId}`, search: `?date=${action.date}&ticket=${action.seats.join(",")}&amount=${action.price}` });
    } catch (err) {
      setMessages((m) => m.map((x, i) => (i === idx ? { ...x, holdError: err?.response?.data?.message || "Couldn't hold those seats. Please try again." } : x)));
    }
  }

  async function send(question) {
    const q = question.trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const history = next.filter((m) => m !== GREETING).map((m) => ({ role: m.role, content: m.text }));
      const token = getToken();
      const { data } = await axios.post(`${API_BASE_URL}/ai/assistant`, { messages: history }, token ? authHeader() : {});
      setMessages((m) => [...m, { role: "assistant", text: data.reply, cards: data.cards || [], action: data.action || null, engine: data.engine }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err?.response?.data?.message || "Sorry, I couldn't answer that just now. Please try again shortly." }]);
    } finally {
      setLoading(false);
    }
  }

  if (!available) return null;

  return (
    <div className={styles.widget}>
      <AnimatePresence>
        {open && (
          <motion.section
            className={`${styles.panel} ${styles.panelWide}`}
            role="dialog"
            aria-label="RaahiGo travel assistant"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <header className={styles.panelHead}>
              <span className={styles.panelTitle}><span className={styles.dot} /> <HiSparkles size={15} /> Travel assistant</span>
              <button onClick={() => setOpen(false)} aria-label="Close assistant"><FiX size={17} /></button>
            </header>

            <div className={styles.messages} ref={scrollRef} aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`${styles.msg} ${styles[m.role]}`}>
                  <p>{m.text}</p>
                  {m.cards?.map((c, k) => <Card key={k} card={c} onBook={goBook} onDate={goDate} />)}
                  {m.action?.type === "hold_seats" && (
                    <div className={styles.confirm}>
                      <p>Hold {m.action.summary} for {formatINR(m.action.price)}?</p>
                      <button onClick={() => confirmHold(m.action, i)}>Hold seats &amp; continue</button>
                      {m.holdError && <small role="alert">{m.holdError}</small>}
                    </div>
                  )}
                  {m.action?.type === "open_cancel" && (
                    <div className={styles.confirm}><button onClick={() => { setOpen(false); navigate("/myticket"); }}>{m.action.label}</button></div>
                  )}
                </div>
              ))}
              {loading && <div className={`${styles.msg} ${styles.assistant}`}><span className={styles.typing}><i /><i /><i /></span></div>}
              {messages.length === 1 && (
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
                </div>
              )}
            </div>

            <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <input type="text" aria-label="Your message" placeholder="Ask about buses, refunds, policies…" value={input}
                onChange={(e) => setInput(e.target.value)} disabled={loading} maxLength={500} />
              <button type="submit" disabled={loading || !input.trim()} aria-label="Send"><FiSend size={16} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <button className={styles.fab} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close assistant" : "Open travel assistant"}>
        {open ? <FiX size={22} /> : <HiSparkles size={22} />}
      </button>
    </div>
  );
}
