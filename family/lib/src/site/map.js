// The site's own map of the Triangle: site/map.svg (drawn once from Census data by
// scripts/make-map.js) with pins laid over it in HTML. Nothing here or on the page
// asks a map service for anything, so a visitor's browser talks only to this site.

import { AREA_NAMES } from './settings.js';
import { esc } from './page.js';
import { iconOf } from './typeicon.js';
import { worstFactor } from '../family/traffic.js';
import { milesApart, WALK_MILES } from '../plans/rules.js';

import { BOUNDS, MAP_W, MAP_H, xyOf, TOWNS } from './map-grid.js';
import { inBounds, frameOf, imgStyle, viewBoxOf, pinStyles, driveWords, routeNote } from './dayroute.js';

export { BOUNDS, MAP_W, MAP_H, xyOf, TOWNS };

const pctOf = (lat, lon) => { const [x, y] = xyOf(lat, lon); return [+(x / MAP_W * 100).toFixed(2), +(y / MAP_H * 100).toFixed(2)]; };

export const ROAD_LABELS = [
  { text: 'I-40', lat: 35.848, lon: -78.905 },
  { text: 'I-85', lat: 36.068, lon: -78.97 },
  { text: 'I-540', lat: 35.9, lon: -78.72 },
  { text: 'US-1', lat: 35.63, lon: -78.92 },
];

/** Where the home page puts each area's button on the map, with the short name that fits there. */
export const AREA_SPOTS = {
  'durham': { lat: 36.0, lon: -78.89, short: 'Durham' },
  'chapel-hill': { lat: 35.88, lon: -79.09, short: 'Chapel Hill' },
  'north-raleigh': { lat: 35.93, lon: -78.6, short: 'North Raleigh' },
  'raleigh': { lat: 35.77, lon: -78.63, short: 'Raleigh' },
  'cary-apex': { lat: 35.76, lon: -78.84, short: 'Cary / Apex' },
  'south-wake': { lat: 35.6, lon: -78.75, short: 'South Wake' },
  'east-wake': { lat: 35.78, lon: -78.41, short: 'East Wake' },
};

const key = (s) => String(s ?? '').toLowerCase().replace(/\b(the|at|of|park|library|community|regional|branch)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
// "1930 Clark Ave, Raleigh" and "1930 Clark Avenue" are one place: the number and the street's first word.
const addressKey = (s) => { const m = /^\s*(\d+)\s+(?:[NSEW]\.?\s+)?([A-Za-z]+)/.exec(s ?? ''); return m ? `${m[1]} ${m[2].toLowerCase()}` : null; };

/**
 * A lookup from a stop in a plan to its point, by address and then by name, in the
 * places list. Plans don't carry points; null for a venue the list doesn't have,
 * and that stop simply has no map.
 */
export function placeFinder(places) {
  const byAddress = new Map(), byExact = new Map(), byName = new Map();
  const exact = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const p of places) {
    const a = addressKey(p.address), n = key(p.name);
    if (a && !byAddress.has(a)) byAddress.set(a, p);
    if (!byExact.has(exact(p.name))) byExact.set(exact(p.name), p);
    // "Library Park" has no words left once the common ones go. It is found by its whole name alone: under '' it
    // was what every stop with no venue and no numbered address turned out to be (2026-11-13: Beech Bluff County
    // Park, 7 miles away, was drawn there).
    if (n && !byName.has(n)) byName.set(n, p);
  }
  const named = (s) => (exact(s) ? byExact.get(exact(s)) ?? (key(s) ? byName.get(key(s)) : undefined) : undefined);
  return ({ address, venue, title } = {}) => {
    const found = byAddress.get(addressKey(address)) ?? named(venue) ?? named(title) ?? null;
    return found && inBounds(found) ? found : null;
  };
}

/** One place, close up, for an outing's card. null with no point to show. */
export function miniMap(point, label, icon = null) {
  if (!point) return '';
  const zoom = 1.8, ratio = 2.6; // the frame's width over its height
  const [px, py] = pctOf(point.lat, point.lon);
  const heightInFrames = (zoom * MAP_H * ratio) / MAP_W;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  // The picture slides under the frame to bring the pin near the middle, stopping at the map's edges.
  const left = clamp(50 - (px * zoom), 100 - 100 * zoom, 0);
  const top = clamp(50 - (py / 100) * heightInFrames * 100, 100 - heightInFrames * 100, 0);
  return `<figure class="mini" role="img" aria-label="${esc(`Map showing ${label}`)}"><img src="/map.svg" alt="" loading="lazy" decoding="async" style="width:${zoom * 100}%;left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">${pinAt(`${(left + px * zoom).toFixed(1)}%`, `${(top + (py / 100) * heightInFrames * 100).toFixed(1)}%`, icon)}</figure>`;
}

/** The build's roads for the day map: (from, to) → { line, minutes, miles } or null. Set by the build (roads.js); none in a preview. */
let roadFor = null;
export const useDayRoads = (lookup) => { roadFor = lookup; };
/** The road between two points on a day's map, { line, minutes, miles }, or null with none: for the day's steps (daypart.js). */
export const dayRoad = (a, b) => (roadFor ? roadFor(a, b) : null);

/**
 * A day's stops on one map, in the order they are visited: numbered pins, each with its icon, and the road from one stop to the
 * next where the family drives on (a straight dashed line where there is no road), with each drive's time in typical traffic
 * (to the minute under 20, else up to five).
 * `stops` are [{ lat, lon, title, icon, apart, at }]; `at` is when the drive to that stop starts ("HH:MM"), `date` the day. `apart` is true when something that
 * needs home sits between a stop and the one before it (a nap), so no line is drawn there: that drive goes by the family's
 * own address, which this page doesn't have. The frame closes in on the stops. '' with fewer than two on the map.
 *
 * With `family` (family plans are open) the map also carries what a family's own browser needs to add their home
 * and the drives from it and back (src/family/www/daymap.js): each stop's `arrive` and `leave` are its outing's
 * times. A day of one stop then has a map too, hidden until home is on it.
 */
export function dayRoute(stops, { date = null, family = false } = {}) {
  const at = stops.filter(inBounds);
  // One stop is the outing card's own map. With family plans it is here too, kept hidden: home and the drive there
  // are what make it worth a map, and those are put on in the family's own browser.
  if (at.length < (family ? 1 : 2)) return '';
  const xy = at.map((s) => xyOf(s.lat, s.lon));
  // Each drive on from a stop: the real road where the build has one (roads.js), else a straight line.
  const drives = at.slice(1).map((s, i) => {
    if (s.apart) return null;
    // Next door (a library and the park beside it) is a walk: no road, and no drive time.
    const apart = milesApart(at[i], s), walk = apart != null && apart <= WALK_MILES;
    return { walk, road: walk || !roadFor ? null : roadFor(at[i], s), s };
  });
  const f = frameOf([...xy, ...drives.flatMap((d) => d?.road?.line ?? [])]);
  const lines = drives.map((d, i) => {
    if (!d) return '';
    if (d.road) return `<polyline points="${d.road.line.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`;
    return `<line class="straight${d.walk ? ' walk' : ''}" x1="${xy[i][0].toFixed(1)}" y1="${xy[i][1].toFixed(1)}" x2="${xy[i + 1][0].toFixed(1)}" y2="${xy[i + 1][1].toFixed(1)}"/>`;
  }).join('');
  // How long each road takes, in typical traffic at the hour it is driven (traffic.js), rounded up to five minutes.
  const times = drives.flatMap((d, i) => {
    if (d?.walk) return [`<li><b>${i + 1} to ${i + 2}</b> a short walk</li>`];
    if (!d?.road) return [];
    return [`<li><b>${i + 1} to ${i + 2}</b> ${driveWords(d.road.minutes, d.road.miles, worstFactor(date, d.s.at == null ? [] : [d.s.at]))}</li>`];
  });
  const note = routeNote(drives.some((d) => d?.road), drives.some((d) => d && !d.road && !d.walk));
  const timesHtml = times.length ? `<ul class="dayroute-legs">${times.join('')}</ul>${note ? `<p class="muted dayroute-note">${note}</p>` : ''}` : '';
  const styles = pinStyles(xy, f);
  const pins = at.map((s, i) => `<i class="pin ic" data-n="${i + 1}" style="${styles[i]}" title="${esc(`${i + 1}. ${s.title}`)}">${s.icon ? `<span aria-hidden="true">${s.icon}</span>` : ''}</i>`).join('');
  const label = `Map of the day: ${at.map((s, i) => `${i + 1}, ${s.title}`).join('; ')}`;
  // What a family's browser needs to put home on the map (dayroute.js's withHome): each stop's point, whether a nap
  // sent them home before it or they walked to it, and its outing's times for the traffic then.
  const forHome = family ? ` data-date="${esc(date ?? '')}" data-stops="${esc(JSON.stringify(at.map((s, i) => ({ lat: s.lat, lon: s.lon, apart: Boolean(s.apart), walk: Boolean(drives[i - 1]?.walk), arrive: s.arrive ?? null, leave: s.leave ?? null }))))}"` : '';
  const alone = at.length < 2;
  return `<figure class="mini dayroute" role="img" aria-label="${esc(label)}"${forHome}${alone ? ' hidden' : ''}><img src="/map.svg" alt="" loading="lazy" decoding="async" style="${imgStyle(f)}"><svg viewBox="${viewBoxOf(f)}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${pins}</figure>${timesHtml}${homeNotice(family)}`;
}

/**
 * Under every day map, one short line and a button: the map has no home on it, and a home address gives real drive
 * times. Signed out the button asks for an address right there, for this browser alone (src/family/www/daymap.js);
 * signed in it takes them to set their address (the family page's #home); once either is saved it isn't shown at all
 * (page.js marks the page has-home before it paints). `family` is whether family plans are open; before then the
 * button is the waitlist.
 */
function homeNotice(family) {
  const pin = '<span class="ic" aria-hidden="true">📍</span>';
  if (!family) return `<p class="dayroute-home">${pin}<span class="say">Home addresses and real drive times are coming soon!</span><a class="btn" href="/custom/" data-goal="map-waitlist">Join the waitlist</a></p>`;
  return `<p class="dayroute-home" data-out>${pin}<span class="say">Add your address to see this day from your door, with real drive times!</span><button type="button" class="btn" data-from-open data-goal="map-address">Enter my address</button></p>`
    + `<p class="dayroute-home" data-in>${pin}<span class="say">Add your home address to get real drive times!</span><a class="btn" href="/family/#home" data-goal="map-set-home">Set my address</a></p>`;
}

/** A pin: with an icon (what the place or outing is, typeicon.js) it is the icon on a white round, else a plain dot. */
const pinAt = (left, top, icon, title = '') => `<i class="pin${icon ? ' ic' : ''}" style="left:${left};top:${top}"${title ? ` title="${esc(title)}"` : ''}>${icon ? `<span aria-hidden="true">${icon}</span>` : ''}</i>`;

/** The whole Triangle with a pin for each entry of `pins`: places, [{ lat, lon, name, kind }], each pinned with its kind's icon. */
export function pinMap(pins, caption) {
  const shown = pins.filter(inBounds);
  if (!shown.length) return '';
  return `<figure class="pinmap"><div class="board"><img src="/map.svg" alt="" width="${MAP_W}" height="${MAP_H}" loading="lazy" decoding="async">${shown.map((p) => { const [x, y] = pctOf(p.lat, p.lon); return pinAt(`${x}%`, `${y}%`, iconOf(p), p.name); }).join('')}</div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}

/** The home page's map: a button per area on the plain map, with today's outings as pins. */
export function areaPicker(pins) {
  const buttons = Object.entries(AREA_SPOTS).map(([id, s]) => {
    const [x, y] = pctOf(s.lat, s.lon);
    return `<button type="button" data-area="${esc(id)}" aria-pressed="false" aria-label="${esc(AREA_NAMES[id])}" style="left:${x}%;top:${y}%">${esc(s.short)}</button>`;
  }).join('');
  // An outing's pin is a link to its plan; hovering or focusing it shows what it is, when and where, and for which ages.
  const dots = pins.filter(inBounds).map((p) => {
    const [x, y] = pctOf(p.lat, p.lon), at = `style="left:${x}%;top:${y}%"`;
    if (!p.icon) return `<i class="dot" ${at}></i>`;
    const tip = p.title ? `<b class="pintip" role="tooltip"><strong>${esc(p.title)}</strong>${p.when ? `<small>${esc(p.when)}</small>` : ''}${p.ages ? `<small class="for">${esc(p.ages)}</small>` : ''}</b>` : '';
    const label = p.title ? ` aria-label="${esc([p.title, p.when].filter(Boolean).join(', '))}"` : '';
    return p.href && p.title
      ? `<a class="dot ic" ${at} href="${esc(p.href)}"${label}><span aria-hidden="true">${p.icon}${tip}</span></a>`
      : `<i class="dot ic" ${at}><span aria-hidden="true">${p.icon}</span></i>`;
  }).join('');
  return `<div class="board picker"><img src="/map-plain.svg" alt="Map of the Triangle" width="${MAP_W}" height="${MAP_H}" loading="lazy" decoding="async">${dots}${buttons}</div>`;
}
