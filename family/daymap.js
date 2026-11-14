// Home on a day page's map: a pin for home, the road from it to the day's first stop, home and out again across a
// nap, and the road home at the day's end, each with its time in typical traffic.
//
// Home is the family's own (the family page keeps it in this browser, under family:profile), or with no account an
// address typed under the map ("Enter my address"), kept in this browser alone under map:from. The page's own
// script (page.js) loads this file only in a browser that has one of those, or when that button is tapped.
//
// The drives are asked of our own server (POST /v1/family/drives: the router on our server, and nobody else is
// told), for this page's stops only, and kept in this browser for a week so a place seen before isn't asked about
// again. The layout is src/site/dayroute.js, the one the build laid the map out with.

import { xyOf } from './lib/src/site/map-grid.js';
import { decodePolyline, packShape, unpackShape } from './lib/src/family/drives.js';
import { homeRuns, withHome, routeNote } from './lib/src/site/dayroute.js';

const API = location.hostname === 'localhost' ? 'http://localhost:7791' : 'https://sync.tottoolbox.com';
const K = { profile: 'family:profile', session: 'family:session', from: 'map:from', drives: 'family:homeDrives' };
/** The server draws a road for a drive up to this long (its MAX_WITHIN); a longer one is a straight line. */
const WITHIN_MIN = 60;
/** The most stops the server takes in one ask with no account (its MAX_DAY_STOPS). */
const STOPS_AN_ASK = 60;
const KEEP_MS = 7 * 864e5, KEEP_MOST = 300;
const SVG = 'http://www.w3.org/2000/svg';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const key = (p) => `${p.lat},${p.lon}`;

/** Where the drives start: the family's saved home, else the address typed here. `own` is whether it's the account's. */
function startPoint() {
  const home = read(K.profile)?.home;
  if (home?.lat != null) return { lat: home.lat, lon: home.lon, label: home.label, own: true };
  const typed = read(K.from);
  return typed?.lat != null ? { ...typed, own: false } : null;
}

/** The drives kept for this start: { stop's "lat,lon": [minutes, miles, packed road or null] or null for no road }. */
function keptFor(home) {
  const kept = read(K.drives);
  const fresh = kept?.home === key(home) && Date.now() - kept.at < KEEP_MS && Object.keys(kept.to).length < KEEP_MOST;
  return fresh ? kept : { home: key(home), at: Date.now(), to: {} };
}

/** One ask of the server: the drives from `start` ({ address } or { at }) to `stops`. The answer names the point found. */
async function ask(start, stops) {
  const r = await fetch(`${API}/v1/family/drives`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...start, to: stops.map((s) => [s.lat, s.lon]), within: WITHIN_MIN }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The drives answered ${r.status}. Try again in a little while.`);
  if (j.minutes?.length !== stops.length || j.miles?.length !== stops.length) throw new Error(`asked for ${stops.length} drives and got ${j.minutes?.length}`);
  return j;
}

/** Keep an answer's drives with the rest for that start. */
function keepDrives(home, stops, j) {
  const kept = keptFor(home);
  stops.forEach((s, k) => {
    const road = j.roads?.[k];
    kept.to[key(s)] = j.minutes[k] == null ? null : [j.minutes[k], j.miles[k], road ? packShape(decodePolyline(road).map(([lat, lon]) => xyOf(lat, lon))) : null];
  });
  localStorage.setItem(K.drives, JSON.stringify(kept));
  return kept;
}

/**
 * The drive from home to each of `stops`, as a lookup: stop → { minutes, miles, line } (`line` null past WITHIN_MIN),
 * or null where there's no way by road. Only the stops not kept already are asked about.
 */
async function drivesFrom(home, stops) {
  let { to } = keptFor(home);
  const missing = [...new Map(stops.filter((s) => !(key(s) in to)).map((s) => [key(s), s])).values()];
  for (let i = 0; i < missing.length; i += STOPS_AN_ASK) {
    const some = missing.slice(i, i + STOPS_AN_ASK);
    ({ to } = keepDrives(home, some, await ask({ at: [home.lat, home.lon] }, some)));
  }
  return (s) => { const d = to[key(s)]; return d ? { minutes: d[0], miles: d[1], line: d[2] && unpackShape(d[2]) } : null; };
}

const maps = () => [...document.querySelectorAll('figure.dayroute[data-stops]')];
/** The stops a day's drives from home end at (and the drives home start from). */
const homeEnds = (stops) => homeRuns(stops).flatMap((r) => [stops[r.first], stops[r.car]]);
const pageEnds = () => maps().flatMap((f) => homeEnds(JSON.parse(f.dataset.stops)));

/** One map, laid out again with home on it. False when home can't be put on it. */
function draw(fig, home, driveFrom) {
  const stops = JSON.parse(fig.dataset.stops);
  const svg = fig.querySelector('svg'), pins = [...fig.querySelectorAll('.pin')];
  if (pins.length !== stops.length) throw new Error(`a day map has ${pins.length} pins for ${stops.length} stops`);
  const lines = [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('points').trim().split(/\s+/).map((q) => q.split(',').map(Number)));
  const laid = withHome({ stops, lines, home, driveFrom, date: fig.dataset.date || null });
  fig.dataset.home = laid ? 'on' : 'none';
  if (!laid) return false;
  fig.querySelector('img').style.cssText = laid.img;
  svg.setAttribute('viewBox', laid.viewBox);
  pins.forEach((p, i) => { p.style.cssText = laid.pins[i]; });
  // The roads from home go under the roads between the stops.
  svg.prepend(...laid.roads.map((r) => {
    const line = document.createElementNS(SVG, 'polyline');
    line.setAttribute('class', r.road ? 'home' : 'home straight');
    line.setAttribute('points', r.points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    return line;
  }));
  const pin = document.createElement('i');
  pin.className = 'pin ic home';
  pin.title = 'Home';
  pin.style.cssText = laid.homePin;
  pin.innerHTML = '<span aria-hidden="true">🏠</span>';
  fig.append(pin);
  fig.setAttribute('aria-label', `${fig.getAttribute('aria-label')}; with the drives from home and back`);
  // The drives under the map, in the day's order: the ones already listed keep their place between the new ones.
  let list = fig.nextElementSibling;
  if (!list?.matches('.dayroute-legs')) { list = document.createElement('ul'); list.className = 'dayroute-legs'; fig.after(list); }
  const listed = new Map([...list.children].map((li) => [/ to (\d+)$/.exec(li.querySelector('b').textContent)?.[1], li]));
  list.replaceChildren(...laid.list.flatMap((item) => {
    if (item.keep) return listed.get(String(item.keep)) ?? [];
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = item.label;
    li.append(b, ` ${item.words}`);
    return li;
  }));
  let note = list.nextElementSibling;
  if (!note?.matches('.dayroute-note')) { note = document.createElement('p'); note.className = 'muted dayroute-note'; list.after(note); }
  // A walk between two stops is a dashed line too, and the note is about drives.
  note.textContent = `${routeNote(true, laid.straight || Boolean(svg.querySelector('line.straight:not(.walk)')))} The way home is drawn as the way there.`;
  fig.hidden = false;
  return true;
}

/** Under a map: where its drives are from, and the way to change that. In place of the "add your address" notice. */
function fromLine(fig, home, drawn) {
  // After everything of this map's: its drives, their note and the notices this takes the place of.
  let last = fig;
  while (last.nextElementSibling?.matches('.dayroute-legs, .dayroute-note, .dayroute-home')) last = last.nextElementSibling;
  const line = document.createElement('p');
  line.className = 'muted dayroute-from';
  const said = home.label ?? 'your home';
  line.append(drawn ? `Drives are from ${said}. ` : `We couldn't draw a drive from ${said} for this day. `);
  if (home.own) {
    const a = Object.assign(document.createElement('a'), { href: '/family/#home', textContent: 'Change' });
    line.append(a);
  } else {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'linklike', textContent: 'Change' });
    b.dataset.fromOpen = '';
    line.append(b);
    if (!read(K.session)) line.append(' ', Object.assign(document.createElement('a'), { href: '/custom/', textContent: 'Sign up to plan whole days from home' }));
  }
  last.after(line);
}

/** Put home on every day map of the page that doesn't have it yet. Nothing to do with no home and no address typed. */
export async function homeOnDayMaps() {
  const home = startPoint();
  const figs = maps().filter((f) => !f.dataset.home);
  if (!home || !figs.length) return;
  const driveFrom = await drivesFrom(home, figs.flatMap((f) => homeEnds(JSON.parse(f.dataset.stops))));
  for (const f of figs) fromLine(f, home, draw(f, home, driveFrom));
}

/** A ZIP's point from the site's own list (/family/where.json): nobody is asked where it is. */
async function zipPoint(zip) {
  const r = await fetch('/family/where.json');
  if (!r.ok) throw new Error(`/family/where.json answered ${r.status}`);
  const at = (await r.json()).zips[zip];
  if (!at) throw new Error("We don't have that ZIP. Try a street address, like \"123 Oak St, Cary\".");
  return at;
}

/**
 * "Enter my address" (or "Change") was tapped: the line it's in becomes a short form. An address is found by our
 * server along with this page's drives; a ZIP is looked up in the site's own list. What's found is kept in this
 * browser alone, and the page is loaded again to draw every map from it.
 */
export function askFrom(button) {
  const line = button.closest('p');
  const typed = read(K.from);
  const form = document.createElement('form');
  form.className = 'dayroute-ask';
  form.innerHTML = `<label for="dayroute-from">Your address or ZIP</label><input id="dayroute-from" name="from" autocomplete="street-address" placeholder="123 Oak St, Cary" required maxlength="200"><button class="btn">Show my drives</button>${typed ? '<button type="button" class="linklike" data-from-clear>Remove it</button>' : ''}<p class="fine">Kept in this browser only, to draw this map. <a href="/privacy/">Privacy</a></p><p class="fine" role="status"></p>`;
  line.replaceWith(form);
  form.elements.from.focus();
  const status = form.querySelector('[role=status]');
  form.querySelector('[data-from-clear]')?.addEventListener('click', () => {
    localStorage.removeItem(K.from);
    localStorage.removeItem(K.drives);
    location.reload();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.elements.from.value.trim(), stops = [...new Map(pageEnds().map((s) => [key(s), s])).values()].slice(0, STOPS_AN_ASK);
    form.querySelector('button').disabled = true;
    status.textContent = 'Finding it…';
    try {
      const zip = /^\d{5}$/.test(text);
      const j = await ask(zip ? { at: await zipPoint(text) } : { address: text }, stops);
      const home = { lat: j.lat, lon: j.lon, label: zip ? `ZIP ${text}` : j.label };
      localStorage.setItem(K.from, JSON.stringify(home));
      keepDrives(home, stops, j);
      location.reload();
    } catch (err) {
      status.textContent = err.message;
      form.querySelector('button').disabled = false;
    }
  });
}
