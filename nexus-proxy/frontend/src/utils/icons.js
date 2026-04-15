/** Inline SVG icons — keeps the bundle self-contained */

const svg = (d, extra = "") =>
  `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" ${extra}>${d}</svg>`;

export const icons = {
  nexus: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px">
    <circle cx="14" cy="14" r="11" stroke="url(#ng)" stroke-width="1.5"/>
    <path d="M3 14 Q14 5 25 14 Q14 23 3 14Z" fill="url(#ng)" opacity="0.25"/>
    <circle cx="14" cy="14" r="3" fill="url(#ng)"/>
    <defs>
      <linearGradient id="ng" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#7c6ff7"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>
  </svg>`,

  globe: svg(`
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
    <path d="M8 2 Q10 5 10 8 Q10 11 8 14" stroke="currentColor" stroke-width="1.3"/>
    <path d="M8 2 Q6 5 6 8 Q6 11 8 14" stroke="currentColor" stroke-width="1.3"/>
    <path d="M2 8h12" stroke="currentColor" stroke-width="1.3"/>
  `),

  history: svg(`
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
    <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M2 8l2-2M2 8l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  `),

  chart: svg(`
    <rect x="2"  y="9"  width="3" height="5" rx="1" fill="currentColor" opacity="0.5"/>
    <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity="0.75"/>
    <rect x="11" y="3"  width="3" height="11" rx="1" fill="currentColor"/>
    <path d="M2 13.5h12" stroke="currentColor" stroke-width="0.75" opacity="0.3"/>
  `),

  settings: svg(`
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5
             M3.5 3.5l1 1M11.5 11.5l1 1
             M3.5 12.5l1-1M11.5 4.5l1-1"
      stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  `),

  close: svg(`
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  `),

  arrow: svg(`
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  `),
};
