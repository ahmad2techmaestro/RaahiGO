import axios from "axios";
import { API_BASE_URL } from "../config/api";

// Fallback keeps search usable if the city endpoint is briefly unreachable.
const FALLBACK = [
  "Mumbai", "Delhi", "Bengaluru", "Ahmedabad", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur",
  "Surat", "Lucknow", "Kanpur", "Nagpur", "Patna", "Indore", "Thane", "Bhopal", "Goa",
].map((name) => ({ name, state: "" }));

let cache = null;
let inflight = null;

/** Loads the (small) city list once and serves every autocomplete from memory. */
export function loadCities() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = axios
      .get(`${API_BASE_URL}/city`, { timeout: 8000 })
      .then(({ data }) => {
        cache = Array.isArray(data) && data.length ? data : FALLBACK;
        return cache;
      })
      .catch(() => {
        inflight = null;
        return FALLBACK;
      });
  }
  return inflight;
}

export function matchCity(list, text) {
  const t = String(text || "").trim().toLowerCase();
  return list.find((c) => c.name.toLowerCase() === t) || null;
}
