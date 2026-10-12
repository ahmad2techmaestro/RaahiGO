import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { FiCheckCircle, FiXCircle, FiAlertCircle } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { formatDate } from "../lib/format";
import { Brand } from "../ui/Icons";
import styles from "../Styles/verify.module.css";

export default function VerifyTicket() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState("loading");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    document.title = "Ticket verification · RaahiGo";
    axios
      .get(`${API_BASE_URL}/verify/${orderId}`, { params: { token } })
      .then(({ data }) => { setResult(data); setState("valid"); })
      .catch((err) => { setErrorMsg(err?.response?.data?.message || "We couldn't verify this ticket"); setState("invalid"); });
  }, [orderId, token]);

  const confirmed = result?.status === "CONFIRMED";
  const rows = result && [
    ["Passenger", result.passengerName], ["Route", result.route], ["Operator", result.operator],
    ["Date", formatDate(result.journeyDate)], ["Seat(s)", result.seats], ["Booking ID", `#${String(result.bookingId).slice(-8).toUpperCase()}`],
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.card} aria-live="polite">
        <Brand size={30} />
        {state === "loading" && <div className={styles.center}><div className="spinner" style={{ width: 28, height: 28, color: "var(--brand)" }} /><p>Verifying ticket…</p></div>}

        {state === "invalid" && (
          <div className={styles.center}>
            <span className={`${styles.icon} ${styles.bad}`}><FiXCircle size={34} /></span>
            <h1>Not a valid ticket</h1>
            <p>{errorMsg}</p>
          </div>
        )}

        {state === "valid" && result && (
          <div className={styles.center}>
            <span className={`${styles.icon} ${confirmed ? styles.ok : styles.warn}`}>{confirmed ? <FiCheckCircle size={34} /> : <FiAlertCircle size={34} />}</span>
            <h1>{confirmed ? "Valid ticket" : `Booking ${String(result.status).toLowerCase()}`}</h1>
            <dl className={styles.rows}>
              {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
