import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getAiStatus } from "../../lib/aiStatus";
import { motion, AnimatePresence } from "framer-motion";
import { HiSparkles } from "react-icons/hi";
import { FiX, FiSend } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/session";
import styles from "../../Styles/ai.module.css";

const GREETING = {
  role: "assistant",
  text: "Hi, I'm RaahiGo's assistant. Ask me about cancellations, refunds, seat holds or payment security.",
};
const SUGGESTIONS = ["How do cancellations work?", "How long are seats held?", "Is my payment secure?"];

export default function SupportWidget() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    getAiStatus().then((data) => setAvailable(Boolean(data.aiEnabled)));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  async function send(question) {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const token = getToken();
      const { data } = await axios.post(
        `${API_BASE_URL}/ai/support`,
        { question: q },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setMessages((m) => [...m, { role: "assistant", text: data.answer, sources: data.sources }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: err?.response?.data?.message || "Sorry — I couldn't answer that just now. Please try again shortly." },
      ]);
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
            className={styles.panel}
            role="dialog"
            aria-label="RaahiGo support assistant"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <header className={styles.panelHead}>
              <span className={styles.panelTitle}>
                <span className={styles.dot} /> <HiSparkles size={15} /> Support assistant
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close assistant"><FiX size={17} /></button>
            </header>

            <div className={styles.messages} ref={scrollRef} aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`${styles.msg} ${styles[m.role]}`}>
                  <p>{m.text}</p>
                  {m.sources?.length > 0 && <small>Based on: {m.sources.join(", ")}</small>}
                </div>
              ))}
              {loading && (
                <div className={`${styles.msg} ${styles.assistant}`}>
                  <span className={styles.typing}><i /><i /><i /></span>
                </div>
              )}
              {messages.length === 1 && (
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
                </div>
              )}
            </div>

            <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <input
                type="text"
                aria-label="Your question"
                placeholder="Ask a question…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                maxLength={500}
              />
              <button type="submit" disabled={loading || !input.trim()} aria-label="Send"><FiSend size={16} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button className={styles.fab} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close assistant" : "Open support assistant"}>
        {open ? <FiX size={22} /> : <HiSparkles size={22} />}
      </button>
    </div>
  );
}
