import { FiCheck } from "react-icons/fi";
import { Brand } from "../../ui/Icons";
import RouteArt from "../Landing/RouteArt";
import styles from "../../Styles/auth.module.css";

const POINTS = [
  "Hold seats for 10 minutes while you pay",
  "Track every journey on a live map",
  "Earn loyalty points on each booking",
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className={styles.wrap}>
      <aside className={styles.art}>
        <RouteArt />
        <div className={styles.artInner}>
          <Brand light size={40} />
          <h2>Travel that starts <em>calm</em> and stays that way.</h2>
          <ul>{POINTS.map((p) => <li key={p}><FiCheck size={16} /> {p}</li>)}</ul>
        </div>
      </aside>
      <section className={styles.panel}>
        <div className={styles.card}>
          <h1>{title}</h1>
          <p className={styles.sub}>{subtitle}</p>
          {children}
          <div className={styles.foot}>{footer}</div>
        </div>
      </section>
    </div>
  );
}
