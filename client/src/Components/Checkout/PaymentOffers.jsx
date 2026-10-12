import { FiZap, FiCheck, FiCreditCard, FiSmartphone, FiGlobe } from "react-icons/fi";
import { RiWallet3Line } from "react-icons/ri";
import { formatINR } from "../../lib/format";
import styles from "../../Styles/checkout.module.css";

export const METHOD_ICON = { UPI: FiSmartphone, CARD: FiCreditCard, NETBANKING: FiGlobe, WALLET: RiWallet3Line };

/** Cashback each payment method earns on this booking — the same numbers the server will credit. */
export default function PaymentOffers({ offers = [], tier, selected = null, onSelect }) {
  if (!offers.length) return null;
  const best = Math.max(...offers.map((o) => o.cashback));
  return (
    <section className={styles.offers} aria-label="Payment offers">
      <header>
        <h3><FiZap aria-hidden="true" /> Cashback on every payment</h3>
        {tier && tier !== "Explorer" && <span className="badge badge-brand">{tier} bonus included</span>}
      </header>
      <ul role="radiogroup" aria-label="Preferred payment method">
        {offers.map((o) => {
          const Icon = METHOD_ICON[o.method] || FiCreditCard;
          const on = selected === o.method;
          return (
            <li key={o.method}>
              <button
                type="button" role="radio" aria-checked={on}
                className={`${styles.offerBtn} ${o.eligible ? "" : styles.dim} ${on ? styles.offerOn : ""} ${!on && o.eligible && o.cashback === best ? styles.best : ""}`}
                onClick={() => onSelect?.(on ? null : o.method)}
              >
                <span className={styles.offIcon}><Icon size={17} /></span>
                <span className={styles.offText}>
                  <strong>{o.label}</strong>
                  <small>{o.eligible ? o.blurb : o.reason}</small>
                </span>
                <span className={styles.offGain}>
                  {o.eligible ? <><b>{formatINR(o.cashback)}</b><i>{o.percent}% back</i></> : <i>—</i>}
                </span>
                <span className={styles.offTick} aria-hidden="true">{on ? <FiCheck size={14} /> : null}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p>{selected ? "Great choice — we'll open checkout with this method ready. " : "Tap a method to pay with it and lock in that cashback. "}Cashback lands in your RaahiGo Wallet the moment payment succeeds, based on the method you actually pay with.</p>
    </section>
  );
}
