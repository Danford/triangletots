// Measures published plans against rules.js. The validator only sees new plans;
// this sees everything on the site, so a rule added today shows up on days
// planned last week. Code only, no Claude call.

import { AGE_BANDS } from './config.js';
import { parseAges } from '../lib/event.js';
import { closureOf } from './closures.js';
import { outingTimeProblems, daylightProblems, dayProblems, outingCopyProblems, copyProblems, stopsOf, placeKey } from './rules.js';
import { sunTimes } from '../site/sky.js';
import { WAKE_SHIFTS, wakePlan, whereOf, nearPlan } from '../site/wake.js';

/** Rules a plan may not break at paid launch: a family would be turned away, or the plan can't be followed. */
export const HARD_RULES = new Set(['too-young', 'too-old', 'closed', 'no-address', 'no-location', 'drop-in-with-sign-up', 'hidden-outing', 'no-lunch', 'no-dinner', 'after-dark', 'overlap']);

/** Stops whose published ages rule this band out. The validator holds new plans to this too. */
export function ageProblems(o, band) {
  const out = [];
  for (const s of stopsOf(o)) {
    const { min, max } = parseAges(s.ages);
    if (min != null && band.ageYears < min - 0.5) out.push({ rule: 'too-young', message: `${s.title} is for ${s.ages}` });
    if (max != null && band.ageYears > max + 0.5) out.push({ rule: 'too-old', message: `${s.title} is for ${s.ages}` });
  }
  return out;
}

export function stopProblems(o, date) {
  return stopsOf(o).flatMap((s) => {
    const shut = closureOf(s, date);
    return [
      ...(shut ? [{ rule: 'closed', message: `${s.title}: ${shut.reason}` }] : []),
      ...(s.address ? [] : [{ rule: 'no-address', message: `${s.title} has no address` }]),
      ...(s.lat != null ? [] : [{ rule: 'no-location', message: `${s.title} has no coordinates` }]),
    ];
  });
}

/**
 * What the site makes of a plan for a child up earlier or later (src/site/wake.js),
 * where it falls short: the day goes across town from the plan's part of it, or
 * has no outing at all. Soft: the page says why, but it is a weaker day.
 */
export function shiftProblems({ plans, plan, nap, date, weather, places }) {
  const out = [];
  for (const d of WAKE_SHIFTS.filter((x) => x !== 0)) {
    const w = wakePlan({ plans, plan, nap, d, date, weather, places });
    const up = `up ${d > 0 ? '+' : ''}${d} min`;
    if (!w.main) out.push({ rule: 'shift-at-home', message: `${up}: nothing fits, a day at home` });
    else if (!nearPlan(w.main, plan)) out.push({ rule: 'shift-across-town', message: `${up}: ${whereOf(w.main)} (${w.main.area}) for a plan in ${plan.main.area}` });
  }
  return out;
}

/**
 * Everything wrong with one day file's latest version. `places` are the site's
 * places (src/site/places.json) the pages are built with, for the wake-up days.
 * @returns {{ rule, hard, date, band, nap, slot, message }[]}
 */
export function auditFile(file, { places = [] } = {}) {
  const band = AGE_BANDS.find((b) => b.id === file.band);
  if (!band) throw new Error(`no age band ${file.band}`);
  const sunset = sunTimes(file.date).set;
  const out = [];
  for (const plan of file.versions.at(-1).plans) {
    const nap = band.naps.find((n) => n.id === plan.nap);
    if (!nap) throw new Error(`${file.date}/${file.band}: no nap pattern ${plan.nap}`);
    const add = (slot, found) => {
      for (const f of found) out.push({ rule: f.rule, hard: HARD_RULES.has(f.rule), date: file.date, band: file.band, nap: plan.nap, slot, message: f.message });
    };
    const outing = (o) => [
      ...ageProblems(o, band), ...stopProblems(o, file.date), ...outingTimeProblems(o, nap, band.id),
      ...daylightProblems(o, sunset), ...outingCopyProblems(o),
    ];
    add('main', outing(plan.main));
    add('main', copyProblems(plan.headline, stopsOf(plan.main)));
    add('day', dayProblems(plan.timeline, plan.main, nap));
    plan.alternatives.forEach((o, i) => add(`alternative ${i + 1}`, outing(o)));
    if (plan.rainBackup) add('rain backup', outing(plan.rainBackup));
    const latest = file.versions.at(-1);
    add('wake-up', shiftProblems({ plans: latest.plans, plan, nap, date: file.date, weather: file.checked?.weather ?? latest.weather, places }));
  }
  return out;
}

/** The same place leading a nap pattern's day again within this many days is a repeat. */
export const REPEAT_WITHIN_DAYS = 3;

/**
 * The days whose main outing goes back to a place the same age and nap pattern's main went to a few days before: what
 * a family following one plan day after day would notice. Soft: the day works, the week is just thinner. Takes every
 * day file at once, as no one file shows it.
 */
export function auditRepeats(files) {
  const days = (iso) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
  const out = [];
  const seen = new Map(); // band/nap/place -> the last date it led
  for (const file of [...files].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const plan of file.versions.at(-1).plans) {
      for (const key of new Set(stopsOf(plan.main).map(placeKey))) {
        const id = `${file.band}/${plan.nap}/${key}`;
        const last = seen.get(id);
        if (last && days(file.date) - days(last) <= REPEAT_WITHIN_DAYS) {
          out.push({ rule: 'repeat', hard: false, date: file.date, band: file.band, nap: plan.nap, slot: 'main', message: `${key} was this plan's main outing on ${last} too` });
        }
        seen.set(id, file.date);
      }
    }
  }
  return out;
}

/** Findings counted by rule, the hard ones first, for the build log and data/status.json. */
export function summarize(findings) {
  const counts = {};
  for (const f of findings) {
    counts[f.rule] ??= { hard: f.hard, main: 0, other: 0 };
    counts[f.rule][f.slot === 'alternative' || f.slot.startsWith('alternative') || f.slot === 'rain backup' ? 'other' : 'main']++;
  }
  const rules = Object.entries(counts).sort(([a, x], [b, y]) => y.hard - x.hard || y.main - x.main || a.localeCompare(b));
  return {
    hard: findings.filter((f) => f.hard).length,
    soft: findings.filter((f) => !f.hard).length,
    rules: Object.fromEntries(rules),
  };
}
