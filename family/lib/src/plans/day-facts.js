// Facts about a day that the planner, the wake-up picker and the family planner all read:
// a place's hours and whether the weather spoils going out. Like rules.js, this has to be
// able to run in a browser, so its only import is the plain settings in config.js.

import { THRESHOLDS } from './config.js';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A place's hours that day as published, or undefined if it isn't open that day.
 * null when the place publishes no hours at all (most parks: dawn to dusk).
 */
export function placeHoursOn(place, date) {
  if (place.hoursOn) return place.hoursOn(date);
  if (!place.hours) return null;
  const h = place.hours[WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]];
  if (!h || /closed/i.test(h)) return undefined;
  return h;
}

/**
 * "10 a.m.–6 p.m." or "9 a.m. - 9 p.m." -> { opens: '10:00', closes: '18:00' }.
 * Anything else (two ranges, school year and summer) -> null: shown to Claude as
 * written, but not checked.
 */
export function parseHoursRange(text) {
  const t = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?`;
  const m = new RegExp(String.raw`^\s*${t}\s*[–-]\s*${t}\s*$`, 'i').exec(String(text ?? ''));
  if (!m) return null;
  const at = (h, mm, ap) => `${String((Number(h) % 12) + (ap.toLowerCase() === 'p' ? 12 : 0)).padStart(2, '0')}:${mm ?? '00'}`;
  return { opens: at(m[1], m[2], m[3]), closes: at(m[4], m[5], m[6]) };
}

/** Weather conditions that spoil an outdoor outing, as short reasons. */
export function badWeather(w) {
  if (!w) return [];
  const out = [];
  if ((w.precipProbability ?? 0) >= THRESHOLDS.rainPct) out.push(`${w.precipProbability}% chance of rain`);
  if (w.tempF != null && w.tempF >= THRESHOLDS.hotF) out.push(`${w.tempF}°F`);
  if (w.tempF != null && w.tempF <= THRESHOLDS.coldF) out.push(`${w.tempF}°F`);
  const sf = String(w.shortForecast ?? '').toLowerCase();
  if (/thunder|storm/.test(sf)) out.push('thunderstorms');
  if (/snow|ice|sleet|freezing/.test(sf)) out.push('snow or ice');
  return out;
}
