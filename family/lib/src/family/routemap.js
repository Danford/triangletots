// The route map on the family page: the day's drive drawn on the site's own map of the
// Triangle, home to each stop by road. The roads come from the build (/family/routes.json,
// made by `routeShapes` in drives.js from the router on VM 106) and the map from /map-base.svg,
// so drawing it asks no one anything and home never leaves the device. It runs in the browser
// and in the tests, so its imports stay free of anything Node (src/family/modules.js).

import { xyOf, TOWNS } from '../site/map-grid.js';
import { stopsOf, toMin } from '../plans/rules.js';
import { unpackShape, packShape, decodePolyline, SHAPE_SCALE } from './drives.js';
import { tableLeg } from './plan.js';
import { typeOfStop } from './icons.js';

/** The road shapes from the build, or null for none: every leg is then drawn straight and dashed. */
let routes = null;

/** Use the build's road shapes. `made` is the drive table's: the two files must be from one build. */
export function useRoutes(shapes, made) {
  if (shapes == null) { routes = null; return; }
  if (typeof shapes.legs !== 'object' || shapes.legs === null || !Number.isFinite(shapes.scale)) throw new Error('road shapes need legs and a scale');
  if (shapes.made !== made) throw new Error(`the road shapes (${shapes.made}) and the drive table (${made}) are from different builds`);
  routes = shapes;
}

/**
 * The roads from a home's own row (useHomeRow in plan.js, point number `i`): `roads[k]` is the router's encoded
 * polyline to the table's stop k, and `to` is the table's column → point numbers.
 */
export function useHomeRoads(i, roads, to) {
  routes ??= { scale: SHAPE_SCALE, legs: {} };
  for (const [k, poly] of Object.entries(roads)) {
    routes.legs[`${i}>${to[Number(k)]}`] = packShape(decodePolyline(poly).map(([lat, lon]) => xyOf(lat, lon)));
  }
}

/** One drive as a line in map units: the road when the build has it, or straight. */
function legOf(from, to) {
  const a = xyOf(from.lat, from.lon), b = xyOf(to.lat, to.lon);
  const leg = tableLeg(from, to);
  const packed = leg && routes?.legs[`${leg.from}>${leg.to}`];
  if (!packed) return { road: false, line: [a, b], lead: null };
  const line = unpackShape(packed);
  return { road: true, line, lead: leg.snap ? [a, line[0]] : null };
}

/**
 * One trip's drive as lines in map units: home to the first stop, then each stop to the next, and with `back`, home
 * again. Each leg is { line, road }; `road: false` is a straight line, drawn dashed, where the build has no road for it.
 * A home set from the phone and moved to a table place has a dashed `lead` to it. The way home is the road out from
 * home to the last stop, turned round: the drive table has roads from home, not to it.
 */
export function routeLegs(home, outing, { back = false, from: start = null } = {}) {
  const stops = stopsOf(outing).filter((s) => s.lat != null);
  const legs = [];
  let from = start ?? home;
  for (const s of stops) { legs.push(legOf(from, s)); from = s; }
  if (back && stops.length) {
    const out = legOf(home, stops.at(-1));
    legs.push({ ...out, back: true, line: [...out.line].reverse(), lead: out.lead && [...out.lead].reverse() });
  }
  return { stops, legs };
}

/**
 * How each trip of a day connects to the next, from `naps` (the children's sleeps, [start, end] as "HH:MM"). Home is only
 * where a nap is, so with no nap between two trips the family drives on from one to the next: `fromHome` is false for a
 * trip that follows one directly, `backHome` false for a trip that is followed by one. Home still starts the day and ends it.
 */
export function tripLinks(trips, naps = []) {
  const napBetween = (a, b) => naps.some(([s]) => toMin(s) >= toMin(a.outing.leave) && toMin(s) < toMin(b.outing.arrive));
  return trips.map((t, i) => ({
    fromHome: i === 0 || napBetween(trips[i - 1], t),
    backHome: i === trips.length - 1 || napBetween(t, trips[i + 1]),
  }));
}

/** Each trip's colour, in the day's order: the map's lines, its pins and the key under it. */
export const TRIP_COLORS = ['#1d6fb8', '#d0592a', '#7a4cb0'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (v) => +v.toFixed(1);
const pts = (line) => line.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
const short = (t) => (t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t);

/** The frame around these points: padded, at least `MIN_W` across, and 16:10. */
const MIN_W = 110, RATIO = 1.6;
function frame(all) {
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.15 + 12;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let w = Math.max(x1 - x0, MIN_W), h = y1 - y0;
  if (w / h < RATIO) w = h * RATIO; else h = w / RATIO;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The route map for one outing: home to its stops. */
export const routeMap = ({ home, outing, base }) => dayMap({ home, trips: [{ outing }], base, back: false });

/**
 * The day's route map, as an <svg>: every trip of the day (`trips`, in time order, each { outing }) in its own colour
 * (TRIP_COLORS), its stops numbered through the day. The route runs home, then stop to stop, and home again only where a
 * nap is between two trips (`naps`, see tripLinks) and at the day's end. `base` is the inside of /map-base.svg
 * (its <svg> tag taken off). Sizes are fractions of the frame, so it reads the same at any zoom; lines keep their
 * width on screen (vector-effect, in family.css). '' when no trip has a stop on the map.
 */
export function dayMap({ home, trips, base, naps = [], back = true }) {
  const mapped = trips.map((t, i) => ({ t, i, stops: stopsOf(t.outing).filter((s) => s.lat != null) })).filter((x) => x.stops.length);
  const links = tripLinks(mapped.map((x) => x.t), naps);
  const drawn = mapped.map(({ t, i }, k) => ({
    ...routeLegs(home, t.outing, { back: back && links[k].backHome, from: links[k].fromHome ? home : mapped[k - 1].stops.at(-1) }),
    color: TRIP_COLORS[i % TRIP_COLORS.length], link: links[k],
  }));
  if (!drawn.length) return '';
  const stops = drawn.flatMap((t) => t.stops.map((s) => ({ s, color: t.color })));
  const legs = drawn.flatMap((t) => t.legs.map((l) => ({ ...l, color: t.color })));
  const h = xyOf(home.lat, home.lon);
  const at = stops.map(({ s }) => xyOf(s.lat, s.lon));
  const f = frame([h, ...at, ...legs.flatMap((l) => l.line)]);
  const u = f.w / 100; // one hundredth of the frame's width
  const pins = [h, ...at];
  // A town's name only where it's clear of the pins and their labels.
  const clear = ([x, y]) => x > f.x + 8 * u && x < f.x + f.w - 8 * u && y > f.y + 4 * u && y < f.y + f.h - 2 * u
    && pins.every(([px, py]) => Math.abs(px - x) > 22 * u || Math.abs(py - y) > 9 * u);
  const towns = TOWNS.map((t) => ({ ...t, xy: xyOf(t.lat, t.lon) })).filter((t) => clear(t.xy))
    .map((t) => `<text class="fa-town" x="${n(t.xy[0])}" y="${n(t.xy[1])}" font-size="${n(u * 3.2)}" stroke-width="${n(u * 0.8)}" text-anchor="middle">${esc(t.name)}</text>`).join('');
  // The ways home first, under the ways out: a one-stop trip comes home on the road it went by.
  const lines = [...legs.filter((l) => l.back), ...legs.filter((l) => !l.back)].map((l) => {
    const lead = l.lead ? `<polyline class="fa-route-lead" stroke="${l.color}" points="${pts(l.lead)}"/>` : '';
    return `${lead}<polyline class="fa-route-case" points="${pts(l.line)}"/><polyline class="fa-route${l.road ? '' : ' fa-route-straight'}${l.back ? ' fa-route-back' : ''}" stroke="${l.color}" points="${pts(l.line)}"/>`;
  }).join('');
  // A label above its pin, or below when the next pin is the one above; centred on the pin, but slid along so its
  // whole width stays inside the frame (its width estimated from its length: a long name near an edge was cut off).
  const label = (i, text) => {
    const [x, y] = pins[i], other = pins[i === 0 ? 1 : i - 1];
    const below = other && other[1] < y && Math.abs(other[1] - y) < 12 * u;
    const size = u * 3.6, w = Math.min(text.length * size * 0.58, f.w - 3 * u);
    const left = Math.min(Math.max(x - w / 2, f.x + 1.5 * u), f.x + f.w - 1.5 * u - w);
    return `<text class="fa-pin-label" x="${n(left + w / 2)}" y="${n(below ? y + u * 7.2 : y - u * 4.4)}" font-size="${n(size)}" stroke-width="${n(u * 0.9)}" text-anchor="middle">${esc(text)}</text>`;
  };
  const homePin = `<circle class="fa-pin-home" cx="${n(h[0])}" cy="${n(h[1])}" r="${n(u * 1.8)}"/>${label(0, 'Home')}`;
  // Each stop's pin carries its type's icon (icons.js), ringed in its trip's colour; with several, numbered in its label.
  const stopPins = at.map(([x, y], i) => {
    const type = typeOfStop(stops[i].s);
    return `<circle class="fa-pin-stop" stroke="${stops[i].color}" stroke-width="${n(u * 0.7)}" cx="${n(x)}" cy="${n(y)}" r="${n(u * 3)}"><title>${esc(type.label)}</title></circle>`
      + `<text class="fa-pin-icon" x="${n(x)}" y="${n(y + u * 1.25)}" font-size="${n(u * 3.4)}" text-anchor="middle" aria-hidden="true">${type.icon}</text>`
      + label(i + 1, `${stops.length > 1 ? `${i + 1}. ` : ''}${short(stops[i].s.title)}`);
  }).join('');
  const straight = legs.some((l) => !l.road);
  // Stops that follow on without a visit home read as one drive; a nap between splits them.
  const runs = drawn.reduce((all, t) => { if (t.link.fromHome) all.push([]); all.at(-1).push(...t.stops.map((s) => s.title)); return all; }, []);
  const name = runs.map((r) => r.join(', then ')).join('; later, ');
  return `<figure class="fa-map"><svg viewBox="${n(f.x)} ${n(f.y)} ${n(f.w)} ${n(f.h)}" role="img" aria-label="${esc(`Map of the drive${runs.length > 1 ? 's' : ''} from home to ${name}`)}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"><g class="fa-base">${base}</g>${towns}${lines}${homePin}${stopPins}</svg>${straight ? '<figcaption class="fa-note">A dashed line is a straight line: we don\'t have that road drawn.</figcaption>' : ''}</figure>`;
}
