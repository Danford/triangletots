// Triangle Tots Family: a day worked out in the family's own browser from the checked
// outings already published, with no Claude call and nothing about the family sent anywhere.
//
// Every rule is the published plans' own: rules.js, audit.js and wake.js are imported, not
// copied, and `familyProblems` is the one gate everything assembled here has to pass.
// This file runs in the browser as well as in the tests, so its import graph stays free
// of anything Node (scripts/build-site.js copies that graph to /family/lib/, and a test
// checks it). See docs/family-plans.md.

import { AGE_BANDS } from '../plans/config.js';
import { MAX_DRIVE_MIN, MAX_STAY_MIN, AFTER_NAP_MIN, DRIVE_MIN, outingTimeProblems, daylightProblems, dayProblems, outingCopyProblems, PRONOUN_RULES, stopsOf, toMin } from '../plans/rules.js';
import { ageProblems, stopProblems } from '../plans/audit.js';
import { placeHoursOn, parseHoursRange, badWeather } from '../plans/day-facts.js';
import { sunTimes } from '../site/sky.js';
import { buildTimeline, byWeather, fits, moved, hasOutside, rainLikely, shiftNap, whereOf, walkBackMin } from '../site/wake.js';
import { familyScore, matchesFor } from './interests.js';
import { typeOfStop } from './icons.js';
import { inTraffic } from './traffic.js';
import { READY_MIN, SECOND_MIN_STAY, SECOND_STAY, SLOW_START_MIN, paid, copyAt, repeatsOf, homeBlockFor, withSecondOuting } from '../site/second-outing.js';

// ---- Distance: the one function to replace when real routing is live ----

/** Straight-line miles to road miles, a common rule of thumb for suburban roads. Not a measurement. */
export const ROAD_FACTOR = 1.3;
/** Average speed over a local drive, lights and all. Also a rule of thumb. */
export const ROAD_MPH = 30;
/** A drive is rounded up to this many minutes, so the number doesn't look more exact than it is. */
const ROUND_TO_MIN = 5;
const MILES_PER_DEGREE = 69.05;

const straightMiles = (a, b) => {
  const dy = (a.lat - b.lat) * MILES_PER_DEGREE;
  const dx = (a.lon - b.lon) * MILES_PER_DEGREE * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
};

/** A home set from the phone's location uses the nearest place in the drive table this close, plus the short way to it. */
export const SNAP_MILES = 1.5;

const roundUp = (minutes) => Math.max(ROUND_TO_MIN, Math.ceil(minutes / ROUND_TO_MIN) * ROUND_TO_MIN);
const roadMiles = (from, to) => straightMiles(from, to) * ROAD_FACTOR;
const estimate = (from, to) => (roadMiles(from, to) * 60) / ROAD_MPH;
const tenth = (miles) => Math.round(miles * 10) / 10;
const pointKey = (lat, lon) => `${lat},${lon}`;

/** The road drive times from the build (/family/drives.json, made by drives.js), or null for none. */
let drives = null;

/** Use a drive table from the build; null goes back to distance alone. */
export function useDrives(table) {
  if (table == null) { drives = null; return; }
  if (!Array.isArray(table.points) || !Array.isArray(table.to) || table.minutes?.length !== table.points.length) {
    throw new Error('a drive table needs points, to, and a row of minutes for each point');
  }
  // A table from a build before the router was asked for distance has no miles: those are worked out from distance.
  if (table.miles != null && table.miles.length !== table.points.length) throw new Error('a drive table\'s miles need a row for each point');
  const row = new Map(table.points.map(([lat, lon], i) => [pointKey(lat, lon), i]));
  const col = new Map(table.to.map((i, k) => [pointKey(...table.points[i]), k]));
  drives = { table, row, col };
}

/**
 * A home's own row in the drive table: `minutes[k]` is the drive to the table's stop k (drives `to`), from the
 * router by way of our server (POST /v1/family/home). The home then plans from its own door, not a table place
 * nearby. `miles[k]`, the road's length, is from the same answer (a home kept from before it was asked has none).
 * Returns the home's point number, which routemap.js keys its roads by.
 */
export function useHomeRow(home, minutes, miles = null) {
  if (!drives) throw new Error('a home row needs the drive table first');
  if (!Array.isArray(minutes) || minutes.length !== drives.table.to.length) throw new Error(`a home row has a drive for each of the table's ${drives.table.to.length} stops`);
  if (miles != null && (!Array.isArray(miles) || miles.length !== minutes.length)) throw new Error('a home row\'s miles go with its minutes, one for each stop');
  const k = pointKey(home.lat, home.lon);
  const i = drives.row.get(k) ?? drives.table.points.length;
  drives.table.points[i] = [home.lat, home.lon];
  drives.table.minutes[i] = minutes;
  if (drives.table.miles) drives.table.miles[i] = miles;
  else if (miles) drives.table.miles = Object.assign([], { [i]: miles });
  drives.row.set(k, i);
  return i;
}

/** The table's stops as [lat, lon], in column order: what a home row is asked for. */
export const tableStops = () => (drives ? drives.table.to.map((i) => drives.table.points[i]) : null);

/** The table's row for a point: its own, or the nearest within SNAP_MILES with the miles to it. */
function rowFor(p) {
  const own = drives.row.get(pointKey(p.lat, p.lon));
  if (own != null) return { i: own, extra: 0 };
  let best = null;
  for (const [i, [lat, lon]] of drives.table.points.entries()) {
    const miles = straightMiles(p, { lat, lon });
    if (miles <= SNAP_MILES && (!best || miles < best.miles)) best = { i, miles, lat, lon };
  }
  return best && { i: best.i, extra: estimate(p, best), extraMiles: roadMiles(p, best), snap: { lat: best.lat, lon: best.lon } };
}

/**
 * The drive table's leg for a drive, as driveBetween finds it: `from` and `to` are the
 * table's point numbers (routemap.js keys road shapes by them), and `snap` is the table
 * place a phone-location home was moved to, or null. null when the table doesn't cover it.
 */
export function tableLeg(from, to) {
  if (!drives) return null;
  const r = rowFor(from);
  const k = drives.col.get(pointKey(to.lat, to.lon));
  if (!r || k == null || drives.table.minutes[r.i][k] == null) return null;
  return { from: r.i, to: drives.table.to[k], snap: r.snap ?? null };
}

/**
 * The drive between two points: minutes, and miles to a tenth. From the road table when the
 * build made one and has both ends: `approximate: false`. Otherwise straight-line distance
 * times a road factor, `approximate: true`, and the page says so. Where the router found no
 * road, Infinity: no outing is planned there. Miles are the router's where the table has them
 * (a table from before it was asked for them works them out from distance).
 * With `date` and `at` (the times the drive is made, minutes after midnight or "HH:MM"; the slowest counts) the minutes
 * are for typical traffic then (traffic.js) rather than an empty road, and `traffic` is how much longer that is.
 * @returns {{ minutes: number, miles: number, approximate: boolean, traffic: number }}
 */
export function driveBetween(from, to, { date = null, at = [] } = {}) {
  if (from?.lat == null || to?.lat == null) throw new Error('driveBetween needs two points with lat and lon');
  const slow = (minutes) => (date && at.length ? inTraffic(minutes, date, at) : minutes);
  const factor = (minutes) => (minutes > 0 ? Math.round((slow(minutes) / minutes) * 100) / 100 : 1);
  if (drives) {
    const r = rowFor(from);
    const k = drives.col.get(pointKey(to.lat, to.lon));
    if (r && k != null) {
      const m = drives.table.minutes[r.i][k];
      if (m == null) return { minutes: Infinity, miles: Infinity, approximate: false, traffic: 1 };
      const mi = drives.table.miles?.[r.i]?.[k];
      return { minutes: roundUp(slow(m + r.extra)), miles: tenth((mi ?? roadMiles(from, to)) + (r.extraMiles ?? 0)), approximate: false, traffic: factor(m + r.extra) };
    }
  }
  return { minutes: roundUp(slow(estimate(from, to))), miles: tenth(roadMiles(from, to)), approximate: true, traffic: factor(estimate(from, to)) };
}

/** Whether the drive from home to an outing's first stop is from the road table rather than distance alone. */
export function driveIsRouted(home, o) {
  const first = stopsOf(o).find((s) => s.lat != null);
  return Boolean(home && first && !driveBetween(home, first).approximate);
}

/**
 * The minutes from home to an outing's first stop, or null when the outing has no point on the map. With `date` it is
 * for typical traffic: the drive out leaves about when the family would have to, and the drive home leaves when the
 * outing ends; the timeline uses one number for both, so the slower of the two counts.
 */
export function driveTo(home, o, date = null) {
  const first = stopsOf(o).find((s) => s.lat != null);
  if (!first) return null;
  const empty = driveBetween(home, first).minutes;
  return driveBetween(home, first, { date, at: [toMin(o.arrive) - empty, toMin(o.leave)] }).minutes;
}

// ---- The family ----

/** The age band for a child this many months old, or null past the bands: the plans stop at 5. */
export function bandForMonths(months) {
  if (!Number.isInteger(months) || months < 12 || months >= 72) return null;
  if (months < 24) return AGE_BANDS.find((b) => b.id === 't1');
  if (months < 36) return AGE_BANDS.find((b) => b.id === 't2');
  if (months < 48) return AGE_BANDS.find((b) => b.id === 't3');
  return AGE_BANDS.find((b) => b.id === 't4');
}

/** Months old on a date, from a birth month "YYYY-MM". The profile keeps no more of a birthday than that. */
export function monthsOld(born, date) {
  const [by, bm] = born.split('-').map(Number), [y, m] = date.split('-').map(Number);
  return (y - by) * 12 + (m - bm);
}

/**
 * One child's day in the shape the rules read. A child's nap pattern is a published
 * one, moved by their wake-up, or their own times: `wake`, `bed`, `naps: [[from, to]]`.
 */
export function childDay(child, date) {
  const months = monthsOld(child.born, date);
  const band = bandForMonths(months);
  if (!band) return null;
  return { id: child.id, name: child.name, band, months, interests: child.interests ?? {}, nap: { wake: child.wake, bed: child.bed, sleep: child.naps ?? [], quiet: child.quiet ?? [] } };
}

/** The children a plan is for on a date: those in the bands, and those too young or old to plan for. */
export function kidsOn(profile, date) {
  const kids = [], left = [];
  for (const c of profile.children ?? []) {
    const day = childDay(c, date);
    if (day) kids.push(day); else left.push(c);
  }
  return { kids, left };
}

/** Every day-file band the family needs. */
export const bandsFor = (kids) => [...new Set(kids.map((k) => k.band.id))];

// ---- Miles and money ----

/** Road miles for one trip from home: there, from stop to stop, and home again the way it came. */
export function tripMiles(home, o) {
  const at = stopsOf(o).filter((s) => s.lat != null);
  if (!at.length) return 0;
  let total = 0, from = home;
  for (const s of at) { total += driveBetween(from, s).miles; from = s; }
  return tenth(total + driveBetween(home, at.at(-1)).miles);
}

// Places the counties and towns run, which charge nothing to walk in. A listing with no price is free there.
const FREE_PLACES = new Set(['park', 'garden', 'library', 'playground', 'greenway']);
const MONEY = /\$\s?(\d+(?:\.\d{1,2})?)/g;

/**
 * What one stop costs the family, from the listing's own words: `usd`, or null when it charges and doesn't say how much
 * ("Included with museum admission"), and `listed: false` when the listing says nothing at all about price.
 * "$24 adults, $19 ages 3–15, under 3 free" is priced person by person; "$6 resident / $8 non-resident" is the higher, as
 * we can't tell which the family is; a single price is each child's for an event (it's the child who's signed up) and
 * everyone's for a place. `people` is { adults, ages: [whole years] }.
 */
export function stopCost(s, { adults, ages, paidIn = false }) {
  const text = String(s.cost ?? '').trim();
  if (!text) return { usd: 0, listed: FREE_PLACES.has(s.kind) };
  // "Included with museum admission": nothing more where the outing pays the admission already (`paidIn`), the
  // museum's own tickets where the build's list has them (useAdmissions, by place name), and otherwise not known.
  if (/included with .*admission/i.test(text)) {
    if (paidIn) return { usd: 0, listed: true };
    // A venue can name a spot inside first: "Hideaway Woods, Museum of Life and Science".
    const at = String(s.venue ?? '').split(',').map((v) => admissions.get(v.toLowerCase().trim())).find(Boolean);
    return at ? stopCost({ ...s, cost: at, kind: 'museum' }, { adults, ages }) : { usd: null, listed: true };
  }
  if (!text.includes('$')) return { usd: /\bfree\b/i.test(text) ? 0 : null, listed: true };
  let adult = null, plain = null;
  const forAges = [];
  for (const part of text.split(/[,;]/)) {
    const amounts = [...part.matchAll(MONEY)].map((m) => Number(m[1]));
    const usd = amounts.length ? Math.max(...amounts) : /\bfree\b/i.test(part) ? 0 : null;
    if (usd == null) continue;
    const range = /(\d+)\s*(?:[–-]|to)\s*(\d+)/.exec(part), under = /under\s*(\d+)/i.exec(part);
    if (/adult|grown|parent/i.test(part)) adult = usd;
    else if (under) forAges.push({ from: 0, to: Number(under[1]) - 1, usd });
    else if (range && /age|year|yr|child|kid/i.test(part)) forAges.push({ from: Number(range[1]), to: Number(range[2]), usd });
    else if (/child|kid|toddler/i.test(part)) forAges.push({ from: 0, to: 99, usd });
    else plain = Math.max(plain ?? 0, usd);
  }
  if (adult == null && !forAges.length) {
    if (plain == null) return { usd: null, listed: true };
    return { usd: plain * (s.kind === 'event' ? ages.length : adults + ages.length), listed: true };
  }
  const grown = adult ?? plain ?? 0;
  const child = (age) => forAges.find((r) => age >= r.from && age <= r.to)?.usd ?? plain ?? grown;
  return { usd: adults * grown + ages.reduce((sum, a) => sum + child(a), 0), listed: true };
}

/** What an outing costs the family: `usd` (null when a stop charges and doesn't say how much), and `unlisted` for a stop that says nothing. */
export function outingCost(o, people) {
  const stops = stopsOf(o);
  const paidIn = stops.some((s) => String(s.cost ?? '').includes('$') && s.kind !== 'event');
  const each = stops.map((s) => stopCost(s, { ...people, paidIn }));
  return { usd: each.some((c) => c.usd == null) ? null : each.reduce((sum, c) => sum + c.usd, 0), unlisted: each.some((c) => !c.listed) };
}

/**
 * Each priced place's admission, by name in lower case: { "museum of life and science": "$24 adults, …" }. Made at the
 * build from the places' hand-kept notes (/family/admissions.json, admissionsOf), for an event "Included with museum
 * admission". Empty until the page has it: such an event's price is then not known.
 */
let admissions = new Map();
export function useAdmissions(table) {
  if (table == null) { admissions = new Map(); return; }
  if (typeof table !== 'object' || Array.isArray(table)) throw new Error('admissions are { place name: price }');
  admissions = new Map(Object.entries(table));
}
/** The admissions file from the places and the price each one's note gives (placeCost in gather.js). */
export const admissionsOf = (places, costOf) => Object.fromEntries(places.map((p) => [String(p.name).toLowerCase().trim(), costOf(p)]).filter(([, c]) => c?.includes('$')));

/** The family going out on a date: the grown-ups the parent said usually go, and each child's age in whole years. */
export const peopleOf = (kids, limits) => ({ adults: limits?.adults ?? 1, ages: kids.map((k) => Math.floor(k.months / 12)) });

/** Monday to Sunday, the week a date is in, as "YYYY-MM-DD" from and to. */
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
  return { from: monday.toISOString().slice(0, 10), to: new Date(monday.getTime() + 6 * 864e5).toISOString().slice(0, 10) };
}

/** No limit: what a family that hasn't set one plans with. */
export const NO_LIMITS = Object.freeze({ miles: Infinity, dollars: Infinity, adults: 1, stretch: 0 });

/** How far a special outing may move naps and bedtime, in minutes: the choices the page offers. 30 until the parent says. */
export const STRETCHES = [0, 30, 60, 90];
export const DEFAULT_STRETCH = 30;

/**
 * What a day can use of the family's limits (profile.limits: dayMiles, weekMiles, weekDollars, adults; a blank one is no
 * limit): `miles` and `dollars` left for this day, after the other days of its week (Monday to Sunday) that are saved.
 * A saved day on this same date is the one being planned again, so it doesn't count. `week` is what the others used.
 */
export function limitsFor(profile, saved, date) {
  const set = profile.limits ?? {};
  const cap = (v) => (Number.isFinite(v) && v >= 0 ? v : Infinity);
  const { from, to } = weekOf(date);
  const others = (saved ?? []).filter((s) => s.date !== date && s.date >= from && s.date <= to);
  const week = { miles: tenth(others.reduce((sum, s) => sum + (s.miles ?? 0), 0)), dollars: others.reduce((sum, s) => sum + (s.dollars ?? 0), 0), days: others.length };
  return {
    miles: Math.max(0, Math.min(cap(set.dayMiles), cap(set.weekMiles) - week.miles)),
    dollars: Math.max(0, cap(set.weekDollars) - week.dollars),
    // Unset, as many grown-ups go as the family has (profile.parents), and at least one.
    adults: Number.isInteger(set.adults) && set.adults >= 1 ? set.adults : Math.max(1, profile.parents?.length ?? 0),
    stretch: STRETCHES.includes(set.stretch) ? set.stretch : DEFAULT_STRETCH,
    week, set: { dayMiles: cap(set.dayMiles), weekMiles: cap(set.weekMiles), weekDollars: cap(set.weekDollars) },
  };
}

const money = (usd) => (Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`);
const milesText = (m) => `${Number.isInteger(m) ? m : m.toFixed(1)} miles`;

/** An outing's miles and cost against what's left: problems, in words, when it goes over. */
export function limitProblems({ miles, cost }, limits) {
  const out = [];
  if (miles > limits.miles) out.push({ rule: 'over-miles', message: `It's about ${milesText(miles)} there and back, and this day has ${milesText(limits.miles)} left of your driving limit.` });
  if (Number.isFinite(limits.dollars)) {
    if (cost.usd == null) out.push({ rule: 'over-budget', message: 'It charges, and the listing doesn\'t say how much, so we can\'t keep it inside your budget.' });
    else if (cost.usd > limits.dollars) out.push({ rule: 'over-budget', message: `It's about ${money(cost.usd)} for your family, and this week has ${money(limits.dollars)} left of your budget.` });
  }
  return out;
}

// ---- The one gate ----

/**
 * How far a family will go: the published plans' longest drive. It also keeps the published
 * nap rules whole: leaving 40 minutes before sleep covers a 30-minute drive and settling.
 */
export const MAX_FAMILY_DRIVE_MIN = MAX_DRIVE_MIN;

const GET_GOING_MIN = 10; // up and changed, before a drive after a nap

/** Whether a place is open for the whole of an outing. Events keep their own times. */
function hoursProblems(o, date) {
  if (o.source.kind === 'event') return [];
  const hours = o.source.hours ? placeHoursOn(o.source, date) : null;
  if (hours === undefined) return [{ rule: 'closed', message: `${o.source.title} isn't open that day` }];
  const range = parseHoursRange(hours);
  if (range && (toMin(o.arrive) < toMin(range.opens) || toMin(o.leave) > toMin(range.closes))) return [{ rule: 'hours', message: `${o.source.title} is open ${hours}` }];
  return [];
}

/** The published rule counts a 20-minute drive in its time after a nap (AFTER_NAP_MIN); a real drive can be longer. */
function afterNapProblems(o, nap, drive) {
  const arrive = toMin(o.arrive);
  return (nap.sleep ?? []).filter(([, b]) => arrive >= toMin(b) && arrive < toMin(b) + Math.max(AFTER_NAP_MIN, drive + GET_GOING_MIN))
    .map(([, b]) => ({ rule: 'tight-nap', message: `arrives ${o.arrive}, too soon after a nap that ends ${b}` }));
}

/**
 * Everything wrong with an outing for this family on this date, with who it's wrong for.
 * [] means every rule that protects a child's day holds for every child, by the same
 * checks the audit runs on what's published, plus the family's real drive.
 */
export function familyProblems(o, { kids, date, drive, weather = null }) {
  const sunset = sunTimes(date).set;
  const wet = o.outdoor ? badWeather(weather) : [];
  const whole = [
    ...stopProblems(o, date), ...hoursProblems(o, date), ...daylightProblems(o, sunset),
    // An outing worded with a "her" from before the pronoun placeholders is still the right outing.
    ...outingCopyProblems(o).filter((c) => c.tip == null && !PRONOUN_RULES.has(c.rule)),
    ...wet.map((w) => ({ rule: 'weather', message: `outdoors, and the forecast says ${w}` })),
  ];
  const each = kids.flatMap((k) => {
    const window = fits(o, k.nap, date) ? [] : [{ rule: 'nap-window', message: `${o.arrive} to ${o.leave} doesn't fit around sleep and meals` }];
    return [...ageProblems(o, k.band), ...outingTimeProblems(o, k.nap, k.band.id), ...window, ...afterNapProblems(o, k.nap, drive)].map((p) => ({ ...p, child: k.name }));
  });
  return [...whole, ...each];
}

// ---- Choosing ----

const SLIDES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, 180];
const isPlace = (o) => stopsOf(o).every((s) => s.kind !== 'event');

// A shorter visit to a place is still worth it, and two naps may leave only that long between them.
const SHORTER_STAYS = [90, 60];

/** A place's stay cut to `most` minutes. An event keeps its times. */
function trimmed(o, most) {
  if (toMin(o.leave) - toMin(o.arrive) <= most) return o;
  const end = toMin(o.arrive) + most;
  return { ...o, leave: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
}

/** A drop-in is open for a stretch, so a family can come and go inside it. Timed events can't be moved. */
function dropInWindow(o) {
  const stops = stopsOf(o);
  if (stops.length !== 1 || !stops[0].dropIn) return null;
  const clockOf = (iso) => (/T\d{2}:\d{2}/.test(iso ?? '') ? toMin(iso.slice(11, 16)) : null);
  const [from, to] = [clockOf(stops[0].start), clockOf(stops[0].end)];
  return from != null && to != null ? { from, to } : null;
}

/**
 * The outing at its own times or, a place or a drop-in, slid and shortened to fit everyone.
 * null if it never does. A timed event keeps its times.
 */
function fitted(o, ctx) {
  const open = dropInWindow(o);
  if (!isPlace(o) && !open) return familyProblems(o, ctx).length ? null : o;
  const longest = Math.min(...ctx.kids.map((k) => MAX_STAY_MIN[k.band.id]));
  const inside = (t) => !open || (toMin(t.arrive) >= open.from && toMin(t.leave) <= open.to);
  for (const stay of [longest, ...SHORTER_STAYS]) {
    for (const d of SLIDES) {
      const t = trimmed(d ? moved(o, d) : o, stay);
      if (inside(t) && !familyProblems(t, ctx).length) return t;
    }
  }
  return null;
}

const planOf = (f) => f.versions.at(-1).plans;
export const weatherOf = (files) => {
  const f = files[0];
  return f ? f.checked?.weather ?? f.versions.at(-1).weather ?? null : null;
};

/**
 * Every checked outing of the day across these day files, once each by ref and time. A day's pool (src/family/pool.js:
 * the rest of what the morning checked) only with `pool`: typed requests plan from it, and lookups by ref find in it.
 */
export function outingsIn(files, { pool = false } = {}) {
  const seen = new Set(), out = [];
  for (const f of files) {
    if (f.pool && !pool) continue;
    for (const p of planOf(f)) {
      for (const o of [p.main, ...p.alternatives, p.rainBackup]) {
        if (!o || seen.has(`${o.ref}@${o.arrive}`)) continue;
        seen.add(`${o.ref}@${o.arrive}`);
        out.push(o);
      }
    }
  }
  return out;
}

/**
 * The outings that pass for this family, each with its drive, its miles there and back and its cost, inside the
 * family's limits. What the children love most comes first (familyScore: their picks, weighted, and the grown-ups'
 * at half); then, with a
 * budget, the paid outings it has room for, the dearest first: more to spend often buys a better morning (a museum,
 * a class), and the budget is the parent's say in how much. Then time outside on a fine day, then the nearest.
 * `pool` adds the day's pool; a pool event is for the ages its listing gives (`bands`), so it has to be for every child's.
 */
export function fittingOutings({ files, kids, grownups = [], home, date, limits = NO_LIMITS, pool = false }) {
  const weather = weatherOf(files);
  const wet = badWeather(weather).length > 0;
  const people = peopleOf(kids, limits);
  const seen = new Set(), out = [];
  for (const o of byWeather(outingsIn(files, { pool }), wet)) {
    if (seen.has(o.ref)) continue;
    if (o.bands && !kids.every((k) => o.bands.includes(k.band.id))) continue;
    const drive = driveTo(home, o, date);
    if (drive == null || drive > MAX_FAMILY_DRIVE_MIN) continue;
    const t = fitted(o, { kids, date, drive, weather });
    if (!t) continue;
    const x = { outing: t, drive, miles: tripMiles(home, t), cost: outingCost(t, people), score: familyScore(t, kids, grownups) };
    if (limitProblems(x, limits).length) continue;
    seen.add(o.ref);
    out.push(x);
  }
  return out.sort(ranking(limits, wet));
}

/**
 * The order outings are offered in: the family's score, then with a budget the dearer first, then time outside on a
 * fine day (bad weather has already turned outdoors away), then the nearest.
 */
function ranking(limits, wet) {
  const rank = (x) => (wet || hasOutside(x.outing) ? 0 : 1);
  const spend = (x) => (Number.isFinite(limits.dollars) ? x.cost.usd ?? 0 : 0);
  return (a, b) => b.score - a.score || spend(b) - spend(a) || rank(a) - rank(b) || a.drive - b.drive;
}

/** How many outings past the limits a day mentions. */
export const BEYOND_MOST = 3;

/**
 * The outings that would have been better for this family than `than` (the day's outing, or none) and fit everyone's
 * day, but that the family's driving or spending limits, or the longest drive we plan (MAX_FAMILY_DRIVE_MIN), kept
 * out. Better is more of what they love, or with a budget, as much and a richer morning (the plan's own ranking,
 * without its tie-breaks of outdoors and nearness). Each with its drive, miles, cost, score and `over`: why it was left out, in words. Best first.
 */
export function beyondLimits({ files, kids, grownups = [], home, date, limits = NO_LIMITS, than = null }) {
  const weather = weatherOf(files);
  const wet = badWeather(weather).length > 0;
  const people = peopleOf(kids, limits);
  const order = ranking(limits, wet);
  const budget = Number.isFinite(limits.dollars);
  const better = (x, y) => x.score > y.score || (budget && x.score === y.score && (x.cost.usd ?? 0) > (y.cost.usd ?? 0));
  const seen = new Set(), out = [];
  for (const o of byWeather(outingsIn(files), wet)) {
    if (seen.has(o.ref) || o.ref === than?.outing.ref) continue;
    const drive = driveTo(home, o, date);
    if (drive == null) continue;
    const t = fitted(o, { kids, date, drive, weather });
    if (!t) continue;
    const x = { outing: t, drive, miles: tripMiles(home, t), cost: outingCost(t, people), score: familyScore(t, kids, grownups) };
    const over = [
      ...(drive > MAX_FAMILY_DRIVE_MIN ? [{ rule: 'drive-time', message: `It's about ${drive} minutes from home, and we plan drives of up to ${MAX_FAMILY_DRIVE_MIN}.` }] : []),
      ...limitProblems(x, limits),
    ];
    if (!over.length) continue;
    seen.add(o.ref);
    if (than && !better(x, than)) continue;
    out.push({ ...x, over });
  }
  return out.sort(order).slice(0, BEYOND_MOST);
}

/**
 * The whole plan for a chosen outing (or none): one timeline per child, all checked, with a second, shorter outing where
 * there's room. The family's limits are part of the gate: an outing over them isn't planned, and the second outing
 * fits in what the first leaves. `miles` and `dollars` are the day's, both trips; `trips` are its outings in time order.
 */
export function dayFor({ outing, drive, kids, date, files, home, limits = NO_LIMITS, forced = false }) {
  const weather = weatherOf(files);
  const outside = !badWeather(weather).length;
  const people = peopleOf(kids, limits);
  const main = outing ? { miles: tripMiles(home, outing), cost: outingCost(outing, people) } : { miles: 0, cost: { usd: 0, unlisted: false } };
  const over = limitProblems(main, limits);
  if (over.length && !forced) return { ok: false, reason: 'over-limits', problems: over };
  const built = kids.map((k) => ({
    id: k.id, name: k.name, band: k.band.id, nap: k.nap, ...(k.moved ? { moved: k.moved } : {}),
    timeline: buildTimeline(k.nap, outing, { outside, drive: drive ?? undefined }),
  }));
  const problems = built.flatMap((t) => dayProblems(t.timeline, outing, t.nap, { minDrive: 0, maxDrive: MAX_FAMILY_DRIVE_MIN }).map((p) => ({ ...p, child: t.name })));
  if (problems.length && !forced) return { ok: false, reason: 'does-not-fit', problems };
  const left = { ...limits, miles: limits.miles - main.miles, dollars: limits.dollars - (main.cost.usd ?? 0) };
  // A day planned anyway is already more than a day should hold: no second outing on top of it.
  const second = outing && !forced ? secondFor({ files, kids, children: built, date, home, outing, weather, limits: left }) : null;
  const children = second ? built.map((c) => ({ ...c, timeline: withSecondOuting(c.timeline, second.outing, second.drive) })) : built;
  const backup = outing?.outdoor && rainLikely(weather)
    ? fittingOutings({ files, kids, home, date, limits }).find((x) => !x.outing.outdoor && x.outing.ref !== second?.outing.ref) ?? null : null;
  const trips = [outing && { outing, drive, ...main }, second].filter(Boolean).sort((a, b) => toMin(a.outing.arrive) - toMin(b.outing.arrive));
  return {
    ok: true, date, outing, drive: drive ?? null, approximate: !outing || !driveIsRouted(home, outing), children, weather,
    second: second?.outing ?? null, secondDrive: second?.drive ?? null,
    rainBackup: backup?.outing ?? null, rainBackupDrive: backup?.drive ?? null,
    cost: main.cost, secondCost: second?.cost ?? null,
    miles: tenth(main.miles + (second?.miles ?? 0)), dollars: (main.cost.usd ?? 0) + (second?.cost.usd ?? 0),
    trips, ...(forced ? { warnings: [...over, ...problems] } : {}),
  };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * A second, shorter outing for the family, in time every child has at home: from the day's
 * checked list, by the same gate as the main outing (familyProblems, with its own drive from
 * home), never the main outing's place again, outside if the main outing had no time
 * outside. An event keeps its times; a place moves into the free time. Events first, then
 * free before paid, then the shortest drive. Inside what the main outing left of the family's limits. null when
 * nothing fits everyone. Each with its miles there and back and its cost.
 */
export function secondFor({ files, kids, children, date, home, outing, weather, limits = NO_LIMITS }) {
  const people = peopleOf(kids, limits);
  const wet = badWeather(weather).length > 0;
  const { repeats } = repeatsOf(outing);
  const needsOutside = !wet && !hasOutside(outing);
  const slowStart = Math.max(...kids.map((k) => toMin(k.nap.wake) + SLOW_START_MIN));
  const longest = Math.min(SECOND_STAY, ...kids.map((k) => MAX_STAY_MIN[k.band.id]));
  const fitsAll = (t, drive) => toMin(t.arrive) >= slowStart && children.every((c) => homeBlockFor(c.timeline, t, drive) >= 0)
    && !familyProblems(t, { kids, date, drive, weather }).length;
  // The first child's long stretches at home, longest first: each has to be time at home for everyone.
  const stretches = (drive) => children[0].timeline.filter((b) => b.kind === 'play' && toMin(b.end) - toMin(b.start) >= READY_MIN + drive * 2 + SECOND_MIN_STAY)
    .sort((a, b) => (toMin(b.end) - toMin(b.start)) - (toMin(a.end) - toMin(a.start)));

  const placed = (o, drive) => {
    if (!isPlace(o)) { const t = copyAt(o, toMin(o.arrive)); return t && fitsAll(t, drive) ? t : null; }
    const stay = Math.min(longest, toMin(o.leave) - toMin(o.arrive));
    for (const b of stretches(drive)) {
      const last = toMin(b.end) - drive;
      for (let at = Math.ceil((toMin(b.start) + READY_MIN + drive) / 5) * 5; at + SECOND_MIN_STAY <= last; at += 15) {
        const t = copyAt({ ...moved(o, at - toMin(o.arrive)), leave: hhmm(Math.min(at + stay, last)) }, at);
        if (t && fitsAll(t, drive)) return t;
      }
    }
    return null;
  };

  // An outing listed at two times is tried at each; the first time that fits is the one used.
  const used = new Set(), fitting = [];
  for (const o of outingsIn(files)) {
    if (used.has(o.ref) || repeats(o) || (wet && o.outdoor) || (needsOutside && !hasOutside(o))) continue;
    const drive = driveTo(home, o, date);
    if (drive == null || drive > MAX_FAMILY_DRIVE_MIN) continue;
    const t = placed(o, drive);
    if (!t) continue;
    const x = { outing: t, drive, miles: tripMiles(home, t), cost: outingCost(t, people) };
    if (limitProblems(x, limits).length) continue;
    used.add(o.ref);
    fitting.push(x);
  }
  // What the children love first; then something on at a time, free before paid, the shortest drive.
  fitting.sort((a, b) => familyScore(b.outing, kids) - familyScore(a.outing, kids) || Number(isPlace(a.outing)) - Number(isPlace(b.outing)) || Number(paid(a.outing)) - Number(paid(b.outing)) || a.drive - b.drive);
  return fitting[0] ?? null;
}

// ---- Moving the day for something special ----
//
// A day is never bent for an ordinary outing. For one that matters (one the parent picked, a child's Top favorite, a
// festival that won't be on again next week) the parent can let naps and bedtime move a little: `limits.stretch`
// minutes at most, as little as it takes. Nothing is skipped that way; every rule still holds around the moved times.

const BEND_STEP = 15;
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Every way to move the naps (earlier or later) and bedtime (later) by up to `most` minutes, the smallest change first. */
export function bendsUpTo(most) {
  const out = [];
  for (let nap = -most; nap <= most; nap += BEND_STEP) for (let bed = 0; bed <= most; bed += BEND_STEP) if (nap || bed) out.push({ nap, bed });
  // At the same size of change, a later nap before an earlier one: a toddler holds on better than they settle early.
  return out.sort((a, b) => Math.abs(a.nap) + a.bed - (Math.abs(b.nap) + b.bed) || b.nap - a.nap);
}

/** A child with their naps and quiet time moved `nap` minutes and bedtime `bed` minutes later; `moved` says by how much. */
export function bentKid(k, { nap, bed }) {
  const sh = (list) => (list ?? []).map(([a, b]) => [hm(toMin(a) + nap), hm(toMin(b) + nap)]);
  const naps = (k.nap.sleep?.length || k.nap.quiet?.length) ? nap : 0;
  return { ...k, nap: { ...k.nap, sleep: sh(k.nap.sleep), quiet: sh(k.nap.quiet), bed: hm(toMin(k.nap.bed) + bed) }, moved: { nap: naps, bed, skipped: [], wake: 0 } };
}

// A moved nap is still a nap: not sooner after waking than two hours, nor nearer bedtime than three (or than the child's
// own, if theirs already are). A nap at 7:30 for a child up at 7 is a second night, not a nap moved.
const WAKE_TO_NAP_MIN = 120, NAP_TO_BED_MIN = 180;
function sensible(k, c) {
  return c.nap.sleep.every(([a, b], i) => {
    const [oa, ob] = k.nap.sleep[i];
    return toMin(a) - toMin(c.nap.wake) >= Math.min(WAKE_TO_NAP_MIN, toMin(oa) - toMin(k.nap.wake))
      && toMin(c.nap.bed) - toMin(b) >= Math.min(NAP_TO_BED_MIN, toMin(k.nap.bed) - toMin(ob));
  });
}

// What moving the day can fix: when an outing is, against sleep and meals. Not its ages, its hours on a closed day, or rain.
const TIMING = new Set(['nap-window', 'tight-nap', 'early-start', 'late-home', 'no-lunch', 'no-dinner', 'hours', 'long-stay']);

// Words for a thing that's on once: a festival, a show, a holiday. A storytime is on every week.
const ONE_OFF = /\b(festival|fest|fair|parade|celebration|annual|holiday|santa|halloween|trunk[- ]or[- ]treat|pumpkin|fireworks|circus|concert|performance|carnival|rodeo|air ?show|grand opening|tree lighting|egg hunt|day out with|special event)\b/i;

/**
 * Why an outing is worth moving a day for, unasked: a child's Top favorite (★) is in it, or it's an event that's on once.
 * `{ kind: 'loves', loves: [{ child, label }] }`, `{ kind: 'one-off' }`, or null.
 */
export function specialOf(o, kids) {
  const loves = kids.flatMap((k) => matchesFor(o, k.interests).filter((m) => m.weight === 3).map((m) => ({ child: k.name, label: m.label })));
  if (loves.length) return { kind: 'loves', loves };
  const timed = stopsOf(o).some((s) => s.kind === 'event' && !s.dropIn);
  return timed && ONE_OFF.test(stopsOf(o).map((s) => `${s.title} ${s.venue ?? ''}`).join(' ')) ? { kind: 'one-off' } : null;
}

/**
 * The day around one of `picks` (the same outing at its listed times) with naps and bedtime moved as little as it
 * takes, up to `most` minutes, and every rule holding around the moved times. null when no move that small does it,
 * or when what's wrong isn't the time of day (too old for it, closed, raining).
 */
function stretchedDay({ picks, kids, date, files, home, limits, drive, most }) {
  if (!most) return null;
  const weather = weatherOf(files);
  if (picks.every((o) => familyProblems(o, { kids, date, drive, weather }).some((p) => !TIMING.has(p.rule)))) return null;
  const napping = kids.some((k) => k.nap.sleep?.length || k.nap.quiet?.length);
  for (const bend of bendsUpTo(most)) {
    if (bend.nap && !napping) continue;
    const bent = kids.map((k) => bentKid(k, bend));
    if (!bent.every((c, i) => sensible(kids[i], c))) continue;
    for (const o of picks) {
      const t = fitted(o, { kids: bent, date, drive, weather });
      if (!t) continue;
      const day = dayFor({ outing: t, drive, kids: bent, date, files, home, limits });
      if (day.ok) return { ...day, bend };
    }
  }
  return null;
}

/**
 * A day moved for something special the children would love more than anything that fits as it is: a Top favorite or
 * a one-off event that only fits with naps or bedtime moved, inside the family's other limits. null when there's none.
 */
function specialDay({ files, kids, grownups, home, date, limits, list }) {
  if (!limits.stretch) return null;
  const best = list[0]?.score ?? 0, fitting = new Set(list.map((x) => x.outing.ref));
  const byRef = new Map();
  for (const o of outingsIn(files)) {
    if (fitting.has(o.ref)) continue;
    if (!byRef.has(o.ref)) {
      const why = specialOf(o, kids), drive = driveTo(home, o);
      byRef.set(o.ref, why && drive != null && drive <= MAX_FAMILY_DRIVE_MIN ? { why, drive, score: familyScore(o, kids, grownups), picks: [] } : null);
    }
    byRef.get(o.ref)?.picks.push(o);
  }
  // Only for more than what fits: a one-off counts as much as a Top favorite would.
  const worth = (x) => Math.max(x.score, x.why.kind === 'one-off' ? 3 : 0);
  const tries = [...byRef.values()].filter((x) => x && worth(x) > best).sort((a, b) => worth(b) - worth(a) || a.drive - b.drive);
  for (const x of tries) {
    const day = stretchedDay({ picks: x.picks, kids, date, files, home, limits, drive: x.drive, most: limits.stretch });
    if (day) return { ...day, special: x.why };
  }
  return null;
}

/** How far a day planned anyway may move naps and bedtime before a nap in the way is let go instead. */
const ANYWAY_MOST = 180;

/**
 * One child's day around an outing whatever it takes, the least first: naps and bedtime moved up to three hours;
 * failing that, a nap in the way let go (`skipped`), bedtime after the drive home, and up earlier for an early start.
 */
function kidAround(k, o, drive, date) {
  const asEvent = { ...o, source: { ...o.source, kind: 'event' } }; // its hours are a warning of their own, not the nap's
  const clear = (c) => fits(asEvent, c.nap, date) && !afterNapProblems(o, c.nap, drive).length;
  if (clear(k)) return k;
  for (const bend of bendsUpTo(ANYWAY_MOST)) {
    const c = bentKid(k, bend);
    if (sensible(k, c) && clear(c)) return c;
  }
  const out = toMin(o.arrive) - drive - READY_MIN, back = toMin(o.leave) + walkBackMin(o) + drive;
  const inWay = ([a, b]) => toMin(a) < back + AFTER_NAP_MIN && toMin(b) > out;
  const bed = Math.max(toMin(k.nap.bed), Math.ceil((back + 60) / BEND_STEP) * BEND_STEP);
  const wake = Math.min(toMin(k.nap.wake), Math.floor((out - 30) / BEND_STEP) * BEND_STEP);
  const nap = { ...k.nap, wake: hm(wake), bed: hm(bed), sleep: (k.nap.sleep ?? []).filter((s) => !inWay(s)), quiet: (k.nap.quiet ?? []).filter((s) => !inWay(s)) };
  return { ...k, nap, moved: { nap: 0, bed: bed - toMin(k.nap.bed), wake: wake - toMin(k.nap.wake), skipped: (k.nap.sleep ?? []).filter(inWay) } };
}

/**
 * The day around a picked outing although it breaks the rules: the parent asked for it. Everything it breaks comes
 * back as `warnings`, in the rules' words, with each child's day moved around it (kidAround) and no second outing.
 */
function forcedDay({ o, kids, date, files, home, limits, drive }) {
  const weather = weatherOf(files);
  const at = drive ?? DRIVE_MIN;
  const moved = kids.map((k) => kidAround(k, o, at, date));
  // What's still wrong once each day has moved around it: what moved is said as a move, not as a broken rule.
  const warnings = [
    ...(drive == null ? [{ rule: 'no-location', message: `${whereOf(o)} has no place on the map, so the drive is a guess` }] : []),
    ...(drive > MAX_FAMILY_DRIVE_MIN ? [{ rule: 'drive-time', message: `It's about ${drive} minutes from home, and we plan up to ${MAX_FAMILY_DRIVE_MIN}.` }] : []),
    ...familyProblems(o, { kids: moved, date, drive: at, weather }),
  ];
  const day = dayFor({ outing: o, drive: at, kids: moved, date, files, home, limits, forced: true });
  const seen = new Set();
  // A long drive is said once, above, not again for each drive in each child's day.
  warnings.push(...day.warnings.filter((p) => p.rule !== 'drive-time'));
  const once = warnings.filter((p) => !seen.has(`${p.rule}|${p.child ?? ''}`) && seen.add(`${p.rule}|${p.child ?? ''}`));
  return { ...day, forced: true, warnings: once, approximate: day.approximate || drive == null, ...(drive == null ? { trips: [] } : {}) };
}

/**
 * The best day for the family on a date: all the kids, from home. With nothing that fits
 * everyone, a day at home, saying so. A day is bent only for something special (specialOf) that
 * the children would love more than anything that fits, and only as far as the parent allows.
 */
export function familyDay({ files, profile, date, limits = NO_LIMITS }) {
  const { kids, left } = kidsOn(profile, date);
  if (!kids.length) return { ok: false, reason: 'no-kids', left };
  const grownups = profile.parents ?? [];
  const at = { files, kids, grownups, home: profile.home, date, limits };
  const list = fittingOutings(at);
  // Whatever the day is, the better ones the limits kept out are said too (beyondLimits), so the parent can choose.
  const special = specialDay({ ...at, list });
  if (special) {
    const than = { outing: special.outing, cost: special.cost, score: familyScore(special.outing, kids, grownups) };
    return { ...special, left, others: list, beyond: beyondLimits({ ...at, than }) };
  }
  for (const x of list) {
    const day = dayFor({ outing: x.outing, drive: x.drive, kids, date, files, home: profile.home, limits });
    if (day.ok) return { ...day, left, others: list.filter((y) => y.outing.ref !== x.outing.ref), beyond: beyondLimits({ ...at, than: x }) };
  }
  // A day at home: says when it's the limits that left nothing, so the parent knows what would change it.
  const limited = limits !== NO_LIMITS && fittingOutings({ ...at, limits: NO_LIMITS }).length > 0;
  return { ...dayFor({ outing: null, drive: null, kids, date, files, home: profile.home }), left, others: [], limited, beyond: beyondLimits(at) };
}

/**
 * A day around one picked outing. The parent picked it, so it's worth moving naps and bedtime for, as far as their
 * `limits.stretch` allows (`bend` says how far, each child's `moved` by how much). When even that doesn't do it,
 * `ok: false` with `problems` in words; with `anyway`, the day is planned regardless (`forced`), with the problems
 * as `warnings`.
 */
export function dayAround({ files, profile, date, ref, limits = NO_LIMITS, anyway = false }) {
  const { kids, left } = kidsOn(profile, date);
  if (!kids.length) return { ok: false, reason: 'no-kids', left };
  const picks = outingsIn(files, { pool: true }).filter((o) => o.ref === ref);
  if (!picks.length) throw new Error(`${ref} isn't one of the day's checked outings`);
  const home = profile.home;
  const others = () => fittingOutings({ files, kids, grownups: profile.parents ?? [], home, date, limits }).filter((x) => x.outing.ref !== ref);
  const drive = driveTo(home, picks[0]);
  const weather = weatherOf(files);
  // Planned anyway: at the time it fits best (a place slid to fit the naps), when there is one.
  const best = () => (drive == null ? null : picks.map((o) => fitted(o, { kids, date, drive, weather })).find(Boolean)) ?? picks[0];
  const fail = (reason, problems, extra = {}) => (anyway
    ? { ...forcedDay({ o: best(), kids, date, files, home, limits, drive }), left, others: others(), ref }
    : { ok: false, reason, left, problems, ref, ...extra });
  if (drive == null) return fail('no-location', [{ rule: 'no-location', message: `${whereOf(picks[0])} has no place on the map` }]);
  if (drive > MAX_FAMILY_DRIVE_MIN) return fail('too-far', [{ rule: 'drive-time', message: `about ${drive} minutes from home, and we plan up to ${MAX_FAMILY_DRIVE_MIN}` }], { drive });
  let last = [], reason = 'does-not-fit';
  for (const o of picks) {
    const t = fitted(o, { kids, date, drive, weather });
    if (t) {
      const day = dayFor({ outing: t, drive, kids, date, files, home, limits });
      if (day.ok) return { ...day, left, others: others(), ref };
      ({ problems: last, reason } = day);
    } else last = familyProblems(o, { kids, date, drive, weather });
  }
  // Moving the day doesn't make an outing cheaper or nearer.
  const timing = reason !== 'over-limits';
  const bent = timing ? stretchedDay({ picks, kids, date, files, home, limits, drive, most: limits.stretch ?? 0 }) : null;
  if (bent) return { ...bent, left, others: others(), ref };
  // Would a bigger allowance have done it? Then the page can say so.
  const wider = timing && !anyway && (limits.stretch ?? 0) < STRETCHES.at(-1)
    ? STRETCHES.find((s) => s > (limits.stretch ?? 0) && stretchedDay({ picks, kids, date, files, home, limits, drive, most: s })) ?? null : null;
  return fail(reason, last, { wider });
}

/** Swap in another checked outing, the nearest to the one it replaces first. The same gate holds. */
export function swapsFor({ files, profile, date, current, limits = NO_LIMITS }) {
  const { kids } = kidsOn(profile, date);
  const list = fittingOutings({ files, kids, grownups: profile.parents ?? [], home: profile.home, date, limits }).filter((x) => x.outing.ref !== current.ref);
  const from = stopsOf(current).find((s) => s.lat != null);
  const away = (x) => {
    const to = stopsOf(x.outing).find((s) => s.lat != null);
    return from && to ? driveBetween(from, to).minutes : Infinity;
  };
  return list.sort((a, b) => away(a) - away(b) || a.drive - b.drive);
}

/** How much later "go later" moves an outing at the least, and how far into the day it looks. */
export const LATER_MIN = 30;
const LATER_LAST = 20 * 60;

/**
 * The same outing later in the day: the next time it fits everyone, at least `LATER_MIN` after
 * `current` arrives. A place or a drop-in slides on, past a nap if that's what it takes, at the
 * longest stay that fits then. A timed event goes later only where the day lists it again at a
 * later time. The same gate holds. null when there's no later time.
 */
export function laterFor({ files, profile, date, current, drive, limits = NO_LIMITS }) {
  const { kids, left } = kidsOn(profile, date);
  const ctx = { kids, date, drive, weather: weatherOf(files) };
  const after = toMin(current.arrive) + LATER_MIN;
  const longest = Math.min(...kids.map((k) => MAX_STAY_MIN[k.band.id]));
  const tries = [];
  for (const o of outingsIn(files, { pool: true }).filter((x) => x.ref === current.ref)) {
    const open = dropInWindow(o);
    if (!isPlace(o) && !open) { if (toMin(o.arrive) >= after) tries.push(o); continue; }
    const inside = (t) => !open || (toMin(t.arrive) >= open.from && toMin(t.leave) <= open.to);
    for (let d = Math.ceil((after - toMin(o.arrive)) / 30) * 30; toMin(o.arrive) + d <= LATER_LAST; d += 30) {
      tries.push(...[longest, ...SHORTER_STAYS].map((stay) => trimmed(d ? moved(o, d) : o, stay)).filter(inside));
    }
  }
  // Soonest first; at one time, the longest stay first (the sort keeps that order).
  tries.sort((a, b) => toMin(a.arrive) - toMin(b.arrive));
  for (const t of tries) {
    if (familyProblems(t, ctx).length) continue;
    const day = dayFor({ outing: t, drive, kids, date, files, home: profile.home, limits });
    if (day.ok) return { ...day, left };
  }
  return null;
}

// ---- A typed request ----

/** "Near Cary" is an outing whose first stop is this many minutes by road from the middle of Cary. */
export const NEAR_MIN = 15;

/** The words of an outing a typed request's words are looked for in: titles, venues, kinds and amenities. */
const wordsOf = (o) => stopsOf(o).flatMap((s) => [s.title, s.venue, s.kind, ...(s.amenities ?? [])]).concat(o.interests ?? []).join(' ').toLowerCase();

/**
 * The day a typed request asks for. `settings` is Claude's reading of it (apps/routines/sync/ask.js settingsOf):
 * `after`/`before` as HH:MM, `setting` indoors or outdoors, `free`, `words` to look for, and `near`, already placed by
 * the page as a point (`near`, or null). Claude picks nothing: the outings are the day's checked ones that fit every
 * child (fittingOutings), and every plan passes the same gate (dayFor). `after`, `before`, `setting`, `free` and
 * `near` must all hold; `words` only rank, and `unmatched` says when none of them were found. A place earlier than
 * `after` is moved later to fit (laterFor). With nothing that holds, `ok: false`, `reason: 'nothing-asked'` and
 * `without`: each of the request's parts that, dropped, would leave something, so the page can say what to give up.
 */
export function askedDay({ files, profile, date, settings, near = null, limits = NO_LIMITS }) {
  const { kids, left } = kidsOn(profile, date);
  if (!kids.length) return { ok: false, reason: 'no-kids', left };
  const home = profile.home;
  const all = fittingOutings({ files, kids, grownups: profile.parents ?? [], home, date, limits, pool: true });
  const nearBy = (x) => {
    const first = stopsOf(x.outing).find((s) => s.lat != null);
    return first ? driveBetween(near, first).minutes : Infinity;
  };
  // Each part of the request as a test on a fitting outing. Times are tested on the day found, after moving.
  const parts = {
    ...(settings.setting === 'indoors' ? { indoors: (x) => !hasOutside(x.outing) } : {}),
    ...(settings.setting === 'outdoors' ? { outdoors: (x) => hasOutside(x.outing) } : {}),
    ...(settings.free ? { free: (x) => x.cost.usd === 0 && !x.cost.unlisted } : {}),
    ...(near ? { near: (x) => nearBy(x) <= NEAR_MIN } : {}),
  };
  const after = settings.after ? toMin(settings.after) : null, before = settings.before ? toMin(settings.before) : null;
  const inTime = (o) => (after == null || toMin(o.arrive) >= after) && (before == null || toMin(o.leave) <= before);
  const words = settings.words ?? [];
  // "trains" finds a museum with a train, "libraries" a library.
  const stem = (w) => w.replace(/(?<=..)(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : ''));
  const hits = (x) => { const text = wordsOf(x.outing); return words.filter((w) => text.includes(w) || text.includes(stem(w))).length; };

  // The day for one outing inside the asked times, moved later for `after` where it can be, or null.
  const dayIn = (x) => {
    if (inTime(x.outing)) {
      const day = dayFor({ outing: x.outing, drive: x.drive, kids, date, files, home, limits });
      if (day.ok) return day;
    }
    if (after == null || toMin(x.outing.arrive) >= after) return null;
    const later = laterFor({ files, profile, date, current: { ...x.outing, arrive: hhmm(Math.max(0, after - LATER_MIN)) }, drive: x.drive, limits });
    return later && inTime(later.outing) ? later : null;
  };
  const search = (tests) => {
    const pool = all.filter((x) => tests.every((t) => t(x)))
      .map((x, i) => ({ x, i, hits: hits(x), near: near ? nearBy(x) : 0 }))
      .sort((a, b) => b.hits - a.hits || a.near - b.near || a.i - b.i);
    for (const { x, hits: h } of pool) {
      const day = dayIn(x);
      if (day) return { day, hits: h };
    }
    return null;
  };

  const found = search(Object.values(parts));
  if (found) {
    return { ...found.day, left, asked: true, unmatched: words.length && !found.hits ? words : [] };
  }
  // What to give up: each part (a time counts as one) that, dropped alone, finds a day.
  const without = [];
  for (const k of Object.keys(parts)) if (search(Object.entries(parts).filter(([n]) => n !== k).map(([, t]) => t))) without.push(k);
  if ((after != null || before != null) && askedDay({ files, profile, date, settings: { ...settings, after: null, before: null }, near, limits }).ok) {
    without.push('time');
  }
  return { ok: false, reason: 'nothing-asked', left, without };
}

/** The events on a day the family could pick, by the time they start. */
export function eventsOn(files) {
  const seen = new Set(), out = [];
  for (const o of outingsIn(files)) {
    for (const s of stopsOf(o)) {
      if (s.kind === 'event' && !seen.has(o.ref)) { seen.add(o.ref); out.push({ ref: o.ref, title: s.title, venue: s.venue, start: s.start, area: o.area }); break; }
    }
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/** A saved plan against this morning's files: still on the list at its time, and still passing every rule. */
export function savedStatus(saved, files, profile) {
  if (!saved.outing) return { ok: true };
  // Each child's day as it was saved: with naps moved for this outing, if they were.
  const kids = kidsOn(profile, saved.date).kids.map((k) => {
    const nap = saved.kids?.find((c) => c.name === (k.name ?? '') && c.nap)?.nap;
    return nap ? { ...k, nap } : k;
  });
  const now = outingsIn(files, { pool: true }).find((o) => o.ref === saved.outing.ref);
  if (!now) return { ok: false, message: `${whereOf(saved.outing)} is no longer on the checked list for this day.` };
  // What the parent planned it anyway knowing isn't news.
  const known = new Set(saved.accepted ?? []);
  const problems = familyProblems(saved.outing, { kids, date: saved.date, drive: saved.drive ?? 0, weather: weatherOf(files) })
    .filter((p) => !known.has(`${p.rule}|${p.child ?? ''}`));
  return problems.length ? { ok: false, message: problems[0].message } : { ok: true };
}

// ---- Where the stops are ----

const stopKey = (s) => `${s.kind}|${s.title}|${s.venue ?? ''}|${s.address ?? ''}`;
const stopsIn = (files) => outingsIn(files).flatMap(stopsOf);

/** Each drive from one stop to the next inside an outing, as [[lat, lon], [lat, lon]], for files withPoints. */
export function stopPairsIn(files) {
  const pairs = new Map();
  for (const o of outingsIn(files)) {
    const at = stopsOf(o).filter((s) => s.lat != null);
    for (let i = 1; i < at.length; i++) pairs.set(`${at[i - 1].lat},${at[i - 1].lon}>${at[i].lat},${at[i].lon}`, [[at[i - 1].lat, at[i - 1].lon], [at[i].lat, at[i].lon]]);
  }
  return [...pairs.values()];
}

/**
 * Each drive on from one outing's last stop to another's first, where the second starts after the first ends, as
 * [[lat, lon], [lat, lon]], for files withPoints. A day's second outing can follow the main one with no nap between
 * (routemap.js tripLinks), and that drive is stop to stop, not from home: it needs its own road drawn.
 */
export function chainPairsIn(files) {
  const pairs = new Map();
  const outings = outingsIn(files).map((o) => ({ o, at: stopsOf(o).filter((s) => s.lat != null) })).filter((x) => x.at.length);
  for (const a of outings) {
    for (const b of outings) {
      if (a.o.ref === b.o.ref || toMin(b.o.arrive) < toMin(a.o.leave)) continue;
      const from = a.at.at(-1), to = b.at[0];
      if (from.lat === to.lat && from.lon === to.lon) continue;
      pairs.set(`${from.lat},${from.lon}>${to.lat},${to.lon}`, [[from.lat, from.lon], [to.lat, to.lon]]);
    }
  }
  return [...pairs.values()];
}

/** { stop: [lat, lon] } for every stop `find` can place, or that carries its own point. Made at the build. */
export function pointsFor(files, find) {
  const out = {};
  for (const s of stopsIn(files)) {
    // Most published stops carry no coordinates, but some sources' events do (Durham's ActiveCommunities
    // programs). Those are points too: left out, the drive table lacks a stop the route map then asks for.
    const p = find(s) ?? (s.lat != null && s.lon != null ? { lat: s.lat, lon: s.lon } : null);
    if (p) out[stopKey(s)] = [p.lat, p.lon];
  }
  return out;
}

/** The day files with their stops' points on them. A copy: what was fetched stays as published. */
export function withPoints(files, points) {
  const copy = JSON.parse(JSON.stringify(files));
  for (const s of stopsIn(copy)) {
    const p = points[stopKey(s)];
    if (p) [s.lat, s.lon] = p;
  }
  return copy;
}

// ---- Where home is ----

/**
 * What the browser reads to place home without asking any map service: the middle of
 * each ZIP and town, from the addresses of the parks and libraries in places.json.
 * Made at each build, as /family/where.json.
 */
export function whereIndex(places) {
  const zips = {}, towns = {};
  const add = (map, k, p) => { (map[k] ??= []).push(p); };
  for (const p of places) {
    if (p.lat == null) continue;
    const zip = /\b(27\d{3})\b/.exec(p.address ?? '')?.[1];
    if (zip) add(zips, zip, p);
    if (p.town) add(towns, p.town, p);
  }
  const middle = (ps) => [+(ps.reduce((s, p) => s + p.lat, 0) / ps.length).toFixed(4), +(ps.reduce((s, p) => s + p.lon, 0) / ps.length).toFixed(4)];
  const each = (map) => Object.fromEntries(Object.entries(map).map(([k, ps]) => [k, middle(ps)]));
  return { zips: each(zips), towns: each(towns) };
}

/** Home from what was typed: a ZIP anywhere in it, or else a town. null when neither is known. Runs only here. */
export function homeFrom(text, where) {
  const t = String(text ?? '').trim();
  const zip = /\b(27\d{3})\b/.exec(t)?.[1];
  if (zip && where.zips[zip]) return { lat: where.zips[zip][0], lon: where.zips[zip][1], label: zip, how: 'zip' };
  const town = Object.keys(where.towns).sort((a, b) => b.length - a.length).find((n) => t.toLowerCase().includes(n.toLowerCase()));
  return town ? { lat: where.towns[town][0], lon: where.towns[town][1], label: town, how: 'town' } : null;
}

/** A published nap pattern as a child's own times, moved by their wake-up. */
export function patternTimes(band, napId, wake) {
  const nap = band.naps.find((n) => n.id === napId);
  if (!nap) throw new Error(`${band.id} has no nap pattern ${napId}`);
  const d = shiftNap(nap, toMin(wake) - toMin(nap.wake));
  return { wake: d.wake, bed: d.bed, naps: d.sleep ?? [], quiet: d.quiet ?? [] };
}

/** A checked day as it's saved on this device: the facts, and each child's day. */
export function toSaved(day, title) {
  const o = day.outing, first = o ? stopsOf(o)[0] : null;
  return {
    id: `${day.date}-${o?.ref ?? 'home'}`.replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 64),
    date: day.date, title, drive: day.drive, outing: o,
    // What the day used of the week's limits (limitsFor): both trips' miles, and what they cost.
    miles: day.miles ?? 0, dollars: day.dollars ?? 0,
    where: o ? whereOf(o) : null, address: first?.address ?? null, url: first?.url ?? null, arrive: o?.arrive ?? null, leave: o?.leave ?? null,
    // A child's naps as this day has them, when they were moved for it; and what a day planned anyway was known to break.
    kids: day.children.map((c) => ({ name: c.name ?? '', timeline: c.timeline, ...(c.moved ? { nap: c.nap } : {}) })),
    // The rest of the day as it was shown, for Tot Routines (toCarry): the shorter outing and the rainy-day one.
    cost: day.cost ?? null,
    second: day.second ? { outing: day.second, drive: day.secondDrive, cost: day.secondCost ?? null } : null,
    rain: day.rainBackup ? { outing: day.rainBackup, drive: day.rainBackupDrive } : null,
    ...(day.forced ? {
      accepted: day.warnings.map((p) => `${p.rule}|${p.child ?? ''}`),
      warned: [...new Set(day.warnings.map((p) => `${p.child ? `${p.child}: ` : ''}${p.message}`))],
    } : {}),
  };
}

/**
 * One outing from a public day page, saved the way a family's day is, with no home and no child: nothing to drive from
 * and nobody's naps, so the app shows it as the family's day (its outingKid). `rain` is the day's rainy-day outing.
 */
export const toSavedOuting = ({ date, title, outing, rain = null }) =>
  toSaved({ date, outing, drive: null, children: [], rainBackup: rain, rainBackupDrive: null }, title);

/**
 * What the sync server checks saved plans against each morning, published as /family/checked.json: for each day,
 * every outing on its checked list by ref with the times it's at, and what in the forecast rules out the outdoors.
 * It's made from the same published files anyone can read, so it says nothing that isn't already public.
 */
export function checkedList(filesByDate, made) {
  const days = {};
  for (const [date, files] of Object.entries(filesByDate)) {
    if (!files.length) continue;
    const d = days[date] = { at: {}, wet: badWeather(weatherOf(files)) };
    for (const o of outingsIn(files, { pool: true })) {
      const at = d.at[o.ref] ??= [];
      if (!at.includes(o.arrive)) at.push(o.arrive);
    }
  }
  return { made, days };
}

/**
 * Saved plans as the sync server keeps them when the family asks to be emailed about changes, and nothing more: the
 * day, which outing, what it's called, the time only for a timed event (a place's time is ours to move), and whether
 * it's outdoors. No home, no children, no timelines.
 */
export const toWatch = (saved) => saved.filter((s) => s.outing).map((s) => ({
  id: s.id, date: s.date, ref: s.outing.ref, title: s.title,
  at: stopsOf(s.outing).some((x) => x.kind === 'event' && !x.dropIn) ? s.outing.arrive : null,
  outdoor: !!s.outing.outdoor,
}));

// ---- Into Tot Routines ----
// The app takes a plan only in the shape it writes (apps/routines/www/sync.js syncValid): plain keys, numbers where
// it counts, and no < > & " ' ` \ in what it draws as it is (start, end, leave and the like are times here). Words
// are escaped as the app draws them, so titles and tips can say anything. A link is kept only if it's http(s).
const webLink = (u) => (typeof u === 'string' && /^https?:\/\/[^\s<>"'`\\]+$/.test(u) ? u : null);
const words = (v) => (v == null || v === '' ? null : String(v));
/** One stop as the app shows it. */
const appStop = (s) => ({
  title: String(s.title ?? ''), kind: words(s.kind), icon: typeOfStop(s).icon, label: typeOfStop(s).label,
  venue: words(s.venue), address: words(s.address), url: webLink(s.url), cost: words(s.cost),
  time: typeof s.start === 'string' && s.start.length > 11 ? s.start.slice(11, 16) : null,
});
/** One trip from home: when, how far, and each of its stops. */
const appTrip = (o, drive, cost) => ({
  arrive: o.arrive, leave: o.leave, drive: Number.isFinite(drive) ? drive : null, outdoor: !!o.outdoor,
  why: words(o.why), tips: words(Array.isArray(o.tips) ? o.tips.join(' ') : o.tips),
  usd: Number.isFinite(cost?.usd) ? cost.usd : null,
  stops: stopsOf(o).map(appStop),
});

/**
 * A saved plan as Tot Routines keeps it. The first fields (title to accepted) are the ones the app has read since
 * 1.89, kept as they were so a phone still on it shows the plan as before; `v: 2` and the rest are new.
 */
export function forApp(s) {
  const { outing, second, rain, cost, warned, ...first } = s;
  return {
    ...first,
    v: 2,
    url: webLink(first.url),
    trips: [
      outing && { ...appTrip(outing, s.drive, cost), main: true },
      second?.outing && appTrip(second.outing, second.drive, second.cost),
    ].filter(Boolean).sort((a, b) => toMin(a.arrive) - toMin(b.arrive)),
    rain: rain?.outing ? appTrip(rain.outing, rain.drive) : null,
    warned: Array.isArray(warned) ? warned.map(String) : [],
  };
}

/** The sealed box's limit on the server (apps/routines/sync/family.js MAX_BODY), with room for the request around it. */
export const CARRY_MAX = 44 << 10;

/**
 * What goes in the sealed box for the app: the saved days from `today` on, soonest first, as many as fit in the box,
 * and the pass's key if there is one. `left` is how many upcoming days didn't fit.
 */
export function toCarry(saved, planKey, today = null) {
  const upcoming = saved.filter((s) => !today || s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const plans = [];
  let size = 0;
  for (const s of upcoming) {
    const p = forApp(s), n = JSON.stringify(p).length;
    if (size + n > CARRY_MAX) break;
    plans.push(p);
    size += n;
  }
  return { v: 2, plans, left: upcoming.length - plans.length, ...(planKey ? { planKey } : {}) };
}
