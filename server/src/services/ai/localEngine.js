/**
 * RaahiGo's built-in "smart" engine.
 *
 * It does the same three jobs the LLM does — understand a plain-English trip, explain which bus fits
 * you, answer policy questions — with deterministic rules and the real data, so those features work
 * out of the box with no API key. When ANTHROPIC_API_KEY is set the LLM handles them instead and this
 * engine is the fallback if the LLM is unreachable. Every result still goes through the same
 * validation as LLM output, so nothing it produces can reach the database unchecked.
 */
const { POLICIES } = require("./policyKB");

const CITY_ALIASES = {
  mumbai: "Mumbai", bombay: "Mumbai", delhi: "Delhi", "new delhi": "Delhi", bengaluru: "Bengaluru", bangalore: "Bengaluru",
  ahmedabad: "Ahmedabad", hyderabad: "Hyderabad", chennai: "Chennai", madras: "Chennai", kolkata: "Kolkata", calcutta: "Kolkata",
  pune: "Pune", jaipur: "Jaipur", surat: "Surat", lucknow: "Lucknow", kanpur: "Kanpur", nagpur: "Nagpur", patna: "Patna",
  indore: "Indore", thane: "Thane", bhopal: "Bhopal", goa: "Goa",
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };

function findCities(text) {
  const names = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${names.map((n) => n.replace(/ /g, "\\s+")).join("|")})\\b`, "g");
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ city: CITY_ALIASES[m[1].replace(/\s+/g, " ")], index: m.index, end: m.index + m[0].length });
  return out;
}

function pickRoute(text) {
  const found = findCities(text);
  let from = null;
  let to = null;
  for (const c of found) {
    const before = text.slice(Math.max(0, c.index - 14), c.index);
    const after = text.slice(c.end, c.end + 10);
    if (/\bfrom\s+$/.test(before) || /^\s*(se|से)\b/.test(after)) from = from || c.city;
    else if (/\b(to|towards|for|reach|reaching)\s+$/.test(before) || /^\s*(tak|ko|ke liye)\b/.test(after)) to = to || c.city;
  }
  const rest = found.map((c) => c.city).filter((c) => c !== from && c !== to);
  if (!from && !to && rest.length >= 2) { from = rest[0]; to = rest[1]; }
  else if (!from && to && rest.length) from = rest[0];
  else if (from && !to && rest.length) to = rest[0];
  return { from, to, mentioned: found.map((c) => c.city) };
}

function pickDate(text) {
  const now = new Date();
  if (/\b(day after tomorrow|parso|parson)\b/.test(text)) return { isoDate: iso(addDays(2)) };
  if (/\b(tomorrow|tmrw|tomorow|kal)\b/.test(text)) return { relativeDate: "tomorrow" };
  if (/\b(today|tonight|aaj|abhi)\b/.test(text)) return { relativeDate: "today" };
  if (/\bweekend\b/.test(text)) return { relativeDate: "this_weekend" };
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { isoDate: isoMatch[0] };
  const dm = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*\\b`)) ||
    text.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (dm) {
    const day = Number(/^\d/.test(dm[1]) ? dm[1] : dm[2]);
    const mon = MONTHS.indexOf((/^\d/.test(dm[1]) ? dm[2] : dm[1]).slice(0, 3));
    let d = new Date(now.getFullYear(), mon, day);
    if (d < addDays(-1)) d = new Date(now.getFullYear() + 1, mon, day);
    if (d.getMonth() === mon) return { isoDate: iso(d) };
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?${WEEKDAYS[i]}\\b`).test(text)) {
      let diff = (i - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return { isoDate: iso(addDays(diff)) };
    }
  }
  return {};
}

const WINDOWS = [["BEFORE_6", 0, 6], ["6_TO_12", 6, 12], ["12_TO_18", 12, 18], ["AFTER_18", 18, 24]];
const windowsFromHour = (h, dir) => WINDOWS.filter(([, lo, hi]) => (dir === "after" ? hi > h : lo < h)).map(([k]) => k);
const hour24 = (n, meridiem) => { let h = Number(n); if (meridiem === "pm" && h < 12) h += 12; if (meridiem === "am" && h === 12) h = 0; return h; };

function pickWindows(text) {
  let rest = text;
  const arrival = new Set();
  const departure = new Set();
  const dayparts = { morning: ["6_TO_12"], "early morning": ["BEFORE_6", "6_TO_12"], afternoon: ["12_TO_18"], evening: ["12_TO_18", "AFTER_18"], night: ["AFTER_18"], "late night": ["AFTER_18"], subah: ["6_TO_12"], raat: ["AFTER_18"] };
  const names = Object.keys(dayparts).sort((a, b) => b.length - a.length).join("|");

  // "arriving / reaching … in the morning" describes the arrival window, not the departure one.
  const arr = new RegExp(`(?:arriv\\w*|reach\\w*|pahunch\\w*|by)\\s+(?:\\w+\\s+){0,3}?(${names})`).exec(rest);
  if (arr) { dayparts[arr[1]].forEach((w) => arrival.add(w)); rest = rest.replace(arr[0], " "); }
  const arrHour = /(?:arriv\w*|reach\w*)\s+(?:\w+\s+){0,2}?(before|by)\s+(\d{1,2})\s*(am|pm)?/.exec(rest);
  if (arrHour) { windowsFromHour(hour24(arrHour[2], arrHour[3]), "before").forEach((w) => arrival.add(w)); rest = rest.replace(arrHour[0], " "); }

  const after = /\b(after|post|from)\s+(\d{1,2})\s*(am|pm)\b|\bafter\s+(\d{1,2})\b/.exec(rest);
  if (after) windowsFromHour(hour24(after[2] || after[4], after[3] || (Number(after[4]) <= 11 && Number(after[4]) >= 5 ? "pm" : undefined)), "after").forEach((w) => departure.add(w));
  const before = /\bbefore\s+(\d{1,2})\s*(am|pm)?\b/.exec(rest);
  if (before) windowsFromHour(hour24(before[1], before[2] || (Number(before[1]) >= 7 && Number(before[1]) <= 11 ? "am" : undefined)), "before").forEach((w) => departure.add(w));
  if (!after && !before) {
    const dp = new RegExp(`\\b(${names})\\b`).exec(rest);
    if (dp) dayparts[dp[1]].forEach((w) => departure.add(w));
  }
  return { departureWindows: [...departure], arrivalWindows: [...arrival] };
}

function pickPrice(text) {
  const num = (s) => { const v = parseFloat(String(s).replace(/,/g, "")); return /k\b/i.test(s) ? v * 1000 : v; };
  const p1 = /(?:under|below|less than|within|upto|up to|max(?:imum)?|budget(?: of| around)?|cheaper than|<=?)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?\s*k?)\b/.exec(text);
  if (p1) return num(p1[1].replace(/\s/g, ""));
  const p2 = /(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:or less|max|tak|se kam)?/.exec(text);
  if (p2) return num(p2[1]);
  const p3 = /(\d[\d,]*)\s*(?:se kam|tak|or less|or below)/.exec(text);
  return p3 ? num(p3[1]) : null;
}

/** Plain-English trip → the same raw shape the LLM prompt asks for (validated afterwards by the caller). */
function parseQueryLocal(query) {
  const text = ` ${String(query).toLowerCase().replace(/[→>]+/g, " to ").replace(/\s+/g, " ")} `;
  const { from, to, mentioned } = pickRoute(text);
  const date = pickDate(text);
  const windows = pickWindows(text);

  const busType = [];
  if (/\bnon[\s-]?ac\b/.test(text)) busType.push("NONAC");
  else if (/\bac\b|air[\s-]?condition/.test(text)) busType.push("AC");
  const seatType = [];
  if (/\bsleeper\b/.test(text)) seatType.push("SLEEPER");
  if (/\bseater\b|\bseating\b/.test(text)) seatType.push("SEATER");

  const topRated = /\b(top|best|highest)[\s-]*rated\b/.test(text);
  const ratingMatch = /(\d(?:\.\d)?)\s*\+?\s*(?:stars?|star rating|rating|rated)/.exec(text);
  let sortBy = null;
  if (/\b(cheapest|lowest (?:fare|price)|sasta|least expensive)\b/.test(text)) sortBy = "price";
  else if (/\b(fastest|quickest|shortest|jaldi)\b/.test(text)) sortBy = "duration";
  else if (topRated) sortBy = "rating";

  let clarification = null;
  if (!from && !to) clarification = mentioned.length ? "Where are you headed, and where are you leaving from?" : "Which city are you leaving from, and where to? Try “Delhi to Jaipur tomorrow”.";
  else if (!from) clarification = `Which city are you leaving from to reach ${to}?`;
  else if (!to) clarification = `Where are you going from ${from}?`;
  else if (from === to) clarification = "The origin and destination are the same — where would you like to go?";

  return {
    from, to, ...date,
    maxPrice: pickPrice(text),
    busType, seatType, ...windows,
    minRating: ratingMatch ? Math.min(5, Number(ratingMatch[1])) : topRated ? 4 : null,
    sortBy,
    clarificationNeeded: clarification,
  };
}

/* ───────────── recommendations ───────────── */

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const hourLabel = (h) => `${Number(h) % 12 === 0 ? 12 : Number(h) % 12} ${Number(h) >= 12 ? "PM" : "AM"}`;

/** Ranks the real buses with transparent scoring and writes reasons straight from their data. */
function recommendLocal(buses, preferenceText = "") {
  if (!buses.length) return { picks: [], summary: "No buses to compare." };
  const pref = String(preferenceText).toLowerCase();
  const want = {
    cheap: /\b(cheap|cheapest|budget|sasta|affordable|save|economical|low cost)\b/.test(pref),
    fast: /\b(fast|fastest|quick|quickest|shortest|jaldi|short)\b/.test(pref),
    comfort: /\b(comfort|comfortable|relax|sleep|sleeper|ac|luxury|premium)\b/.test(pref),
    rated: /\b(rated|rating|reliable|safe|best)\b/.test(pref),
    night: /\b(night|late|after dinner|overnight|raat)\b/.test(pref),
    morning: /\b(morning|early|subah)\b/.test(pref),
    wifi: /\b(wifi|wi-fi|internet|work)\b/.test(pref),
    charge: /\b(charging|charger|plug)\b/.test(pref),
  };
  const none = !Object.values(want).some(Boolean);

  const prices = buses.map((b) => b.price);
  const durs = buses.map((b) => b.durationHours).filter((d) => d != null);
  const [pMin, pMax] = [Math.min(...prices), Math.max(...prices)];
  const [dMin, dMax] = durs.length ? [Math.min(...durs), Math.max(...durs)] : [0, 0];

  const scored = buses.map((b) => {
    const amen = b.aminites || [];
    const priceScore = pMax === pMin ? 1 : 1 - (b.price - pMin) / (pMax - pMin);
    const durScore = dMax === dMin || b.durationHours == null ? 0.5 : 1 - (b.durationHours - dMin) / (dMax - dMin);
    const rateScore = clamp01((Number(b.rating) || 0) / 5);
    let score = (none ? 1 : 0.4) * (0.4 * priceScore + 0.3 * rateScore + 0.3 * durScore);
    if (want.cheap) score += 1.4 * priceScore;
    if (want.fast) score += 1.4 * durScore;
    if (want.rated) score += 1.2 * rateScore;
    if (want.comfort) score += 0.5 * (amen.includes("AC") ? 1 : 0) + 0.5 * (amen.includes("SLEEPER") ? 1 : 0);
    if (want.wifi && amen.includes("WIFI")) score += 0.7;
    if (want.charge && amen.includes("CHARGING_POINT")) score += 0.5;
    if (want.night && Number(b.departure) >= 18) score += 0.8;
    if (want.morning && Number(b.departure) >= 5 && Number(b.departure) < 12) score += 0.8;
    if (b.seatsAvailable === 0) score -= 5;
    return { b, score, priceScore, durScore, rateScore };
  }).sort((x, y) => y.score - x.score);

  const cheapest = buses.find((b) => b.price === pMin);
  const picks = scored.slice(0, 3).map(({ b, priceScore, durScore, rateScore }, i) => {
    const bits = [];
    if (b.price === pMin) bits.push(`the lowest fare at ₹${b.price}`);
    else bits.push(`₹${b.price}${pMax > pMin ? ` (₹${b.price - pMin} above the cheapest)` : ""}`);
    if (b.durationHours != null) bits.push(durScore > 0.99 ? `the shortest trip at ${b.durationHours}h` : `${b.durationHours}h on the road`);
    if (Number(b.rating) > 0) bits.push(rateScore >= 0.8 ? `a strong ${Number(b.rating).toFixed(1)}★ rating` : `${Number(b.rating).toFixed(1)}★`);
    bits.push(`departs ${hourLabel(b.departure)}`);
    const amen = (b.aminites || []).filter((a) => ["AC", "SLEEPER", "WIFI", "CHARGING_POINT"].includes(a)).map((a) => ({ AC: "AC", SLEEPER: "sleeper berths", WIFI: "Wi-Fi", CHARGING_POINT: "charging points" }[a]));
    const lead = i === 0 ? "Best overall fit" : i === 1 ? "Solid alternative" : "Also worth a look";
    return { id: String(b._id), reason: `${lead}: ${bits.join(", ")}${amen.length ? `, with ${amen.join(" & ")}` : ""}.` };
  });

  const fastest = durs.length ? buses.find((b) => b.durationHours === dMin) : null;
  const summary = pMax === pMin
    ? `All ${buses.length} buses cost the same, so timing, rating and amenities decide it.`
    : `Fares run ₹${pMin}–₹${pMax}. ${cheapest ? `${cheapest.companyname} is cheapest` : ""}${fastest && fastest !== cheapest ? `; ${fastest.companyname} is quickest (${dMin}h)` : ""}.`;
  return { picks, summary };
}

/* ───────────── support ───────────── */

const STOP = new Set("what when where which that this with have does your about from into they them then than there will would could should please tell know want need how can the and for are you but not any all".split(" "));
const tokens = (t) => String(t).toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP.has(w)) || [];

/** Policies that genuinely match: keyword hits count most, shared meaningful words count a little. No match = no answer. */
function matchPolicies(question) {
  const q = String(question).toLowerCase();
  const qTokens = new Set(tokens(q));
  return POLICIES.map((p) => {
    const kw = p.keywords.filter((k) => q.includes(k.toLowerCase())).length;
    const body = new Set(tokens(`${p.topic} ${p.content}`));
    const overlap = [...qTokens].filter((w) => body.has(w)).length;
    return { p, score: kw * 3 + overlap };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).map((x) => x.p);
}

const firstSentences = (text, n) => (text.match(/[^.!?]+[.!?]+/g) || [text]).slice(0, n).map((x) => x.trim()).join(" ");

/** Answers from the real policy notes (and the traveller's own bookings), or says it doesn't know. */
function answerLocal(question, bookingContext = null) {
  const q = String(question).toLowerCase();
  const parts = [];
  const sources = [];

  if (bookingContext && bookingContext.length && /\b(my|mera|meri)\b.*\b(booking|ticket|trip|refund|journey)\b|\b(status|refund status)\b/.test(q)) {
    const lines = bookingContext.slice(0, 3).map((b) => {
      const when = b.date ? new Date(b.date).toDateString() : "date n/a";
      const refund = b.refundStatus && b.refundStatus !== "NONE" ? `, refund ${String(b.refundStatus).toLowerCase()}` : "";
      return `${b.route} on ${when} — ${String(b.status).toLowerCase()}${refund}`;
    });
    parts.push(`Your latest bookings: ${lines.join("; ")}.`);
    sources.push("Your bookings");
  }

  const policies = matchPolicies(question);
  if (policies.length) {
    parts.push(firstSentences(policies[0].content, 4));
    if (policies[1]) parts.push(firstSentences(policies[1].content, 2));
    sources.push(...policies.slice(0, 2).map((p) => p.topic));
  }

  if (!parts.length) {
    return { answer: "I don't have that in my notes, so I won't guess. Please contact RaahiGo support and they'll help you directly.", sources: [] };
  }
  return { answer: parts.join(" "), sources };
}

module.exports = { parseQueryLocal, recommendLocal, answerLocal, findCities, CITY_ALIASES };
