import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_BASE_URL } from "../../config/api";
import { authHeader } from "../../lib/session";
import styles from "../../Styles/tracking.module.css";

// CRA's bundler doesn't resolve Leaflet's default marker image paths —
// this rebuilds the default icon from the package's own bundled assets.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const busIcon = new L.DivIcon({
  html: '<div class="rg-bus-marker"><span>🚌</span></div>',
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const POLL_INTERVAL_MS = 10000;

export default function LiveTrackingMap({ orderId }) {
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTracking() {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/tracking/${orderId}`, authHeader());
        if (!cancelled) {
          setInfo(data);
          setErrorMsg("");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.response?.data?.message || "Could not load tracking info");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTracking();
    intervalRef.current = setInterval(fetchTracking, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [orderId]);

  if (loading) return <div className="skel" style={{ height: 360, borderRadius: 16 }} />;
  if (errorMsg) return <div className={styles.state}>{errorMsg}</div>;
  if (!info?.trackingAvailable) {
    return (
      <div className={styles.state}>
        {info?.reason || "Tracking is not available for this journey yet."}
      </div>
    );
  }

  const { currentPosition, from, to, progress, distanceRemainingKm, etaMinutes, delayMinutes, status, startsInMinutes } = info;
  const scheduled = startsInMinutes != null && startsInMinutes > 0;
  const fmtMins = (m) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  const center = [currentPosition.lat, currentPosition.lng];
  const route = [
    [from.coordinates.lat, from.coordinates.lng],
    [to.coordinates.lat, to.coordinates.lng],
  ];

  return (
    <div>
      <div className={styles.disclosure}>{info.disclosure}</div>

      <MapContainer center={scheduled ? [(route[0][0] + route[1][0]) / 2, (route[0][1] + route[1][1]) / 2] : center} zoom={scheduled ? 5 : 6} scrollWheelZoom={false} className={styles.map}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={route} pathOptions={{ color: "#0d4a42", weight: 3, dashArray: "2 9", lineCap: "round" }} />
        <Marker position={route[0]}>
          <Popup>{from.name} (departure)</Popup>
        </Marker>
        <Marker position={route[1]}>
          <Popup>{to.name} (destination)</Popup>
        </Marker>
        <Marker position={center} icon={busIcon}>
          <Popup>Bus — {Math.round(progress * 100)}% of the way there</Popup>
        </Marker>
      </MapContainer>

      <div className={styles.stats}>
        <div>
          <span className={styles.label}>Status</span>
          <span
            className={styles.value}
            style={{ color: status === "DELAYED" ? "var(--warn)" : "var(--success)" }}
          >
            {scheduled ? `Departs in ${fmtMins(startsInMinutes)}` : status === "ON_SCHEDULE" ? "On schedule" : status === "DELAYED" ? `Delayed ${delayMinutes} min` : "Arrived"}
          </span>
        </div>
        <div>
          <span className={styles.label}>Distance remaining</span>
          <span className={styles.value}>{distanceRemainingKm} km</span>
        </div>
        <div>
          <span className={styles.label}>ETA</span>
          <span className={styles.value}>
            {scheduled ? "After departure" : etaMinutes > 60 ? `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m` : `${etaMinutes}m`}
          </span>
        </div>
        <div>
          <span className={styles.label}>Progress</span>
          <span className={styles.value}>{Math.round(progress * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
