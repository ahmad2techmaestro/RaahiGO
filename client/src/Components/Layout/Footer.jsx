import { Link } from "react-router-dom";
import { FiGithub, FiLinkedin } from "react-icons/fi";
import { Brand } from "../../ui/Icons";
import { searchPath, toISODate } from "../../lib/format";
import styles from "../../Styles/footer.module.css";

const ROUTES = [
  ["Mumbai", "Pune"],
  ["Delhi", "Jaipur"],
  ["Bengaluru", "Chennai"],
  ["Hyderabad", "Bengaluru"],
  ["Ahmedabad", "Mumbai"],
  ["Kolkata", "Patna"],
];

export default function Footer() {
  const today = toISODate();
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.about}>
            <Brand light size={38} />
            <p>
              Intercity bus travel across India — live seat maps, secure checkout and real-time tracking, designed to
              feel calm from search to arrival.
            </p>
            <div className={styles.status}>
              <span className={styles.pulse} aria-hidden="true" /> All systems normal
            </div>
          </div>

          <nav aria-label="Popular routes">
            <h4>Popular routes</h4>
            <ul>
              {ROUTES.map(([a, b]) => (
                <li key={a + b}>
                  <Link to={searchPath(a, b, today)}>
                    {a} <span>→</span> {b}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Account">
            <h4>Your account</h4>
            <ul>
              <li><Link to="/myticket">My trips</Link></li>
              <li><Link to="/profile">Profile & rewards</Link></li>
              <li><Link to="/signup">Create account</Link></li>
              <li><Link to="/operator">Become a partner</Link></li>
            </ul>
          </nav>

        </div>

        <div className={styles.bottom}>
          <span>
            © {new Date().getFullYear()} RaahiGo · Designed &amp; built by{" "}
            <a href="https://www.linkedin.com/in/shah-ahmad-raza-62a72722" target="_blank" rel="noreferrer" className={styles.author}>Shah Ahmad Raza</a>
          </span>
          <span className={styles.social}>
            <a href="https://github.com/ahmad2techmaestro" target="_blank" rel="noreferrer" aria-label="GitHub"><FiGithub size={18} /></a>
            <a href="https://www.linkedin.com/in/shah-ahmad-raza-62a72722" target="_blank" rel="noreferrer" aria-label="LinkedIn"><FiLinkedin size={18} /></a>
          </span>
          <span className={styles.stack}>React · Node · MongoDB · Redis · Socket.IO</span>
        </div>
      </div>
    </footer>
  );
}
