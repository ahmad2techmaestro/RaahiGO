import styles from "../Styles/pageheader.module.css";

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className={styles.wrap}>
      <div className="container">
        <div className={styles.inner}>
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.sub}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </div>
    </header>
  );
}
