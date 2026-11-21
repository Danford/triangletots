// Typical traffic for the Triangle, by time of day. The road router (OSRM, drives.js) drives at the posted speed
// limits, so its minutes are what the trip takes with empty roads. A family drives at 8:15 on a school morning, not
// at 3 am, so a drive is slowed by how busy the roads usually are at that hour.
//
// These are rule-of-thumb figures for Raleigh–Durham–Chapel Hill (the I-40, I-540 and US-1 rush hours), not a
// measurement and not live: they don't know about today's crash or rain. The pages say "typical traffic" for that
// reason. Nothing here asks anyone anything, so a family's start never leaves their phone. It imports nothing, so it
// runs in the browser, the tests and the build alike.

/** [from, to) minutes after midnight, and how much longer a drive takes than on an empty road. Weekdays. */
const WEEKDAY = [
  [0, 6 * 60, 1.0],
  [6 * 60, 7 * 60, 1.15],
  [7 * 60, 9 * 60, 1.4],
  [9 * 60, 10 * 60, 1.2],
  [10 * 60, 15 * 60, 1.1],
  [15 * 60, 16 * 60, 1.25],
  [16 * 60, 18 * 60, 1.45],
  [18 * 60, 19 * 60, 1.2],
  [19 * 60, 24 * 60, 1.05],
];

/** Saturdays and Sundays: busy only around the shops and the midday. */
const WEEKEND = [
  [0, 9 * 60, 1.0],
  [9 * 60, 11 * 60, 1.05],
  [11 * 60, 17 * 60, 1.12],
  [17 * 60, 24 * 60, 1.03],
];

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

/** Whether "YYYY-MM-DD" falls on a Saturday or Sunday. A date that isn't one is treated as a weekday. */
export function isWeekend(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && [0, 6].includes(d.getUTCDay());
}

/**
 * How many times longer than an empty road a drive that starts at `at` (minutes after midnight, or "HH:MM") takes on
 * `date`. 1 for no date or no time: a drive nobody has placed in the day is not adjusted.
 */
export function trafficFactor(date, at) {
  if (!date || at == null) return 1;
  const m = typeof at === 'string' ? toMin(at) : at;
  if (!Number.isFinite(m)) return 1;
  const table = isWeekend(date) ? WEEKEND : WEEKDAY;
  return (table.find(([from, to]) => m >= from && m < to) ?? table.at(-1))[2];
}

/** The slowest of the drive's start times: a trip is planned for its worst hour, so it is never short. */
export function worstFactor(date, times = []) {
  return Math.max(1, ...times.map((t) => trafficFactor(date, t)));
}

/** A drive's minutes in typical traffic at those start times, not yet rounded. */
export const inTraffic = (minutes, date, times) => minutes * worstFactor(date, times);

/** The words for how busy the roads usually are at that factor, or '' when they are clear. */
export function trafficWord(factor) {
  if (factor >= 1.35) return 'rush hour';
  if (factor >= 1.15) return 'busy';
  return '';
}
