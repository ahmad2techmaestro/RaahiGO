import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { AnimatePresence, motion } from "framer-motion";
import { FiSun, FiMoon, FiMenu, FiX, FiUser, FiLogOut, FiBriefcase, FiShield } from "react-icons/fi";
import { Brand } from "../../ui/Icons";
import { useTheme } from "../../context/ThemeContext";
import { logoutAPI } from "../../Redux/authentication/auth.action";
import { clearSession, getEmail, getRole } from "../../lib/session";
import { useWalletBalance } from "../../lib/wallet";
import { formatINR } from "../../lib/format";
import { RiWallet3Line } from "react-icons/ri";
import { success } from "../../Utils/notification";
import styles from "../../Styles/navbar.module.css";

export default function Navbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const token = useSelector((s) => s.auth.data.token);
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  const walletBalance = useWalletBalance(Boolean(token));
  const role = token ? getRole() : null;
  const email = token ? getEmail() : "";
  const initial = (email[0] || "U").toUpperCase();
  const overHero = pathname === "/" && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    const esc = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  function logout() {
    clearSession();
    dispatch(logoutAPI());
    navigate("/");
    success("You've been signed out");
  }

  const links = [
    { to: "/", label: "Search", end: true },
    { to: "/myticket", label: "My trips" },
    ...(token ? [{ to: "/operator", label: "Partner" }] : []),
    ...(role === "ADMIN" ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ""} ${overHero ? styles.overHero : ""}`}>
      <div className={`container ${styles.bar}`}>
        <Link to="/" className={styles.brand} aria-label="RaahiGo home">
          <Brand light={overHero} />
        </Link>

        <nav className={styles.links} aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.right}>
          <button
            className={styles.iconBtn}
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <FiSun size={17} /> : <FiMoon size={17} />}
          </button>

          {token && walletBalance !== null && (
            <Link to="/profile#wallet" className={styles.wallet} aria-label={`Wallet balance ${formatINR(walletBalance)}`}>
              <RiWallet3Line size={16} /> {formatINR(walletBalance)}
            </Link>
          )}

          {token ? (
            <div className={styles.userWrap} ref={menuRef}>
              <button
                className={styles.avatar}
                onClick={() => setMenu((m) => !m)}
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label="Account menu"
              >
                {initial}
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    className={styles.menu}
                    role="menu"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.14 }}
                  >
                    <div className={styles.menuHead}>
                      <strong>{email || "Traveller"}</strong>
                      <span>{role === "ADMIN" ? "Administrator" : role === "OPERATOR" ? "Bus operator" : "Passenger"}</span>
                    </div>
                    <Link to="/profile" role="menuitem"><FiUser /> Profile & rewards</Link>
                    <Link to="/profile#wallet" role="menuitem"><RiWallet3Line /> Wallet & cashback</Link>
                    <Link to="/myticket" role="menuitem"><FiBriefcase /> My trips</Link>
                    {role === "ADMIN" && <Link to="/admin" role="menuitem"><FiShield /> Admin console</Link>}
                    <button role="menuitem" onClick={logout}><FiLogOut /> Sign out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className={styles.auth}>
              <Link to="/signin" className={styles.signin}>Sign in</Link>
              <Link to="/signup" className="btn btn-accent btn-sm">Create account</Link>
            </div>
          )}

          <button
            className={`${styles.iconBtn} ${styles.burger}`}
            onClick={() => setDrawer((d) => !d)}
            aria-label={drawer ? "Close menu" : "Open menu"}
            aria-expanded={drawer}
          >
            {drawer ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {drawer && (
          <motion.nav
            className={styles.drawer}
            aria-label="Mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={styles.drawerLink}>
                {l.label}
              </NavLink>
            ))}
            {token ? (
              <>
                <NavLink to="/profile" className={styles.drawerLink}>Profile & rewards</NavLink>
                <button className={styles.drawerLink} onClick={logout}>Sign out</button>
              </>
            ) : (
              <div className={styles.drawerCta}>
                <Link to="/signin" className="btn btn-outline">Sign in</Link>
                <Link to="/signup" className="btn btn-accent">Create account</Link>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
