/**
 * Hand-drawn route map used behind the hero. Pure SVG + CSS: a dashed
 * highway, glowing stops and a bus marker travelling along the path.
 */
export default function RouteArt() {
  return (
    <div className="route-art" aria-hidden="true">
      <svg viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="glow" cx="78%" cy="28%" r="55%">
            <stop offset="0" stopColor="#f2a93b" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f2a93b" stopOpacity="0" />
          </radialGradient>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
          </pattern>
        </defs>
        <rect width="1440" height="640" fill="url(#grid)" />
        <rect width="1440" height="640" fill="url(#glow)" />
        <path
          id="hero-route"
          d="M-20 520 C 180 470, 260 330, 460 350 S 760 520, 940 400 S 1230 170, 1480 210"
          fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2.5" strokeDasharray="3 12" strokeLinecap="round"
        />
        <path
          d="M-20 560 C 220 540, 340 420, 560 450 S 880 600, 1060 470 S 1300 300, 1480 330"
          fill="none" stroke="#f2a93b" strokeOpacity="0.35" strokeWidth="1.6" strokeDasharray="2 10" strokeLinecap="round"
        />
        {[
          [460, 350], [940, 400], [1230, 232],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="16" fill="#f2a93b" fillOpacity="0.15" className="route-ping" style={{ animationDelay: `${i * 0.8}s` }} />
            <circle r="6" fill="#0d4a42" stroke="#f2a93b" strokeWidth="2.5" />
          </g>
        ))}
        <g>
          <circle r="22" fill="#f2a93b" fillOpacity="0.22" />
          <circle r="8" fill="#f2a93b" stroke="#fff" strokeWidth="2.5" />
          <animateMotion dur="18s" repeatCount="indefinite" rotate="0">
            <mpath href="#hero-route" />
          </animateMotion>
        </g>
      </svg>
      <style>{`
        .route-art{position:absolute;inset:0;overflow:hidden;pointer-events:none}
        .route-art svg{position:absolute;inset:0;width:100%;height:100%}
        .route-ping{transform-box:fill-box;transform-origin:center;animation:ping 3s ease-out infinite}
        @keyframes ping{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.6);opacity:0}}
      `}</style>
    </div>
  );
}
