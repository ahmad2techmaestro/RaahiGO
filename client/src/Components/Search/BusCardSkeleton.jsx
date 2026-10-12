import styles from "../../Styles/search.module.css";

export default function BusCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.cardMain} style={{ display: "grid", gap: 16 }}>
        <div className="skel" style={{ height: 22, width: "40%" }} />
        <div className="skel" style={{ height: 40, width: "85%" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <div className="skel" style={{ height: 24, width: 64, borderRadius: 99 }} />
          <div className="skel" style={{ height: 24, width: 64, borderRadius: 99 }} />
          <div className="skel" style={{ height: 24, width: 64, borderRadius: 99 }} />
        </div>
      </div>
      <div className={styles.cardSide} style={{ gap: 12 }}>
        <div className="skel" style={{ height: 34, width: 90 }} />
        <div className="skel" style={{ height: 44, width: "100%", borderRadius: 10 }} />
      </div>
    </div>
  );
}
