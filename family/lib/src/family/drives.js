// Real drive times for Triangle Tots Family, asked of the OSRM router on VM 106 at the build
// and published as /family/drives.json. The browser looks them up and asks no one: nothing about
// the family leaves the device. Every place home can be set from (where.json) and every stop
// with a point (points.json) is a row; every stop is a column. See docs/family-plans.md.
//
// The build runs the fetching here; the browser uses only `unpackShape` (routemap.js), so this
// file imports nothing. The browser side of drive times is `useDrives`/`driveBetween` in plan.js.

/** OSRM's table service allows sources × destinations up to this many (osrm-routed's default, 100²). */
const MAX_CELLS = 100 * 100;
/** The router measures in meters. */
const METERS_PER_TENTH_MILE = 160.9344;

const key = ([lat, lon]) => `${lat},${lon}`;

/** The unique points of a list of [lat, lon], in order. */
function unique(points) {
  const seen = new Map();
  for (const p of points) if (!seen.has(key(p))) seen.set(key(p), p);
  return [...seen.values()];
}

/**
 * { points, to, minutes, miles, made }: minutes[i][k] is the drive from points[i] to points[to[k]],
 * whole minutes rounded up, or null where the router found no road; miles[i][k] is that road's
 * length to a tenth of a mile. Throws when the router
 * can't be reached or answers anything but Ok: a launch build must not quietly go without.
 */
export async function driveTable({ where, points, routing, fetchImpl = fetch, now = new Date() }) {
  if (!routing) throw new Error('driveTable needs the router address (--routing or FAMILY_ASSISTANT_ROUTING)');
  const stops = unique(Object.values(points));
  const homes = unique([...Object.values(where.zips), ...Object.values(where.towns)]);
  const all = unique([...stops, ...homes]);
  const to = stops.map((s) => all.findIndex((p) => key(p) === key(s)));
  const rows = Math.max(1, Math.floor(MAX_CELLS / Math.max(1, stops.length)));
  const minutes = [], miles = [];
  for (let start = 0; start < all.length; start += rows) {
    const from = all.slice(start, start + rows);
    const coords = [...from, ...stops].map(([lat, lon]) => `${lon},${lat}`).join(';');
    const sources = from.map((_, i) => i).join(';');
    const destinations = stops.map((_, i) => from.length + i).join(';');
    const url = `${routing.replace(/\/$/, '')}/table/v1/driving/${coords}?sources=${sources}&destinations=${destinations}&annotations=duration,distance`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`the router answered ${res.status} for a table of ${from.length} × ${stops.length}`);
    const body = await res.json();
    if (body.code !== 'Ok') throw new Error(`the router said ${body.code}: ${body.message ?? 'no message'}`);
    if (body.durations?.length !== from.length) throw new Error(`the router sent ${body.durations?.length} rows for ${from.length} places`);
    if (body.distances?.length !== from.length) throw new Error(`the router sent ${body.distances?.length} rows of distances for ${from.length} places`);
    for (const row of body.durations) minutes.push(row.map((s) => (s == null ? null : Math.ceil(s / 60))));
    for (const row of body.distances) miles.push(row.map((m) => (m == null ? null : Math.round(m / METERS_PER_TENTH_MILE) / 10)));
  }
  return { made: now.toISOString(), points: all, to, minutes, miles };
}

// ---- The roads themselves, for the route map ----

/** Shapes are kept to this many map units (about 90 m), and stored in halves of one. */
const SIMPLIFY_UNITS = 1;
export const SHAPE_SCALE = 2;
const ROUTE_REQUESTS_AT_ONCE = 8;
/** The longest drive from one outing straight on to the next that gets a road drawn (minutes, no traffic). */
export const CHAIN_MAX_MIN = 20;

/** OSRM's encoded polyline, precision 5, as [lat, lon]. */
export function decodePolyline(text) {
  const out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < text.length) {
    const next = () => {
      let b, shift = 0, v = 0;
      do { b = text.charCodeAt(i++) - 63; v |= (b & 31) << shift; shift += 5; } while (b >= 32);
      return v & 1 ? ~(v >> 1) : v >> 1;
    };
    lat += next();
    lon += next();
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

/** Douglas–Peucker: the fewest points within `eps` of the line. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = len ? Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(x - a[0], y - a[1]);
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

/** A shape in map units as whole halves: the first point, then each step from the one before. */
export function packShape(xy) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of simplify(xy, SIMPLIFY_UNITS)) {
    const qx = Math.round(x * SHAPE_SCALE), qy = Math.round(y * SHAPE_SCALE);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx; py = qy;
  }
  return out;
}

/** packShape's inverse, in map units. */
export function unpackShape(packed) {
  const out = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < packed.length; i += 2) { x += packed[i]; y += packed[i + 1]; out.push([x / SHAPE_SCALE, y / SHAPE_SCALE]); }
  return out;
}

/**
 * { made, scale, legs }: the road for every drive the planner can choose, keyed "i>j" by the
 * drive table's own point numbers. That's each place home can be set from (where.json) to every
 * stop within `maxMinutes`, and each `stopPairs` [[lat, lon], [lat, lon]] (one stop to the next
 * inside an outing). `xyOf` turns [lat, lon] into map units. `made` is the table's, so the page
 * can tell the two files are from one build. Also each `chainPairs` (a stop to another outing's first stop, the drive on
 * when no nap sends the family home) that is within `CHAIN_MAX_MIN`: a day wouldn't chain farther than that, and every
 * pair would be thousands of roads. Throws on any answer but Ok.
 */
export async function routeShapes({ table, where, stopPairs = [], chainPairs = [], maxMinutes, xyOf, routing, fetchImpl = fetch }) {
  if (!routing) throw new Error('routeShapes needs the router address (--routing or FAMILY_ASSISTANT_ROUTING)');
  if (!Number.isFinite(maxMinutes)) throw new Error('routeShapes needs maxMinutes');
  const row = new Map(table.points.map((p, i) => [key(p), i]));
  const wanted = new Map();
  const want = (i, j) => { if (i !== j) wanted.set(`${i}>${j}`, [i, j]); };
  for (const p of unique([...Object.values(where.zips), ...Object.values(where.towns)])) {
    const i = row.get(key(p));
    if (i == null) throw new Error(`home place ${key(p)} isn't in the drive table`);
    table.to.forEach((j, k) => { const m = table.minutes[i][k]; if (m != null && m <= maxMinutes) want(i, j); });
  }
  for (const [a, b] of stopPairs) {
    const i = row.get(key(a)), j = row.get(key(b));
    if (i == null || j == null) throw new Error(`stop ${key(i == null ? a : b)} isn't in the drive table`);
    if (table.minutes[i][table.to.indexOf(j)] != null) want(i, j); // no road, no drive: the planner never makes it
  }
  for (const [a, b] of chainPairs) {
    const i = row.get(key(a)), j = row.get(key(b));
    if (i == null || j == null) continue; // a stop the table doesn't have is no drive the page can plan either
    const m = table.minutes[i][table.to.indexOf(j)];
    if (m != null && m <= CHAIN_MAX_MIN) want(i, j);
  }
  const legs = {};
  const queue = [...wanted];
  const base = routing.replace(/\/$/, '');
  const work = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, [i, j]] = next;
      const [a, b] = [table.points[i], table.points[j]];
      const res = await fetchImpl(`${base}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=polyline&steps=false`);
      if (!res.ok) throw new Error(`the router answered ${res.status} for the road ${id}`);
      const body = await res.json();
      if (body.code !== 'Ok' || !body.routes?.[0]?.geometry) throw new Error(`the router said ${body.code} for the road ${id}: ${body.message ?? 'no route'}`);
      legs[id] = packShape(decodePolyline(body.routes[0].geometry).map(([lat, lon]) => xyOf(lat, lon)));
    }
  };
  await Promise.all(Array.from({ length: ROUTE_REQUESTS_AT_ONCE }, work));
  return { made: table.made, scale: SHAPE_SCALE, legs };
}
