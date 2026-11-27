// The day map's layout: the frame around a day's stops, where each pin sits in it, and how a drive is worded. The
// build lays the map out from the stops alone (map.js); a family with a home saved gets home added in their own
// browser (src/family/www/daymap.js), which lays the same map out again around it. Both use these functions, so
// the two agree. It runs in the browser and in the tests, so its imports stay free of anything Node.

import { BOUNDS, MAP_W, MAP_H, xyOf } from './map-grid.js';
import { worstFactor, trafficWord } from '../family/traffic.js';

/** The day map's width over its height. */
export const RATIO = 2.6;

export const inBounds = ({ lat, lon }) => lat > BOUNDS.south && lat < BOUNDS.north && lon > BOUNDS.west && lon < BOUNDS.east;

/** The frame that closes in on these points ([[x, y]], map units): padded, at least half the map across, inside the map. */
export function frameOf(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, (y1 - y0) * RATIO) * 0.18 + MAP_W * 0.03;
  x0 -= pad; x1 += pad; y0 -= pad / RATIO; y1 += pad / RATIO;
  let w = Math.max(x1 - x0, MAP_W * 0.5, (y1 - y0) * RATIO);
  w = Math.min(w, MAP_W);
  const h = w / RATIO, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: Math.min(Math.max(cx - w / 2, 0), MAP_W - w), y: Math.min(Math.max(cy - h / 2, 0), Math.max(MAP_H - h, 0)), w, h };
}

/** The map picture's style, slid and sized so the frame shows this part of it. */
export const imgStyle = (f) => `width:${(MAP_W / f.w * 100).toFixed(1)}%;left:${(-f.x / f.w * 100).toFixed(1)}%;top:${(-f.y / f.h * 100).toFixed(1)}%`;

/** The frame as the drawn lines' viewBox. */
export const viewBoxOf = (f) => `${f.x.toFixed(1)} ${f.y.toFixed(1)} ${f.w.toFixed(1)} ${f.h.toFixed(1)}`;

/**
 * Each pin's style in the frame, for points `xy` in order. A pin close to an earlier one is nudged aside (the road
 * still ends at the stop itself), so none hides another.
 */
export function pinStyles(xy, f) {
  const nudges = [[1.1, -.9], [-1.1, .9], [1.1, .9], [-1.1, -.9]];
  const close = (i, j) => Math.hypot((xy[i][0] - xy[j][0]) / f.w * 100, (xy[i][1] - xy[j][1]) / f.h * 100 / RATIO) < 6.5;
  return xy.map(([x, y], i) => {
    const k = xy.slice(0, i).filter((_, j) => close(i, j)).length;
    const [dx, dy] = k ? nudges[(k - 1) % nudges.length] : [0, 0];
    return `left:${((x - f.x) / f.w * 100).toFixed(1)}%;top:${((y - f.y) / f.h * 100).toFixed(1)}%${k ? `;margin:${dy}rem 0 0 ${dx}rem` : ''}`;
  });
}

/**
 * A drive in words: its minutes in typical traffic (`factor`, traffic.js) and its miles. A short hop is to the
 * minute; a longer drive goes up to five, which is as close as traffic can be told.
 */
export function driveWords(clearMinutes, miles, factor) {
  const slow = clearMinutes * factor, minutes = slow < 20 ? Math.max(2, Math.ceil(slow)) : Math.ceil(slow / 5) * 5, word = trafficWord(factor);
  return `about ${minutes} minutes, ${miles} miles${word ? `, ${word}` : ''}`;
}

/** The line under the drives: what the times are, and what a dashed line is. '' with neither. */
export const routeNote = (driven, straight) => [driven && 'Drive times are for typical traffic at that hour, not live.', straight && 'A dashed line is straight, not a road.'].filter(Boolean).join(' ');

/**
 * The day's trips from home, from its stops in order: [{ first, car, last }], each a number in `stops`. A stop marked
 * `apart` starts a new trip (a nap sent the family home before it). `first` is where the drive from home ends, `last`
 * the trip's last stop, and `car` where the drive home starts: the last stop, or the one the family parked at when they
 * walked on from it (`walk`: this stop was walked to from the one before).
 */
export function homeRuns(stops) {
  const runs = [];
  stops.forEach((s, i) => {
    if (i === 0 || s.apart) runs.push({ first: i, car: i, last: i });
    else { const r = runs.at(-1); r.last = i; if (!s.walk) r.car = i; }
  });
  return runs;
}

/**
 * The day map again with home on it. `stops` are the map's, in order: [{ lat, lon, apart, walk, arrive, leave }]
 * (`arrive` and `leave` are the stop's outing's, "HH:MM", for the traffic then). `lines` are the roads already
 * drawn between the stops, each [[x, y]], which the frame must keep in. `driveFrom(stop)` is the drive from home to
 * that stop: { minutes (clear road), miles, line: [[x, y]] or null with no road drawn } or null where there's no
 * way by road. The way home is the way out turned round, as on the family page (routemap.js).
 *
 * Returns the new layout: `img` and `viewBox` for the frame, `pins` (each stop's style), `homePin` (home's),
 * `roads` (the lines to add, [{ points, road }], `road: false` a straight one), `list` (the drives in the day's
 * order: { keep: n } is the drive already listed that ends at stop number n, { label, words } a drive from or to
 * home) and `straight` (whether any home line is). null when home is off the map or no stop can be driven to.
 */
export function withHome({ stops, lines = [], home, driveFrom, date = null }) {
  if (!inBounds(home)) return null;
  const h = xyOf(home.lat, home.lon), xy = stops.map((s) => xyOf(s.lat, s.lon));
  const drives = new Map();
  const drive = (i) => { if (!drives.has(i)) drives.set(i, driveFrom(stops[i])); return drives.get(i); };
  const words = (d, time) => driveWords(d.minutes, d.miles, worstFactor(date, time == null ? [] : [time]));
  const list = [];
  for (const r of homeRuns(stops)) {
    const out = drive(r.first), back = drive(r.car);
    if (out) list.push({ label: `Home to ${r.first + 1}`, words: words(out, stops[r.first].arrive) });
    for (let i = r.first + 1; i <= r.last; i++) list.push({ keep: i + 1 });
    if (back) list.push({ label: `${r.car + 1} to home`, words: words(back, stops[r.last].leave) });
  }
  const roads = [...drives].filter(([, d]) => d).map(([i, d]) => ({ points: d.line ?? [h, xy[i]], road: Boolean(d.line) }));
  if (!roads.length) return null;
  const f = frameOf([h, ...xy, ...lines.flat(), ...roads.flatMap((r) => r.points)]);
  const pins = pinStyles([...xy, h], f);
  return { img: imgStyle(f), viewBox: viewBoxOf(f), pins: pins.slice(0, -1), homePin: pins.at(-1), roads, list, straight: roads.some((r) => !r.road) };
}
