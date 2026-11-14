// Plans for a child who wakes earlier or later than the 7 am the plans are made for.
//
// Code only, no Claude call: the whole day (naps, quiet time, bedtime) moves with
// the wake-up, and the outing is picked from the day's checked outings (every
// pattern's main, alternatives and rain backup) by the same nap rules as
// src/plans/validate.js. Events keep their times; a park or library visit moves
// with the day if it is open then. The timeline is rebuilt around what was picked.

import { toMin, stopsOf, between, NAP_BUFFER_MIN, AFTER_NAP_MIN, DRIVE_MIN, MORNING_MIN, EVENING_MIN, NEARBY_MIN, LEAVE_BEFORE_SLEEP_MIN, LUNCH_MIN, LUNCH_BY_MIN, RAIN_BACKUP_PCT } from '../plans/rules.js';
import { placeHoursOn, parseHoursRange, badWeather } from '../plans/day-facts.js';

/** Minutes from the 7 am wake-up the plans are made for. */
export const WAKE_SHIFTS = [-60, -30, 0, 30, 60, 90, 120, 150, 180];

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const move = (t, d) => hhmm(toMin(t) + d);

/** A nap pattern with every time moved by `d` minutes. */
export function shiftNap(nap, d) {
  const pairs = (list) => list?.map(([a, b]) => [move(a, d), move(b, d)]);
  return { ...nap, wake: move(nap.wake, d), bed: move(nap.bed, d), sleep: pairs(nap.sleep), quiet: pairs(nap.quiet) };
}

/** Where an outing starts: the venue of its first event, or the place. */
export const whereOf = (o) => (o.source.kind === 'event' ? o.source.venue : o.source.title);

/** Whether an outing (at its own times) fits a day: rested before, home before sleep, home for dinner, place open. */
export function fits(o, nap, date) {
  const arrive = toMin(o.arrive), leave = toMin(o.leave);
  if (arrive < toMin(nap.wake) + MORNING_MIN || leave > toMin(nap.bed) - EVENING_MIN) return false;
  for (const [a, b] of nap.sleep ?? []) {
    if (arrive < toMin(b) + AFTER_NAP_MIN && leave > toMin(a) - LEAVE_BEFORE_SLEEP_MIN) return false;
  }
  for (const [a, b] of nap.quiet ?? []) {
    if (arrive < toMin(b) + AFTER_NAP_MIN && leave > toMin(a) - NAP_BUFFER_MIN) return false;
  }
  if (o.source.kind !== 'event') {
    const hours = o.source.hours ? placeHoursOn(o.source, date) : null;
    if (hours === undefined) return false;
    const range = parseHoursRange(hours);
    if (range && (arrive < toMin(range.opens) || leave > toMin(range.closes))) return false;
  }
  return true;
}

/** Whether an outing has time outside: it is outdoors, or a park or other outdoor stop goes with it. */
export const hasOutside = (o) => o.outdoor || stopsOf(o).some((s) => s.indoor === false);

export const rainLikely = (weather) => (weather?.precipProbability ?? 0) >= RAIN_BACKUP_PCT;

/** Colder than this while a family is out, and an outdoor outing gets an indoor one to fall back on, as a wet day does. */
export const COLD_BACKUP_F = 40;

/**
 * The lowest and highest temperature while a family is at an outing, from the day's hourly forecast:
 * { low, high }, or null on a day too far ahead to have one.
 */
export function tempsWhile(o, weather) {
  const from = toMin(o.arrive), to = toMin(o.leave);
  const temps = (weather?.hours ?? []).filter((h) => toMin(h.t) + 60 > from && toMin(h.t) < to).map((h) => h.tempF);
  return temps.length ? { low: Math.min(...temps), high: Math.max(...temps) } : null;
}

/** Why an outing wants an indoor one to fall back on today: 'rain', 'cold', or null (it is indoors, or the day is fine). */
export function backupReason(o, weather) {
  if (!o?.outdoor) return null;
  if (rainLikely(weather)) return 'rain';
  const temps = tempsWhile(o, weather);
  return temps && temps.low < COLD_BACKUP_F ? 'cold' : null;
}

/** Outings best first for the day: indoors first in bad weather, otherwise the ones with time outside. */
export const byWeather = (pool, wet) => (wet ? [...pool.filter((o) => !o.outdoor), ...pool.filter((o) => o.outdoor)]
  : [...pool.filter(hasOutside), ...pool.filter((o) => !hasOutside(o))]);

/**
 * The indoor outing to fall back on for a plan today (in rain, or cold: backupReason),
 * or null. Worked out from the day's forecast each time, so a plan made before there
 * was a forecast gets one, and a fine day doesn't show one written when rain looked likely. The plan's own
 * first, then any checked outing of the day that fits this nap pattern.
 */
export function rainBackupFor({ plans, plan, nap, date, weather }) {
  if (!backupReason(plan.main, weather)) return null;
  const others = plans.filter((p) => p !== plan);
  const pool = [plan.rainBackup, ...plan.alternatives, ...others.map((p) => p.main), ...others.flatMap((p) => p.alternatives)].filter(Boolean);
  return pool.find((o) => o.ref !== plan.main.ref && !o.outdoor && fits(o, nap, date)) ?? null;
}

/** The outing at its own times, or (places only) moved with the day, whichever fits; null if neither. */
function placed(o, nap, d, date) {
  const tries = stopsOf(o).some((s) => s.kind === 'event') || !d ? [o] : [moved(o, d), o];
  return tries.find((t) => fits(t, nap, date)) ?? null;
}

// Tips that name a clock time ("leave by 10:20") are wrong once the outing moves.
const CLOCK = /\b\d{1,2}(:\d{2})?\s*([ap]\.?m\b|noon)|\b\d{1,2}:\d{2}\b/i;
export const moved = (o, d) => ({ ...o, arrive: move(o.arrive, d), leave: move(o.leave, d), tips: (o.tips ?? []).filter((t) => !CLOCK.test(t)) });

const key = (o) => `${o.ref}@${o.arrive}`;

/** How long a plain visit to a library or playground is planned for. */
export const VISIT_MIN = 60;
/** How far from the plan's outing another outing still counts as near: the same side of town. */
export const NEAR_MILES = 6;
/** How far from the plan's outing a plain visit may be. */
export const VISIT_MILES = 4;

// Straight-line miles between two points: plenty at the Triangle's scale. Kept here,
// not from lib/geo.js, as this file also runs in the browser (src/family/plan.js).
export const miles = (a, b) => Math.hypot((a.lat - b.lat) * 69, (a.lon - b.lon) * 69 * Math.cos((a.lat * Math.PI) / 180));
export const pointOf = (o) => { const s = stopsOf(o)[0]; return s.lat != null && s.lon != null ? s : null; };
const sameName = (a, b) => String(a ?? '').toLowerCase().replace(/\s+/g, ' ').trim() === String(b ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Whether an outing is near the plan's own: in its part of town, or a short drive from it across a line. */
export function nearPlan(o, plan) {
  if (o.area === plan.main.area) return true;
  const a = pointOf(o), b = pointOf(plan.main);
  return Boolean(a && b && miles(a, b) <= NEAR_MILES);
}

// What a parent wants to know about a park beyond its playground, from the site's own list of what each has.
// Not its rides or splash pad: those have their own hours, seasons and prices, which the list doesn't hold.
const PARK_HAS = { restroom: 'restrooms', 'picnic-shelter': 'a picnic shelter', greenway: 'a greenway to walk', nature: 'nature trails', garden: 'a garden' };
const inWords = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
/** " It has restrooms and a picnic shelter." for a park that does; '' for one with nothing listed. */
export function alsoHas(p) {
  const has = Object.keys(PARK_HAS).filter((a) => p.amenities?.includes(a)).map((a) => PARK_HAS[a]);
  return has.length ? ` It has ${inWords(has)}.` : '';
}

/**
 * A plain visit to a library (its children's area) or a playground near the plan's
 * outing, with no times yet. `p` is one of the site's places.
 */
export function visitOf(p, plan) {
  const first = stopsOf(plan.main)[0];
  const library = p.kind === 'library';
  const same = library && first.kind === 'event' && sameName(first.venue, p.name);
  return {
    ref: `visit:${p.name}`,
    visit: same ? 'same-library' : p.kind,
    why: library
      ? `${same ? `${first.title} doesn’t fit this day, but the library is open` : 'The library is open'}: picture books, puzzles and room to play in the children’s area, free and indoors.`
      : `A playground close by: room to run, climb and swing, free.${alsoHas(p)}`,
    tips: library ? ['Pick out a few books to take home for the nap.', 'Bring the library card, or sign up for one at the desk.'] : ['Bring water and a snack.'],
    interests: library ? ['stories'] : ['movement'],
    also: [],
    area: p.area,
    outdoor: !library,
    source: { kind: p.kind, title: p.name, address: p.address, lat: p.lat, lon: p.lon, url: p.url ?? null, amenities: p.amenities ?? [], indoor: library, area: p.area, hours: p.hours ?? null, cost: 'Free' },
  };
}

/**
 * A plain visit to a library or a playground, at the plan's outing's time moved
 * with the day, or else the nearest quarter hour that fits. null when no time does.
 */
function visitTo(p, plan, day, d, date) {
  const library = p.kind === 'library';
  const visit = visitOf(p, plan);
  const at = toMin(plan.main.arrive) + d;
  for (let i = 0; i <= 32; i++) {
    const start = at + (i % 2 ? -1 : 1) * 15 * Math.ceil(i / 2);
    // A playground in daylight: not before 8, home before dusk.
    if (!library && (start < 8 * 60 || start + VISIT_MIN > OUTSIDE_BY)) continue;
    const o = { ...visit, arrive: hhmm(start), leave: hhmm(start + VISIT_MIN) };
    if (fits(o, day, date)) return o;
  }
  return null;
}

/**
 * For a day where nothing on the day's list fits near the plan's outing: the
 * nearest library open then (whose hours we know), or in good weather the nearest
 * playground, within VISIT_MILES of it. The library the outing was at comes first,
 * being nearest. `places` are the site's places (src/site/places.json).
 */
export function nearbyVisit({ plan, day, d, date, places, wet }) {
  const at = pointOf(plan.main);
  if (!at) return null;
  const options = places
    .filter((p) => p.lat != null && (p.kind === 'library' ? Boolean(p.hours) : !wet && p.kind === 'park' && p.amenities?.includes('playground')))
    .map((p) => ({ p, mi: miles(at, p) }))
    .filter((x) => x.mi <= VISIT_MILES)
    // Weather allowing, outside first, as the 7 am plans have it; then the nearest.
    .sort((a, b) => (wet ? 0 : (a.p.kind === 'library') - (b.p.kind === 'library')) || a.mi - b.mi);
  for (const { p } of options) {
    const v = visitTo(p, plan, day, d, date);
    if (v) return v;
  }
  return null;
}

/**
 * The plan for one nap pattern on a day, for a child up `d` minutes from 7.
 * `plans` is the day's latest version's plans (all three patterns). `places`
 * are the site's places, for a plain visit near the plan when nothing listed fits.
 */
export function wakePlan({ plans, plan, nap, d, date, weather, places = [] }) {
  const day = shiftNap(nap, d);
  const others = plans.filter((p) => p !== plan);
  const wet = badWeather(weather).length > 0;
  // Best first: this pattern's own picks, then the other patterns'. In bad weather the
  // indoor ones come first, otherwise the ones with time outside, as the 7 am plans
  // have; within that, the ones near the plan's own outing.
  const listed = [plan.main, ...plan.alternatives, ...others.map((p) => p.main), ...others.flatMap((p) => p.alternatives), plan.rainBackup, ...others.map((p) => p.rainBackup)].filter(Boolean);
  const weatherRank = (o) => (wet ? Number(Boolean(o.outdoor)) : Number(!hasOutside(o)));
  const rank = (o) => weatherRank(o) * 2 + Number(!nearPlan(o, plan));
  const pool = listed.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map((x) => x.o);
  const seen = new Set();
  const fitting = [];
  for (const o of pool) {
    const p = placed(o, day, d, date);
    if (p && !seen.has(o.ref)) { seen.add(o.ref); fitting.push(p); }
  }
  // Nothing near fits: a library or playground near the plan, before anything across town.
  if (!fitting.some((o) => nearPlan(o, plan))) {
    const visit = nearbyVisit({ plan, day, d, date, places, wet });
    if (visit) fitting.unshift(visit);
  }
  const [main = null, ...rest] = fitting;
  const rainBackup = backupReason(main, weather) ? rest.find((o) => !o.outdoor) ?? null : null;
  const alternatives = rest.filter((o) => o !== rainBackup);

  // The 7 am plan moved whole when its own outing moved with it; otherwise rebuilt.
  const same = main && main.ref === plan.main.ref && toMin(main.arrive) - toMin(plan.main.arrive) === d;
  const timeline = same
    ? plan.timeline.map(({ detail, ...b }) => ({ ...b, start: move(b.start, d), end: move(b.end, d), ...(detail && !CLOCK.test(detail) ? { detail } : {}) }))
    : buildTimeline(day, main, { outside: !wet });
  return { nap: plan.nap, napLabel: plan.napLabel, shift: d, day, same: main?.ref === plan.main.ref, main, alternatives, rainBackup, timeline };
}

/** The swap-ins a plan's day can be rebuilt around: its own, at their own times, where they fit its nap pattern. */
export const aroundOutings = (plan, nap, date) => plan.alternatives.filter((o) => fits(o, nap, date));

/**
 * A plan's day at the usual wake-up, rebuilt around one of its swap-ins (one of
 * aroundOutings): the swap-in is the outing, the plan's own outing joins the
 * swap-ins, and the timeline is built again. The same shape as wakePlan, with
 * `around` the swap-in's ref.
 */
export function aroundPlan({ plan, nap, outing, date, weather }) {
  if (!fits(outing, nap, date)) throw new Error(`aroundPlan: ${outing.ref} at ${outing.arrive}–${outing.leave} doesn't fit the ${plan.nap} day`);
  const wet = badWeather(weather).length > 0;
  const rest = [plan.main, ...plan.alternatives.filter((o) => o.ref !== outing.ref)];
  const rainBackup = backupReason(outing, weather)
    ? [plan.rainBackup, ...rest].find((o) => o && o.ref !== outing.ref && !o.outdoor && fits(o, nap, date)) ?? null : null;
  return {
    nap: plan.nap, napLabel: plan.napLabel, shift: 0, around: outing.ref, day: nap, same: false, main: outing,
    alternatives: rest.filter((o) => o.ref !== rainBackup?.ref), rainBackup, timeline: buildTimeline(nap, outing, { outside: !wet }),
  };
}

const QUIET_MIN = 15; // the shortest quiet time worth a line in the day
const OUTSIDE_PLAY_MIN = 30; // the shortest play at home worth taking outside
const OUTSIDE_BY = 17 * 60; // and over before dusk (about 5:15 once the clocks go back)

/**
 * An outing's time from arrival to leaving, one block per stop with the drives
 * between: an event at its own times, a park or place in the time around them
 * (shared evenly when two places are next to each other). One block for the
 * whole outing when its times leave no room for its stops.
 */
export function stopBlocks(o) {
  const stops = stopsOf(o);
  const arrive = toMin(o.arrive), leave = toMin(o.leave);
  const whole = [[arrive, leave, 'outing', whereOf(o)]];
  if (stops.length === 1) return whole;
  const clockOf = (iso) => (iso && iso.length >= 16 ? toMin(iso.slice(11, 16)) : null);
  const out = [];
  let at = arrive;
  for (const [i, s] of stops.entries()) {
    // Nobody drives from a park to a program in the same park, or between two storytimes in one library.
    const way = i ? between(stops[i - 1], s) : 'same';
    if (way !== 'same') { out.push([at, at + NEARBY_MIN, 'travel', `${way === 'walk' ? 'Walk' : 'Drive'} to ${s.kind === 'event' ? s.venue : s.title}`]); at += NEARBY_MIN; }
    const left = stops.length - 1 - i;
    let end;
    if (!left) end = leave;
    else if (s.kind === 'event' && clockOf(s.end) != null) end = clockOf(s.end);
    else {
      const next = stops[i + 1];
      const nextStart = next.kind === 'event' ? clockOf(next.start) : null;
      const toNext = between(s, next) === 'same' ? 0 : NEARBY_MIN;
      end = nextStart != null ? nextStart - toNext : at + Math.floor((leave - at - NEARBY_MIN * left) / (left + 1));
    }
    if (end <= at || end > leave) return whole;
    out.push([at, end, 'outing', s.title]);
    at = end;
  }
  return out;
}

/**
 * Minutes to walk back to the car after an outing's last stop: NEARBY_MIN when the family walked on from where they
 * parked (the library, then the park beside it), else 0. The car is wherever the last drive ended, or the first stop.
 * "Leave by" is when they leave the last stop, so this comes after it, before the drive home.
 */
export function walkBackMin(o) {
  if (!o) return 0;
  const blocks = stopBlocks(o);
  if (blocks.length === 1) return 0; // shown as one block: no walk on the page to come back from
  const stops = stopsOf(o);
  const legs = stops.slice(1).map((s, i) => between(stops[i], s));
  return legs.slice(legs.lastIndexOf('drive') + 1).includes('walk') ? NEARBY_MIN : 0;
}

/**
 * A day from wake to bed around one outing (or none): fixed blocks first (the
 * outing and its drives, sleep, quiet time, bedtime), then meals and the small
 * things where they fit, then play at home in the gaps.
 */
export function buildTimeline(day, outing, { outside = false, drive = DRIVE_MIN } = {}) {
  const wake = toMin(day.wake), bed = toMin(day.bed);
  const blocks = [];
  const free = (s, e) => s >= wake && e <= bed && e > s && blocks.every((b) => e <= b.s || s >= b.e);
  const put = (s, e, kind, title, detail) => { if (free(s, e)) { blocks.push({ s, e, kind, title, detail }); return true; } return false; };
  const force = (s, e, kind, title, detail) => blocks.push({ s: Math.max(s, wake), e: Math.min(e, bed), kind, title, detail });

  const sleeps = (day.sleep ?? []).map(([a, b]) => [toMin(a), toMin(b)]);
  const quiets = (day.quiet ?? []).map(([a, b]) => [toMin(a), toMin(b)]);
  for (const [a, b] of sleeps) force(a, b, 'nap', 'Nap');
  // Quiet time gives way to the outing, as sleep doesn't: it ends when it's time to leave for one that starts
  // during it, and is left out when under a quarter of an hour would be left. (A planned outing may run into
  // quiet time, validate.js; one picked here by fits() never does.)
  const away = outing ? [toMin(outing.arrive) - drive, toMin(outing.leave) + walkBackMin(outing)] : null;
  for (const [a, b] of quiets) {
    const until = away && a < away[0] && b > away[0] ? away[0] : b;
    if (away && a >= away[0] && a < away[1]) continue;
    if (until - a >= QUIET_MIN) force(a, until, 'quiet', 'Quiet time', 'Books or quiet play in their room.');
  }
  force(bed - 45, bed, 'routine', 'Bath, books and bed');

  let lunchOut = false;
  if (outing) {
    const where = whereOf(outing);
    const arrive = toMin(outing.arrive), leave = toMin(outing.leave);
    const nextSleep = Math.min(bed, ...[...sleeps, ...quiets].map(([a]) => a).filter((a) => a >= leave));
    force(arrive - drive, arrive, 'travel', `Drive to ${where}`);
    for (const [s, e, kind, title] of stopBlocks(outing)) force(s, e, kind, title);
    const back = walkBackMin(outing);
    if (back) force(leave, leave + back, 'travel', 'Walk back to the car');
    force(leave + back, Math.min(leave + back + drive, nextSleep), 'travel', 'Drive home');
    // Lunch time spent out: pack it.
    lunchOut = arrive < wake + 330 && leave > wake + 300;
  }

  put(wake, wake + 30, 'meal', 'Up and breakfast');
  // Lunch about five hours after waking (noon for a 7 am riser): just before a nap
  // that falls around then, or else the nearest free half hour.
  const midday = sleeps.find(([a]) => a >= wake + 225 && a <= wake + LUNCH_BY_MIN);
  if (!lunchOut) {
    const end = midday ? midday[0] - 15 : wake + 315;
    const tries = [0, ...Array.from({ length: 24 }, (_, i) => (i % 2 ? 1 : -1) * 5 * Math.ceil((i + 1) / 2))];
    const lunchAt = (mins) => tries.some((t) => end + t - mins <= wake + LUNCH_BY_MIN && put(end + t - mins, end + t, 'meal', 'Lunch'));
    // No half hour free near it: a shorter lunch, and with the outing still in the way, lunch goes with it.
    if (!lunchAt(30) && !lunchAt(LUNCH_MIN) && outing) lunchOut = true;
  }
  if (midday) put(midday[0] - 15, midday[0], 'quiet', 'Wind down', 'A couple of books to settle.');
  for (const [, b] of sleeps) {
    // Straight out to the outing after a nap: the few minutes there are say so, not "Play at home".
    const next = blocks.filter((x) => x.s >= b).sort((x, y) => x.s - y.s)[0];
    if (next?.kind === 'travel' && next.s > b && next.s - b < 20) put(b, next.s, 'routine', 'Up, a snack and out the door', 'Have the bag packed and by the door before the nap.');
    else put(b, b + 20, 'routine', 'Up and a snack');
  }
  // "The bag", not "diaper bag": these days are for children up to five.
  if (outing) {
    const go = toMin(outing.arrive) - drive;
    [20, 15, 10].some((m) => put(go - m, go, 'routine', 'Get ready to go', 'Shoes on, the bag, water and a snack.'));
  }
  put(bed - 90, bed - 45, 'meal', 'Dinner');

  blocks.sort((x, y) => x.s - y.s);
  const out = [];
  let at = wake;
  for (const b of blocks) {
    if (b.s > at) {
      // A gap: play at home, or a few minutes folded into the block before.
      if (b.s - at >= 10 || !out.length) out.push({ s: at, e: b.s, kind: 'play', title: 'Play at home' });
      else out.at(-1).e = b.s;
    }
    out.push(b);
    at = b.e;
  }
  if (lunchOut) {
    const o = out.find((b) => b.kind === 'outing');
    o.detail = 'Pack a lunch to eat there.';
  }
  // Weather fine but the outing has no time outside (or there's no outing): the
  // longest daylight play at home goes outside, so every day still gets some.
  if (outside && !(outing && hasOutside(outing))) {
    const play = out.filter((b) => b.kind === 'play' && b.e - b.s >= OUTSIDE_PLAY_MIN && b.e <= OUTSIDE_BY)
      .sort((x, y) => (y.e - y.s) - (x.e - x.s))[0];
    if (play) Object.assign(play, { title: 'Play outside', detail: 'In the yard or at a nearby park.' });
  }
  return out.map((b) => ({ start: hhmm(b.s), end: hhmm(b.e), kind: b.kind, title: b.title, ...(b.detail ? { detail: b.detail } : {}) }));
}
