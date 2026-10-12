import { useEffect, useState } from "react";
import axios from "axios";
import { FiMap, FiClock, FiTrendingUp, FiFeather, FiNavigation, FiTag } from "react-icons/fi";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import { formatINR } from "../../lib/format";
import styles from "../../Styles/wallet.module.css";

/** Journey Passport: lifetime stats computed on the server from the traveller's own bookings. */
export default function Passport() {
  const [p, setP] = useState(null);

  useEffect(() => { axios.get(`${API_BASE_URL}/profile/passport`, authHeader()).then(({ data }) => setP(data)).catch(() => setP(false)); }, []);

  if (p === false) return <p className="field-error">Couldn't load your passport.</p>;
  if (!p) return <div className="skel" style={{ height: 180, borderRadius: 20 }} />;
  if (!p.trips) return <p className={styles.empty}>Take your first trip and your passport will start filling up with stamps, kilometres and savings.</p>;

  const stats = [
    { icon: FiNavigation, label: "Trips", value: p.trips, hint: p.upcoming ? `${p.upcoming} coming up` : "all travelled" },
    { icon: FiMap, label: "Cities", value: p.cities.length, hint: p.cities.slice(0, 3).join(" · ") },
    { icon: FiClock, label: "Hours on road", value: p.hoursOnRoad, hint: `≈ ${p.kmTravelled.toLocaleString("en-IN")} km` },
    { icon: FiTag, label: "Saved", value: formatINR(p.saved), hint: "coupons + cashback" },
    { icon: FiFeather, label: "CO₂ avoided", value: `${p.co2SavedKg} kg`, hint: "vs. driving alone (est.)" },
    { icon: FiTrendingUp, label: "Spent", value: formatINR(p.spent), hint: `${p.seats} seat${p.seats === 1 ? "" : "s"} booked` },
  ];

  return (
    <div>
      <ul className={styles.stats}>
        {stats.map(({ icon: Icon, label, value, hint }) => (
          <li key={label}><Icon size={18} /><strong>{value}</strong><span>{label}</span><small>{hint}</small></li>
        ))}
      </ul>
      {(p.topRoute || p.topOperator) && (
        <p className={styles.fav}>
          {p.topRoute && <>Favourite route: <b>{p.topRoute.route}</b> ({p.topRoute.trips}×). </>}
          {p.topOperator && <>Most-used operator: <b>{p.topOperator.name}</b>.</>}
        </p>
      )}
      {p.cities.length > 0 && <div className={styles.stamps}>{p.cities.map((c) => <span key={c}>{c}</span>)}</div>}
    </div>
  );
}
