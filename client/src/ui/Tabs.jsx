import { useRef } from "react";

/** Roving-tabindex tablist (←/→/Home/End) — no external JS needed. */
export default function Tabs({ tabs, value, onChange, label = "Sections" }) {
  const refs = useRef([]);

  function onKeyDown(e, i) {
    const last = tabs.length - 1;
    let next = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => (refs.current[i] = el)}
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={value === t.key}
          aria-controls={`panel-${t.key}`}
          tabIndex={value === t.key ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.key)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
