// The canonical Event shape.
//
// Every source normalizes into this so that one search tool can rank across all
// of them. The sources disagree wildly about what they publish — wake.gov has a
// real audience taxonomy, Raleigh's feed has only title/start/end/url, WebTrac
// has ages and dollar fees — so each field is explicitly nullable and the
// difference between "known false" and "not published" is preserved.
//
// That distinction matters: `cost.free === false` means a source asserted it
// costs money, while `cost.free === null` means nobody said. Collapsing the two
// would let a free storytime get filtered out of a "free events" search.

/** @typedef {'wake-county'|'raleigh'|'reclink'|'museum'} SourceId */

/**
 * A public library's own program whose source leaves the price blank. The
 * libraries here don't charge for programs, but wake.gov and LibCal publish no
 * price field for them, so a free storytime read "Cost not listed" on the site
 * (Green Road's Storytime Stay and Play, 2026-11-06). Anything the source did
 * price keeps its price.
 */
function atLibrary(fields) {
  const unpriced = fields.cost?.free == null && fields.cost?.amountUsd == null;
  return unpriced && /\blibrary\b/i.test(fields.venue?.name ?? '');
}

export function makeEvent(fields) {
  const e = {
    id: fields.id,
    source: fields.source,
    sourceLabel: fields.sourceLabel ?? null,
    title: (fields.title ?? '').trim(),
    description: fields.description ?? null,

    start: fields.start ?? null, // ISO 8601, with offset where the source gives one
    end: fields.end ?? null,
    allDay: fields.allDay ?? false,
    recurring: fields.recurring ?? false,

    venue: {
      name: fields.venue?.name ?? null,
      address: fields.venue?.address ?? null,
      lat: fields.venue?.lat ?? null,
      lon: fields.venue?.lon ?? null,
    },

    cost: atLibrary(fields) ? { free: true, amountUsd: 0, text: 'Free' } : {
      free: fields.cost?.free ?? null, // true | false | null (= unpublished)
      amountUsd: fields.cost?.amountUsd ?? null,
      text: fields.cost?.text ?? null,
    },

    ages: {
      min: fields.ages?.min ?? null, // years
      max: fields.ages?.max ?? null,
      text: fields.ages?.text ?? null,
    },

    registration: {
      required: fields.registration?.required ?? null,
      url: fields.registration?.url ?? null,
      capacity: fields.registration?.capacity ?? null,
      taken: fields.registration?.taken ?? null,
      openings: fields.registration?.openings ?? null,
    },

    url: fields.url ?? null,
    categories: fields.categories ?? [],
    audiences: fields.audiences ?? [],
    indoor: fields.indoor ?? null, // true | false | null (unknown)
    cancelled: fields.cancelled ?? false,
    raw: fields.raw ?? null,
  };
  return e;
}

// Several sources mark a cancellation by prefixing the title rather than by
// setting any field — observed live on wake.gov
// ("CANCELLED Bookmobile @ Marbles Kids Museum"). Without this, a cancelled
// storytime ranks as a perfectly good Saturday plan.
const CANCELLED_RE = /^\s*(cancell?ed|canceled|postponed)\b[\s:\u2013-]*/i;
// Raleigh's calendar puts it at the end instead ("Rich Park Apartments Outreach - CANCELLED").
const CANCELLED_SUFFIX_RE = /\s*[-\u2013(:]\s*(cancell?ed|postponed)\)?\s*$/i;

export function detectCancelled(title) {
  return CANCELLED_RE.test(title || '') || CANCELLED_SUFFIX_RE.test(title || '');
}

export function stripCancelledPrefix(title) {
  return (title || '').replace(CANCELLED_RE, '').replace(CANCELLED_SUFFIX_RE, '').trim();
}

/**
 * Parse an age range out of free text.
 *
 * Deliberately conservative: it returns null rather than guessing, because a
 * wrong age range is worse than an absent one — it silently removes a suitable
 * event from results, and nothing in the output would show why.
 */
export function parseAges(text) {
  if (!text) return { min: null, max: null, text: null };
  const t = String(text).toLowerCase();

  // "ages 2-5", "2 - 5 years", "18 months - 3 years"
  const monthRange = t.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*months?/);
  if (monthRange) {
    return {
      min: +monthRange[1] / 12,
      max: +monthRange[2] / 12,
      text: String(text).trim(),
    };
  }

  const mixed = t.match(/(\d+)\s*months?\s*(?:-|–|to)\s*(\d+)\s*(?:years?|yrs?)/);
  if (mixed) {
    return { min: +mixed[1] / 12, max: +mixed[2], text: String(text).trim() };
  }

  const yearRange = t.match(/(?:ages?\s*)?(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs?)?/);
  if (yearRange) {
    const min = +yearRange[1];
    const max = +yearRange[2];
    // Guard against matching a date, a time range or a year ("2024-2025").
    if (min <= max && max <= 18) return { min, max, text: String(text).trim() };
  }

  const under = t.match(/under\s*(\d{1,2})/);
  if (under && +under[1] <= 18) return { min: 0, max: +under[1], text: String(text).trim() };

  const plus = t.match(/(\d{1,2})\s*(?:\+|and up|and older)/);
  if (plus && +plus[1] <= 18) return { min: +plus[1], max: null, text: String(text).trim() };

  // Named bands, which these sources use more often than numbers.
  if (/\ball ages\b/.test(t)) return { min: 0, max: null, text: String(text).trim() };
  if (/\b(infant|baby|lapsit|babies)\b/.test(t)) return { min: 0, max: 1.5, text: String(text).trim() };
  if (/\btoddler\b/.test(t)) return { min: 1, max: 3, text: String(text).trim() };
  if (/\b(preschool(?:ers?)?|pre-k)\b/.test(t)) return { min: 3, max: 5, text: String(text).trim() };
  if (/\byoung children\b/.test(t)) return { min: 0, max: 5, text: String(text).trim() };

  return { min: null, max: null, text: String(text).trim() };
}

/**
 * Whether a program's own wording says to sign up: true, false, or null when it
 * doesn't say. "No registration required" is read first, as it contains the rest.
 */
export function parseRegistration(text, categories = []) {
  const t = String(text ?? '');
  if (categories.some((c) => /walk-?up/i.test(c))) return false;
  if (/\bno (pre-?)?registration\b|registration (is )?not (required|needed)|no (tickets?|reservations?) (is |are )?(needed|required)/i.test(t)) return false;
  if (/pre-?registration|registration (is )?required|register (for this|online|in advance|by)\b|advance registration|(tickets?|reservations?) (is |are )?required/i.test(t)) return true;
  return null;
}

/** Parse a dollar amount / "free" out of free text. */
export function parseCost(text) {
  if (!text) return { free: null, amountUsd: null, text: null };
  const t = String(text);
  if (/\bfree\b|\bno charge\b|\bno cost\b/i.test(t)) {
    return { free: true, amountUsd: 0, text: t.trim() };
  }
  const m = t.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (m) {
    const amt = +m[1];
    return { free: amt === 0, amountUsd: amt, text: t.trim() };
  }
  return { free: null, amountUsd: null, text: t.trim() };
}

/**
 * Score how well an event suits a specific child, 0..100, with reasons.
 *
 * The reasons are part of the contract, not decoration: the agent presenting
 * these needs to be able to say *why* something is a good fit, and a bare score
 * is unreviewable. Unknown fields never penalize — they just fail to earn
 * points, so a thinly-documented event stays visible but ranks below a
 * well-matched one.
 */
/**
 * Whether an event is indoors (true), outside (false) or unknown (null), from its
 * title and where it is held. The title wins: Touch-a-Truck is in a library's car
 * park and birdwatching at the science museum's Prairie Ridge is on the trails.
 */
export function inferIndoor({ title = '', where = '' }) {
  if (/\b(outdoors?|outside|touch[- ]a[- ]truck|nature walk|hike|bird ?watching|bird walk|birding|trunk[- ]or[- ]treat|gardening|splash|picnic|playground|storywalk|muddy boots)\b/i.test(title)) return false;
  if (/\b(library|museum|center|centre|ctr|indoor|theatre|theater|gallery)\b/i.test(where)) return true;
  if (/\b(park|greenway|trail|garden|outdoor|farm|amphitheat\w*|lake|pool|field|ecostation|preserve)\b/i.test(where)) return false;
  return null;
}

// Meetings and hearings are for the grown-ups. Covers government business
// ("... Board Meeting", "Public Hearing") and adult info sessions ("Foster
// Parent Information Meeting"), both of which wake.gov tags "All Ages". Raleigh's
// calendar lists its council, committees and commissions the same way ("City
// Council Afternoon Session", "Parks Committee", "Design Review Commission").
const MEETING_RE =
  /\bmeetings?\b|\bpublic hearing\b|\bwork session\b|\binformation(?:al)? session\b|\bboard of (?:commissioners|education|adjustment|directors)\b|\badvisory board\b|\bcouncil\b|\bcommittee\b|\bcommission\b|\b(?:afternoon|evening) session\b/i;

// Grown-up programs that carry no age at all, so they start at the baseline
// like any event: the botanical garden's memorial lecture, the art museum's
// string quartet and tai chi, a housing forum held in Pullen Park (2026-10-27).
const GROWN_UP_RE =
  /\b(lectures?|quartet|symphony|tai chi|yoga|pilates|sound bath|forest bathing|docent|expo|developers|affordable housing|happy hour|wine|beer|pickleball|commuting)\b/i;

/**
 * The category a source gives an event that is a city's own business rather than a program for the public's
 * families: a contractors' workshop, a planning department's engagement night. A source sets it from what it knows
 * of who runs the event (src/sources/raleigh-events.js, from the part of the city's site the event is under).
 */
export const CITY_BUSINESS = 'City business';

export function scoreForChild(event, { ageYears = null, napStart = null, napEnd = null } = {}) {
  let score = 40; // neutral baseline for "an event that exists"
  const reasons = [];

  if (event.cancelled) {
    return { score: 0, reasons: ['cancelled'] };
  }

  // --- age fit ---
  if (ageYears != null) {
    const { min, max } = event.ages;
    if (min != null || max != null) {
      const okLow = min == null || ageYears >= min - 0.25;
      const okHigh = max == null || ageYears <= max + 0.25;
      if (okLow && okHigh) {
        score += 30;
        reasons.push(`age ${ageYears} fits ${formatAgeRange(event.ages)}`);
      } else {
        score -= 35;
        reasons.push(`age ${ageYears} outside ${formatAgeRange(event.ages)}`);
      }
    }
  }

  // Audience/category signals, which are often the only age hint available.
  const hay = [event.title, ...(event.categories || []), ...(event.audiences || [])]
    .join(' ')
    .toLowerCase();
  let forLittleOnes = true;
  if (/\b(toddlers?|lapsit|baby|babies|infant|preschool(?:ers?)?|pre-k|young children)\b/.test(hay)) {
    score += 15;
    reasons.push('explicitly aimed at little kids');
  } else if (/\bstory ?time\b/.test(hay)) {
    score += 12;
    reasons.push('storytime');
  } else if (/\b(family|families|all ages)\b/.test(hay)) {
    score += 8;
    reasons.push('family/all-ages');
  } else {
    forLittleOnes = false;
  }
  // The science museum tags its walks "Adults", "Children" and "Teens" at once:
  // that is everyone, not grown-ups.
  const forKidsToo = /\b(children|kids|famil(?:y|ies)|all ages)\b/.test((event.audiences || []).join(' ').toLowerCase());
  if (/\b(teens?|adults?|seniors?|college|educators?)\b|\b(?:18|21)\+/.test(hay) && !forKidsToo) {
    score -= 25;
    reasons.push('aimed at older audiences');
  } else if (!forLittleOnes && GROWN_UP_RE.test(event.title || '')) {
    // "Toddler Yoga" is for toddlers; "Yoga in the Park" is not.
    score -= 25;
    reasons.push('a program for grown-ups');
  } else if (!forLittleOnes && (event.categories || []).includes(CITY_BUSINESS)) {
    // The planning department's "Family Design Day" is for families; its "Community Engagement Event" is not.
    score -= 25;
    reasons.push('city business, not a kids activity');
  }
  // wake.gov tags board meetings and adult info sessions "All Ages" and free,
  // so without this a fire-department board meeting scored a perfect 100 for
  // a 20-month-old (observed live, 2026-10-12).
  if (MEETING_RE.test(event.title || '')) {
    score -= 50;
    reasons.push('a meeting, not a kids activity');
  }

  // --- cost ---
  if (event.cost.free === true) {
    score += 12;
    reasons.push('free');
  } else if (event.cost.amountUsd != null && event.cost.amountUsd <= 10) {
    score += 8;
    reasons.push(`cheap ($${event.cost.amountUsd})`);
  } else if (event.cost.amountUsd != null && event.cost.amountUsd > 40) {
    score -= 10;
    reasons.push(`pricey ($${event.cost.amountUsd})`);
  }

  // --- nap window ---
  // A perfect event in the middle of a nap is not a usable plan.
  if (napStart && napEnd && event.start) {
    const overlap = overlapsClockWindow(event, napStart, napEnd);
    if (overlap === true) {
      score -= 30;
      reasons.push(`collides with nap (${napStart}-${napEnd})`);
    } else if (overlap === false) {
      score += 6;
      reasons.push('outside nap window');
    }
  }

  // --- registration availability ---
  if (event.registration.openings === 0) {
    score -= 40;
    reasons.push('full');
  } else if (event.registration.openings != null && event.registration.openings > 0) {
    score += 5;
    reasons.push(`${event.registration.openings} spots open`);
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function formatAgeRange({ min, max, text }) {
  if (min == null && max == null) return text || 'any age';
  if (min != null && max == null) return `${trimNum(min)}+`;
  if (min == null) return `under ${trimNum(max)}`;
  return `${trimNum(min)}-${trimNum(max)}`;
}

function trimNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Does the event overlap a local clock window like "12:30".."14:30"?
 * Returns null when it cannot be determined rather than defaulting to false,
 * so the caller can tell "no collision" from "no start time published".
 */
export function overlapsClockWindow(event, napStart, napEnd) {
  if (!event.start) return null;
  const startMin = clockMinutes(event.start);
  if (startMin == null) return null;
  const a = hhmmToMinutes(napStart);
  const b = hhmmToMinutes(napEnd);
  if (a == null || b == null) return null;

  let endMin = event.end ? clockMinutes(event.end) : null;
  // No end time published: assume an hour, the modal storytime/class length.
  if (endMin == null || endMin < startMin) endMin = startMin + 60;

  return startMin < b && endMin > a;
}

function clockMinutes(iso) {
  // Read the wall-clock time as written in the source's own offset. Converting
  // to the host timezone would shift every event on a machine set elsewhere.
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

function hhmmToMinutes(s) {
  const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}
