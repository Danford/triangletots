// The real road between two stops on a day page's map, from the build's own router (OSRM on VM 106, the one the
// Family page's drive times use). The build asks once for each drive the pages show and keeps the road's shape (in
// the map's own units, to about 90 m) and its length and clear-road minutes; the page then carries only the finished
// SVG, so a visitor's browser asks no one anything. Without a router (a preview, an --offline build) there are no roads
// and the map draws a straight, dashed line and gives no drive time: nothing is made up.

import { decodePolyline, packShape, unpackShape } from '../family/drives.js';

const key = (a, b) => `${a.lat},${a.lon}>${b.lat},${b.lon}`;
const REQUESTS_AT_ONCE = 8;

/**
 * Roads for a list of drives, [[from, to]] each { lat, lon }: a Map keyed "lat,lon>lat,lon" to
 * { line: [[x, y]] in map units, minutes (clear road, not rounded), miles }. `xyOf` turns a point into map units.
 * Throws on any answer but Ok: a build must not quietly publish maps with some roads missing.
 */
export async function roadsFor({ pairs, routing, xyOf, fetchImpl = fetch, known = new Map() }) {
  if (!routing) throw new Error('roadsFor needs the router address (--routing or FAMILY_ASSISTANT_ROUTING)');
  const base = routing.replace(/\/$/, '');
  // `known` holds roads asked for before (a preview keeps them on disk): those are not asked again.
  const queue = [...new Map(pairs.map(([a, b]) => [key(a, b), [a, b]]))].filter(([id]) => !known.has(id));
  const roads = new Map(known);
  const work = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, [a, b]] = next;
      const res = await fetchImpl(`${base}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=polyline&steps=false`);
      if (!res.ok) throw new Error(`the router answered ${res.status} for the road ${id}`);
      const body = await res.json();
      const r = body.routes?.[0];
      if (body.code !== 'Ok' || !r?.geometry) throw new Error(`the router said ${body.code} for the road ${id}: ${body.message ?? 'no route'}`);
      const line = unpackShape(packShape(decodePolyline(r.geometry).map(([lat, lon]) => xyOf(lat, lon))));
      roads.set(id, { line, minutes: r.duration / 60, miles: Math.round(r.distance / 160.9344) / 10 });
    }
  };
  await Promise.all(Array.from({ length: REQUESTS_AT_ONCE }, work));
  return roads;
}

/** A lookup for the map from a Map made by roadsFor: (from, to) → { line, minutes, miles }, or null with no road. */
export const roadLookup = (roads) => (a, b) => roads.get(key(a, b)) ?? null;

/** A lookup that finds no road, and notes each drive it was asked for in `wanted`: a dry render, to know what to fetch. */
export function roadRecorder(wanted) {
  return (a, b) => { wanted.set(key(a, b), [a, b]); return null; };
}
