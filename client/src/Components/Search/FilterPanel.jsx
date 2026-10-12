import { useState, useEffect } from "react";
import { FiChevronDown } from "react-icons/fi";
import styles from "../../Styles/search.module.css";

const TIME_WINDOWS = [
  { key: "BEFORE_6", label: "Before 6 AM" },
  { key: "6_TO_12", label: "6 AM – 12 PM" },
  { key: "12_TO_18", label: "12 PM – 6 PM" },
  { key: "AFTER_18", label: "After 6 PM" },
];
const AMENITY_LABELS = { WIFI: "Wi-Fi", CHARGING_POINT: "Charging point", AC: "AC", NONAC: "Non-AC", SLEEPER: "Sleeper", SEATER: "Seater" };
const TYPE_TAGS = ["AC", "NONAC", "SLEEPER", "SEATER"];

export const emptyFilters = {
  busType: [], seatType: [], amenities: [], operators: [],
  departureWindows: [], arrivalWindows: [],
  minPrice: null, maxPrice: null, minRating: null, maxDurationHours: null,
};

export function countActive(f) {
  return (
    f.busType.length + f.seatType.length + f.amenities.length + f.operators.length +
    f.departureWindows.length + f.arrivalWindows.length +
    (f.maxPrice != null ? 1 : 0) + (f.minRating != null ? 1 : 0) + (f.maxDurationHours != null ? 1 : 0)
  );
}

function Group({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className={styles.group}>
      <legend className="sr-only">{title}</legend>
      <button type="button" className={styles.groupHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title}
        <FiChevronDown size={16} className={open ? styles.flip : ""} />
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </fieldset>
  );
}

function Check({ checked, onChange, label }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export default function FilterPanel({ facets, filters, onChange, onReset, resultCount, id = "filters" }) {
  const [priceMax, setPriceMax] = useState(filters.maxPrice ?? facets?.priceRange?.max ?? 0);

  useEffect(() => {
    if (facets?.priceRange?.max != null && filters.maxPrice == null) setPriceMax(facets.priceRange.max);
  }, [facets, filters.maxPrice]);

  function toggleIn(list, value) {
    const cur = filters[list] || [];
    onChange({ ...filters, [list]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  }
  const commitPrice = () => onChange({ ...filters, maxPrice: priceMax });

  const extra = (facets?.amenities || []).filter((a) => !TYPE_TAGS.includes(a));
  const active = countActive(filters);
  const hasPriceRange = facets?.priceRange?.max > facets?.priceRange?.min;

  return (
    <div className={styles.filters} id={id}>
      <div className={styles.filtersTop}>
        <div>
          <h2>Filters</h2>
          <span>{resultCount} {resultCount === 1 ? "bus" : "buses"}</span>
        </div>
        {active > 0 && <button type="button" className={styles.clear} onClick={onReset}>Clear all ({active})</button>}
      </div>

      <Group title="Bus type">
        <Check label="AC" checked={filters.busType.includes("AC")} onChange={() => toggleIn("busType", "AC")} />
        <Check label="Non-AC" checked={filters.busType.includes("NONAC")} onChange={() => toggleIn("busType", "NONAC")} />
      </Group>

      <Group title="Seat type">
        <Check label="Sleeper" checked={filters.seatType.includes("SLEEPER")} onChange={() => toggleIn("seatType", "SLEEPER")} />
        <Check label="Seater" checked={filters.seatType.includes("SEATER")} onChange={() => toggleIn("seatType", "SEATER")} />
      </Group>

      {hasPriceRange && (
        <Group title="Max fare">
          <div className={styles.priceRow}>
            <span>₹{facets.priceRange.min}</span>
            <strong>₹{priceMax}</strong>
          </div>
          <input
            type="range"
            aria-label="Maximum fare"
            min={facets.priceRange.min}
            max={facets.priceRange.max}
            value={priceMax}
            onChange={(e) => setPriceMax(Number(e.target.value))}
            onMouseUp={commitPrice}
            onTouchEnd={commitPrice}
            onKeyUp={commitPrice}
            className={styles.range}
          />
        </Group>
      )}

      <Group title="Departure time">
        {TIME_WINDOWS.map((w) => (
          <Check key={w.key} label={w.label} checked={filters.departureWindows.includes(w.key)} onChange={() => toggleIn("departureWindows", w.key)} />
        ))}
      </Group>

      <Group title="Arrival time" defaultOpen={false}>
        {TIME_WINDOWS.map((w) => (
          <Check key={w.key} label={w.label} checked={filters.arrivalWindows.includes(w.key)} onChange={() => toggleIn("arrivalWindows", w.key)} />
        ))}
      </Group>

      <Group title="Minimum rating" defaultOpen={false}>
        {[4, 3.5, 3].map((r) => (
          <Check key={r} label={`${r}★ and above`} checked={filters.minRating === r}
            onChange={() => onChange({ ...filters, minRating: filters.minRating === r ? null : r })} />
        ))}
      </Group>

      {extra.length > 0 && (
        <Group title="Amenities" defaultOpen={false}>
          {extra.map((a) => (
            <Check key={a} label={AMENITY_LABELS[a] || a} checked={filters.amenities.includes(a)} onChange={() => toggleIn("amenities", a)} />
          ))}
        </Group>
      )}

      {(facets?.operators || []).length > 1 && (
        <Group title="Operator" defaultOpen={false}>
          {facets.operators.map((op) => (
            <Check key={op} label={op} checked={filters.operators.includes(op)} onChange={() => toggleIn("operators", op)} />
          ))}
        </Group>
      )}
    </div>
  );
}
