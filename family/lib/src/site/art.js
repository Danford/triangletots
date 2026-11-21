// The Triangle Tots drawings: rain, nap, storytime, the Sunday email and free outings. Each is drawn in a 400x400
// box on its own two-colour background. The site shows them inline (art() below), so their text uses the page's
// Gabarito; scripts/ads-graphics.mjs puts the same drawings in the Google Ads images.

export const SKY = '#9fd6f5', GREEN = '#14543f', SUN = '#ffc72c', INK = '#12343b';

// The site's mark: a green triangle with the sun rising inside it, drawn in a 40x40 box.
export const mark = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s / 40})"><path d="M20 7 34 31H6Z" fill="${GREEN}" stroke="${GREEN}" stroke-width="5" stroke-linejoin="round"/><circle cx="20" cy="23" r="6" fill="${SUN}"/></g>`;

// The logo badge, drawn in a 100x100 box: the round badge of the Ads logo (scripts/ads-graphics.mjs, logo-square)
// pared down to hold up at favicon and header size: sky, the sun rising behind the triangle hill, rolling hills, a kite.
// `id` keeps the clip and gradient ids apart when a page has the badge twice.
export const badgeBody = (id = 'tb') => `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ee"/><stop offset="1" stop-color="#e3f4fc"/></linearGradient><clipPath id="${id}c"><circle cx="50" cy="50" r="46"/></clipPath></defs>
<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}s)"/>
<circle cx="50" cy="55" r="22" fill="#fff3c4" opacity=".75"/><circle cx="50" cy="55" r="16" fill="${SUN}"/>
<path d="M0 70C14 60 26 62 36 66V100H0Z M100 68C86 58 75 60 64 64V100H100Z" fill="#3f8f6b"/>
<path d="M14 79 45 61Q50 58 55 61L86 79Z" fill="${GREEN}" stroke="${GREEN}" stroke-width="4" stroke-linejoin="round"/>
<path d="M0 80C22 74 38 77 50 79S78 75 100 78V100H0Z" fill="#5aa877"/>
<path d="M73 19l4 6-4 7-4-7z" fill="#ff7a59"/></g>
<circle class="ring" cx="50" cy="50" r="46" fill="none" stroke="${GREEN}" stroke-width="5"/>`;
export const badge = (x, y, s, id) => `<g transform="translate(${x} ${y}) scale(${s / 100})">${badgeBody(id)}</g>`;

const star = (x, y, r, c) => `<path d="${[...Array(10)].map((_, i) => { const a = Math.PI / 5 * i - Math.PI / 2, q = i % 2 ? r * 0.45 : r; return `${i ? 'L' : 'M'}${(x + q * Math.cos(a)).toFixed(1)} ${(y + q * Math.sin(a)).toFixed(1)}`; }).join('')}Z" fill="${c}"/>`;

export const ART = {
  rain: {
    bg: ['#b9d3e3', '#eaf2f7'],
    art: `<ellipse cx="200" cy="352" rx="160" ry="20" fill="#8fc0de"/>
<rect x="125" y="200" width="150" height="140" rx="8" fill="#fff"/>
<path d="M200 118 300 212H100Z" fill="${GREEN}" stroke="${GREEN}" stroke-width="18" stroke-linejoin="round"/>
<circle cx="200" cy="258" r="40" fill="${SUN}" opacity=".35"/><rect x="176" y="234" width="48" height="48" rx="6" fill="${SUN}"/>
<path d="M200 234V282M176 258H224" stroke="#fff" stroke-width="4"/>
<rect x="140" y="292" width="30" height="48" rx="5" fill="#ff7a59"/>
${[[110, 120], [150, 150], [330, 130], [300, 170], [70, 180], [350, 230], [60, 260], [260, 110]].map(([x, y]) => `<path d="M${x} ${y}l-8 22" stroke="#4f8fbd" stroke-width="6" stroke-linecap="round"/>`).join('')}
<g fill="#fff"><circle cx="120" cy="70" r="38"/><circle cx="175" cy="52" r="50"/><circle cx="238" cy="62" r="44"/><circle cx="285" cy="82" r="32"/><rect x="90" y="70" width="210" height="44" rx="22"/></g>`,
  },
  nap: {
    bg: ['#e4e0f6', '#fdf6e3'],
    art: `<path d="M235 60A115 115 0 1 0 345 215 92 92 0 1 1 235 60Z" fill="${SUN}"/>
${star(80, 70, 16, '#fff')}${star(320, 60, 12, '#fff')}${star(60, 200, 10, '#fff')}
<g font-family="Gabarito" font-weight="800" fill="#262e5c"><text x="300" y="130" font-size="44">z</text><text x="330" y="95" font-size="34">z</text><text x="352" y="68" font-size="26">z</text></g>
${/* The site's day strip in miniature: a November sky (src/site/sky.js skyStops, sunrise 7:30, sunset 5:30) on a
   5:30 am to 9:30 pm clock, so night runs into dawn, day, sunset and night again; a morning outing (green, 9 to 11)
   and the nap (night blue, 11:45 to 2:30) sit on it in the site's colours, and the sun marks sunrise. */ ''}<defs><linearGradient id="art-day" x1="0" x2="1"><stop offset="0.026" stop-color="#26305e"/><stop offset="0.052" stop-color="#2c3669"/><stop offset="0.073" stop-color="#363f78"/><stop offset="0.092" stop-color="#4a4b88"/><stop offset="0.106" stop-color="#6e5f95"/><stop offset="0.119" stop-color="#a27a9c"/><stop offset="0.131" stop-color="#d2979f"/><stop offset="0.146" stop-color="#efb6a1"/><stop offset="0.165" stop-color="#f6caa8"/><stop offset="0.193" stop-color="#ead8cc"/><stop offset="0.229" stop-color="#d6e3ee"/><stop offset="0.271" stop-color="#cfe6f6"/><stop offset="0.438" stop-color="#b2d7f1"/><stop offset="0.583" stop-color="#b2d7f1"/><stop offset="0.635" stop-color="#cdd8d6"/><stop offset="0.672" stop-color="#ead7a6"/><stop offset="0.703" stop-color="#f4d08c"/><stop offset="0.727" stop-color="#f2bb8c"/><stop offset="0.744" stop-color="#dc9f98"/><stop offset="0.758" stop-color="#b993af"/><stop offset="0.773" stop-color="#8f80b4"/><stop offset="0.790" stop-color="#66629f"/><stop offset="0.808" stop-color="#4b4f8e"/><stop offset="0.829" stop-color="#363f78"/><stop offset="0.854" stop-color="#2c3669"/><stop offset="0.880" stop-color="#26305e"/></linearGradient></defs>
<rect x="20" y="315" width="360" height="54" rx="27" fill="url(#art-day)"/>
<rect x="99" y="315" width="45" height="54" fill="#3a9b62"/>
<rect x="161" y="315" width="62" height="54" fill="#262e5c"/>
<text x="192" y="352" font-family="Gabarito" font-weight="800" font-size="24" fill="#fff" text-anchor="middle">Nap</text>
<circle cx="65" cy="342" r="11" fill="${SUN}" stroke="#fff" stroke-width="4"/>`,
  },
  story: {
    bg: ['#fff4d6', '#ffe6a8'],
    art: `<path d="M200 330C150 300 95 298 40 312V150C95 136 150 138 200 168Z" fill="#fff" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M200 330C250 300 305 298 360 312V150C305 136 250 138 200 168Z" fill="#fff" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
${[0, 1, 2, 3].map((i) => `<path d="M68 ${182 + i * 28}C110 ${174 + i * 28} 140 ${176 + i * 28} 176 ${188 + i * 28}M224 ${188 + i * 28}C260 ${176 + i * 28} 290 ${174 + i * 28} 332 ${182 + i * 28}" stroke="#c9d3d6" stroke-width="7" stroke-linecap="round" fill="none"/>`).join('')}
${star(110, 80, 28, SUN)}${star(290, 70, 22, '#ff7a59')}${star(200, 45, 18, '#3a9b62')}${star(345, 125, 14, SUN)}${star(55, 120, 12, '#ff7a59')}
<path d="M200 128c-14-22-44-12-38 10 4 14 20 24 38 36 18-12 34-22 38-36 6-22-24-32-38-10Z" fill="#ff7a59"/>`,
  },
  email: {
    bg: [SKY, '#e6f5fd'],
    art: `<circle cx="320" cy="80" r="44" fill="${SUN}"/>
<rect x="60" y="170" width="280" height="180" rx="16" fill="#fff"/>
<rect x="95" y="95" width="210" height="175" rx="10" fill="#fffbe8" stroke="#e8dcb0" stroke-width="4"/>
${mark(170, 108, 60)}
<rect x="125" y="180" width="150" height="12" rx="6" fill="#d9d2b8"/><rect x="125" y="204" width="120" height="12" rx="6" fill="#d9d2b8"/>
<path d="M60 186 200 270 340 186V334a16 16 0 0 1-16 16H76a16 16 0 0 1-16-16Z" fill="#fff" stroke="#cfdde4" stroke-width="4" stroke-linejoin="round"/>
<path d="M66 342 170 262M334 342 230 262" stroke="#cfdde4" stroke-width="4"/>
<rect x="240" y="300" width="120" height="44" rx="22" fill="${GREEN}"/><text x="300" y="331" font-family="Gabarito" font-weight="800" font-size="24" fill="#fff" text-anchor="middle">Sunday</text>`,
  },
  free: {
    bg: [SKY, '#e6f5fd'],
    art: `<circle cx="330" cy="70" r="42" fill="${SUN}"/>
<ellipse cx="200" cy="325" rx="200" ry="55" fill="#5aa877"/>
<ellipse cx="200" cy="318" rx="150" ry="26" fill="#cfe9f7"/>
${[[200, 120], [120, 170], [280, 170]].map(([x, top]) => `<path d="M${x} 314C${x} ${top} ${x - 70} ${top} ${x - 80} 300M${x} 314C${x} ${top} ${x + 70} ${top} ${x + 80} 300" fill="none" stroke="#4fb3e8" stroke-width="9" stroke-linecap="round" stroke-dasharray="2 18"/><rect x="${x - 10}" y="300" width="20" height="16" rx="4" fill="#9aa7ad"/>`).join('')}
<g transform="rotate(-10 92 110)"><rect x="22" y="78" width="140" height="64" rx="16" fill="#ff7a59"/><text x="92" y="124" font-family="Gabarito" font-weight="800" font-size="40" fill="#fff" text-anchor="middle">FREE</text></g>`,
  },
};

/** One drawing as an inline SVG on its rounded background, with a little room around it. Decorative: screen readers skip it. */
export function art(name, cls = '') {
  const a = ART[name];
  if (!a) throw new Error(`no drawing called "${name}"`);
  return `<svg class="art${cls ? ` ${cls}` : ''}" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><defs><linearGradient id="art-bg-${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient></defs><rect width="400" height="400" rx="64" fill="url(#art-bg-${name})"/><g transform="translate(36 36) scale(.82)">${a.art}</g></svg>`;
}
