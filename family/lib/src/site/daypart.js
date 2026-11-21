// The parts of a day page that depend on the day's outings: the day strip, the outing cards, the map of the day's
// stops and the day's steps. The build renders them (render.js), and a visitor whose home is known gets them drawn
// again in their own browser around an outing nearer home (src/family/www/dayhome.js). Both use these functions, so
// the two agree. It runs in the browser, so its imports stay free of anything Node.

import { SIGNUP, AREA_NAMES } from './settings.js';
import { whereOf, hasOutside, tempsWhile, backupReason, stopBlocks } from './wake.js';
import { withSecond } from './second-outing.js';
import { sunTimes, skyStops } from './sky.js';
import { clock, plainCopy, stopsOf } from '../plans/rules.js';
import { playIdeas } from './ideas.js';
import { esc, mapLink, isoClock } from './page.js';
import { miniMap, dayRoute, dayRoad } from './map.js';
import { typeIcon, iconOf, NAP_BEAR } from './typeicon.js';
import { entryOf, calendarPath, googleCalendarLink } from './calendar.js';
import { placePath } from './places.js';
import { forApp, toSavedOuting } from '../family/plan.js';
import { worstFactor } from '../family/traffic.js';

/** Text Claude wrote, as the site words it and safe in a page. */
export const say = (s) => esc(plainCopy(s));

export const toM = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

const STRIP_KINDS = { nap: 'Nap', quiet: 'Quiet', outing: null, travel: '' };

// Every strip runs on the same clock, so a later wake-up visibly moves the day right.
// It covers the earliest wake-up (6 am) to the latest bedtime (11 pm, up at 10 with an 8 pm bed moved 3 hours).
const AXIS = [360, 1380];
export const hhmmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A play block that is plainly outside: at a park or in the yard, not "at home or a park". */
export const playsOutside = (b) => /\b(park|playground|outside|outdoors?|backyard|yard|walk)\b/i.test(b.title ?? '') && !/\b(home|indoors?|inside)\b/i.test(b.title ?? '');

/**
 * For each outing and drive block of a timeline, where it is and whether it is
 * indoors. An outing block is the stop its title names (a storytime, then the
 * park after it); one that names none is the outing as a whole. A drive takes
 * the colour of the outing block it leads to or comes home from.
 */
function outingBlocks(blocks, outing, second = null) {
  const stops = [outing, second].filter(Boolean).flatMap(stopsOf);
  // The stop named first in the title ("Hillside Park and Circle & Square at the
  // library" is the park), the longer name where two start together ("NC Museum of
  // Art Museum Park" is the park, not the event at the "NC Museum of Art").
  const named = (b) => {
    const t = (b.title ?? '').toLowerCase();
    let best = null, at = Infinity, len = 0;
    for (const s of stops) {
      for (const n of [s.title, s.venue]) {
        const i = n ? t.indexOf(n.toLowerCase()) : -1;
        if (i >= 0 && (i < at || (i === at && n.length > len))) { best = s; at = i; len = n.length; }
      }
    }
    return best;
  };
  const out = blocks.map((b) => {
    if (b.kind !== 'outing') return null;
    const s = named(b);
    if (s) return { where: s.kind === 'event' ? s.venue : s.title, inside: s.indoor === true, icon: iconOf(s) };
    // Another outing in the timeline, or one titled in passing.
    return { where: b.title, icon: iconOf({ title: b.title }), inside: outing ? !outing.outdoor && !/\b(park|playground|trail|garden|outside)\b/i.test(b.title) : false };
  });
  return blocks.map((b, i) => {
    if (b.kind !== 'travel') return out[i];
    const near = out[i + 1] ?? out[i - 1];
    return { inside: near ? near.inside : false };
  });
}

// Transitions closer than this share a temperature label: the first, most important one keeps it.
const SAME_MOMENT_MIN = 25;
// Labels nearer than this (share of the strip) would overlap, so the later one goes up a row.
const LABEL_GAP_PCT = 7; // about a label's width on a phone

// The tallest rain bar, at a 100% chance, as a share of the strip's height: the whole of it, so a bar's height reads
// as its chance. The bars are see-through (style.css) so the blocks' labels show through them.
const RAIN_MAX_PCT = 100;
// The rain label nearer than this (share of the strip) to sunrise or sunset's would overlap it, so it goes under them.
const SUN_LABEL_GAP_PCT = 17;
// The temperature line keeps to this band of the strip's height (from its top), clear of the blocks' labels in the middle.
const LINE_TOP_PCT = 7, LINE_BOTTOM_PCT = 36;

/**
 * The hourly forecast on the day strip itself, so it takes no room of its own:
 * the temperature as a line across the strip's top, with its reading at each
 * moment the day changes (`transitions`, minutes, most important first) marked
 * on it and named over the strip, and the chance of rain as bars rising from
 * its bottom edge, the wettest hour's chance named under it. null when the
 * hourly forecast doesn't reach the day.
 */
function forecastOnStrip(hours, sun, transitions, { from, to, pct, at }) {
  const pts = (hours ?? []).map((h) => ({ m: toM(h.t), tempF: h.tempF, pop: h.pop ?? 0 })).filter((h) => h.m + 60 > from && h.m < to && h.tempF != null);
  if (pts.length < 3) return null;
  const lo = Math.min(...pts.map((p) => p.tempF)), hi = Math.max(...pts.map((p) => p.tempF));
  // Each hour's reading is its middle; between two, a straight run; before the first or after the last, the nearest.
  const tempAt = (m) => {
    const c = pts.map((p) => ({ m: p.m + 30, t: p.tempF }));
    if (m <= c[0].m) return c[0].t;
    const i = c.findIndex((p) => p.m >= m);
    if (i < 0) return c.at(-1).t;
    const a = c[i - 1], b = c[i];
    return a.t + ((b.t - a.t) * (m - a.m)) / (b.m - a.m);
  };
  const x = (m) => pct(Math.min(Math.max(m, from), to));
  const bars = pts.filter((p) => p.pop > 0).map((p) =>
    `<i class="rain" style="left:${x(p.m)}%;width:${+(x(p.m + 60) - x(p.m)).toFixed(2)}%;height:${+((p.pop / 100) * RAIN_MAX_PCT).toFixed(1)}%"></i>`).join('');
  // The temperature as a line across the strip's top, edge to edge, over the sky and the blocks but above their labels.
  const y = (t) => +(hi === lo ? (LINE_TOP_PCT + LINE_BOTTOM_PCT) / 2 : LINE_TOP_PCT + ((hi - t) / (hi - lo)) * (LINE_BOTTOM_PCT - LINE_TOP_PCT)).toFixed(2);
  const along = [from, ...pts.map((p) => p.m + 30).filter((m) => m > from && m < to), to];
  const line = `<svg class="tline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${along.map((m) => `${x(m)},${y(tempAt(m))}`).join(' ')}"/></svg>`;
  // The temperature at every transition, one per moment, over its time; one too near the label before it goes up a row.
  const kept = [];
  for (const m of transitions) if (m >= from && m <= to && kept.every((k) => Math.abs(k - m) >= SAME_MOMENT_MIN)) kept.push(m);
  kept.sort((a, b) => a - b);
  const last = [-Infinity, -Infinity]; // where each row's last label is
  const dots = kept.map((m) => `<i class="tdot" style="left:${pct(m)}%;top:${y(tempAt(m))}%"></i>`).join('');
  const labels = kept.map((m) => {
    const px = pct(m);
    const row = px - last[0] >= LABEL_GAP_PCT ? 0 : px - last[1] >= LABEL_GAP_PCT ? 1 : 0;
    last[row] = px;
    // Kept inside the strip at either end.
    const [shift, stem] = px < 3 ? ['0', '0'] : px > 97 ? ['-100%', '100%'] : ['-50%', '50%'];
    return `<span class="temp${row ? ' up' : ''}" style="left:${px}%;--x:${shift};--stem:${stem}">${Math.round(tempAt(m))}°</span>`;
  });
  const wettest = pts.reduce((a, b) => (b.pop > a.pop ? b : a));
  const said = [`Hourly forecast: from ${lo}° to ${hi}°F`, wettest.pop >= 20 ? `rain chance up to ${wettest.pop}% around ${clock(hhmmOf(wettest.m))}` : 'little chance of rain',
    ...kept.map((m) => `${Math.round(tempAt(m))}° at ${clock(hhmmOf(m))}`)];
  const two = labels.some((l) => l.includes('temp up'));
  const wet = pct(wettest.m + 30), low = [sun.rise, sun.set].some((m) => Math.abs(pct(Math.min(Math.max(m, from), to)) - wet) < SUN_LABEL_GAP_PCT);
  return {
    temps: `<div class="temps${two ? ' two' : ''}" role="img" aria-label="${esc(said.join(', '))}">${labels.join('')}</div>`,
    onStrip: bars + line + dots,
    pop: wettest.pop >= 20 ? `<span class="pop${low ? ' low' : ''}" style="${at(wettest.m + 30)}">${wettest.pop}% rain</span>` : '',
    low: wettest.pop >= 20 && low,
  };
}

/**
 * The whole day as one bar on a 6 am to 11 pm clock, coloured like the sky on
 * that date (sunrise and sunset move through the year): asleep before waking and
 * after bed, and the nap, quiet time, the outing and its drives in between. The
 * hourly forecast, when there is one, is on it (temperatures over it, rain along
 * its bottom); under it the clock, and sunrise and sunset.
 */
export function dayStrip(blocks, { outing, second = null, date, weather } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error(`dayStrip needs the day's date for its sky, got ${date}`);
  const wake = toM(blocks[0].start), bed = toM(blocks.at(-1).end);
  const [from, to] = [Math.min(AXIS[0], wake), Math.max(AXIS[1], bed)];
  const pct = (m) => +(((m - from) / (to - from)) * 100).toFixed(2);
  const sun = sunTimes(date);
  const sky = skyStops(sun).map(([t, c]) => `${c} ${pct(t)}%`).join(', ');
  // `data-k` names each block (nap1, outing1, …) so site.js can slide the nap from
  // its old time to its new one when the nap or wake-up changes.
  const seen = {};
  const seg = (kind, s, e, text, k) => `<span class="seg s-${esc(kind)}" data-k="${k}" style="left:${pct(s)}%;width:${(pct(e) - pct(s)).toFixed(2)}%">${text}</span>`;
  const stops = outingBlocks(blocks, outing, second);
  const segs = blocks.map((b, i) => {
    const playOut = b.kind === 'play' && playsOutside(b);
    if (!(b.kind in STRIP_KINDS) && !playOut) return '';
    seen[b.kind] = (seen[b.kind] ?? 0) + 1;
    if (playOut) return seg('play', toM(b.start), toM(b.end), '', `play${seen.play}`);
    const label = b.kind === 'outing' ? stops[i].where : STRIP_KINDS[b.kind];
    // The outing's name where it fits, or just "Out" (CSS picks by the block's width).
    // Each block leads with its picture: the outing's own icon, the sleepy bear at nap time, a book for quiet time.
    const pic = b.kind === 'outing' ? `<span class="pic">${stops[i].icon}</span>` : b.kind === 'nap' ? NAP_BEAR : b.kind === 'quiet' ? '<span class="pic">📖</span>' : '';
    const inner = pic + (b.kind === 'outing' ? `<span class="long">${esc(label)}</span><span class="short">Out</span>` : `<span class="w">${esc(label)}</span>`);
    // Indoors (and the drives to and from it) is coloured apart from outside.
    const kind = stops[i]?.inside ? `${b.kind} in` : b.kind;
    return seg(kind, toM(b.start), toM(b.end), label ? `<span class="lbl">${inner}</span>` : '', `${b.kind}${seen[b.kind]}`);
  }).join('');
  const night = seg('asleep s-am', from, wake, '', 'am') + seg('asleep s-pm', bed, to, '', 'pm');
  const said = blocks.filter((b) => b.kind === 'outing' || b.kind === 'nap' || b.kind === 'quiet')
    .map((b) => `${b.kind === 'outing' ? `out at ${b.title}` : b.kind === 'nap' ? 'nap' : 'quiet time'} ${clock(b.start)} to ${clock(b.end)}`);
  // Up and asleep are marked where they fall; the hours between only where they don't crowd them.
  const hours = [];
  for (let h = 540; h < to; h += 180) if (h - wake >= 100 && bed - h >= 100) hours.push(h);
  // Centred under its time, or kept inside the strip at either end.
  const at = (m) => { const p = pct(m); return `left:${p}%${p < 5 ? ';transform:none' : p > 95 ? ';transform:translateX(-100%)' : ''}`; };
  const mark = (m, cls, k) => `<span class="${cls}" data-k="${k}" style="${at(m)}">${clock(hhmmOf(m))}</span>`;
  const sunMark = (m, cls, word) => `<span class="${cls}" style="${at(Math.min(Math.max(m, from), to))}">${word} ${clock(hhmmOf(m))}</span>`;
  const sunLines = [sun.rise, sun.set].filter((m) => m > from && m < to).map((m) => `<i class="sunline" style="left:${pct(m)}%"></i>`).join('');
  // The moments the day changes, most important first: up and asleep, sunrise and sunset, then
  // the edges of the nap, quiet time and the time out of the house (its drives included), in order.
  const shown = blocks.filter((b) => b.kind in STRIP_KINDS || (b.kind === 'play' && playsOutside(b)));
  const transitions = [wake, bed, sun.rise, sun.set, ...shown.flatMap((b) => [toM(b.start), toM(b.end)])];
  const wx = forecastOnStrip(weather?.hours, sun, transitions, { from, to, pct, at }) ?? { temps: '', onStrip: '', pop: '', low: false };
  // For site.js: the card shown at a moment under the pointer, and the "Now" line on today's strip. Minutes past
  // midnight: [start, end, kind, title, detail] per block, [minute, °F, % rain] per hour, and sunrise and sunset.
  const data = {
    date, from, to, sun: [sun.rise, sun.set],
    blocks: blocks.map((b) => [toM(b.start), toM(b.end), b.kind, plainCopy(b.title ?? ''), b.detail ? plainCopy(b.detail) : '']),
    hours: (weather?.hours ?? []).map((h) => [toM(h.t), h.tempF, h.pop ?? 0]),
  };
  return `<div class="daystrip">${wx.temps}<div class="strip" data-day="${esc(JSON.stringify(data))}" style="background:linear-gradient(90deg, ${sky})" role="img" aria-label="${esc(['Up at ' + clock(blocks[0].start), ...said, 'asleep by ' + clock(blocks.at(-1).end), `sunrise ${clock(hhmmOf(sun.rise))}, sunset ${clock(hhmmOf(sun.set))}`].join(', '))}">${night}${segs}${wx.onStrip}${sunLines}</div>
<div class="ticks" aria-hidden="true">${hours.map((h) => `<span style="left:${pct(h)}%">${clock(hhmmOf(h))}</span>`).join('')}${mark(wake, 'first', 'wake')}${mark(bed, 'last', 'bed')}</div>
<div class="suns${wx.low ? ' two' : ''}" aria-hidden="true">${sunMark(sun.rise, 'rise', 'Sunrise')}${sunMark(sun.set, 'set', 'Sunset')}${wx.pop}</div></div>`;
}

/** What an outing costs, as far as its sources say. null for a place no one has priced. */
export function costOf(stops) {
  const events = stops.filter((s) => s.kind === 'event');
  if (!events.length) return stops.map((s) => s.cost).find(Boolean) ?? null;
  if (events.every((s) => /^free$/i.test(s.cost ?? ''))) return 'Free';
  // Two programs at one museum each say "Included with museum admission": that is one cost, said once.
  return [...new Set(events.map((s) => s.cost).filter(Boolean))].join(' · ') || 'Cost not listed';
}

/** Whether to sign up: needed (with its link), not needed, or the event doesn't say. Nothing for a place. */
export function signUp(stops) {
  const events = stops.filter((s) => s.kind === 'event');
  if (!events.length) return '';
  const needed = events.find((s) => s.registration);
  if (needed) {
    const link = typeof needed.registration === 'string' ? needed.registration : needed.url;
    return link ? `<a class="warn" href="${esc(link)}" data-goal="event-signup">Sign-up needed</a>` : '<span class="warn">Sign-up needed</span>';
  }
  return events.every((s) => s.registration === false) ? 'No sign-up needed' : 'Sign-up not listed';
}

/**
 * An outing at a glance, for under a plan's headline: where it is and which side of the Triangle, then when, what
 * it costs and whether to sign up first. A headline alone ("Run and climb at a big destination playground") names
 * no place. site.js copies this from a day page onto the home card when the wake-up is changed.
 */
export function outingFacts(o) {
  const stops = stopsOf(o);
  const cost = costOf(stops);
  const place = [whereOf(o), AREA_NAMES[o.area]].filter(Boolean).map(esc).join(' · ');
  const needsSignUp = stops.some((s) => s.kind === 'event' && s.registration);
  const rest = [`${clock(o.arrive)}–${clock(o.leave)}`, cost ? esc(cost) : '', needsSignUp ? 'Sign up first' : '', o.outdoor ? 'Outdoors' : ''].filter(Boolean).join(' · ');
  return `<b>${place}</b><span>${rest}</span>`;
}

export const noPlace = () => null;

export const tipList = (o) => (o.tips?.length ? `<ul class="tips">${o.tips.map((t) => `<li>${say(t)}</li>`).join('')}</ul>` : '');

/**
 * The calendar files this build's outing cards link to, by path (src/site/calendar.js): scripts/build-site.js writes
 * them once the pages are rendered. One outing heads many plans, and is one file.
 */
export const calendarFiles = new Map();

/** "Add to calendar" for an outing on a day ahead: the file any phone's calendar opens, and Google Calendar's form. */
function calendarLinks(o, date, page, rain = null) {
  const entry = entryOf(o, date, page);
  const file = calendarPath(entry);
  calendarFiles.set(file, entry);
  // The outing as Tot Routines keeps it (src/family/plan.js forApp), for the button that sends it: site/site.js seals
  // it in the browser and leaves it with the sync server for the app to collect.
  const forRoutines = forApp(toSavedOuting({ date, title: `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })}: ${entry.title}`, outing: o, rain }));
  // One button; its box (site/site.js opens it) says which calendar each choice is for.
  return `<p class="cal"><button type="button" class="calbtn" data-cal-open data-goal="add-calendar-open">Add to calendar</button> <button type="button" class="calbtn" data-routines="${esc(JSON.stringify(forRoutines))}" data-goal="send-to-routines">Send to Tot Routines</button></p>
<dialog class="caldlg" aria-label="Add to calendar">
<h3>Add to calendar</h3>
<p class="calwhat">${esc(entry.title)}</p>
<a class="calopt" href="${esc(googleCalendarLink(entry))}" target="_blank" rel="noopener" data-goal="add-google-calendar"><strong>Google Calendar</strong><span>Opens Google Calendar with the event filled in, ready to save.</span></a>
<a class="calopt" href="${esc(file)}" download data-goal="add-calendar"><strong>Apple, Outlook or another calendar</strong><span>Downloads a calendar file. Open it on an iPhone, Mac or Outlook and tap Add.</span></a>
<button type="button" class="calclose" data-cal-close>Cancel</button>
</dialog>`;
}

/** A way to say an outing was wrong: closed, moved, the wrong time. An email, already addressed and titled. */
function reportLink(where, date) {
  const q = new URLSearchParams({ subject: `Something wrong: ${where}, ${date}`, body: 'What was different from the plan?\n\n' });
  return `<p class="report">Closed, moved or not as we said? <a href="mailto:${esc(SIGNUP.contact)}?${esc(q.toString().replace(/\+/g, '%20'))}" data-goal="report-outing">Tell us</a> and we’ll fix it.</p>`;
}

/**
 * What to wear for an outing with time outside on a cold or hot day, from the day's hourly forecast for the time
 * there. '' on a mild day, and on one too far ahead for an hourly forecast. The plans' own words never mention the
 * weather (it changes after they're written); this is worked out again at every build.
 */
export function dressLine(o, weather) {
  if (!hasOutside(o)) return '';
  const temps = tempsWhile(o, weather);
  if (!temps) return '';
  const { low, high } = temps;
  const about = low === high ? `${low}°F` : `${low}–${high}°F`;
  if (low < 40) return `Cold while you’re there: about ${about}. Warm coats, hats and mittens.`;
  if (low < 50) return `Chilly while you’re there: about ${about}. Coats and hats.`;
  if (high >= 88) return `Hot while you’re there: about ${about}. Sun hats, water and shade.`;
  return '';
}

/** The label over an outing's indoor backup: what it is there for (backupReason). */
export const backupLabel = (main, weather) => (backupReason(main, weather) === 'cold' ? 'If it’s too cold out' : 'If it rains');

/** `cal`: { date, page } on a day still ahead, for its calendar links; nothing on a day that has passed. `weather`: the day's, for dressLine. */
export function outingCard(o, { label, find = noPlace, cal = null, weather = null, rain = null, card = null }) {
  const dress = dressLine(o, weather);
  const stops = stopsOf(o);
  const first = stops[0];
  const where = first.kind === 'event' ? first.venue : first.title;
  const cost = costOf(stops);
  const register = signUp(stops);
  const ours = placePath(find(first));
  const stop = (s, i) => {
    const name = s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title);
    if (s.kind !== 'event') {
      // A park the outing starts at, before its events, or finishes at, after them.
      return `<li><span class="when">${i ? 'Then' : 'First'}</span> ${typeIcon(s)}${name}${s.address ? ` <span class="muted">· <a href="${mapLink(s.address)}">map</a></span>` : ''}${s.indoor !== true ? ' <span class="muted">· if it’s dry</span>' : ''}</li>`;
    }
    return `<li><span class="when">${s.start ? `${clock(isoClock(s.start))}${s.end ? `–${clock(isoClock(s.end))}` : ''}` : ''}</span> ${typeIcon(s)}${name}${s.venue !== where ? ` <span class="muted">at ${esc(s.venue)}</span>` : ''}</li>`;
  };
  const events = stops.length > 1 || first.kind === 'event' ? `<ul class="stops">${stops.map(stop).join('')}</ul>` : '';
  return `<article class="outing${o.outdoor ? '' : ' in'}"${card ? ` data-card="${esc(card)}"` : ''}>
<p class="label">${esc(label)}</p>
<h3>${typeIcon(first)}${esc(where)}</h3>
${first.address ? `<p class="addr"><a href="${mapLink(first.address)}">${esc(first.address)}</a> · ${esc(AREA_NAMES[o.area] ?? '')}</p>` : ''}
${miniMap(find(first), `${where}, ${AREA_NAMES[o.area] ?? 'the Triangle'}`, iconOf(first))}
<p class="times"><strong>Arrive ${clock(o.arrive)}</strong>, leave by ${clock(o.leave)}${cost ? ` · ${esc(cost)}` : ''}${register ? ` · ${register}` : ''}${o.outdoor ? ' · Outdoors' : ''}</p>
${dress ? `<p class="dress">${esc(dress)}</p>` : ''}
${events}
${cal ? calendarLinks(o, cal.date, cal.page, rain) : ''}
<p class="why">${say(o.why)}</p>
${tipList(o)}
${ours ? `<p><a href="${esc(ours)}">What’s at ${esc(where)}, and what else is on there</a></p>` : first.kind !== 'event' && first.url ? `<p><a href="${esc(first.url)}">About ${esc(first.title)}</a></p>` : ''}
${cal ? reportLink(where, cal.date) : ''}
<p class="tags">${o.interests.map((i) => `<span>${esc(i)}</span>`).join('')}</p>
</article>`;
}

/** A play block's ideas (see ideas.js), the outside ones marked. */
const ideaList = (ideas) => (ideas?.length ? `<ul class="ideas">${ideas.map((x) => `<li${x.outside ? ' class="out"' : ''}><b>${esc(x.title)}${x.outside ? ' <span class="where">outside</span>' : ''}</b> ${esc(x.how)}</li>`).join('')}</ul>` : '');

/**
 * Every stop of the day on one map, in order (the outing and the second one, each with its own stops). Between two
 * outings the family goes home (the day's steps say so: lunch, a nap, down time), which this page can't draw without
 * their address, so no line joins those two. The stops of one outing are joined: that drive doesn't go by home.
 * A family with a home saved gets it drawn in their own browser, with the drives from it and back (map.js's dayRoute).
 */
export function dayRouteMap(blocks, { outing, second = null, find = noPlace, date = null, family = false }) {
  const outs = [outing, second].filter(Boolean).sort((a, b) => toM(a.arrive) - toM(b.arrive));
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
  const stops = outs.flatMap((o, i) => stopsOf(o).flatMap((s, j) => {
    const p = find(s);
    if (!p) return [];
    const apart = j === 0 && i > 0;
    // When the drive to this stop starts: partway through the outing, between its own stops.
    const at = j === 0 ? null : hm((toM(o.arrive) + toM(o.leave)) / 2);
    return [{ lat: p.lat, lon: p.lon, title: s.title, icon: iconOf(s), apart, at, arrive: o.arrive, leave: o.leave }];
  }));
  return dayRoute(stops, { date, family });
}

export function timeline(blocks, { outing, second = null, date, weather, band, seed }) {
  const at = outingBlocks(blocks, outing, second);
  const ideas = playIdeas(blocks, { date, band, weather, outing, second, seed });
  // data-date and each step's minutes let site.js mark where today is now.
  return `<ol class="timeline" data-date="${esc(date)}">${blocks.map((b, i) => `<li class="k-${esc(b.kind)}${b.kind === 'outing' && at[i].inside ? ' in' : ''}${b.kind === 'play' && playsOutside(b) ? ' out' : ''}" data-m="${toM(b.start)}-${toM(b.end)}"><span class="when">${clock(b.start)}</span><div><strong>${say(b.title)}</strong>${b.detail ? `<p>${say(b.detail)}</p>` : ''}${ideaList(ideas[i])}</div></li>`).join('')}</ol>`;
}

/** The second outing's card: before the main one or after it. */
export const secondCard = (second, main, { find, cal, weather, nearHome = false }) => (second ? outingCard(second, { label: `${main && second.arrive < main.arrive ? 'Earlier' : 'Later on'}${nearHome ? ', near home' : ''}`, find, cal, weather, card: 'second' }) : '');

/** A drive in the day's steps is rounded up to this, as the steps' times are. */
const STEP_MIN = 5;

/**
 * The day's steps with each drive between two stops of one outing at the time the road takes (the build's own
 * roads, map.js's dayRoad, in typical traffic at that hour), in place of the allowance the plan was made with. Only
 * those: a drive from home or back to it needs the family's address. `outings` are the day's, `find` the lookup
 * from a stop to its point. Steps that aren't an outing's own stops, in order from its arrival to its leaving, are
 * left as they are.
 */
export function withRoadTimes(blocks, outings, { find = noPlace, date = null } = {}) {
  let out = blocks;
  for (const o of outings.filter(Boolean)) {
    if (stopsOf(o).length < 2) continue;
    const mid = hhmmOf(Math.round((toM(o.arrive) + toM(o.leave)) / 2));
    const leg = (a, b) => {
      const p = find(a), q = find(b), road = p && q ? dayRoad(p, q) : null;
      return road ? Math.max(STEP_MIN, Math.ceil((road.minutes * worstFactor(date, [mid])) / STEP_MIN) * STEP_MIN) : null;
    };
    const fresh = stopBlocks(o, leg);
    if (fresh.length < 2) continue;
    const own = (b) => b.kind === 'outing' || b.kind === 'travel';
    const i = out.findIndex((b) => own(b) && b.start === o.arrive);
    let j = i;
    while (j >= 0 && j < out.length && own(out[j]) && out[j].end !== o.leave) j++;
    if (i < 0 || j >= out.length || !own(out[j])) continue;
    const detail = out.slice(i, j + 1).find((b) => b.kind === 'outing')?.detail;
    const made = fresh.map(([a, b, kind, title]) => ({ start: hhmmOf(a), end: hhmmOf(b), kind, title }));
    if (detail) made.find((b) => b.kind === 'outing').detail = detail;
    out = [...out.slice(0, i), ...made, ...out.slice(j + 1)];
  }
  return out;
}

/**
 * A plan's day as its page shows it: the second outing that fits (second-outing.js) and the day's steps with it in,
 * the drives between stops at their road times. `sky` is the page's { date, weather, places, find }; `home` the
 * family's home when their own browser draws the day (the second outing is then one near it), and driveOf(outing)
 * the drive from it in minutes, for the steps.
 */
export function dayWith({ plans, plan, main = plan.main, day, timeline, sky, home = null, driveOf = null }) {
  const { second, timeline: blocks } = withSecond({ plans, plan, main, day, date: sky.date, weather: sky.weather, places: sky.places, timeline, home, find: sky.find, driveOf });
  return { second, blocks: withRoadTimes(blocks, [main, second], sky) };
}
