// A page for every park, library and place to play in src/site/places.json, at /places/<name>/, and the list of
// them at /places/. Day pages expire; these stay, so a parent (or a search engine) asking "does this park have a
// restroom" or "what's on at my library" has somewhere to land that leads on to the plans.
//
// Nothing here is written by Claude. Every fact is the snapshot's (each town's own pages and map data), an event's
// own listing, or a plan already published. A fact the snapshot lacks is left out, never guessed.

import { clock } from '../plans/rules.js';
import { AREA_NAMES, SITE } from './settings.js';
import { esc, layout, signupForm, jsonLd, longDate, onDay, mapLink, isoClock } from './page.js';
import { miniMap } from './map.js';
import { typeIcon, iconOf } from './typeicon.js';

const KIND = { park: 'Park', library: 'Library', museum: 'Museum', farm: 'Farm', garden: 'Garden' };
const KINDS = { park: 'Parks and playgrounds', library: 'Libraries', museum: 'Museums', farm: 'Farms', garden: 'Gardens and nature' };
const LD_TYPE = { park: 'Park', library: 'Library', museum: 'Museum' };
/** What a town's pages list at a place, in a parent's words, the ones a toddler's day turns on first. */
const AMENITY = {
  playground: 'Playground', restroom: 'Restrooms', splashpad: 'Splash pad', 'picnic-shelter': 'Picnic shelter', greenway: 'Greenway trail',
  nature: 'Nature area', animals: 'Animals', train: 'Train ride', carousel: 'Carousel', amusements: 'Rides', farm: 'Farm', garden: 'Garden',
  pool: 'Pool', boating: 'Boating', fields: 'Ball fields', courts: 'Courts', 'community-center': 'Community center', 'dog-park': 'Dog park',
};
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const EVENTS_SHOWN = 10;
const NEARBY = 5;

const slugOf = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Each place's address on this site. Two places with one name (the county's East Regional Library and Durham's)
 * get their town added, and a third way apart their street number, so no page overwrites another.
 */
export function placePaths(places) {
  const taken = new Set(), paths = new Map();
  for (const p of places) {
    const tries = [slugOf(p.name), slugOf(`${p.name} ${p.town ?? ''}`), slugOf(`${p.name} ${p.town ?? ''} ${/^\d+/.exec(p.address ?? '')?.[0] ?? ''}`)];
    const slug = tries.find((s) => s && !taken.has(s));
    if (!slug) throw new Error(`no address on the site left for the place "${p.name}" in ${p.town}: ${tries.join(', ')} are all taken`);
    taken.add(slug);
    paths.set(p, `/places/${slug}/`);
  }
  return paths;
}

// The paths of this build's place pages, set by the build once it has the places (as the footer's guides are), so an
// outing's card or a guide's list can link to a place's page. Until set, nothing links: a page that wasn't made
// is never linked to.
let paths = new Map();
export function setPlacePaths(map) {
  paths = map;
}
/** A place's page, or null for one this build made none for. `p` is a place of the snapshot itself. */
export const placePath = (p) => (p ? paths.get(p) ?? null : null);

const km = (a, b) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
const miles = (a, b) => km(a, b) / 1.609;
const dateOf = (iso) => String(iso ?? '').slice(0, 10);
const shortDay = (date) => onDay(date, { weekday: 'short', month: 'short', day: 'numeric' });

/** What a place has, in a line: "Playground · Restrooms · Picnic shelter". */
export const amenityWords = (p) => Object.keys(AMENITY).filter((a) => (p.amenities ?? []).includes(a)).map((a) => AMENITY[a]);

/** The first few, for a line about a place close by, less the one its kind says already ("Garden. Garden."). */
const nearWords = (p) => amenityWords(p).filter((w) => w !== KIND[p.kind]).slice(0, 3);

const kindLine = (p) => [KIND[p.kind] ?? 'Place', p.town, AREA_NAMES[p.area]].filter(Boolean).filter((x, i, all) => all.indexOf(x) === i).join(' · ');

/**
 * Every place's page. `data` is the search page's (src/site/ahead.js searchData): every event from today on with its
 * plan if one has it, and each place's next plan. `find` is the plans' own lookup from a venue to a place.
 */
export function placePages({ places, find, data, today, readOn }) {
  const paths = placePaths(places);
  // Each event belongs to the place its address or venue finds; one the snapshot doesn't have belongs to none.
  const eventsAt = new Map();
  for (const e of data.events) {
    if (dateOf(e.e ?? e.s) < today) continue;
    const p = find({ address: e.a, venue: e.v });
    if (p) eventsAt.set(p, [...(eventsAt.get(p) ?? []), e]);
  }
  const planOf = new Map(data.places.filter((s) => s.p).map((s) => [`${s.n}|${s.a}`, s]));
  return places.map((p) => {
    const path = paths.get(p);
    const has = amenityWords(p);
    const events = (eventsAt.get(p) ?? []).filter((e) => isoClock(e.s) && isoClock(e.s) !== '00:00');
    const plan = planOf.get(`${p.name}|${p.address ?? null}`);
    const near = places.filter((o) => o !== p && o.lat != null && p.lat != null && (o.kind !== 'park' || o.amenities.includes('playground')))
      .map((o) => ({ o, d: miles(p, o) })).sort((a, b) => a.d - b.d).slice(0, NEARBY);
    const eventItem = (e) => `<li><p class="it-name">${typeIcon({ kind: 'event', title: e.t, venue: p.name })}${e.p ? `<a href="${esc(e.p)}">${esc(e.t)}</a>` : e.u ? `<a href="${esc(e.u)}">${esc(e.t)}</a>` : esc(e.t)}</p><p class="it-facts"><b>${esc(shortDay(dateOf(e.s)))}, ${esc(clock(isoClock(e.s)))}${isoClock(e.e) ? ` to ${esc(clock(isoClock(e.e)))}` : ''}</b>. ${esc(e.f ? 'Free' : e.c ?? 'Cost not listed')}. ${e.reg ? 'Sign-up needed' : 'No sign-up listed'}.${e.p ? ' In one of our day plans.' : ''}</p></li>`;
    const hours = p.hours ? `<section class="gsec"><h2>Hours</h2><table class="hours">${DAYS.filter(([d]) => p.hours[d]).map(([d, name]) => `<tr><th scope="row">${name}</th><td>${esc(p.hours[d])}</td></tr>`).join('')}</table><p class="it-facts">As its own page had them on ${esc(longDate(readOn))}. Holidays differ, so check before a special trip.</p></section>` : '';
    const what = p.kind === 'library' ? 'library' : p.kind === 'park' ? 'park' : 'place';
    const lede = [
      `${p.name} is a ${what === 'place' ? (KIND[p.kind] ?? 'place').toLowerCase() : what} in ${p.town}${AREA_NAMES[p.area] && !AREA_NAMES[p.area].includes(p.town) ? `, on the ${AREA_NAMES[p.area]} side of the Triangle` : ''}.`,
      events.length ? `${events.length} ${events.length === 1 ? 'event' : 'events'} for little ones ${events.length === 1 ? 'is' : 'are'} coming up here.` : '',
    ].filter(Boolean).join(' ');
    const body = `<main class="guide place">
<div class="pagehead"><div class="wrap narrow">
<p class="crumb"><a href="/places/">Places</a></p>
<h1>${esc(p.name)}</h1>
<p class="lede">${esc(lede)}</p>
<p class="dated">${typeIcon(p)}${esc(kindLine(p))}</p>
</div></div>
<div class="wrap narrow">
${keepButton(path)}
${p.address ? `<p class="addr"><a href="${esc(mapLink(p.address))}">${esc(p.address)}</a></p>` : ''}
${p.lat != null ? miniMap(p, `${p.name}, ${p.town}`, iconOf(p)) : ''}
${p.note ? `<p class="why">${esc(p.note)}</p>` : ''}
${plan ? `<p class="planned"><a class="btn" href="${esc(plan.p)}">${plan.pd === today ? 'It’s in today’s plan' : `It’s in the plan for ${esc(shortDay(plan.pd))}`} →</a></p>` : ''}
${has.length ? `<section class="gsec"><h2>What’s here</h2><ul class="has">${has.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><p class="it-facts">As ${esc(p.town)}’s own pages and map data list it. A place can have more than its town lists.</p></section>` : ''}
${hours}
${events.length ? `<section class="gsec"><h2>Coming up here</h2><ul class="items">${events.slice(0, EVENTS_SHOWN).map(eventItem).join('')}</ul>${events.length > EVENTS_SHOWN ? `<p><a href="/search/?q=${encodeURIComponent(p.name)}&kind=events">All ${events.length} events here</a></p>` : ''}</section>` : ''}
${p.url ? `<p><a href="${esc(p.url)}" data-goal="place-page">${esc(p.name)}’s own page</a></p>` : ''}
${near.length ? `<section class="gsec"><h2>Close by</h2><ul class="items">${near.map(({ o, d }) => `<li><p class="it-name">${typeIcon(o)}<a href="${esc(paths.get(o))}">${esc(o.name)}</a></p><p class="it-facts">${esc(KIND[o.kind] ?? 'Place')}, about ${d < 1.5 ? 'a mile or less' : `${Math.round(d)} miles`} away${nearWords(o).length ? `. ${esc(nearWords(o).join(', '))}` : ''}.</p></li>`).join('')}</ul></section>` : ''}
<section class="gsec"><h2>Plan a day around it</h2><p><a href="/">Today’s plans</a> pick one real outing for your child’s age and fit the whole day around the nap. <a href="/days/">The days ahead</a> has the next two weeks.</p></section>
<p class="sources">Places read ${esc(longDate(readOn))} from each town’s own pages and map data. Check a place’s own page before you go, as things change.</p>
${signupForm('sunday')}
</div>
</main>`;
    const ld = jsonLd({
      '@context': 'https://schema.org', '@type': LD_TYPE[p.kind] ?? 'TouristAttraction', name: p.name,
      ...(p.address ? { address: p.address } : {}),
      ...(p.lat != null ? { geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lon } } : {}),
      ...(p.url ? { sameAs: p.url } : {}),
      // Only where a source says so: a library, or a place whose note starts "Free".
      ...(/^Free\b/.test(p.note ?? '') || p.kind === 'library' ? { isAccessibleForFree: true } : {}),
    });
    const facts = [has.slice(0, 4).join(', '), events.length ? `${events.length} toddler ${events.length === 1 ? 'event' : 'events'} coming up` : ''].filter(Boolean).join('. ');
    const first = events[0];
    return {
      path, place: p,
      // For "Your places" (site.js): what a family who kept this place sees without opening its page.
      next: {
        n: p.name, t: p.town, c: events.length,
        ...(first ? { x: `${first.t}, ${shortDay(dateOf(first.s))}, ${clock(isoClock(first.s))}`, ...(first.p ?? first.u ? { u: first.p ?? first.u } : {}) } : {}),
        ...(plan ? { p: plan.p, pd: plan.pd === today ? 'today' : shortDay(plan.pd) } : {}),
      },
      html: layout({
        title: `${p.name}, ${p.town}: with a toddler | ${SITE.name}`,
        description: `${p.name} in ${p.town}, NC, for parents of toddlers: the address and a map${facts ? `. ${facts}` : ''}.`,
        body, path, head: ld,
      }),
    };
  });
}

/** The button on a place's page that keeps it in this browser's "Your places". Hidden until site.js is there to work it. */
const keepButton = (path) => `<p class="keepbar" data-keepbar hidden><button type="button" class="keep" data-keep="${esc(path)}" data-goal="keep-place" aria-pressed="false">Keep in your places</button> <span class="it-facts" data-kept-note hidden>Kept on this phone. It’s on the <a href="/">home page</a> and under <a href="/places/">Places</a>, with what’s next there.</span></p>`;

/**
 * Where a family's kept places show: the home page and /places/. Empty and hidden in the page; site.js fills it from
 * /places/next.json for a browser that has kept some. Nothing about which places leaves the browser.
 */
export const yourPlaces = () => `<section class="yours" data-yours hidden><h2>Your places</h2><ul class="items two"></ul><p class="it-facts">Kept on this phone only. <a href="/places/">Find more places to keep</a></p></section>`;

/** /places/next.json: each place's page with its name, what's next there and the plan it's in. */
export const placesNext = (pages) => Object.fromEntries(pages.map((x) => [x.path, x.next]));

/** /places/: every place by side of the Triangle, then by kind. `pages` is placePages()'s. */
export function placesIndex(pages, today) {
  const section = ([area, name]) => {
    const here = pages.filter((x) => x.place.area === area);
    if (!here.length) return '';
    const groups = Object.entries(KINDS).map(([kind, heading]) => {
      const list = here.filter((x) => x.place.kind === kind).sort((a, b) => a.place.name.localeCompare(b.place.name));
      return list.length ? `<h3>${esc(heading)}</h3><ul class="items two">${list.map((x) => `<li><p class="it-name">${typeIcon(x.place)}<a href="${esc(x.path)}">${esc(x.place.name)}</a></p>${amenityWords(x.place).length ? `<p class="it-facts">${esc(amenityWords(x.place).slice(0, 3).join(', '))}</p>` : ''}</li>`).join('')}</ul>` : '';
    }).join('');
    return `<section class="gsec" id="${esc(area)}"><h2>${esc(name)}</h2>${groups}</section>`;
  };
  const areas = Object.entries(AREA_NAMES).filter(([a]) => pages.some((x) => x.place.area === a));
  const body = `<main class="guide">
<div class="pagehead"><div class="wrap narrow"><h1>Places</h1><p class="lede">${pages.length} parks, playgrounds, libraries and places to play around Raleigh, Durham and Cary, each with what’s there and what’s coming up.</p>
<p class="dated">Updated <time datetime="${esc(today)}">${esc(onDay(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</time>.</p></div></div>
<div class="wrap narrow">
<ul class="towns">${areas.map(([a, n]) => `<li><a href="#${esc(a)}">${esc(n)}</a></li>`).join('')}</ul>
<p><a href="/search/?kind=places">Search the places by name, or by what they have</a></p>
${yourPlaces()}
<p class="it-facts yours-how">Open a place and tap “Keep in your places” to have it here and on the home page, with what’s next there.</p>
${areas.map(section).join('\n')}
${signupForm('sunday')}
</div>
</main>`;
  return layout({ title: `Parks, playgrounds and libraries for toddlers around Raleigh and Durham | ${SITE.name}`, description: `${pages.length} parks, playgrounds, libraries and places to play with a toddler around Raleigh, Durham and Cary, by side of the Triangle.`, body, path: '/places/' });
}
