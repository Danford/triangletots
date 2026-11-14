// The rules of a good day, in one place. The validator holds Claude's plans to
// them, the wake-up picker (src/site/wake.js) picks by them, the prompt states
// them and the audit (audit.js) measures what's published against them.
// No imports: this file has to be able to run in a browser.

export const NAP_BUFFER_MIN = 15; // home and settled before sleep
// Up, shoes on and the drive after waking: nobody leaves the minute a nap ends. Not longer, or a baby whose
// morning nap ends at 10:30 could never make an 11 o'clock storytime.
export const AFTER_NAP_MIN = 30;
export const EARLY_ARRIVAL_MIN = 10;
export const BETWEEN_VENUES_MIN = 20; // to pack up and drive to the next event of an outing
export const NEARBY_MIN = 10; // from an event to a park near it
export const PLACE_STAY_MIN = 20; // worth the stop
export const RAIN_BACKUP_PCT = 30; // chance of rain worth an indoor backup
export const MORNING_MIN = 60; // up, breakfast and dressed before arriving anywhere
export const EVENING_MIN = 110; // drive home, dinner, bath and bed after leaving
export const DRIVE_MIN = 20; // a drive there or home, when a timeline is built in code
export const MIN_DRIVE_MIN = 20; // the home isn't known, so a plan allows for a real drive
export const MAX_DRIVE_MIN = 30;
export const LEAVE_BEFORE_SLEEP_MIN = MAX_DRIVE_MIN + 10; // the drive, then a few minutes to settle
export const LUNCH_MIN = 20;
export const LUNCH_BY_MIN = 6 * 60; // after waking: 1 pm for a 7 am riser

/** The longest stay at an outing, by age band: a young toddler is done well before a 4-year-old. */
export const MAX_STAY_MIN = { t1: 120, t2: 150, t3: 180, t4: 210 };

export const toMin = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) throw new Error(`time must be HH:MM, got ${JSON.stringify(hhmm)}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Every stop of a published outing, in the order they're visited. */
export const stopsOf = (o) => [o.source, ...(o.also ?? []).map((a) => a.source)];

/** "09:20" → "9:20 am", "14:00" → "2 pm". */
export function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

// A time of day in a sentence, unless it already says am or pm. Not a digit or a
// colon either side: "10:30:00", "1:2:3".
const BARE_CLOCK = /(?<![\d:])(\d{1,2}):([0-5]\d)(?![\d:])(?!\s*[ap]\.?m\b)/gi;

/**
 * Plans written before these rules, and any slip after: "at 14:20" as "at 2:20 pm".
 * Nobody is out between 1 and 5 in the morning, so an unpadded "2:30" is afternoon.
 */
export function plainTimes(text) {
  return text.replace(BARE_CLOCK, (all, h, m) => {
    const hour = Number(h);
    if (hour > 23) return all;
    const padded = h.length === 2;
    const afternoon = !padded && hour >= 1 && hour <= 5 ? hour + 12 : hour;
    return clock(`${String(afternoon).padStart(2, '0')}:${m}`);
  });
}

// The child in a plan's copy is written with placeholders, never "she" or "he":
// the public plans are for every child of an age, and a family's plan knows a
// child's sex only if the parent said. Filled in where the copy is shown.
//
//   {they} {them} {their} {theirs} {themself}   (and {They}, {Their}... to start a sentence)
//   a verb after {they} carries its ending:      like{s}, go{es}, carr{ies}
//   and the irregular ones are whole:            {is} {was} {has} {does}   ({is}n't, {does}n't)
//
// No contractions on {they} ("{they}'re"): "{they} {is}" reads right either way.
// Nobody else in the copy is "he" or "she" either: an artist shows "the artist's" paintings.
const PRONOUN_FORMS = {
  they: { girl: 'she', boy: 'he', none: 'they' },
  them: { girl: 'her', boy: 'him', none: 'them' },
  their: { girl: 'her', boy: 'his', none: 'their' },
  theirs: { girl: 'hers', boy: 'his', none: 'theirs' },
  themself: { girl: 'herself', boy: 'himself', none: 'themself' },
  s: { one: 's', none: '' },
  es: { one: 'es', none: '' },
  ies: { one: 'ies', none: 'y' },
  is: { one: 'is', none: 'are' },
  was: { one: 'was', none: 'were' },
  has: { one: 'has', none: 'have' },
  does: { one: 'does', none: 'do' },
};
export const SEXES = ['girl', 'boy'];

/**
 * The copy with its placeholders filled in for a child of `sex` ('girl', 'boy',
 * or null when it isn't known: "they"). Throws on a placeholder it doesn't know,
 * as the page would otherwise show the braces.
 */
export function withPronouns(text, sex = null) {
  if (sex != null && !SEXES.includes(sex)) throw new Error(`withPronouns: sex must be 'girl', 'boy' or null, got ${JSON.stringify(sex)}`);
  return String(text ?? '').replace(/\{(\w+)\}/g, (whole, name) => {
    const forms = PRONOUN_FORMS[name.toLowerCase()];
    if (!forms) throw new Error(`withPronouns: unknown placeholder ${whole} in "${text}"`);
    const word = sex ? forms[sex] ?? forms.one : forms.none;
    return name[0] === name[0].toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
}

// "English title / Título en español": the second half of a long two-language title.
const SECOND_LANGUAGE = /\s+\/\s+(?=.*[áéíóúñ¡¿]).*$/i;
const FALLS_LAKE = /^Falls Lake State Recreation Area - (.+?)(?: Rec Area)? Entrance$/;

/**
 * A stop's name as the page shows it. A museum's two-language title ("Art Kits: Sponge, Stamp, Soar / Kit de arte …")
 * keeps its first language where the whole is too long for a headline, and a map layer's name for one way into a big
 * park ("Falls Lake State Recreation Area - Sandling Beach Rec Area Entrance") is said as people say it.
 */
export function shortTitle(title) {
  const t = String(title ?? '');
  const lake = FALLS_LAKE.exec(t);
  if (lake) return `${lake[1]}, Falls Lake`;
  return t.length > 60 ? t.replace(SECOND_LANGUAGE, '') : t;
}

/**
 * Where a stop is, as the names it goes by, lower case: an event's venue or a place's own name, split where it names
 * a spot inside a bigger place ("Hideaway Woods, Museum of Life and Science", "Gipson Play Plaza at Dix Park").
 * The last is the place a family would say they went to.
 */
export function spotNames(s) {
  const name = s.kind === 'event' ? s.venue ?? s.title : s.title;
  if (!name) throw new Error(`spotNames: a stop needs a venue or a title, got ${JSON.stringify(s)}`);
  return String(name).toLowerCase().split(/,\s+|\s+at\s+/).map((x) => x.trim()).filter(Boolean);
}

/** The place a stop is at, for telling one day's outing from another's: "museum of life and science". */
export const placeKey = (s) => spotNames(s).at(-1);

export const WALK_MILES = 0.25; // two stops this close are a walk with a toddler, not a drive

/** Straight-line miles between two stops, or null when either has no coordinates. */
export function milesApart(a, b) {
  if ([a.lat, a.lon, b.lat, b.lon].some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * How two stops of one outing stand to each other: 'same' (one spot, or one inside the other: nothing to travel),
 * 'walk' (two spots of one big place, or next door to each other, like a library and the park beside it) or 'drive'.
 */
export function between(a, b) {
  const x = spotNames(a), y = spotNames(b);
  if (x.join('|') === y.join('|') || (x.length === 1 && y.includes(x[0])) || (y.length === 1 && x.includes(y[0]))) return 'same';
  if (x.at(-1) === y.at(-1)) return 'walk';
  const miles = milesApart(a, b);
  return miles != null && miles <= WALK_MILES ? 'walk' : 'drive';
}

/** The rules about pronouns: how the copy is worded, not whether the outing is right for a child. */
export const PRONOUN_RULES = new Set(['pronoun-placeholder', 'gendered-pronoun', 'pronoun-verb']);

const GENDERED = /\b(she|he|her|hers|herself|him|his|himself)\b/i;
// After {they}, past any of these, the verb; "likes", "is", "has" (an s on the end, not "pass") is the one-child form written out.
const BARE_VERB = /\{they\}\s+(?:(?:also|still|just|often|really|usually|only|never|always|first|then|soon|may|might|can|will|could|should|would|must)\s+)*([a-z']+)/gi;

/** Problems with how a line of copy refers to the child: a gendered pronoun, a verb that only fits "she", a made-up placeholder. */
export function pronounProblems(text) {
  const out = [];
  for (const [, name] of String(text).matchAll(/\{(\w+)\}/g)) {
    if (!PRONOUN_FORMS[name.toLowerCase()]) out.push({ rule: 'pronoun-placeholder', message: `has a placeholder that isn't one, {${name}}: "${text}"` });
  }
  const g = GENDERED.exec(text)?.[0];
  if (g) out.push({ rule: 'gendered-pronoun', message: `says "${g}"; the child is {they}, {them} or {their}, anyone else by name or role: "${text}"` });
  for (const [, verb] of String(text).matchAll(BARE_VERB)) {
    if (/(?<!s)s$/i.test(verb)) out.push({ rule: 'pronoun-verb', message: `"{they} ${verb}" needs its ending as a placeholder (like{s}, {is}, {has}): "${text}"` });
  }
  return out;
}

/** How the site words any text Claude wrote: the child's pronouns, 12-hour times, no em dashes, whole-year ages, American English. */
export function plainCopy(text, sex = null) {
  return plainTimes(withPronouns(text, sex))
    .replace(/\s*—\s*/g, ', ')
    .replace(/(?<![\d.])(\d)\.5[- ]year[- ]olds?\b/gi, (m, y) => `${y}-year-old${/s$/i.test(m) ? 's' : ''}`)
    .replace(/\bpram-friendly\b/gi, 'stroller-friendly')
    .replace(/\bprams?\b/gi, 'stroller');
}

/** Problems with an outing's times for this age and nap pattern, whichever kind of outing it is. */
export function outingTimeProblems(o, nap, bandId) {
  const out = [];
  const arrive = toMin(o.arrive), leave = toMin(o.leave);
  const stay = leave - arrive, most = MAX_STAY_MIN[bandId];
  if (most == null) throw new Error(`no longest stay for band ${bandId}`);
  if (stay > most) out.push({ rule: 'long-stay', message: `stays ${stay} minutes; ${most} is the most for this age` });
  if (arrive < toMin(nap.wake) + MORNING_MIN) out.push({ rule: 'early-start', message: `arrives ${o.arrive}; leave at least ${MORNING_MIN} minutes after waking for breakfast and getting dressed` });
  if (leave > toMin(nap.bed) - EVENING_MIN) out.push({ rule: 'late-home', message: `leaves ${o.leave}; leave at least ${EVENING_MIN} minutes before bedtime for the drive, dinner and bath` });
  const next = (nap.sleep ?? []).map(([a]) => toMin(a)).filter((a) => a >= arrive).sort((a, b) => a - b)[0];
  if (next != null && leave > next - LEAVE_BEFORE_SLEEP_MIN) out.push({ rule: 'tight-nap', message: `leaves ${o.leave}; leave at least ${LEAVE_BEFORE_SLEEP_MIN} minutes before sleep for the drive home and settling` });
  return out;
}

/** Outdoors has to be over by dark. `sunset` in minutes after midnight. */
export function daylightProblems(o, sunset) {
  if (!o.outdoor || toMin(o.leave) <= sunset) return [];
  return [{ rule: 'after-dark', message: `leaves ${o.leave}, after sunset, and it is outdoors` }];
}

/**
 * Problems with a whole day's timeline around its main outing. `drive`: the allowed
 * minutes for a drive there or home. A family's home is known, so its short drive is
 * fine; the longest stays the same.
 */
export function dayProblems(timeline, main, nap, { minDrive = MIN_DRIVE_MIN, maxDrive = MAX_DRIVE_MIN } = {}) {
  const out = [];
  const eats = (re) => timeline.filter((b) => re.test(`${b.title ?? ''} ${b.detail ?? ''}`));
  const lunches = eats(/\blunch\b/i);
  const atTable = lunches.filter((b) => b.kind === 'meal');
  // Packed for the outing it's a line in that block; at home it's a meal of its own.
  const packed = lunches.some((b) => b.kind !== 'meal');
  const lunchBy = toMin(nap.wake) + LUNCH_BY_MIN;
  if (!atTable.length && !packed) out.push({ rule: 'no-lunch', message: 'no lunch in the timeline; add a meal block, or pack it in the outing block\'s detail' });
  else if (!packed && atTable.every((b) => toMin(b.end) - toMin(b.start) < LUNCH_MIN)) out.push({ rule: 'short-lunch', message: `lunch is under ${LUNCH_MIN} minutes` });
  else if (!packed && atTable.every((b) => toMin(b.start) > lunchBy)) out.push({ rule: 'late-lunch', message: `lunch starts after ${clock(`${String(Math.floor(lunchBy / 60)).padStart(2, '0')}:${String(lunchBy % 60).padStart(2, '0')}`)}` });
  if (!eats(/\b(dinner|supper)\b/i).length) out.push({ rule: 'no-dinner', message: 'no dinner in the timeline' });
  // Nobody is in two places at once: quiet time until 1:45 and a drive from 1:30.
  for (let i = 1; i < timeline.length; i++) {
    const before = timeline[i - 1], b = timeline[i];
    if (toMin(b.start) < toMin(before.end)) out.push({ rule: 'overlap', message: `"${b.title}" starts ${b.start}, before "${before.title}" ends ${before.end}` });
  }
  if (main) {
    const arrive = toMin(main.arrive), leave = toMin(main.leave);
    for (const b of timeline) {
      if (b.kind === 'outing' && (toMin(b.start) < arrive || toMin(b.end) > leave)) {
        out.push({ rule: 'hidden-outing', message: `"${b.title}" at ${b.start} is outside the outing's ${main.arrive}–${main.leave}; every outing block belongs to the main outing` });
      }
    }
    const firstOuting = timeline.findIndex((b) => b.kind === 'outing');
    const lastOuting = timeline.findLastIndex((b) => b.kind === 'outing');
    // The drive home comes after any walk back to the car (wake.js walkBackMin).
    const after = timeline[lastOuting + 1]?.title === 'Walk back to the car' ? lastOuting + 2 : lastOuting + 1;
    const there = timeline[firstOuting - 1], home = timeline[after];
    for (const b of [there, home]) {
      if (b?.kind !== 'travel') continue;
      const mins = toMin(b.end) - toMin(b.start);
      // A shorter drive home is cut by sleep in a code-built day; here it is a plan's own number.
      if (mins < minDrive || mins > maxDrive) out.push({ rule: 'drive-time', message: `"${b.title}" is ${mins} minutes; allow ${minDrive}–${maxDrive}` });
    }
  }
  return out;
}

const WEATHER_WORDS = /\b(rain(y|ing|fall|coats?|s)?|forecast|showers?|storm(y|s)?|thunderstorms?|drizzle|overcast|sunny|cloudy|windy|chilly|weather|mild (day|morning|afternoon)|dry (day|morning|afternoon)|if it(’|')?s dry)\b/i;
const FACILITY_WORDS = /\b(paved|stroller[- ](friendly|accessible)|prams?|pram-friendly|shad(e|y|ed)|parking)\b/i;
const SIGN_UP_WORDS = /\b(registration (is )?(required|needed)|register (ahead|in advance|before|online|first)|must register|sign[- ]?up (is )?(required|needed|ahead|in advance)|reserve (a spot|ahead|your spot))\b/i;
const DROP_IN_WORDS = /\bdrop[- ]in\b/i;

const known = (s) => JSON.stringify([s.amenities ?? [], s.note ?? '']).toLowerCase();

/**
 * Problems with what one line of copy says, given the stops it's about. Weather
 * changes after a plan is written and the page shows the forecast itself, so copy
 * never mentions it; facts have to be in the data.
 */
export function copyProblems(text, stops) {
  const out = [];
  const needs = stops.some((s) => s.registration);
  const statedNone = stops.every((s) => s.kind !== 'event' || s.registration === false);
  if (WEATHER_WORDS.test(text)) out.push({ rule: 'weather-in-copy', message: `mentions the weather: "${text}"` });
  if (needs && DROP_IN_WORDS.test(text)) out.push({ rule: 'drop-in-with-sign-up', message: `says drop-in, but sign-up is needed: "${text}"` });
  if (!needs && statedNone && stops.some((s) => s.kind === 'event') && SIGN_UP_WORDS.test(text)) out.push({ rule: 'false-sign-up', message: `says to sign up, but the event says no sign-up is needed: "${text}"` });
  const claim = FACILITY_WORDS.exec(text)?.[0]?.toLowerCase();
  if (claim && !stops.some((s) => known(s).includes(claim.slice(0, 5)))) out.push({ rule: 'unbacked-claim', message: `says "${claim}", which isn't in the data: "${text}"` });
  out.push(...pronounProblems(text));
  return out;
}

/** The headline, `why` and tips of an outing, checked. Returns findings with `tip: index` on a tip's. */
export function outingCopyProblems(o) {
  const stops = stopsOf(o);
  return [
    ...copyProblems(o.why ?? '', stops),
    ...(o.tips ?? []).flatMap((t, tip) => copyProblems(t, stops).map((p) => ({ ...p, tip }))),
  ];
}
