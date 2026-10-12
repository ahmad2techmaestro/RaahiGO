import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { FiClock, FiTag, FiCheck, FiShield, FiLock, FiArrowRight, FiGift } from "react-icons/fi";
import { RiWallet3Line } from "react-icons/ri";
import { API_BASE_URL } from "../config/api";
import { authHeader, getEmail, getToken } from "../lib/session";
import { notifyWalletChanged } from "../lib/wallet";
import { removeall } from "../Redux/ticket/ticket.action";
import PaymentOffers from "../Components/Checkout/PaymentOffers";
import DemoPaymentSheet from "../Components/Checkout/DemoPaymentSheet";
import { formatDate, formatHour, formatINR, mmss, titleCase } from "../lib/format";
import { validateEmail, validatePhone } from "../lib/validators";
import { error } from "../Utils/notification";
import { abandonCheckout, demoAuthorise, getPaymentConfig, openRazorpay, verifyBooking } from "./payment/checkout";
import styles from "../Styles/details.module.css";
import ck from "../Styles/checkout.module.css";

function readJSON(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

export default function Details() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const date = searchParams.get("date");
  const ticket = searchParams.get("ticket") || "";
  const seats = ticket.split(",").filter(Boolean);
  const bus = useMemo(() => readJSON("busData")?.[0] || null, []);

  const [secondsLeft, setSecondsLeft] = useState(null);
  const [creds, setCreds] = useState({ name: "", age: "", gender: "", email: getEmail(), phone: "" });
  const [errors, setErrors] = useState({});
  const [paying, setPaying] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [preferred, setPreferred] = useState(null); // payment method the traveller tapped in the offers list
  const [sheet, setSheet] = useState(null); // demo-gateway checkout awaiting payment
  const nameRef = useRef(null);
  const paidRef = useRef(false);

  const fetchQuote = useCallback(async (code, wallet) => {
    const q = new URLSearchParams({ busId: params.id, date: date || "", seats: ticket, useWallet: String(wallet) });
    if (code) q.set("couponCode", code);
    const { data } = await axios.get(`${API_BASE_URL}/api/payment/quote?${q}`, authHeader());
    return data;
  }, [params.id, date, ticket]);

  // Server-side price quote: totals, wallet usage and per-method cashback. The browser never computes money.
  useEffect(() => {
    if (!date || !ticket) return undefined;
    let live = true;
    fetchQuote(appliedCode, useWallet)
      .then((d) => { if (live) { setQuote(d); setQuoteError(""); } })
      .catch((err) => { if (live) setQuoteError(err?.response?.data?.message || "Couldn't price this booking. Please go back and try again."); });
    return () => { live = false; };
  }, [fetchQuote, appliedCode, useWallet, date, ticket]);

  useEffect(() => { document.title = "Passenger details · RaahiGo"; nameRef.current?.focus(); }, []);

  // Seat-hold countdown. The server releases the seats at expiry (Redis TTL); the UI sends the user back.
  useEffect(() => {
    const lock = readJSON("seatLock");
    if (!lock?.expiresAt) return undefined;
    const tick = () => {
      const remaining = Math.round((lock.expiresAt - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        sessionStorage.removeItem("seatLock");
        error("Your seat hold expired. Please choose your seats again.");
        navigate(-1);
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bus || !date || !seats.length) {
    return (
      <div className="container" style={{ padding: "72px 0", textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--fs-2xl)", marginBottom: 12 }}>Your booking session has ended</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Start again to choose your seats.</p>
        <Link to="/" className="btn btn-primary">Back to search</Link>
      </div>
    );
  }

  const pricing = quote?.pricing;
  const total = pricing?.payable ?? 0;
  const urgent = secondsLeft !== null && secondsLeft < 60;
  const pct = secondsLeft !== null ? Math.max(0, Math.min(100, (secondsLeft / 600) * 100)) : 100;

  function set(e) {
    const { name, value } = e.target;
    setCreds((c) => ({ ...c, [name]: name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value }));
    if (errors[name]) setErrors((x) => ({ ...x, [name]: undefined }));
  }

  function validate() {
    const e = {};
    if (creds.name.trim().length < 2) e.name = "Enter the passenger's full name";
    const age = Number(creds.age);
    if (!age || age < 1 || age > 120) e.age = "Enter a valid age";
    if (!creds.gender) e.gender = "Select a gender";
    if (!validateEmail(creds.email)) e.email = "Enter a valid email address";
    if (!validatePhone(creds.phone)) e.phone = "Enter a valid 10-digit mobile number";
    setErrors(e);
    return e;
  }

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setChecking(true);
    try {
      const data = await fetchQuote(code, useWallet);
      setQuote(data);
      setQuoteError("");
      setAppliedCode(code);
    } catch (err) {
      setAppliedCode("");
      error(err?.response?.data?.message || "Couldn't validate that coupon");
    } finally {
      setChecking(false);
    }
  }

  function removeCoupon() { setAppliedCode(""); setCouponCode(""); }

  async function finish(payment) {
    try {
      paidRef.current = true;
      const data = await verifyBooking({ payment, creds, lockToken: readJSON("seatLock")?.lockToken || null, token: getToken() });
      sessionStorage.removeItem("seatLock");
      dispatch(removeall());
      notifyWalletChanged();
      setSheet(null);
      navigate(`/booked/${data.order._id}`, { state: { cashback: data.cashback }, replace: true });
    } catch (err) {
      paidRef.current = false;
      setSheet(null);
      setPaying(false);
      notifyWalletChanged();
      error(err?.response?.data?.message || "We couldn't confirm your booking. If money was debited it will be refunded automatically.");
      throw err;
    }
  }

  function dismissCheckout(checkout) {
    if (paidRef.current) return;
    abandonCheckout({ orderId: checkout.id, token: getToken() }).then(() => { notifyWalletChanged(); setQuote((q) => q && { ...q }); });
    setSheet(null);
    setPaying(false);
    fetchQuote(appliedCode, useWallet).then(setQuote).catch(() => {});
  }

  async function submit(e) {
    e.preventDefault();
    if (paying || !quote) return;
    const found = validate();
    const first = Object.keys(found)[0];
    if (first) return document.getElementById(`f-${first}`)?.focus();

    setPaying(true);
    paidRef.current = false;
    try {
      const { data: checkout } = await axios.post(
        `${API_BASE_URL}/api/payment/ticket`,
        { busId: params.id, date, seats, couponCode: appliedCode || undefined, useWallet, from: bus.from, to: bus.to, email: creds.email, name: creds.name },
        authHeader()
      );
      notifyWalletChanged();
      if (checkout.gateway === "demo") return setSheet(checkout);

      const config = await getPaymentConfig();
      openRazorpay({
        keyId: config.keyId || process.env.REACT_APP_RAZORPAY_KEY_ID, checkout, creds, preferred,
        onPaid: (response) => finish(response).catch(() => {}),
        onDismiss: () => dismissCheckout(checkout),
        onFailed: (msg) => { error(msg); dismissCheckout(checkout); },
      });
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't start the payment. Please try again.");
      setPaying(false);
      if (err?.response?.status === 409) fetchQuote(appliedCode, useWallet).then(setQuote).catch(() => {});
    }
  }

  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <input
        id={`f-${name}`} name={name} className="input" value={creds[name]} onChange={set}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `e-${name}` : undefined}
        {...props}
      />
      {errors[name] && <span id={`e-${name}`} className="field-error" role="alert">{errors[name]}</span>}
    </div>
  );

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <span className="eyebrow">Step 2 of 2 · Passenger details</span>
        <h1>Almost there, one quick form.</h1>
      </div>

      {secondsLeft !== null && secondsLeft > 0 && (
        <div className={`${styles.timer} ${urgent ? styles.urgent : ""}`} role="timer" aria-live="off">
          <FiClock size={20} />
          <div>
            <strong>Seats held for <span className="mono">{mmss(secondsLeft)}</span></strong>
            <small>Complete payment before the timer ends or the seats are released.</small>
          </div>
          <div className={styles.track}><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      <div className={styles.layout}>
        <form className={`card ${styles.form}`} onSubmit={submit} noValidate>
          <h2>Passenger</h2>
          <div className={styles.grid2}>
            {field("name", "Full name", { type: "text", autoComplete: "name", placeholder: "As on government ID", ref: nameRef })}
            {field("age", "Age", { type: "number", inputMode: "numeric", min: 1, max: 120, placeholder: "e.g. 28" })}
          </div>

          <fieldset className={styles.genders}>
            <legend className="field-label">Gender</legend>
            <div>
              {[["men", "Male"], ["women", "Female"], ["other", "Other"]].map(([v, l]) => (
                <label key={v} className={creds.gender === v ? styles.on : ""}>
                  <input id={v === "men" ? "f-gender" : undefined} type="radio" name="gender" value={v} checked={creds.gender === v} onChange={set} />
                  {l}
                </label>
              ))}
            </div>
            {errors.gender && <span className="field-error" role="alert">{errors.gender}</span>}
          </fieldset>

          <h2 style={{ marginTop: 28 }}>Contact</h2>
          <p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: -6 }}>Your e-ticket and journey alerts are sent here.</p>
          <div className={styles.grid2}>
            {field("email", "Email", { type: "email", autoComplete: "email", placeholder: "you@example.com" })}
            {field("phone", "Mobile number", { type: "tel", inputMode: "numeric", autoComplete: "tel", placeholder: "10-digit number" })}
          </div>

          <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={paying || !quote} style={{ marginTop: 28 }}>
            {paying ? <><span className="spinner" /> Opening secure payment…</> : <><FiLock size={17} /> Pay {formatINR(total)} <FiArrowRight size={17} /></>}
          </button>
          <PaymentOffers offers={quote?.offers} tier={quote?.tier} selected={preferred} onSelect={setPreferred} />
          <p className={styles.secure}><FiShield size={14} /> {quote?.mode === "demo" ? "Sandbox payments — no real money is charged — verified on our servers." : "Payments are processed by Razorpay and verified on our servers."}</p>
        </form>

        <aside className={`card ${styles.summary}`}>
          <h2>{titleCase(bus.companyname)}</h2>
          <p className="muted">{formatDate(date)}</p>
          <div className={styles.trip}>
            <div><time>{formatHour(bus.departure)}</time><span>{bus.from}</span></div>
            <i />
            <div style={{ textAlign: "right" }}><time>{formatHour(bus.arrival)}</time><span>{bus.to}</span></div>
          </div>
          <div className={styles.seatsRow}>
            <span className="field-label">Seats</span>
            <div>{seats.map((s) => <b key={s} className="mono">{s}</b>)}</div>
          </div>

          <div className={styles.coupon}>
            <label htmlFor="coupon" className="field-label"><FiTag size={13} /> Have a coupon?</label>
            <div>
              <input id="coupon" className="input mono" placeholder="FIRST150" value={couponCode} disabled={Boolean(appliedCode)}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} />
              {appliedCode
                ? <button type="button" className="btn btn-outline" onClick={removeCoupon}>Remove</button>
                : <button type="button" className="btn btn-outline" onClick={applyCoupon} disabled={checking || !couponCode.trim()}>{checking ? <span className="spinner" /> : "Apply"}</button>}
            </div>
            {appliedCode && pricing && <span className={styles.applied}><FiCheck /> {appliedCode} applied — you save {formatINR(pricing.couponDiscount)}</span>}
          </div>

          {quote?.wallet?.balance > 0 && (
            <div className={ck.walletBox}>
              <div>
                <strong><RiWallet3Line /> RaahiGo Wallet · {formatINR(quote.wallet.balance)}</strong>
                <small>{quote.wallet.usable > 0 ? `Use up to ${formatINR(quote.wallet.usable)} on this booking` : "Nothing usable on this booking"}</small>
              </div>
              <button type="button" role="switch" aria-checked={useWallet} aria-label="Pay part with wallet balance"
                className={ck.switch} disabled={quote.wallet.usable <= 0} onClick={() => setUseWallet((v) => !v)} />
            </div>
          )}

          {pricing ? (
            <dl className={styles.fare}>
              <div><dt>Fare ({seats.length} seat{seats.length > 1 ? "s" : ""})</dt><dd>{formatINR(pricing.fare)}</dd></div>
              {pricing.couponDiscount > 0 && <div className={styles.save}><dt>Coupon discount</dt><dd>−{formatINR(pricing.couponDiscount)}</dd></div>}
              {pricing.walletUsed > 0 && <div className={styles.save}><dt>RaahiGo Wallet</dt><dd>−{formatINR(pricing.walletUsed)}</dd></div>}
              <div className={styles.total}><dt>Total payable</dt><dd>{formatINR(pricing.payable)}</dd></div>
            </dl>
          ) : (
            <div className="skel" style={{ height: 110, borderRadius: 12 }} />
          )}
          {quoteError && <p className="field-error" role="alert">{quoteError}</p>}
          {quote?.offers && (() => {
            const top = Math.max(0, ...quote.offers.map((o) => o.cashback));
            return top > 0 ? <p className={ck.earn}><FiGift /> Earn up to {formatINR(top)} cashback on this payment</p> : null;
          })()}
        </aside>
      </div>

      <DemoPaymentSheet
        open={Boolean(sheet)} initialMethod={preferred} amount={sheet?.pricing?.payable ?? total} offers={sheet?.offers || quote?.offers}
        onClose={() => sheet && dismissCheckout(sheet)}
        onPay={async (method) => {
          const payment = await demoAuthorise({ orderId: sheet.id, method, token: getToken() });
          await finish(payment);
        }}
      />
    </div>
  );
}
