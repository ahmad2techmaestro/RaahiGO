/** Builds an .ics calendar entry for a booked journey (departure hours are IST, UTC+05:30). */

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const esc = (s) => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function departureDate(order) {
  const d = new Date(order.ticketSummary.date);
  const hour = Number(order.busDetails.departure) || 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + hour * 3600000 - 5.5 * 3600000);
}

export function journeyHours(order) {
  const dep = Number(order.busDetails.departure);
  const arr = Number(order.busDetails.arrival);
  if (Number.isNaN(dep) || Number.isNaN(arr)) return 6;
  const diff = (arr - dep + 24) % 24;
  return diff === 0 ? 24 : diff;
}

export function buildICS(order) {
  const start = departureDate(order);
  const end = new Date(start.getTime() + journeyHours(order) * 3600000);
  const { from, to, name } = order.busDetails;
  const id = String(order._id).slice(-8).toUpperCase();
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RaahiGo//Boarding Pass//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${order._id}@raahigo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Bus ${from} → ${to} (${name})`)}`,
    `DESCRIPTION:${esc(`RaahiGo booking #${id}\nSeat(s): ${order.ticketSummary.ticket}\nPassenger: ${order.userDetails.name}`)}`,
    `LOCATION:${esc(from)}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Your bus leaves in 2 hours", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(order) {
  const blob = new Blob([buildICS(order)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raahigo-${String(order._id).slice(-8).toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
