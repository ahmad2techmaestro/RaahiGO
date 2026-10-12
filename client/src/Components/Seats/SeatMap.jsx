import { memo } from "react";
import { motion } from "framer-motion";
import { GiSteeringWheel } from "react-icons/gi";
import styles from "../../Styles/bookseat.module.css";

/** Seat numbering matches the booking API: lower deck 1–5 / 11–20, upper deck 6–10 / 21–30. */
export const DECKS = [
  { key: "lower", name: "Lower deck", rows: [[1, 2, 3, 4, 5], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20]] },
  { key: "upper", name: "Upper deck", rows: [[6, 7, 8, 9, 10], [21, 22, 23, 24, 25], [26, 27, 28, 29, 30]] },
];
export const ALL_SEATS = DECKS.flatMap((d) => d.rows.flat());

const Seat = memo(function Seat({ id, state, onToggle }) {
  const label =
    state === "selected" ? `Seat ${id}, selected. Press to deselect`
    : state === "unavailable" ? `Seat ${id}, unavailable`
    : `Seat ${id}, available. Press to select`;
  return (
    <motion.button
      type="button"
      className={`${styles.seat} ${styles[state]}`}
      disabled={state === "unavailable"}
      aria-pressed={state === "selected"}
      aria-label={label}
      onClick={() => onToggle(id)}
      whileTap={state === "unavailable" ? undefined : { scale: 0.9 }}
      animate={state === "selected" ? { y: -2 } : { y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
    >
      <span className={styles.berth} aria-hidden="true" />
      <span className={styles.seatNo}>{id}</span>
    </motion.button>
  );
});

export default function SeatMap({ isUnavailable, selected, onToggle }) {
  const sel = new Set(selected.map(Number));
  return (
    <div className={styles.decks}>
      {DECKS.map((deck, di) => (
        <section key={deck.key} className={styles.deck} aria-label={deck.name}>
          <header className={styles.deckHead}>
            <h3>{deck.name}</h3>
            {di === 0 && <span className={styles.front}><GiSteeringWheel size={20} /> Front</span>}
          </header>
          <div className={styles.shell}>
            {deck.rows.map((row, ri) => (
              <div key={ri} className={`${styles.row} ${ri === 0 ? styles.rowTop : ""}`}>
                {row.map((id) => (
                  <Seat
                    key={id}
                    id={id}
                    state={isUnavailable(id) ? "unavailable" : sel.has(id) ? "selected" : "open"}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
