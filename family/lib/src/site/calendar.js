// An outing as a calendar entry: a file any phone's calendar opens (.ics), and a link that fills in Google
// Calendar's own form. Both carry what the outing's card says: where, when to arrive and leave, and the plan's page.
// Pure functions; scripts/build-site.js writes the files render.js asked for (calendarFiles).

import { SITE } from './settings.js';
import { utcOffsetMin } from './sky.js';
import { stopsOf } from '../plans/rules.js';
import { whereOf } from './wake.js';

const pad = (n) => String(n).padStart(2, '0');

/** A Raleigh date and clock time as the moment it is, in UTC: 20261111T142000Z. */
export function utcStamp(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, m) - utcOffsetMin(date) * 60000);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
}

/** What a calendar entry says for an outing on a day. `page` is the plan's address on this site. */
export function entryOf(o, date, page) {
  const stops = stopsOf(o);
  const first = stops[0];
  const events = stops.filter((s) => s.kind === 'event');
  const title = events.length ? `${events[0].title} at ${whereOf(o)}` : whereOf(o);
  const notes = [
    events.some((s) => s.registration) ? 'Sign up first.' : '',
    ...stops.map((s) => s.url).filter(Boolean),
    `The whole day: https://${SITE.domain}${page}`,
    'Times and details can change. Check the event or place before you go.',
  ].filter(Boolean);
  return { title, start: utcStamp(date, o.arrive), end: utcStamp(date, o.leave), where: first.address ?? whereOf(o), notes, date, arrive: o.arrive, leave: o.leave };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Where an outing's calendar file lives. One file per place and time on a day, however many plans share it. */
export const calendarPath = (e) => `/cal/${e.date}/${slug(e.title)}-${e.arrive.replace(':', '')}-${e.leave.replace(':', '')}.ics`;

// RFC 5545: commas, semicolons and backslashes are escaped, a line break is \n, and a line is at most 75 bytes,
// longer ones carried over onto lines that start with a space.
const text = (s) => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75 - (out.length ? 1 : 0);
    while (Buffer.byteLength(rest.slice(0, n)) > 75 - (out.length ? 1 : 0)) n--;
    out.push((out.length ? ' ' : '') + rest.slice(0, n));
    rest = rest.slice(n);
  }
  out.push((out.length ? ' ' : '') + rest);
  return out.join('\r\n');
}

/** The entry as an .ics file. `stamp` is when it was made (a UTC stamp), the build's own time. */
export function icsOf(e, stamp) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${SITE.name}//${SITE.domain}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${calendarPath(e).slice(5, -4).replace(/\//g, '-')}@${SITE.domain}`, `DTSTAMP:${stamp}`,
    `DTSTART:${e.start}`, `DTEND:${e.end}`, `SUMMARY:${text(e.title)}`, `LOCATION:${text(e.where)}`, `DESCRIPTION:${text(e.notes.join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Google Calendar's own "new event" form, filled in. */
export function googleCalendarLink(e) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${e.start}/${e.end}`, location: e.where, details: e.notes.join('\n') });
  return `https://calendar.google.com/calendar/render?${q}`;
}
