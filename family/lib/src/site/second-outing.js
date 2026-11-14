// A second, shorter outing in the day's longest stretch at home, so a day isn't
// one outing and then "Play at home" from the nap until dinner (or from breakfast
// until an afternoon outing).
//
// Code only, no Claude call: picked from the day's checked outings (every nap
// pattern's main, alternatives and rain backup), by the same rules as the wake-up
// plans (wake.js). An event keeps its own times; a park, library or other place
// moves into the free time. Near the main outing, over before dusk when it is
// outside, never the main outing's place again, free before paid. When nothing
// listed fits, a playground (or in bad weather a library) close to the main
// outing. The home time is rebuilt around it. No Node imports: this runs in a browser too.

import { toMin, stopsOf, DRIVE_MIN, MORNING_MIN } from '../plans/rules.js';
import { badWeather } from '../plans/day-facts.js';
import { fits, hasOutside, nearPlan, moved, whereOf, stopBlocks, walkBackMin, visitOf, miles, pointOf, alsoHas, NEAR_MILES } from './wake.js';
import { sunTimes } from './sky.js';

/** Time to get shoes on and out of the door before the drive. */
export const READY_MIN = 20;
/** The shortest second outing worth the drive, and the longest planned. */
export const SECOND_MIN_STAY = 45;
export const SECOND_STAY = 75;
/** An outside outing is over this long before sunset. */
const DUSK_MIN = 15;
/** At home this long after the main outing before getting ready for another: lunch if it is then, and feet up. */
export const HOME_BETWEEN_MIN = 75;
/** Not out of the door at the first minute the rules allow: a slow start to the morning. */
export const SLOW_START_MIN = 120;

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const up5 = (m) => Math.ceil(m / 5) * 5;
const isPlace = (o) => stopsOf(o).every((s) => s.kind !== 'event');
const lower = (s) => String(s ?? '').toLowerCase().trim();
// A place with an admission price: fine as the day's outing, a lot for an hour's add-on. Not one that is free to get
// into and charges for a ride once there ("Free to get in; rides $2 a ticket").
export const paid = (o) => isPlace(o) && stopsOf(o).some((s) => !/^free\b/i.test(s.cost ?? '') && /\$\s?\d/.test(`${s.cost ?? ''} ${s.note ?? ''}`));
// Copy written for another part of the day doesn't move with the outing.
const NOT_AFTERNOON = /\b(morning|breakfast|lunch|nap ?time|before (the |a |your )?(nap|rest)|nap)\b/i;
const NOT_MORNING = /\b(afternoon|after (the |a |your )?(nap|rest)|evening|dinner)\b/i;

/** Words for another time of day, for a second outing at `atMin`. */
export const otherTimeWords = (atMin) => (atMin >= 12 * 60 ? NOT_AFTERNOON : NOT_MORNING);

/** An outing as a second outing at `atMin`: its tips for another time of day dropped; null when its why is written for another time. */
export function copyAt(o, atMin) {
  const re = otherTimeWords(atMin);
  return re.test(o.why ?? '') ? null : { ...o, tips: (o.tips ?? []).filter((x) => !re.test(x)) };
}

// Kinds of outing a day has only one of: two storytimes (or a storytime and an hour of
// picture books at the library) is the same morning twice.
const KINDS = {
  books: (s) => s.kind === 'library' || /\b(story ?times?|stories|story|books?|read(ing)?|rhymes?|lapsit)\b/i.test(s.title ?? ''),
  music: (s) => /\b(music|sing|songs?|sing-?along|jam)\b/i.test(s.title ?? ''),
  crafts: (s) => /\b(crafts?|art ?(cart|class|time)|paint(ing)?|make ?(and|&) ?take)\b/i.test(s.title ?? ''),
};
/** The kinds of activity an outing's stops are: books, music, crafts. */
export const kindsOf = (o) => new Set(stopsOf(o).flatMap((s) => Object.keys(KINDS).filter((k) => KINDS[k](s))));

/**
 * Whether an outing is the main outing again: its ref, one of its places under the same or a
 * longer name, or the same kind of thing (a second storytime).
 */
export function repeatsOf(main) {
  const takenNames = (main ? stopsOf(main) : []).flatMap((s) => [s.title, s.venue].filter(Boolean).map(lower));
  // The same place under another name: "Apex Nature Park (Seymour Athletic Fields)" is Apex Nature Park.
  const isTaken = (name) => Boolean(name) && takenNames.some((t) => lower(name).startsWith(t) || t.startsWith(lower(name)));
  const mainKinds = main ? kindsOf(main) : new Set();
  const sameKind = (o) => [...kindsOf(o)].some((k) => mainKinds.has(k));
  const repeats = (o) => o.ref === main?.ref || sameKind(o) || stopsOf(o).some((s) => [s.title, s.venue].some(isTaken));
  return { repeats, isTaken, sameKind };
}

/** The play-at-home block a second outing's getting ready, drives and stay all fit inside, or -1. */
export function homeBlockFor(timeline, o, drive = DRIVE_MIN) {
  const from = toMin(o.arrive) - drive - READY_MIN, to = toMin(o.leave) + walkBackMin(o) + drive;
  return timeline.findIndex((b) => b.kind === 'play' && toMin(b.start) <= from && to <= toMin(b.end));
}
// Not a toddler's playground, whatever its amenities say; an express library is a shelf and a desk.
const NOT_FOR_LITTLE = /\b(fitness|skate|dog park|disc golf|tennis|express)\b/i;

// How much a park's features make it worth the drive, as gather.js ranks them for the plans.
const AMENITY_WEIGHT = { carousel: 3, train: 3, amusements: 3, animals: 3, splashpad: 3, nature: 2, playground: 2, garden: 1, greenway: 1, restroom: 1 };
const parkRank = (p) => (p.amenities ?? []).reduce((s, a) => s + (AMENITY_WEIGHT[a] ?? 0), 0);

/**
 * The day's longest stretch at home with room for getting ready, a drive each way
 * and the shortest stay, outside the main outing and its drives. null when none.
 */
export function homeStretch(timeline, drive = DRIVE_MIN) {
  const need = READY_MIN + drive * 2 + SECOND_MIN_STAY;
  const long = timeline.map((b, i) => ({ b, i, mins: toMin(b.end) - toMin(b.start) }))
    .filter(({ b, mins }) => b.kind === 'play' && mins >= need)
    .sort((x, y) => y.mins - x.mins)[0];
  return long ? { index: long.i, start: toMin(long.b.start), end: toMin(long.b.end) } : null;
}

/**
 * When the family got home from an outing, in minutes, if nothing but a meal lies between that and the stretch at
 * home at `index`; null when they have been home longer (a nap, quiet time) or haven't been out.
 */
export function homeSince(timeline, index) {
  const before = timeline.slice(0, index);
  const cameHome = before.findLast((b) => b.kind === 'travel');
  return cameHome && before.slice(before.indexOf(cameHome) + 1).every((b) => b.kind === 'meal') ? toMin(cameHome.end) : null;
}

/**
 * The best second outing for one plan on its day, or null. `plan` is the 7 am
 * plan (its main is where the family is assumed to be), `main` the outing the
 * day is built around (a wake-up plan's own, or the plan's; null for a day at
 * home), `plans` every nap pattern's plan that day, `day` the nap pattern (moved
 * for a wake-up), `timeline` the day so far, `places` the site's places for a
 * playground or library close by.
 */
export function secondOutingFor({ plans, plan, main = plan.main, day, date, weather, places = [], timeline }) {
  const gap = homeStretch(timeline);
  if (!gap) return null;
  const wet = badWeather(weather).length > 0;
  const afternoon = gap.start >= 12 * 60;
  // Home from the main outing just before this stretch (a day with no nap: nothing but lunch in between): a rest
  // at home first, not in from one outing and straight out to the next.
  const sinceHome = homeSince(timeline, gap.index);
  const rested = sinceHome == null ? gap.start : Math.max(gap.start, sinceHome + HOME_BETWEEN_MIN);
  const earliest = up5(Math.max(rested + READY_MIN + DRIVE_MIN, toMin(day.wake) + Math.max(MORNING_MIN, SLOW_START_MIN)));
  const latest = gap.end - DRIVE_MIN;
  const dusk = sunTimes(date).set - DUSK_MIN;
  const anchor = { ...plan, main: main ?? plan.main };
  const { repeats, isTaken, sameKind } = repeatsOf(main);
  const otherTime = afternoon ? NOT_AFTERNOON : NOT_MORNING;
  // Outside, if the main outing had none: every day gets time outside when the weather allows.
  const needsOutside = !wet && !(main && hasOutside(main));
  const okWeather = (o) => (wet ? !o.outdoor : needsOutside ? hasOutside(o) : true);
  const inWindow = (o) => toMin(o.arrive) >= earliest && toMin(o.leave) <= latest && (!o.outdoor || toMin(o.leave) <= dusk) && fits(o, day, date);

  // A place moves into the free time, as long as a stay fits; an event keeps its times.
  const placedIn = (o) => {
    if (!isPlace(o)) return inWindow(o) ? o : null;
    const stay = Math.min(SECOND_STAY, toMin(o.leave) - toMin(o.arrive));
    for (let at = earliest; at + SECOND_MIN_STAY <= latest; at += 15) {
      const end = Math.min(at + stay, latest, o.outdoor ? dusk : Infinity);
      if (end - at < SECOND_MIN_STAY) break;
      const t = { ...moved(o, at - toMin(o.arrive)), leave: hhmm(end) };
      if (inWindow(t)) return t;
    }
    return null;
  };

  const others = plans.filter((p) => p !== plan);
  const listed = [plan.main, ...plan.alternatives, ...others.map((p) => p.main), ...others.flatMap((p) => p.alternatives), plan.rainBackup, ...others.map((p) => p.rainBackup)].filter(Boolean);
  const seen = new Set();
  const fitting = [];
  for (const [i, o] of listed.entries()) {
    if (seen.has(o.ref) || repeats(o) || !okWeather(o) || !nearPlan(o, anchor) || otherTime.test(o.why ?? '')) continue;
    seen.add(o.ref);
    const t = placedIn({ ...o, tips: (o.tips ?? []).filter((x) => !otherTime.test(x)) });
    if (t) fitting.push({ o: t, i });
  }
  // Something on at a time (a fair, a show) first; then free places before paid; then the plans' own order.
  fitting.sort((a, b) => Number(isPlace(a.o)) - Number(isPlace(b.o)) || Number(paid(a.o)) - Number(paid(b.o)) || a.i - b.i);
  const best = fitting.find((x) => !paid(x.o));
  if (best) return best.o;

  // Nothing free listed fits: a playground close to the main outing, the best of them first,
  // or a library in bad weather or when no playground is near.
  const at = pointOf(anchor.main);
  const visits = !at ? [] : places
    .filter((p) => p.lat != null && !isTaken(p.name) && !NOT_FOR_LITTLE.test(p.name)
      && (p.kind === 'library' ? Boolean(p.hours) : !wet && p.kind === 'park' && p.amenities?.includes('playground')))
    .map((p) => ({ p, mi: miles(at, p) }))
    .filter((x) => x.mi <= NEAR_MILES)
    .sort((a, b) => (a.p.kind === 'library') - (b.p.kind === 'library') || parkRank(b.p) - parkRank(a.p) || a.mi - b.mi);
  for (const { p } of visits) {
    const v = visitOf(p, anchor);
    const t = placedIn({ ...v, arrive: hhmm(earliest), leave: hhmm(earliest + SECOND_STAY) });
    if (t && okWeather(t) && !sameKind(t)) return visitWords(t, p);
  }
  // Only a paid place, then: still better than nothing.
  return fitting[0]?.o ?? null;
}

/** A plain visit's words, for any time of day. */
function visitWords(o, p) {
  return p.kind === 'library'
    ? { ...o, why: 'An easy hour out: picture books, puzzles and room to play in the children’s area, free and indoors.', tips: ['Pick out a few books for bedtime.', 'Bring the library card, or sign up for one at the desk.'] }
    : { ...o, why: `A run around at a playground close by: room to climb, swing and dig, free.${alsoHas(p)}`, tips: ['Bring water and a snack.', 'Give a five-minute warning before it’s time to go.'] };
}

/**
 * The timeline with the second outing in its stretch at home: getting ready, the
 * drive there, the outing's stops, the drive home, and play at home either side
 * where there's room. A few minutes either side go with the block next to them.
 */
export function withSecondOuting(timeline, o, drive = DRIVE_MIN) {
  if (!o) return timeline;
  const index = homeBlockFor(timeline, o, drive);
  if (index < 0) throw new Error(`withSecondOuting: ${o.ref} at ${o.arrive}–${o.leave} doesn't fit any time at home`);
  const gap = { index, start: toMin(timeline[index].start), end: toMin(timeline[index].end) };
  const arrive = toMin(o.arrive), leave = toMin(o.leave);
  const blocks = [];
  const add = (s, e, kind, title, detail) => blocks.push({ start: hhmm(s), end: hhmm(e), kind, title, ...(detail ? { detail } : {}) });
  let ready = arrive - drive - READY_MIN;
  if (ready - gap.start < 10) ready = gap.start;
  else if (homeSince(timeline, index) == null) add(gap.start, ready, 'play', 'Play at home');
  else add(gap.start, ready, 'play', 'Down time at home', 'Books, puzzles or quiet play before heading out again.');
  add(ready, arrive - drive, 'routine', 'Get ready to go', 'Shoes on, the bag and a water bottle.');
  add(arrive - drive, arrive, 'travel', `Drive to ${whereOf(o)}`);
  for (const [s, e, kind, title] of stopBlocks(o)) add(s, e, kind, title);
  const back = walkBackMin(o), car = leave + back, home = car + drive;
  if (back) add(leave, car, 'travel', 'Walk back to the car');
  if (gap.end - home < 10) add(car, gap.end, 'travel', 'Drive home');
  else { add(car, home, 'travel', 'Drive home'); add(home, gap.end, 'play', 'Play at home'); }
  return [...timeline.slice(0, gap.index), ...blocks, ...timeline.slice(gap.index + 1)];
}

/** The second outing for a plan and the day's timeline with it in; the timeline as it was when nothing fits. */
export function withSecond(args) {
  const second = secondOutingFor(args);
  return { second, timeline: second ? withSecondOuting(args.timeline, second) : args.timeline };
}
