import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch, FiGrid, FiCreditCard, FiRadio, FiLock, FiZap, FiGift, FiPlus, FiArrowUpRight, FiArrowRight, FiCheck,
} from "react-icons/fi";
import { HiSparkles } from "react-icons/hi";
import { searchPath, toISODate } from "../../lib/format";
import AISearchBox from "../AI/AISearchBox";
import styles from "../../Styles/landing.module.css";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

function Head({ eyebrow, title, children }) {
  return (
    <motion.div className={styles.sectionHead} {...reveal}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </motion.div>
  );
}

export function Stats() {
  const items = [
    ["18+", "cities connected"],
    ["60+", "two-way routes"],
    ["10 min", "seat hold at checkout"],
    ["100%", "server-verified payments"],
  ];
  return (
    <section className={styles.stats} aria-label="RaahiGo at a glance">
      <div className="container">
        <dl>
          {items.map(([n, l]) => (
            <motion.div key={l} {...reveal}>
              <dt>{n}</dt>
              <dd>{l}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: FiSearch, title: "Search any route", text: "Type two cities and a date. Filters for price, time, seat type and amenities narrow it down instantly." },
  { icon: FiGrid, title: "Pick your exact seat", text: "A live deck map shows what's free right now — seats other travellers are paying for lock in real time." },
  { icon: FiCreditCard, title: "Pay securely", text: "Your seats are held for ten minutes while you check out with Razorpay. Tickets arrive with a verifiable QR." },
  { icon: FiRadio, title: "Track the journey", text: "Follow your bus on a live map with ETA and delay alerts, right from your trips page." },
];

export function HowItWorks() {
  return (
    <section className={styles.section}>
      <div className="container">
        <Head eyebrow="How it works" title="From “where to?” to boarding pass in four calm steps" />
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <motion.li key={s.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
              <span className={styles.stepNum}>0{i + 1}</span>
              <span className={styles.stepIcon}><s.icon size={22} /></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const ROUTES = [
  ["Mumbai", "Pune", "linear-gradient(135deg,#0d4a42,#1b7566)"],
  ["Delhi", "Jaipur", "linear-gradient(135deg,#7a3b12,#d9822b)"],
  ["Bengaluru", "Chennai", "linear-gradient(135deg,#1f3a5f,#3f7cac)"],
  ["Hyderabad", "Bengaluru", "linear-gradient(135deg,#4b2a5c,#9a5fb0)"],
  ["Ahmedabad", "Surat", "linear-gradient(135deg,#5b3a14,#c28b3a)"],
  ["Kolkata", "Patna", "linear-gradient(135deg,#143c3c,#2f8d7e)"],
];

export function PopularRoutes() {
  const navigate = useNavigate();
  const today = toISODate();
  return (
    <section className={styles.section}>
      <div className="container">
        <Head eyebrow="Popular routes" title="Where travellers are heading">
          Jump straight into today's departures on the corridors people search most.
        </Head>
        <div className={styles.routeGrid}>
          {ROUTES.map(([a, b, bg], i) => (
            <motion.button
              key={a + b}
              className={styles.routeCard}
              style={{ background: bg }}
              onClick={() => navigate(searchPath(a, b, today))}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 3) * 0.07 }}
              whileHover={{ y: -6 }}
            >
              <span className={styles.routeDots} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.routeText}>
                <small>Departures today</small>
                <strong>{a}</strong>
                <span className={styles.routeArrow}><FiArrowRight /></span>
                <strong>{b}</strong>
              </span>
              <FiArrowUpRight className={styles.routeGo} size={22} />
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- "Built differently": each card is a small live demo plus a way into the real feature ---------- */

/** 4×5 deck that flips seats to "taken" the way the real seat map does when someone else locks one. */
function SeatsDemo() {
  const [taken, setTaken] = useState(() => new Set([2, 5, 9, 14]));
  useEffect(() => {
    const id = setInterval(() => {
      setTaken((prev) => {
        const next = new Set(prev);
        const n = Math.floor(Math.random() * 20);
        if (next.has(n)) next.delete(n); else next.add(n);
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.demoSeats} aria-hidden="true">
      {Array.from({ length: 20 }, (_, i) => <i key={i} className={taken.has(i) ? styles.seatTaken : ""} />)}
    </div>
  );
}

/** A real ticking ten-minute hold ring, restarting like a fresh checkout. */
function HoldDemo() {
  const TOTAL = 600;
  const [left, setLeft] = useState(TOTAL);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => (l <= 1 ? TOTAL : l - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const r = 26, c = 2 * Math.PI * r;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className={styles.demoHold} aria-hidden="true">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - left / TOTAL)} transform="rotate(-90 34 34)" />
      </svg>
      <b>{mm}:{ss}</b>
      <span>Seat 12 · held for you</span>
    </div>
  );
}

/** Loops through the checks every payment goes through before a booking is written. */
function VerifyDemo() {
  const steps = ["Gateway returns payment id + signature", "Server recomputes HMAC-SHA256", "Signatures match — amount re-checked", "Booking written, ticket issued"];
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= steps.length + 1 ? 1 : v + 1)), 1100);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <ul className={styles.demoVerify} aria-hidden="true">
      {steps.map((t, i) => <li key={t} className={i < n ? styles.stepOn : ""}><FiCheck size={13} /> {t}</li>)}
    </ul>
  );
}

function TrackDemo() {
  return (
    <div className={styles.demoTrack} aria-hidden="true">
      <div className={styles.trackLine}><span className={styles.trackBus}>🚌</span></div>
      <div className={styles.trackMeta}><span>Mumbai</span><b>ETA 2h 40m · On schedule</b><span>Pune</span></div>
    </div>
  );
}

function RewardsDemo() {
  const tiers = ["Explorer", "Traveller", "Voyager", "Elite"];
  return (
    <div className={styles.demoRewards} aria-hidden="true">
      <div className={styles.tierBar}><span /></div>
      <div className={styles.tierNames}>{tiers.map((t) => <small key={t}>{t}</small>)}</div>
      <p>1 point per ₹100 · +1% cashback per tier · ₹ bonus when a friend books</p>
    </div>
  );
}

export function Features() {
  const navigate = useNavigate();
  const today = toISODate();
  const demoRoute = searchPath("Mumbai", "Pune", today);

  const cards = [
    { icon: FiGrid, title: "Live seat maps", wide: true, demo: <SeatsDemo />,
      text: "Open any bus and its seat map updates over WebSockets the moment another traveller picks, holds or releases a seat — scoped to that exact bus and date.",
      cta: ["Open a live seat map", () => navigate(demoRoute)] },
    { icon: FiLock, title: "Atomic seat holds", demo: <HoldDemo />,
      text: "Pick a seat and a Redis lock reserves it for ten minutes, so two people can never pay for the same seat. Timer expires, seat returns.",
      cta: ["Try holding a seat", () => navigate(demoRoute)] },
    { icon: FiZap, title: "Server-verified payments", demo: <VerifyDemo />,
      text: "The browser is never trusted. Price is computed on the server and the payment signature is verified before any booking is written.",
      cta: ["How checkout is secured", () => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" })] },
    { icon: HiSparkles, title: "AI that plans with you", wide: true, demo: <AISearchBox compact />,
      text: "Type it the way you'd say it — “sleeper Mumbai to Delhi tomorrow under ₹1500”. It becomes a precise search with filters already applied. Try it right here." },
    { icon: FiRadio, title: "Real-time tracking", demo: <TrackDemo />,
      text: "Every confirmed trip has a live map with ETA, distance left and delay status. Find it under My trips → Track bus (open from the moment you book).",
      cta: ["Go to My trips", () => navigate("/myticket")] },
    { icon: FiGift, title: "Rewards that stack", demo: <RewardsDemo />,
      text: "Every booking earns loyalty points and cashback. Climb tiers for bigger cashback, and share your referral code for bonus credit.",
      cta: ["See my rewards", () => navigate("/profile#wallet")] },
  ];

  return (
    <section className={`${styles.section} ${styles.dark}`}>
      <div className="container">
        <Head eyebrow="Built differently" title="The engineering is invisible. The calm is not.">
          Everything under the hood exists for one reason: so booking a seat never feels risky. Each card below is live — try it.
        </Head>
        <div className={styles.bento}>
          {cards.map((f, i) => (
            <motion.article
              key={f.title}
              className={`${styles.bentoItem} ${f.wide ? styles.wide : ""}`}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 3) * 0.07 }}
            >
              <span className={styles.bentoIcon}><f.icon size={22} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <div className={styles.demo}>{f.demo}</div>
              {f.cta && (
                <button type="button" className={styles.bentoCta} onClick={f.cta[1]}>
                  {f.cta[0]} <FiArrowRight size={15} />
                </button>
              )}
            </motion.article>
          ))}
        </div>
        <p className={styles.demoNote}>Seat, hold and tracking visuals above are illustrations of the real behaviour; the AI box runs the real planner.</p>
      </div>
    </section>
  );
}

const FAQ = [
  ["How long are my seats held?", "Once you proceed to checkout, your seats are locked for ten minutes. A visible countdown shows the time left; if it expires the seats return to the pool automatically."],
  ["Can I cancel a ticket?", "Yes — open My trips → Cancel & refund up to 2 hours before departure. You get 100% back at 48+ hours, 90% at 24–48h, 75% at 12–24h, 50% at 6–12h and 25% at 2–6h. Choose the RaahiGo Wallet for an instant refund plus a small bonus, or the original payment method (5–7 days). Cashback on that booking is reversed."],
  ["Is payment secure?", "Payments run through Razorpay. We never trust the browser alone: every payment signature is verified on our server before a booking is confirmed."],
  ["How does cashback work?", "Pay with UPI, card, net banking or a mobile wallet and cashback is credited to your RaahiGo Wallet right after the booking — 3% to 7% depending on the method, plus extra percentage points as you climb loyalty tiers. Wallet balance can pay for your next trip."],
  ["How do I verify a ticket?", "Every ticket carries a QR code that opens a public verification page showing the passenger, route, date and seats — so drivers and staff can confirm it in seconds."],
  ["Do I need an account?", "You can search and compare freely. An account is needed to hold seats, pay, and manage trips — it takes about thirty seconds."],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className={styles.section} id="faq">
      <div className={`container ${styles.faqWrap}`}>
        <Head eyebrow="Good to know" title="Questions, answered straight" />
        <div className={styles.faq}>
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`${styles.faqItem} ${open === i ? styles.faqOpen : ""}`}>
              <button
                id={`faq-q-${i}`}
                aria-expanded={open === i}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                {q}
                <FiPlus size={20} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    id={`faq-a-${i}`}
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <p>{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className={styles.cta}>
      <div className="container">
        <motion.div className={styles.ctaInner} {...reveal}>
          <div>
            <h2>Your next journey starts with one search.</h2>
            <p>Create a free account to hold seats, earn rewards and track every trip.</p>
          </div>
          <div className={styles.ctaBtns}>
            <Link to="/signup" className="btn btn-accent btn-lg">Create free account</Link>
            <a href="#main" className="btn btn-lg btn-outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,.35)" }}
               onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Search buses
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function Developer() {
  return (
    <section className={styles.section}>
      <div className="container">
        <motion.div className={styles.dev} {...reveal}>
          <span className={styles.devMark} aria-hidden="true">SA</span>
          <div className={styles.devText}>
            <span className="eyebrow">Behind RaahiGo</span>
            <h2>Designed and built by Shah Ahmad Raza</h2>
            <p>
              Full Stack Developer (MERN). RaahiGo is an end-to-end booking platform — React, Node, MongoDB, Redis
              seat locking and Socket.IO live updates — built to handle the hard parts of real booking: concurrency,
              payments and trust.
            </p>
          </div>
          <div className={styles.devLinks}>
            <a className="btn btn-primary" href="https://www.linkedin.com/in/shah-ahmad-raza-62a72722" target="_blank" rel="noreferrer">LinkedIn</a>
            <a className="btn btn-outline" href="https://github.com/ahmad2techmaestro" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
