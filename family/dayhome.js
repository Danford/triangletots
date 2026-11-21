// A day page for a visitor whose home is known: the second outing of each day picked again near home.
//
// The published plans are written for nobody's address, so a day's second outing (the hour out after the nap, or
// before a late main outing) is one near the main outing. That suits a family who lives over there. For one who
// doesn't, it is two drives across town. With a home (the family's own, or an address typed under the map), this
// picks it again by the build's own rules with home in them (second-outing.js): something close to home, unless a
// one-off is on. Then the parts of the page that show it are drawn again by the build's own functions (daypart.js):
// the day strip, the map, the outing's card and the day's steps.
//
// Nothing is asked of anyone: the day's published file and the site's own list of places and roads
// (/family/daykit.json) are read from this site, and the picking is done here. How far a place is from home is
// straight-line distance; the map's drive times are then asked for as before (daymap.js).

import { AGE_BANDS } from './lib/src/plans/config.js';
import { stopsOf, DRIVE_MIN } from './lib/src/plans/rules.js';
import { worstFactor } from './lib/src/family/traffic.js';
import { placeFinder, useDayRoads } from './lib/src/site/map.js';
import { placePaths, setPlacePaths } from './lib/src/site/places.js';
import { roadLookup } from './lib/src/site/roads.js';
import { unpackShape } from './lib/src/family/drives.js';
import { wakePlan, aroundPlan, miles } from './lib/src/site/wake.js';
import { HOME_NEAR_MILES } from './lib/src/site/second-outing.js';
import { dayWith, dayStrip, dayRouteMap, timeline, secondCard } from './lib/src/site/daypart.js';

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.json();
}

/** One outing at its times, to tell two picks apart. */
const idOf = (o) => (o ? `${o.ref}@${o.arrive}-${o.leave}` : '');

/** A section's day as the build made it: the outing it is built around, the nap pattern as moved, its steps before a second outing, and the seed its play ideas were picked with. */
export function builtDay(sec, { plans, band, date, weather, places }) {
  const plan = plans.find((p) => p.nap === sec.dataset.nap);
  const nap = band.naps.find((n) => n.id === sec.dataset.nap);
  if (!plan || !nap) throw new Error(`this page has a ${sec.dataset.nap} day and the day's file doesn't`);
  const d = Number(sec.dataset.shift), around = sec.dataset.around;
  if (around) {
    const outing = plan.alternatives.find((o) => o.ref === around);
    if (!outing) throw new Error(`this page has a day around ${around} and the day's file doesn't`);
    const w = aroundPlan({ plan, nap, outing, date, weather });
    return { plan, main: w.main, day: w.day, steps: w.timeline, seed: `${w.nap}${w.shift}${w.around}` };
  }
  if (d) {
    const w = wakePlan({ plans, plan, nap, d, date, weather, places });
    return { plan, main: w.main, day: w.day, steps: w.timeline, seed: `${w.nap}${w.shift}` };
  }
  return { plan, main: plan.main, day: nap, steps: plan.timeline, seed: plan.nap };
}

/** Put `html` in place of `el`, and give back the first element it made (null for nothing). */
function swap(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const first = t.content.firstElementChild;
  el.replaceWith(t.content);
  return first;
}

/** One section's parts drawn again around `second`. */
function draw(sec, { main, second, blocks, seed, sky, near }) {
  const strip = swap(sec.querySelector(':scope > .daystrip'), dayStrip(blocks, { outing: main, second, ...sky }));
  // The map and everything of its own after it: its drives, their note and the address notices.
  const key = sec.querySelector(':scope > .key');
  const fig = sec.querySelector(':scope > figure.dayroute');
  for (let n = (fig ?? key).nextElementSibling; n?.matches('.dayroute-legs, .dayroute-note, .dayroute-home, .dayroute-from, .dayroute-ask'); n = (fig ?? key).nextElementSibling) n.remove();
  fig?.remove();
  key.insertAdjacentHTML('afterend', dayRouteMap(blocks, { outing: main, second, find: sky.find, date: sky.date, family: true }));
  // The second outing's card: before the main outing's when it comes first in the day, else after it and its backup.
  const cards = sec.querySelector('.c-out');
  cards.querySelector('[data-card="second"]')?.remove();
  const html = secondCard(second, main, { ...sky, nearHome: near });
  const after = [...cards.querySelectorAll('[data-card="main"], [data-card="backup"]')].at(-1);
  if (main && second.arrive < main.arrive || !after) cards.insertAdjacentHTML('afterbegin', html);
  else after.insertAdjacentHTML('afterend', html);
  swap(sec.querySelector('ol.timeline'), timeline(blocks, { outing: main, second, ...sky, seed }));
  // It isn't offered as a swap-in under the day it is already in.
  for (const li of sec.querySelectorAll('.alt')) li.classList.toggle('taken', li.dataset.ref === second.ref);
  return strip?.querySelector('.strip[data-day]') ?? null;
}

/**
 * Each day on this page with its second outing picked again near `home` ({ lat, lon }), where that differs from the
 * one published. A page that isn't a day still ahead has nothing to do. Returns how many days changed.
 *
 * `drivesTo(points)` asks for the drives from home to those points and resolves to a lookup, point → { minutes } or
 * null (daymap.js's, which keeps them for the maps it draws next). The day's steps then give the drive to the new
 * outing and home its real time, up to the DRIVE_MIN the day was fitted with. The main outing's drives stay as
 * published: its day was planned around that allowance, and a longer drive would move the nap.
 */
export async function nearHome(home, drivesTo) {
  const at = await loadDay();
  if (!at) return 0;
  const { plans, sky } = at;
  const first = (o) => sky.find(stopsOf(o)[0]);
  const picked = [];
  for (const sec of document.querySelectorAll('section.plan[data-nap]')) {
    const { plan, main, day, steps, seed } = builtDay(sec, at);
    const args = { plans, plan, main, day, timeline: steps, sky, home };
    const built = dayWith({ ...args, home: null }), mine = dayWith(args);
    if (mine.second && idOf(mine.second) !== idOf(built.second)) picked.push({ sec, args, main, seed, second: mine.second });
  }
  if (!picked.length) return 0;
  const driveFrom = await drivesTo(picked.map((p) => first(p.second)).filter(Boolean));
  const driveOf = (o) => {
    const p = first(o), d = p ? driveFrom(p) : null;
    return d ? Math.min(DRIVE_MIN, Math.max(5, Math.ceil((d.minutes * worstFactor(sky.date, [o.arrive, o.leave])) / 5) * 5)) : DRIVE_MIN;
  };
  const strips = [];
  for (const { sec, args, main, seed, second } of picked) {
    const mine = dayWith({ ...args, driveOf });
    if (idOf(mine.second) !== idOf(second)) throw new Error(`the second outing near home changed between two picks: ${idOf(second)} then ${idOf(mine.second)}`);
    const p = first(second);
    const strip = draw(sec, { main, second, blocks: mine.blocks, seed, sky, near: Boolean(p) && miles(home, p) <= HOME_NEAR_MILES });
    if (strip) strips.push(strip);
  }
  // site.js gives the new strips their pointer card and the Now line.
  if (strips.length) document.dispatchEvent(new CustomEvent('strips', { detail: strips }));
  return strips.length;
}

/**
 * What this page's day was built from: the day's published plans, its age band, and the page's own places, roads and
 * weather (`sky`, as render.js has it). null on a page that isn't a day still ahead.
 */
export async function loadDay() {
  const page = document.querySelector('main.day[data-date][data-band]');
  if (!page) return null;
  const { date, band: bandId } = page.dataset;
  const band = AGE_BANDS.find((b) => b.id === bandId);
  if (!band) throw new Error(`this page is for the age band ${bandId}, which isn't one`);
  const [file, kit] = await Promise.all([get(`/data/${date}/${bandId}.json`), get('/family/daykit.json')]);
  const { places } = kit;
  const find = placeFinder(places);
  setPlacePaths(placePaths(places));
  useDayRoads(roadLookup(new Map(kit.roads.map(([id, r]) => [id, { ...r, line: unpackShape(r.line) }]))));
  const latest = file.versions.at(-1);
  const weather = file.checked?.weather ?? latest.weather;
  // No calendar file was made for an outing the build didn't pick, so the card has no "Add to calendar".
  const sky = { date, weather, band: bandId, find, places, family: true, cal: null };
  return { plans: latest.plans, band, date, weather, places, sky };
}
