// Places and venues known to be closed, kept by hand. A place on no calendar
// can't announce a closure, so one nobody writes down here stays on the site.
// `until` is the last day it's closed: past that the entry does nothing and can go.

export const CLOSURES = [
  {
    match: /\bSandling Beach\b/i,
    from: '2026-10-02',
    until: '2027-03-31',
    reason: 'closed for the season',
    // "Day-use area: swim beach and picnic shelters #1-7: April 1, 2026 – October 1, 2026." Read 2026-11-11.
    source: 'https://www.ncparks.gov/state-parks/falls-lake-state-recreation-area',
  },
  {
    match: /\bHolly Point\b/i,
    until: '2026-11-15',
    reason: 'closed for construction',
    // Says the campground reopens by November 16, 2026, and says nothing separate for day use.
    source: 'https://www.ncparks.gov/state-parks/falls-lake-state-recreation-area/news/campground-closures',
  },
];

/** The closure covering a stop (a place or event's published facts) on a date, or null. */
export function closureOf(stop, date) {
  const names = [stop.title, stop.venue, stop.name].filter(Boolean).join(' ');
  return CLOSURES.find((c) => c.match.test(names) && (!c.from || date >= c.from) && date <= c.until) ?? null;
}
