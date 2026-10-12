/** Brand marks. Everything else comes from react-icons. */

export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--logo-bg, #0d4a42)" />
      <path
        d="M9 27c4-9 8-1 12-9s7-3 10-6"
        stroke="var(--logo-line, #f2a93b)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="9" cy="27" r="3" fill="#fff" />
      <circle cx="31" cy="12" r="3.4" fill="var(--logo-line, #f2a93b)" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark({ light = false }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 650,
        fontSize: 22,
        letterSpacing: "-0.03em",
        color: light ? "#fff" : "var(--ink)",
        fontVariationSettings: '"opsz" 72',
      }}
    >
      Raahi<span style={{ color: "var(--accent)", fontStyle: "italic" }}>Go</span>
    </span>
  );
}

export function Brand({ light = false, size = 34 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <Wordmark light={light} />
    </span>
  );
}
