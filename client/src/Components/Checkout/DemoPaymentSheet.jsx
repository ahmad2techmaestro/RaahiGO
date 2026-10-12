import { useEffect, useState } from "react";
import { FiLock, FiCheck, FiShield } from "react-icons/fi";
import Modal from "../../ui/Modal";
import { formatINR } from "../../lib/format";
import { METHOD_ICON } from "./PaymentOffers";
import styles from "../../Styles/checkout.module.css";

const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank"];
const WALLETS = ["Paytm", "Amazon Pay", "MobiKwik", "PhonePe Wallet"];
const UPI_APPS = ["@okhdfcbank", "@oksbi", "@ybl", "@paytm"];

const digits = (v, n) => v.replace(/\D/g, "").slice(0, n);
const luhn = (num) => {
  let sum = 0;
  [...num].reverse().forEach((c, i) => { let d = Number(c); if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; });
  return num.length >= 12 && sum % 10 === 0;
};

/**
 * Sandbox payment sheet used when the server runs in demo mode: it walks through a realistic
 * UPI / card / net-banking / wallet flow without any real money or real card data leaving the page.
 */
export default function DemoPaymentSheet({ open, amount, offers = [], initialMethod = null, title = "Secure payment", onClose, onPay }) {
  const [method, setMethod] = useState("UPI");
  const [state, setState] = useState("idle"); // idle | processing | done
  const [form, setForm] = useState({ vpa: "", card: "", exp: "", cvv: "", holder: "", bank: BANKS[0], wallet: WALLETS[0] });
  const [err, setErr] = useState("");

  useEffect(() => { if (open) { setState("idle"); setErr(""); if (initialMethod) setMethod(initialMethod); } }, [open, initialMethod]);

  const set = (k) => (e) => { setErr(""); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const offer = offers.find((o) => o.method === method);
  const methods = ["UPI", "CARD", "NETBANKING", "WALLET"].map((m) => offers.find((o) => o.method === m) || { method: m, label: m });

  function validate() {
    if (method === "UPI" && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(form.vpa.trim())) return "Enter a valid UPI ID, e.g. name@okhdfcbank";
    if (method === "CARD") {
      if (!luhn(digits(form.card, 19))) return "Enter a valid card number (try 4111 1111 1111 1111)";
      if (!/^(0[1-9]|1[0-2])\/?\d{2}$/.test(form.exp.replace(/\s/g, ""))) return "Enter the expiry as MM/YY";
      if (digits(form.cvv, 4).length < 3) return "Enter the 3-digit CVV";
    }
    return "";
  }

  async function pay() {
    const problem = validate();
    if (problem) return setErr(problem);
    setState("processing");
    try {
      await new Promise((r) => setTimeout(r, 1300)); // the "talking to your bank" beat
      await onPay(method);
      setState("done");
    } catch {
      setState("idle");
    }
  }

  const busy = state !== "idle";

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} width={520}>
      <div className={styles.sheet}>
        <div className={styles.sheetTop}>
          <span><FiShield size={14} /> Sandbox gateway · no real money moves</span>
          <strong>{formatINR(amount)}</strong>
        </div>

        <div className={styles.methods} role="tablist" aria-label="Payment method">
          {methods.map((m) => {
            const Icon = METHOD_ICON[m.method];
            return (
              <button key={m.method} role="tab" aria-selected={method === m.method} disabled={busy}
                className={method === m.method ? styles.methodOn : ""} onClick={() => { setMethod(m.method); setErr(""); }}>
                <Icon size={17} />
                <span>{m.method === "NETBANKING" ? "Net banking" : m.method === "WALLET" ? "Wallets" : m.method === "CARD" ? "Card" : "UPI"}</span>
                {m.eligible && <em>{formatINR(m.cashback)} back</em>}
              </button>
            );
          })}
        </div>

        <div className={styles.methodBody}>
          {method === "UPI" && (
            <div className="field">
              <label htmlFor="d-vpa">UPI ID</label>
              <input id="d-vpa" className="input" value={form.vpa} onChange={set("vpa")} placeholder="yourname@okhdfcbank" autoComplete="off" disabled={busy} />
              <div className={styles.chips}>
                {UPI_APPS.map((s) => (
                  <button type="button" key={s} onClick={() => setForm((f) => ({ ...f, vpa: `${f.vpa.split("@")[0] || "traveller"}${s}` }))} disabled={busy}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {method === "CARD" && (
            <div className={styles.cardForm}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="d-card">Card number</label>
                <input id="d-card" className="input mono" inputMode="numeric" placeholder="4111 1111 1111 1111" disabled={busy}
                  value={digits(form.card, 19).replace(/(.{4})/g, "$1 ").trim()} onChange={(e) => { setErr(""); setForm((f) => ({ ...f, card: e.target.value })); }} />
              </div>
              <div className="field"><label htmlFor="d-exp">Expiry</label>
                <input id="d-exp" className="input mono" placeholder="MM/YY" maxLength={5} disabled={busy} value={form.exp}
                  onChange={(e) => { const d = digits(e.target.value, 4); setErr(""); setForm((f) => ({ ...f, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d })); }} /></div>
              <div className="field"><label htmlFor="d-cvv">CVV</label>
                <input id="d-cvv" className="input mono" type="password" inputMode="numeric" placeholder="•••" maxLength={4} disabled={busy} value={form.cvv}
                  onChange={(e) => { setErr(""); setForm((f) => ({ ...f, cvv: digits(e.target.value, 4) })); }} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="d-holder">Name on card</label>
                <input id="d-holder" className="input" value={form.holder} onChange={set("holder")} autoComplete="off" disabled={busy} /></div>
            </div>
          )}
          {method === "NETBANKING" && (
            <div className="field"><label htmlFor="d-bank">Choose your bank</label>
              <select id="d-bank" className="select" value={form.bank} onChange={set("bank")} disabled={busy}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></div>
          )}
          {method === "WALLET" && (
            <div className="field"><label htmlFor="d-wallet">Choose a wallet</label>
              <select id="d-wallet" className="select" value={form.wallet} onChange={set("wallet")} disabled={busy}>{WALLETS.map((b) => <option key={b}>{b}</option>)}</select></div>
          )}

          <p className={styles.gain} data-on={offer?.eligible ? "1" : "0"}>
            {offer?.eligible
              ? <><FiCheck /> You'll earn <b>{formatINR(offer.cashback)}</b> cashback ({offer.percent}%) with this method</>
              : offer?.reason || "No cashback for this method"}
          </p>
          {err && <p className="field-error" role="alert">{err}</p>}
        </div>

        <button className="btn btn-accent btn-lg btn-block" onClick={pay} disabled={busy}>
          {state === "processing" ? <><span className="spinner" /> Authorising with your bank…</>
            : state === "done" ? <><FiCheck /> Payment successful</>
            : <><FiLock size={16} /> Pay {formatINR(amount)}</>}
        </button>
        <p className={styles.sheetNote}>Demo mode: card details are checked in your browser only and never sent anywhere.</p>
      </div>
    </Modal>
  );
}
