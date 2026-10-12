import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiMapPin } from "react-icons/fi";
import { loadCities } from "../../lib/cities";
import styles from "../../Styles/landing.module.css";

/** Instant, keyboard-navigable city combobox (list is cached client-side). */
export default function CityField({ label, value, onChange, placeholder, icon, inputRef }) {
  const id = useId();
  const [cities, setCities] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);

  useEffect(() => {
    loadCities().then(setCities);
  }, []);

  useEffect(() => {
    const away = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
    return list.slice(0, 7);
  }, [cities, value]);

  useEffect(() => { setActive(0); }, [value]);

  function pick(c) {
    onChange(c.name);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) return setOpen(true);
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); pick(results[active]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className={styles.cityField} ref={wrap}>
      <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
      <div className={styles.fieldBox}>
        <span className={styles.fieldIcon}>{icon || <FiMapPin size={18} />}</span>
        <input
          id={id}
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
        />
      </div>
      {open && results.length > 0 && (
        <ul id={`${id}-list`} className={styles.suggest} role="listbox">
          {results.map((c, i) => (
            <li
              key={c.name}
              role="option"
              aria-selected={i === active}
              className={i === active ? styles.suggestActive : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
            >
              <FiMapPin size={15} />
              <span><strong>{c.name}</strong>{c.state && <em>{c.state}</em>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
