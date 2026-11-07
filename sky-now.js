// The home page's sky as it really is right now over Raleigh: where the sun and the moon are, the moon's phase,
// how dark it is, and which bright stars are up. The page is built once each morning (src/site/scene.js dresses it
// for the season and the forecast); this moves it through the day in the visitor's browser, smoothly.
//
// The scene faces south: east on the left, west on the right, the horizon along the hilltops and straight up at the
// top of the sky. Positions are low-precision (a fraction of a degree for the sun, about a degree for the moon),
// which is far finer than a pixel here.
//
// For checking: ?at=2026-11-06T21:30 shows that local time; ?speed=600 runs the clock 600 times fast.

const RAD = Math.PI / 180;
// Raleigh: the forecast point in src/plans/config.js.
export const HOME = { lat: 35.7796, lon: -78.6382 };

const days = (t) => t / 86400000 - 10957.5; // since J2000.0
const norm = (a) => ((a % 360) + 360) % 360;

function equatorial(lambda, beta, d) {
  const e = (23.439 - 0.0000004 * d) * RAD, l = lambda * RAD, b = beta * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: norm(ra / RAD), dec: dec / RAD };
}

/** Altitude and azimuth (degrees; azimuth from north, through east) of a point at ra/dec, seen from `at`. */
export function horizontal({ ra, dec }, t, { lat, lon } = HOME) {
  const d = days(t);
  const lst = norm(280.16 + 360.9856235 * d + lon);
  const h = (lst - ra) * RAD, p = lat * RAD, de = dec * RAD;
  const alt = Math.asin(Math.sin(p) * Math.sin(de) + Math.cos(p) * Math.cos(de) * Math.cos(h));
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(de) * Math.cos(p));
  return { alt: alt / RAD, az: norm(az / RAD + 180) };
}

function sunEcliptic(d) {
  const g = (357.528 + 0.9856003 * d) * RAD;
  return norm(280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
}

export function sun(t, where = HOME) {
  const d = days(t);
  return horizontal(equatorial(sunEcliptic(d), 0, d), t, where);
}

/** The moon's place, and its phase: lit (0 new to 1 full) and waxing (lit on the right, as seen from here). */
export function moon(t, where = HOME) {
  const d = days(t);
  const L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.229350 * d) * RAD;
  const lambda = norm(L + 6.289 * Math.sin(M));
  const elong = norm(lambda - sunEcliptic(d));
  return { ...horizontal(equatorial(lambda, 5.128 * Math.sin(F), d), t, where), lit: (1 - Math.cos(elong * RAD)) / 2, waxing: elong < 180 };
}

// The brightest stars and the shapes people know: name, right ascension and declination (degrees), magnitude.
export const STARS = [
  ['Sirius', 101.29, -16.72, -1.46], ['Arcturus', 213.92, 19.18, -0.05], ['Vega', 279.23, 38.78, 0.03], ['Capella', 79.17, 45.99, 0.08],
  ['Rigel', 78.63, -8.2, 0.13], ['Procyon', 114.83, 5.22, 0.34], ['Betelgeuse', 88.79, 7.41, 0.5], ['Altair', 297.7, 8.87, 0.77],
  ['Aldebaran', 68.98, 16.51, 0.85], ['Antares', 247.35, -26.43, 0.96], ['Spica', 201.3, -11.16, 0.97], ['Pollux', 116.33, 28.03, 1.14],
  ['Fomalhaut', 344.41, -29.62, 1.16], ['Deneb', 310.36, 45.28, 1.25], ['Regulus', 152.09, 11.97, 1.35], ['Castor', 113.65, 31.89, 1.58],
  ['Shaula', 263.4, -37.1, 1.62], ['Bellatrix', 81.28, 6.35, 1.64], ['Alnilam', 84.05, -1.2, 1.69], ['Alnitak', 85.19, -1.94, 1.77],
  ['Dubhe', 165.93, 61.75, 1.79], ['Alioth', 193.51, 55.96, 1.77], ['Alkaid', 206.89, 49.31, 1.86], ['Polaris', 37.95, 89.26, 1.98],
  ['Mizar', 200.98, 54.93, 2.23], ['Mintaka', 83.0, -0.3, 2.23], ['Saiph', 86.94, -9.67, 2.06], ['Alpheratz', 2.1, 29.09, 2.06],
  ['Denebola', 177.26, 14.57, 2.14], ['Algieba', 154.99, 19.84, 2.08], ['Schedar', 10.13, 56.54, 2.24], ['Caph', 2.29, 59.15, 2.28],
  ['Sadr', 305.56, 40.26, 2.23], ['Merak', 165.46, 56.38, 2.37], ['Phecda', 178.46, 53.69, 2.44], ['Navi', 14.18, 60.72, 2.47],
  ['Scheat', 345.94, 28.08, 2.42], ['Markab', 346.19, 15.21, 2.49], ['Gienah', 311.55, 33.97, 2.48], ['Ruchbah', 21.45, 60.24, 2.68],
  ['Algenib', 3.31, 15.18, 2.83], ['Albireo', 292.68, 27.96, 3.05], ['Fawaris', 296.24, 45.13, 2.87], ['Alcyone', 56.87, 24.11, 2.87],
  ['Megrez', 183.86, 57.03, 3.31], ['Segin', 28.6, 63.67, 3.37],
];
// Fainter stars to fill the dark: the same few hundred every night, spread evenly over the sphere (a fixed seed),
// so they rise and set with the rest. Magnitudes 3.4 to 4.8: the ones a dark backyard shows.
export const FAINT = (() => {
  let seed = 20261106;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  return Array.from({ length: 320 }, () => [null, rnd() * 360, Math.asin(rnd() * 2 - 1) / RAD, 3.4 + rnd() * 1.4]);
})();
export const LINES = [
  ['Betelgeuse', 'Bellatrix'], ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'], ['Saiph', 'Rigel'],
  ['Alkaid', 'Mizar'], ['Mizar', 'Alioth'], ['Alioth', 'Megrez'], ['Megrez', 'Phecda'], ['Phecda', 'Merak'], ['Merak', 'Dubhe'], ['Dubhe', 'Megrez'],
  ['Caph', 'Schedar'], ['Schedar', 'Navi'], ['Navi', 'Ruchbah'], ['Ruchbah', 'Segin'],
  ['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Fawaris', 'Sadr'], ['Sadr', 'Gienah'],
  ['Alpheratz', 'Scheat'], ['Scheat', 'Markab'], ['Markab', 'Algenib'], ['Algenib', 'Alpheratz'],
  ['Regulus', 'Algieba'], ['Algieba', 'Denebola'], ['Denebola', 'Regulus'], ['Castor', 'Pollux'],
];

/** Where a sky position falls in the scene, as fractions: x 0..1 (east to west, facing south), y 0 (straight up) to 1 (horizon). Null when behind the viewer. */
export function place({ alt, az }) {
  const off = ((az - 180 + 540) % 360) - 180; // degrees west of south
  if (Math.abs(off) > 150) return null;
  return { x: 0.5 + off / 300, y: 1 - alt / 90 };
}

/** How dark the sky is from the sun's altitude: 0 by day, 1 once it's 12° down. And the glow near sunrise and sunset. */
export function light(sunAlt) {
  const night = Math.min(1, Math.max(0, (4 - sunAlt) / 16));
  const dusk = Math.max(0, 1 - Math.abs(sunAlt + 1) / 9);
  return { night, dusk };
}

/** How late in the evening it is in Raleigh, for the city's office windows: 0 until 9pm, rising to 1 by 1am, and
 * back to 0 at 5am when the early ones come on again. */
const raleighClock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
export function lateness(t) {
  const parts = Object.fromEntries(raleighClock.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const h = Number(parts.hour) + Number(parts.minute) / 60;
  if (h >= 21) return Math.min(1, (h - 21) / 4);
  return h < 5 ? Math.min(1, (h + 3) / 4) : 0;
}

const raleighDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Raleigh's date and its clock in hours (7.5 is 7:30), at t. */
export function raleighNow(t) {
  const parts = Object.fromEntries(raleighClock.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return { date: raleighDay.format(new Date(t)), hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

// How hard it rains for a chance of rain: none at 20% or under, a drizzle around 40%, the heaviest at 90% and over.
const RAIN_FROM = 20, RAIN_FULL = 90;
/**
 * How hard it's raining at an hour of the day, 0 to 1, from the hourly chances of rain ("5:10 6:20 …", as
 * src/site/scene.js writes data-rain), each hour's chance at its half past, eased from one hour to the next.
 * Before the first hour or after the last, that hour's. Null with no hours.
 */
export function rainAt(hours, hour) {
  const pop = hourlyAt(hours, hour);
  return pop == null ? null : Math.min(1, Math.max(0, (pop - RAIN_FROM) / (RAIN_FULL - RAIN_FROM)));
}

/** A percent at an hour of the day from "5:10 6:20 …", eased between the hours (each at its half past). Null with none. */
export function hourlyAt(hours, hour) {
  const pts = String(hours ?? '').trim().split(/\s+/).filter(Boolean).map((s) => s.split(':').map(Number)).map(([h, p]) => [h + 0.5, p]);
  if (!pts.length) return null;
  if (hour <= pts[0][0]) return pts[0][1];
  if (hour >= pts.at(-1)[0]) return pts.at(-1)[1];
  const i = pts.findIndex(([h]) => h > hour);
  const [h0, p0] = pts[i - 1], [h1, p1] = pts[i];
  return p0 + ((p1 - p0) * (hour - h0)) / (h1 - h0);
}

// Even a cloudless sky keeps a cloud drifting by; a covered one shows all seven (style.css: .drift, --cloud).
const CLOUD_MIN = 0.15;
/**
 * The sky at an hour from its cloud cover ("5:100 6:87 …", data-cloud): how many of the clouds show (0..1), and
 * how much of the sky shows through for the stars, the moon and the sun. Null with no cover.
 */
export function cloudAt(hours, hour) {
  const cover = hourlyAt(hours, hour);
  if (cover == null) return null;
  return { clouds: CLOUD_MIN + (1 - CLOUD_MIN) * (cover / 100), clear: 1 - cover / 100 };
}

// The critters keep in out of the rain once it's more than a sprinkle, and the pond's birds huddle by the reeds
// in a downpour; butterflies and bats want a warm hour (src/site/scene.js: WARM_F, the same).
const WET = 0.15, POURING = 0.6, WARM_F = 62;

// How much of the sky shows through the day's weather (scene.js puts wx-<sky> on the section).
const CLEARNESS = { clear: 1, partly: 0.65, cloudy: 0.2, rain: 0.05, storm: 0, snow: 0.05, fog: 0.1 };

/** The lit part of a moon of radius r at the origin, lit 0..1 on the right; a waning moon is this mirrored. */
export function moonPath(r, lit) {
  const rx = Math.abs(1 - 2 * lit) * r;
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${lit < 0.5 ? 0 : 1} 0 ${-r}Z`;
}

const svgNS = 'http://www.w3.org/2000/svg';

/** The sun's colour by its altitude: gold up high, warming to orange in the last few degrees above the horizon. */
export function sunColour(alt) {
  return alt >= 14 ? '#ffc72c' : alt <= 0 ? '#ff8a3d' : mix('#ff8a3d', '#ffc72c', alt / 14);
}

/** Two #rrggbb colours mixed, t of the way from a to b. */
export function mix(a, b, t) {
  const ch = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

let bodiesSeen = 0;
/** The moon and sun at a size (the sun's radius): a glow, twelve tapered rays and a disc lit from the upper left. */
function bodiesArt(size) {
  const id = `sun${++bodiesSeen}`;
  const rays = Array.from({ length: 12 }, (_, k) => {
    const a = (k * Math.PI) / 6, w = 0.11, r0 = size * 1.16, r1 = size * (k % 2 ? 1.42 : 1.62);
    const pt = (r, da) => `${(r * Math.cos(a + da)).toFixed(1)} ${(r * Math.sin(a + da)).toFixed(1)}`;
    return `M${pt(r0, -w)}L${pt(r1, 0)}L${pt(r0, w)}Z`;
  }).join('');
  return `<defs><radialGradient id="${id}g"><stop offset=".3" stop-color="#fff3c4" stop-opacity=".75"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${id}f" cx=".5" cy=".5" fx=".36" fy=".34" r=".6"><stop offset="0" stop-color="#fff7d1"/><stop offset=".55" style="stop-color:var(--sun)"/><stop offset="1" style="stop-color:var(--sunedge)"/></radialGradient></defs>`
    + '<g class="moon" style="display:none"></g>'
    + `<g class="sunball" style="display:none"><g class="sunhalo"><circle class="sunglow" r="${(size * 2.5).toFixed(1)}" fill="url(#${id}g)"/><path class="sunrays" d="${rays}"/></g><circle class="sundisc" r="${size.toFixed(1)}" fill="url(#${id}f)"/></g>`;
}

/** Puts the sun or moon at p (or hides it with none). Its first place after hiding is a jump, not a glide. */
function moveTo(el, p) {
  if (!p) { el.style.display = 'none'; el.dataset.up = ''; return; }
  const to = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
  if (!el.dataset.up) {
    el.style.transition = 'none';
    el.style.transform = to;
    if (el.style.display === 'none') el.style.removeProperty('display');
    el.getBoundingClientRect();
    el.style.removeProperty('transition');
    el.dataset.up = '1';
    return;
  }
  el.style.transform = to;
}

function draw(section, t) {
  const art = section.querySelector('.skyart');
  const hills = section.querySelector('.hills');
  if (!art || !hills) return;
  const W = section.clientWidth;
  // The hilltops: about half way down the hillside drawing. (An svg has no offsetTop, so measure both boxes.)
  const box = section.getBoundingClientRect(), hb = hills.getBoundingClientRect();
  const horizon = hb.top - box.top + hb.height * 0.55;
  const wx = (/\bwx-(\w+)/.exec(section.className) ?? [])[1] ?? 'clear';
  // The hour's rain and cloud cover, from the hourly forecast (style.css: --rain, --cloud). Only on the day the
  // forecast is for: a page still up the next morning keeps the day's sky as it was drawn.
  const now = raleighNow(t);
  const today = section.dataset.day === now.date;
  const rain = today ? rainAt(section.dataset.rain, now.hour) : null;
  const cover = today ? cloudAt(section.dataset.cloud, now.hour) : null;
  if (rain == null) section.style.removeProperty('--rain');
  else section.style.setProperty('--rain', rain.toFixed(3));
  section.classList.toggle('hourly-sky', cover != null);
  if (cover == null) { section.style.removeProperty('--cloud'); section.style.removeProperty('--clear'); }
  else { section.style.setProperty('--cloud', cover.clouds.toFixed(3)); section.style.setProperty('--clear', cover.clear.toFixed(3)); }
  // How much of the sky shows: the hour's cover when there is one (fog hides it whatever the clouds), less in rain.
  const dayClear = CLEARNESS[wx] ?? 1;
  const clear = (cover == null ? dayClear : wx === 'fog' ? Math.min(dayClear, cover.clear) : cover.clear) * (1 - (rain ?? 0));
  const s = sun(t), m = moon(t);
  const { night, dusk } = light(s.alt);
  section.style.setProperty('--dark', night.toFixed(3));
  section.style.setProperty('--glow', (dusk * Math.max(clear, 0.3)).toFixed(3));
  // The hillside's critters and the pond follow the hour too (style.css: .wet, .pouring, .warm, .twilight). With no
  // hourly forecast they keep the day's, as scene.js drew it.
  if (rain != null) { section.classList.toggle('wet', rain > WET); section.classList.toggle('pouring', rain >= POURING); }
  const temp = today ? hourlyAt(section.dataset.temp, now.hour) : null;
  if (temp != null) section.classList.toggle('warm', temp >= WARM_F);
  section.classList.toggle('twilight', dusk > 0.25);
  section.classList.add('live');
  section.classList.toggle('night', night > 0.55);
  section.style.setProperty('--late', lateness(t).toFixed(3));

  let layer = art.querySelector('.heavens');
  if (!layer) {
    art.insertAdjacentHTML('afterbegin', '<div class="nightsky"></div><div class="duskglow"></div>');
    layer = document.createElementNS(svgNS, 'svg');
    layer.setAttribute('class', 'heavens');
    art.querySelector('.duskglow').after(layer);
    // The stars are drawn once and then only moved, so they glide across the sky and the bright ones' twinkle
    // runs on unbroken; the sun and moon are redrawn in .bodies.
    layer.innerHTML = `<path class="figures"/><g class="stars">${[...STARS, ...FAINT].map(([name, ra, , mag]) =>
      `<circle class="star${mag < 1 ? ' bright' : ''}"${mag < 1 ? ` style="animation-delay:-${(ra % 7).toFixed(1)}s"` : ''} display="none">${name ? `<title>${name}</title>` : ''}</circle>`).join('')}</g><g class="bodies"></g>`;
  }
  layer.setAttribute('viewBox', `0 0 ${W} ${section.clientHeight}`);
  const at = (p) => { const q = place(p); return q && { x: q.x * W, y: q.y * horizon }; };

  // Stars: as many as the dark and the weather let through, the brightest first to show at dusk.
  const starLight = Math.max(0, (night - 0.35) / 0.65) * clear;
  const figures = layer.querySelector('.figures');
  const dots = layer.querySelector('.stars').children;
  // pos: the stars showing; set: the ones gone below the hills, so a figure's line runs on down behind them.
  const pos = new Map(), set = new Map();
  [...STARS, ...FAINT].forEach(([name, ra, dec, mag], i) => {
    const dot = dots[i];
    const h = starLight > 0.02 ? horizontal({ ra, dec }, t) : null;
    if (name && h && h.alt < 1) { const q = at(h); if (q) set.set(name, q); }
    const p = h && h.alt >= 1 && at(h);
    const seen = p ? Math.min(1, starLight * (1.6 - mag * 0.3)) * Math.min(1, h.alt / 8) : 0;
    if (seen <= 0.03) { dot.setAttribute('display', 'none'); return; }
    if (name) pos.set(name, p);
    dot.setAttribute('cx', p.x.toFixed(2));
    dot.setAttribute('cy', p.y.toFixed(2));
    dot.setAttribute('r', (Math.max(0.6, 2.4 - 0.45 * mag) * (W < 600 ? 0.8 : 1)).toFixed(2));
    dot.setAttribute('opacity', seen.toFixed(2));
    dot.removeAttribute('display');
  });
  // A line shows while either end is up; the hills hide the part past the horizon.
  const end = (n) => pos.get(n) ?? set.get(n);
  const lines = LINES.filter(([a, b]) => (pos.has(a) || pos.has(b)) && end(a) && end(b) && Math.abs(end(a).x - end(b).x) < W / 3)
    .map(([a, b]) => `M${end(a).x.toFixed(2)} ${end(a).y.toFixed(2)}L${end(b).x.toFixed(2)} ${end(b).y.toFixed(2)}`).join('');
  figures.setAttribute('d', lines);
  figures.setAttribute('opacity', (starLight * 0.5).toFixed(2));

  const size = Math.min(56, Math.max(24, W * 0.028));
  // The sun and moon stay the same elements and only move (style.css glides them between the seconds' places,
  // and turns the sun's rays and breathes its glow unbroken).
  const bodies = layer.querySelector('.bodies');
  if (bodies.dataset.size !== size.toFixed(1)) { bodies.innerHTML = bodiesArt(size); bodies.dataset.size = size.toFixed(1); }
  const moonEl = bodies.querySelector('.moon'), sunEl = bodies.querySelector('.sunball');
  // The moon, lit as it is tonight, faint by day the way it really is.
  const mp = m.alt > -3 && at(m);
  if (mp) {
    const r = size * 0.62;
    moonEl.innerHTML = `<circle r="${r.toFixed(1)}" class="moondark"/><path d="${moonPath(r, m.lit)}"${m.waxing ? '' : ' transform="scale(-1 1)"'} class="moonlit"/>`;
    moonEl.setAttribute('opacity', ((0.55 + 0.45 * night) * Math.max(clear, 0.25)).toFixed(2));
  }
  moveTo(moonEl, mp);
  // The sun, deepening from gold to orange as it nears the horizon.
  const sp = s.alt > -3 && at(s);
  layer.style.setProperty('--sun', sunColour(s.alt));
  layer.style.setProperty('--sunedge', mix(sunColour(s.alt), '#e8730c', 0.45));
  // With the hour's cloud cover, the sun shows as much as the sky does (over the day's wx- rules in style.css):
  // bright with its glow and rays in a clear sky, a pale disc through cloud.
  const halo = sunEl.querySelector('.sunhalo'), disc = sunEl.querySelector('.sundisc');
  if (cover == null) {
    sunEl.style.removeProperty('opacity'); disc.style.removeProperty('opacity');
    halo.style.removeProperty('opacity'); halo.style.removeProperty('display');
    if (sp) sunEl.style.removeProperty('display');
  } else {
    sunEl.style.opacity = (0.3 + 0.7 * clear).toFixed(2);
    halo.style.display = 'inline';
    halo.style.opacity = Math.min(1, Math.max(0, (clear - 0.3) / 0.4)).toFixed(2);
    disc.style.opacity = '1';
    if (sp) sunEl.style.display = 'inline';
  }
  moveTo(sunEl, sp);

  // The header above the home page's sky darkens with it.
  const top = document.querySelector('.top');
  if (top && section === document.querySelector('main > .sky')) top.style.background = night > 0.55 ? '#101b3d' : night > 0.15 ? '#3b4c7a' : '';
  top?.classList.toggle('night', night > 0.15 && section === document.querySelector('main > .sky'));
}

if (typeof document !== 'undefined') {
  const q = new URLSearchParams(location.search);
  const loaded = Date.now();
  const speed = Number(q.get('speed')) || 1;
  const clock = (start) => start + (Date.now() - loaded) * speed;
  const sections = [...document.querySelectorAll('.sky')].filter((s) => s.querySelector('.hills'));
  const startOf = (s) => Date.parse(s.dataset.at ?? q.get('at') ?? '') || loaded;
  const tick = () => {
    for (const s of sections) {
      const t = clock(startOf(s));
      draw(s, t);
      if (s.dataset.date && !s.dataset.at) turnOver(s, raleighNow(t).date, Date.now());
    }
  };
  if (speed > 1) for (const s of sections) s.classList.add('fast');
  // The sky turns smoothly: every frame when the clock runs fast, every second at real speed (the stars creep
  // about a pixel a minute, so a second's step is far under a pixel). The browser pauses it in a hidden tab.
  const every = speed > 1 ? 0 : 1000;
  let last = performance.now();
  const frame = (now) => { if (now - last >= every) { last = now; tick(); } requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  addEventListener('resize', tick);
  // A storm's walk down to the library, and a cold day's fire, start once the hillside is in view, so they aren't
  // over before anyone scrolls to them (style.css: .arrive). Reduced motion leaves the child inside, the fire lit.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = still ? null : new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { e.target.closest('.sky').classList.add('arrive'); seen.unobserve(e.target); }
  }, { threshold: 0.8 });
  const watch = (s) => { if (seen && s.querySelector('.walkhome, .lamps.cold')) seen.observe(s.querySelector('.hills')); };
  sections.forEach(watch);

  // The page is built each morning for that day. Still open once the day has turned over (or opened from an
  // older copy), it takes the new day's sky and hillside (sky/<date>.html, built with it), and then checks
  // hourly for a fresher one, since the morning's build has the newest forecast. A day with none is tried again
  // in half an hour.
  const tried = new WeakMap();
  const turnOver = async (s, date, nowMs) => {
    const last = tried.get(s);
    if (s.dataset.date === date && !last?.text) return;
    if (last && last.date === date && nowMs - last.at < (last.text ? 3600e3 : 1800e3)) return;
    tried.set(s, { ...last, date, at: nowMs });
    let text;
    try {
      const res = await fetch(`/sky/${date}.html`, { cache: 'no-cache' });
      if (!res.ok) return;
      text = await res.text();
    } catch { return; } // offline: tried again on the schedule above
    tried.set(s, { date, at: nowMs, text });
    if (last?.text === text && s.dataset.date === date) return;
    swapSky(s, text);
    watch(s);
    draw(s, clock(startOf(s)));
  };
  tick();
}

/** Puts a day's sky (sky/<date>.html: a section with the sky layer and the hillside) in place of the one showing. */
export function swapSky(section, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const next = tpl.content.firstElementChild;
  if (!next?.classList.contains('sky')) throw new Error('swapSky: no sky section in the day\'s sky file');
  // Keep what sky-now and the page put on it: alive, the time of day, the fire and walk already started.
  const keep = ['live', 'night', 'twilight', 'arrive', 'fast'].filter((c) => section.classList.contains(c));
  section.className = next.className;
  section.classList.add(...keep);
  for (const a of ['style', 'data-day', 'data-rain', 'data-cloud', 'data-temp', 'data-date']) {
    const v = next.getAttribute(a);
    if (v == null) section.removeAttribute(a); else section.setAttribute(a, v);
  }
  section.querySelector(':scope > .skyart')?.replaceWith(next.querySelector(':scope > .skyart'));
  section.querySelector(':scope > .hills')?.remove();
  section.querySelector(':scope > .lamps')?.remove();
  section.append(...next.querySelectorAll(':scope > .hills, :scope > .lamps'));
  const now = section.querySelector('.now');
  if (now && next.dataset.now) { now.textContent = next.dataset.now; now.dataset.today = next.dataset.date; }
}
