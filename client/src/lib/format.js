/** Shared formatting helpers — one implementation instead of four copies. */

export function formatHour(h) {
  const hour = Number(h);
  if (h === null || h === undefined || h === "" || Number.isNaN(hour)) return "--:--";
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(display).padStart(2, "0")}:00 ${suffix}`;
}

export function formatDate(d, opts) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function formatINR(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return "₹0";
  return `₹${num.toLocaleString("en-IN")}`;
}

export function titleCase(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Local-date ISO string (yyyy-mm-dd) — avoids the UTC off-by-one of toISOString(). */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function mmss(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function searchPath(from, to, date, extra = {}) {
  const q = new URLSearchParams({ from, to, date: date || toISODate() });
  // Optional filters carried over from the AI planner; the search page reads them back with filtersFromParams().
  const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(",") : "");
  if (extra.maxPrice != null) q.set("maxPrice", String(extra.maxPrice));
  if (extra.minRating != null) q.set("minRating", String(extra.minRating));
  if (list(extra.busType)) q.set("busType", list(extra.busType));
  if (list(extra.seatType)) q.set("seatType", list(extra.seatType));
  if (list(extra.departureWindows)) q.set("dep", list(extra.departureWindows));
  if (list(extra.arrivalWindows)) q.set("arr", list(extra.arrivalWindows));
  if (extra.sortBy && extra.sortBy !== "departure") q.set("sort", `${extra.sortBy}:${extra.sortBy === "rating" ? "desc" : "asc"}`);
  return `/selectbus?${q.toString()}`;
}

/** Passenger gender is stored as men / women / other; show it the way people say it. */
export function genderLabel(g) {
  return { men: "Male", women: "Female", other: "Other" }[String(g || "").toLowerCase()] || titleCase(g || "");
}
