// What every page of the Triangle Tots site shares: the frame, the visit count, the
// email sign-up and the search engines' structured data.

import { SITE, SIGNUP } from './settings.js';
import { utcOffsetMin } from './sky.js';
import { art, badgeBody } from './art.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const onDay = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
export const longDate = (date) => onDay(date, { weekday: 'long', month: 'long', day: 'numeric' });
export const dayPath = (date, band) => `/${date}/${band}/`;
export const mapLink = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const isoClock = (iso) => /T(\d{2}:\d{2})/.exec(iso ?? '')?.[1] ?? null;

// The logo badge: the sun rising behind the triangle hill. The header and footer each get their own ids.
const MARK = (id) => `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">${badgeBody(id)}</svg>`;

/**
 * Runs before anything else on the page: marks that script is on, and counts the
 * visit with a beacon. No cookie and no id: the count is the page and where the
 * visitor came from. Only on the real site, so a preview doesn't count, and a
 * failure anywhere is ignored: the page must not depend on it.
 */
export const FIRST_SCRIPT = `document.documentElement.classList.add('js');try{if(/(^|\\.)${SITE.domain.replace('.', '\\.')}$/.test(location.hostname))navigator.sendBeacon('${SIGNUP.api}/v1/hit',JSON.stringify({site:'triangletots',path:location.pathname,ref:document.referrer}))}catch(e){}`;

/** A block of schema.org data. `<` is escaped so a title can't end the script. */
export const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const offsetOf = (date) => {
  const m = utcOffsetMin(date);
  return `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:00`;
};
// Times as the source wrote them; the sources give local time, with or without its offset.
const withZone = (iso) => (/[+-]\d{2}:\d{2}$|Z$/.test(iso) ? iso : `${iso}${offsetOf(iso.slice(0, 10))}`);

/**
 * schema.org Event data for a stop of a plan, or null when it would be less than
 * honest or complete: an event with a set time, a named venue and a street address.
 * The price is only stated when the source says free; nothing is guessed.
 */
export function eventData(s) {
  if (s.kind !== 'event' || !s.title || !/T\d{2}:\d{2}/.test(s.start ?? '') || !s.venue || !s.address) return null;
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: s.title, startDate: withZone(s.start),
    ...(/T\d{2}:\d{2}/.test(s.end ?? '') ? { endDate: withZone(s.end) } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: s.venue, address: s.address },
    ...(s.url ? { url: s.url } : {}),
    ...(/^free$/i.test(s.cost ?? '') ? { isAccessibleForFree: true } : {}),
  };
}

/** Event data for every stop that can honestly have it, one block. Empty string when none can. */
export function eventsLd(stops) {
  const data = stops.map(eventData).filter(Boolean);
  return data.length ? jsonLd(data) : '';
}

export const SIGNUP_COPY = {
  sunday: {
    heading: 'Get the week\'s best outings on Sunday',
    lead: `One email, in time to plan the week: the outings worth the trip, near you. Leaving is one click.`,
    button: 'Send me the Sunday plan',
    done: SIGNUP.sundayStarted ? `You're on the list. Your first Sunday plan comes this Sunday.` : `You're on the list. We'll send the first Sunday plan as soon as it's ready.`,
    // Where a successful join goes: the thank-you page, which Google Ads counts as a sign-up.
    next: '/welcome/',
  },
  'family-waitlist': {
    heading: 'Join the family waitlist',
    lead: `One email when family plans open, nothing before then. Leaving is one click.`,
    button: 'Join the waitlist',
    done: `You're on the waitlist. We'll email you when family plans open.`,
  },
};

// The areas the list knows, as the server's contract has them.
const LIST_AREAS = { raleigh: 'Raleigh', cary: 'Cary / Apex', durham: 'Durham', 'chapel-hill': 'Chapel Hill', 'wake-forest': 'Wake Forest / North Raleigh', other: 'Somewhere else' };

let formCount = 0;

/** An email sign-up form. site.js posts it; the honeypot `website` field stays empty for people. */
export function signupForm(list, { heading, lead, anchor } = {}) {
  const copy = SIGNUP_COPY[list];
  if (!copy) throw new Error(`no sign-up copy for the list "${list}"`);
  const id = `f${++formCount}`;
  return `<form${anchor ? ` id="${esc(anchor)}"` : ''} class="signup${list === 'sunday' ? ' has-art' : ''}" data-signup="${esc(list)}" data-api="${esc(SIGNUP.api)}" data-done="${esc(copy.done)}"${copy.next ? ` data-next="${esc(copy.next)}"` : ''}>
${list === 'sunday' ? art('email') : ''}<h2>${esc(heading ?? copy.heading)}</h2>
<p class="lead">${esc(lead ?? copy.lead)}</p>
<div class="fields">
<label class="f-email" for="${id}e">Your email</label>
<input id="${id}e" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required>
<label class="f-area" for="${id}a">Where you are (optional)</label>
<select id="${id}a" name="area"><option value="">Choose one</option>${Object.entries(LIST_AREAS).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
<span class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></span>
<button type="submit" class="btn">${esc(copy.button)}</button>
</div>
<p class="result" role="status" aria-live="polite" hidden></p>
<noscript><p class="result bad">This form needs JavaScript. Email <a href="mailto:${esc(SIGNUP.contact)}">${esc(SIGNUP.contact)}</a> and we'll add you.</p></noscript>
<p class="fine">Your address is used for this and nothing else. <a href="/privacy/">Privacy</a></p>
</form>`;
}

/**
 * The home page's Sunday sign-up (#sunday), the full form. Where it's written it sits in the page; with script
 * (site.js) it floats at the bottom of the window instead, sliding up once the visitor is past the sky, until they
 * close it or join. A link to #sunday (the footer's button, the ads' sitelink) brings it up whatever.
 */
export function signupDock() {
  return `<aside class="dock" data-dock aria-label="Sunday email">
${signupForm('sunday', { anchor: 'sunday' })}
<button type="button" class="dockclose" data-dock-close data-goal="dock-close" aria-label="Close" hidden>×</button>
</aside>`;
}

/** The sources named in each page's footer. Kept true to src/plans/config.js's PLAN_SOURCES. */
const SOURCES = `Events come from Wake County Public Libraries, Durham County Library, the town parks calendars and local museums. Times and details are copied from each event's own page; check it before you go, as things change.`;

/**
 * The guides the footer links to: set by the build once it knows which guides this morning's
 * data filled, so the footer never links to a page that wasn't made. Until set, only the
 * guides index, which is always made.
 */
let footerGuides = [];
export function setFooterGuides(guides) {
  footerGuides = guides;
}
// Whether this build has Triangle Tots Family (scripts/build-site.js): the header's "Sign in" goes with it.
let familyNav = false;
export function setFamilyNav(on) {
  familyNav = !!on;
}
// With it, a browser signed in to Family (the family page keeps its session under family:session) is marked before the
// first paint, so a [data-in] part shows in place of a [data-out] sales pitch with no flash. Storage refused: signed out.
// A home saved there too (family:profile), or an address typed under a day map with no account (map:from), marks it
// has-home, so the day map's "add your home address" isn't shown.
const SIGNED_IN_SCRIPT = `try{var c=document.documentElement.classList;if(localStorage.getItem('family:session'))c.add('signed-in');if((JSON.parse(localStorage.getItem('family:profile'))||{}).home||localStorage.getItem('map:from'))c.add('has-home')}catch(e){}`;
// A family with a home saved gets it on each day map: the drive from home to the first stop, home across a nap, and
// home again, by road with the time (src/family/www/daymap.js). Loaded only on a page that has a day map, in a browser
// that has a home or when "Enter my address" (or "Change") is tapped, so nobody else's fetches it. Here and not in
// site.js: a build with Family off has no trace of it.
const HOME_MAP_SCRIPT = `addEventListener('DOMContentLoaded',function(){if(!document.querySelector('figure.dayroute[data-stops]'))return;var go=function(f){import('/family/daymap.js').then(f).catch(function(e){console.error('day map from home:',e.message)})};if(document.documentElement.classList.contains('has-home'))go(function(m){return m.homeOnDayMaps()});document.addEventListener('click',function(e){var b=e.target.closest('[data-from-open]');if(b)go(function(m){return m.askFrom(b)})})})`;
// The guides worth a footer link, in order, with the shorter names a footer wants.
const FOOTER_GUIDES = [
  ['holiday-events-for-toddlers', 'Holiday events'],
  ['halloween-events-for-toddlers', 'Halloween and fall'],
  ['easter-events-for-toddlers', 'Egg hunts and spring'],
  ['this-weekend-with-a-toddler', 'This weekend'],
  ['toddler-storytimes', 'Storytimes by library'],
  ['rainy-day-raleigh', 'Rainy day ideas'],
  ['playgrounds-with-restrooms-raleigh', 'Playgrounds with restrooms'],
  ['splash-pads-raleigh', 'Splash pads'],
  ['free-things-to-do-raleigh', 'Free things to do'],
];

const APPS = [
  ['routines', 'Tot Routines', 'Bedtime and morning routines, with a picture chart they follow.'],
  ['potty', 'Tot Potty', 'Potty training, with a plan for each day and a timer that learns.'],
  ['bumplings', 'Bumplings', 'Expecting again? A week-by-week app for both of you.'],
];

const HILLS = '<svg class="foothills" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70V40C150 6 320 10 480 34s300 30 460 2 200-24 260-10v44Z" fill="#14543f"/></svg>';

function footer() {
  const made = footerGuides.filter((g) => g.path);
  const bySlug = new Map(made.map((g) => [g.slug, g]));
  const ages = made.filter((g) => g.group === 'age');
  const guides = FOOTER_GUIDES.filter(([slug]) => bySlug.has(slug));
  const li = (href, text, attrs = '') => `<li><a href="${esc(href)}"${attrs}>${esc(text)}</a></li>`;
  return `<footer class="site-foot">${HILLS}
<div class="foot-in"><div class="wrap">
<div class="fgrid">
<div class="fbrand">
<a class="brand" href="/">${MARK('fb')}${esc(SITE.name)}</a>
<p>Free toddler day plans around Raleigh, Durham and Cary: a real outing and a whole day around the nap, checked every morning.</p>
<a class="btn" href="/#sunday" data-goal="footer-sunday">Get the Sunday email</a>
<button type="button" class="install" data-install data-goal="install" hidden>Add to your home screen</button>
</div>
<nav aria-label="Plans"><p class="fh">Plans</p><ul>${li('/', 'Today’s plans')}${ages.map((g) => li(g.path, g.h1.replace(/^Things to do w/, 'W'))).join('')}${li('/past/', 'Past days’ plans')}</ul></nav>
<nav aria-label="Guides"><p class="fh">Guides</p><ul>${guides.map(([slug, text]) => li(bySlug.get(slug).path, text)).join('')}${li('/places/', 'Parks and libraries')}${li('/guides/', 'All guides →')}</ul></nav>
<nav aria-label="About"><p class="fh">${esc(SITE.name)}</p><ul>${li('/about/', 'About us')}${li('/custom/', 'Family plans')}${li('/widget/', 'Put our plans on your site')}${li('/privacy/', 'Privacy')}${li('/terms/', 'Terms')}${li(`mailto:${SIGNUP.contact}`, 'Email us')}</ul></nav>
</div>
<div class="fapps"><p class="fh">Free apps from the same family</p><ul>${APPS.map(([slug, name, about]) => `<li><a href="https://tottoolbox.com/${slug}/" data-goal="to-${slug}"><img src="/img/apps/${slug}.png" alt="" width="48" height="48" loading="lazy"><span><strong>${esc(name)}</strong><span>${esc(about)}</span></span></a></li>`).join('')}</ul></div>
<div class="fbase">
<p>${SOURCES}</p>
<p>© ${new Date().getFullYear()} ${esc(SITE.publisher)}, doing business as <a href="https://tottoolbox.com">Tot Toolbox</a>. Made in Raleigh, NC. No ads, and the free plans need no account.</p>
</div>
</div></div>
</footer>`;
}

/** Google's own snippet, as high in <head> as Google asks: gtag.js loaded once, then configured for each id. */
const googleTag = (ids) => ids.length ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ids[0]}"></script>
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date());${ids.map((id) => ` gtag('config', '${id}');`).join('')}</script>
` : '';
export const googleIds = () => [SITE.googleAnalytics, SITE.googleAds].filter(Boolean);

// `ads: false` leaves Google's tags off a page. `analytics: true` with it keeps Analytics alone (the family page).
export function layout({ title, description, body, path, head = '', ads = true, analytics = false }) {
  const here = (test) => (test ? ' aria-current="page"' : '');
  const url = `https://${SITE.domain}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
${googleTag(ads ? googleIds() : analytics ? [SITE.googleAnalytics].filter(Boolean) : [])}<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://${SITE.domain}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#9fd6f5">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<script>${FIRST_SCRIPT}</script>
${familyNav ? `<script>${SIGNED_IN_SCRIPT}</script>\n<script>${HOME_MAP_SCRIPT}</script>\n` : ''}<link rel="preload" href="/fonts/gabarito.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
<script src="/site.js" defer></script>
${head}
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/">${MARK('hb')}${esc(SITE.name)}</a>
<nav aria-label="Main"><span class="links"><a href="/"${here(path === '/' || /^\/\d/.test(path))}>Today</a><a href="/days/"${here(path === '/days/')}>Days ahead</a><a href="/guides/"${here(path.startsWith('/guides/'))}>Guides</a><a href="/custom/"${here(path === '/custom/')}>Family plans</a></span><a class="find" href="/search/" aria-label="Search"${here(path === '/search/')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg></a>${familyNav ? `<a class="acct" href="/family/" data-acct${here(path === '/family/')}>Sign in</a>` : ''}</nav></div></header>
${body}
${footer()}
</body>
</html>
`;
}

/**
 * A short link for a poster, a post or a mailing: it counts as a visit to its own path, so
 * the visit count shows which ones bring people, then goes on to the home page. The home page address carries the
 * slug as the campaign tags Google Analytics reads (source = the slug, medium print or link), so its reports show it too.
 */
export function goPage(slug) {
  const to = `/?utm_source=${slug}&utm_medium=${slug.startsWith('flyer') ? 'print' : 'link'}&utm_campaign=go`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SITE.name)}</title>
<link rel="canonical" href="https://${SITE.domain}/">
<script>${FIRST_SCRIPT}location.replace('${to}');</script>
<meta http-equiv="refresh" content="1;url=${esc(to)}">
</head><body><p><a href="${esc(to)}">Go to ${esc(SITE.name)}</a></p></body></html>
`;
}
