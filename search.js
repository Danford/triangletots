// Triangle Tots search: every event and place in /search/data.json (built by src/site/ahead.js), searched here in
// the browser. What's asked for lives in the address (?q=&day=&age=&area=&kind=&only=), so a search can be shared,
// and a day's "See all" on /days/ opens on that day.

const AREAS = { raleigh: 'Raleigh', 'north-raleigh': 'North Raleigh / Wake Forest', 'cary-apex': 'Cary / Apex', 'south-wake': 'South Wake', 'east-wake': 'East Wake', durham: 'Durham', 'chapel-hill': 'Chapel Hill / Pittsboro' };
const KINDS = { park: 'Park', library: 'Library', museum: 'Museum', farm: 'Farm', garden: 'Garden' };
const AMENITIES = { playground: 'Playground', restroom: 'Restrooms', splashpad: 'Splash pad', greenway: 'Greenway', 'picnic-shelter': 'Picnic shelter', nature: 'Nature trail', carousel: 'Carousel', train: 'Little train', animals: 'Animals', pool: 'Pool', boating: 'Boats', 'community-center': 'Community center', garden: 'Garden', farm: 'Farm', fields: 'Fields', amusements: 'Rides', 'dog-park': 'Dog park', courts: 'Courts' };
// The amenities a parent of a toddler looks for first, shown first.
const AMENITY_ORDER = ['playground', 'restroom', 'splashpad', 'carousel', 'train', 'animals', 'nature', 'greenway', 'picnic-shelter', 'pool', 'garden', 'farm', 'boating', 'community-center'];
const PAGE = 24;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');
const dateOf = (iso) => String(iso ?? '').slice(0, 10);
const onDay = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const clockOf = (iso) => {
  const m = /T(\d{2}):(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return `${h % 12 || 12}${mm ? `:${m[2]}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
const mapLink = (a) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** An event runs across a date: it starts then, or it began before and hasn't ended. */
const runsOn = (e, date) => dateOf(e.s) === date || (dateOf(e.s) < date && dateOf(e.e ?? e.s) >= date);
const multiDay = (e) => e.e && dateOf(e.e) > dateOf(e.s);
// A start at midnight is a listing for the whole day (a scavenger hunt open all day), not a midnight event.
const allDayOf = (e) => !clockOf(e.s) || /T00:00/.test(e.s);

addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('[data-finder]');
  if (!form) return;
  const found = document.querySelector('[data-found]');
  const out = document.querySelector('[data-results]');
  const q = form.elements.q;
  const kindButtons = [...form.querySelectorAll('[data-kind]')];
  const onlyButtons = [...form.querySelectorAll('[data-only]')];

  // What's asked for, read from the address first.
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') ?? '';
  for (const name of ['day', 'age', 'area']) {
    const v = params.get(name);
    if (v && [...form.elements[name].options].some((o) => o.value === v)) form.elements[name].value = v;
  }
  const press = (buttons, on) => { for (const b of buttons) b.setAttribute('aria-pressed', String(on(b))); };
  const kindAsked = params.get('kind');
  press(kindButtons, (b) => b.dataset.kind === (['events', 'places'].includes(kindAsked) ? kindAsked : 'all'));
  const onlyAsked = (params.get('only') ?? '').split(',');
  press(onlyButtons, (b) => onlyAsked.includes(b.dataset.only));

  let data;
  try {
    const res = await fetch('/search/data.json');
    if (!res.ok) throw new Error(`/search/data.json answered ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error('search:', err.message);
    found.textContent = 'Search couldn’t load. Check your connection and reload the page.';
    return;
  }
  // Each item's words, folded once.
  for (const e of data.events) e._t = fold(e.t), e._h = fold([e.t, e.v, AREAS[e.r], e.ab, e.g, e.c, e.d ? 'drop in drop-in' : '', e.i === 1 ? 'indoors inside' : e.i === 0 ? 'outdoors outside' : ''].join(' '));
  for (const p of data.places) p._t = fold(p.n), p._h = fold([p.n, KINDS[p.k], p.w, AREAS[p.r], p.a, p.o, ...p.m.map((m) => AMENITIES[m] ?? m)].join(' '));

  let shown = { events: PAGE, places: PAGE };
  const state = () => ({
    q: q.value.trim(),
    day: form.elements.day.value,
    age: form.elements.age.value,
    area: form.elements.area.value,
    kind: kindButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.kind ?? 'all',
    only: onlyButtons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.only),
  });

  /** Every word asked for is somewhere in the item; a match in the name counts most. */
  const score = (item, words) => {
    if (!words.length) return 1;
    let s = 0;
    for (const w of words) {
      if (!item._h.includes(w)) return 0;
      s += item._t.includes(w) ? (item._t.startsWith(w) ? 4 : 3) : 1;
    }
    return s;
  };

  const badge = (text, cls = '') => `<span class="tag${cls ? ` ${cls}` : ''}">${esc(text)}</span>`;
  function eventCard(e) {
    const allDay = allDayOf(e);
    const when = multiDay(e)
      ? `<small>Until</small><b>${esc(onDay(dateOf(e.e), { month: 'short', day: 'numeric' }))}</b>`
      : allDay ? '<b>All day</b>' : `<b>${esc(clockOf(e.s))}</b>${e.e && clockOf(e.e) ? `<small>to ${esc(clockOf(e.e))}</small>` : ''}`;
    const tags = [
      e.f ? badge('Free', 'free') : e.c ? badge(e.c) : '',
      e.d ? badge('Drop in', 'drop') : e.reg ? badge('Sign up first', 'reg') : '',
      e.i === 1 ? badge('Indoors', 'in') : e.i === 0 ? badge('Outdoors', 'out') : '',
      e.g ? badge(e.g, 'age') : '',
    ].join('');
    const links = [
      e.p ? `<a class="go plan" href="${esc(e.p)}">In our plan <span aria-hidden="true">→</span></a>` : '',
      e.u ? `<a class="go" href="${esc(e.u)}" rel="noopener" target="_blank" data-goal="event-page">Event page <span aria-hidden="true">↗</span></a>` : '',
      e.a ? `<a class="go" href="${esc(mapLink(e.a))}" rel="noopener" target="_blank">Directions</a>` : '',
    ].join('');
    return `<li class="hit ev${e.p ? ' planned' : ''}"><span class="when">${when}</span>
<div class="what"><h3>${esc(e.t)}</h3><p class="where">${esc(e.v)}${e.r ? ` · ${esc(AREAS[e.r])}` : ''}</p>${tags ? `<p class="tags">${tags}</p>` : ''}${e.ab ? `<p class="about">${esc(e.ab)}${e.ab.length >= 180 ? '…' : ''}</p>` : ''}${links ? `<p class="links">${links}</p>` : ''}</div></li>`;
  }
  function placeCard(p) {
    const ams = AMENITY_ORDER.filter((a) => p.m.includes(a)).slice(0, 6);
    const links = [
      p.p ? `<a class="go plan" href="${esc(p.p)}">In a plan ${esc(p.pd === data.today ? 'today' : `on ${onDay(p.pd, { weekday: 'short', month: 'short', day: 'numeric' })}`)} <span aria-hidden="true">→</span></a>` : '',
      p.h ? `<a class="go" href="${esc(p.h)}">What’s here <span aria-hidden="true">→</span></a>` : '',
      p.u ? `<a class="go" href="${esc(p.u)}" rel="noopener" target="_blank" data-goal="place-page">Website <span aria-hidden="true">↗</span></a>` : '',
      p.a ? `<a class="go" href="${esc(mapLink(p.a))}" rel="noopener" target="_blank">Directions</a>` : '',
    ].join('');
    return `<li class="hit pl pl-${esc(p.k)}${p.p ? ' planned' : ''}"><span class="kind">${esc(KINDS[p.k] ?? 'Place')}</span>
<div class="what"><h3>${esc(p.n)}</h3><p class="where">${esc(p.w ? `${p.w} · ` : '')}${esc(AREAS[p.r] ?? '')}</p>${ams.length ? `<p class="tags">${ams.map((a) => badge(AMENITIES[a], 'am')).join('')}</p>` : ''}${p.o ? `<p class="about">${esc(p.o)}</p>` : ''}${links ? `<p class="links">${links}</p>` : ''}</div></li>`;
  }

  function run({ keepPages = false } = {}) {
    const s = state();
    if (!keepPages) shown = { events: PAGE, places: PAGE };
    const words = fold(s.q).split(/\s+/).filter(Boolean);
    const events = s.kind === 'places' ? [] : data.events
      .filter((e) => (!s.day ? dateOf(e.e ?? e.s) >= data.today : runsOn(e, s.day))
        && (!s.age || e.b.includes(s.age)) && (!s.area || e.r === s.area)
        && (!s.only.includes('free') || e.f) && (!s.only.includes('indoor') || e.i === 1) && (!s.only.includes('dropin') || e.d))
      .map((e) => ({ e, sc: score(e, words) })).filter((x) => x.sc > 0);
    // A place is any day, any age; "Free" and "No sign-up" fit every park and library, "Indoors" only a roof.
    const places = s.kind === 'events' ? [] : data.places
      .filter((p) => (!s.area || p.r === s.area) && (!s.only.includes('indoor') || ['library', 'museum'].includes(p.k)))
      .map((p) => ({ p, sc: score(p, words) })).filter((x) => x.sc > 0);
    // With words, the best matches first; without, events in time order and places by name.
    // Without, the ones running for days or weeks after the rest, as they're shown.
    if (words.length) { events.sort((a, b) => b.sc - a.sc); places.sort((a, b) => b.sc - a.sc); }
    // Within a day, the ones that last all day after the ones with a time.
    else events.sort((a, b) => Number(multiDay(a.e)) - Number(multiDay(b.e)) || dateOf(a.e.s).localeCompare(dateOf(b.e.s)) || Number(allDayOf(a.e)) - Number(allDayOf(b.e)) || String(a.e.s).localeCompare(String(b.e.s)));

    const parts = [];
    if (s.kind !== 'places') {
      const list = events.slice(0, shown.events).map((x) => x.e);
      // In time order, by day; the ones that run for days or weeks (a class's session, a StoryWalk) together after.
      let html = '';
      if (words.length) html = `<ul class="hits">${list.map(eventCard).join('')}</ul>`;
      else {
        const long = list.filter(multiDay), single = list.filter((e) => !multiDay(e));
        let day = null, open = false;
        for (const e of single) {
          const d = dateOf(e.s);
          if (d !== day) {
            if (open) html += '</ul>';
            html += `<h3 class="dayhead">${esc(d === data.today ? 'Today' : onDay(d, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3><ul class="hits">`;
            day = d; open = true;
          }
          html += eventCard(e);
        }
        if (open) html += '</ul>';
        if (long.length) html += `<h3 class="dayhead">Running over several days or weeks</h3><ul class="hits">${long.map(eventCard).join('')}</ul>`;
      }
      parts.push(`<section class="group"><h2>Events <span>${events.length}</span></h2>${events.length ? html : '<p class="muted">No events match. Try fewer words or another day.</p>'}${events.length > shown.events ? `<button type="button" class="more" data-more="events">Show more events (${events.length - shown.events} left)</button>` : ''}</section>`);
    }
    if (s.kind !== 'events') {
      const list = places.slice(0, shown.places).map((x) => x.p);
      parts.push(`<section class="group"><h2>Places <span>${places.length}</span></h2>${places.length ? `<ul class="hits">${list.map(placeCard).join('')}</ul>` : '<p class="muted">No places match.</p>'}${places.length > shown.places ? `<button type="button" class="more" data-more="places">Show more places (${places.length - shown.places} left)</button>` : ''}</section>`);
    }
    const said = [s.kind !== 'places' ? plural(events.length, 'event') : null, s.kind !== 'events' ? plural(places.length, 'place') : null].filter(Boolean).join(' and ');
    const asked = s.q || s.day || s.age || s.area || s.only.length || s.kind !== 'all';
    found.innerHTML = `${esc(said)}${s.day ? ` on ${esc(s.day === data.today ? 'today' : onDay(s.day, { weekday: 'long', month: 'long', day: 'numeric' }))}` : ''}${asked ? ' <button type="button" class="clear" data-clear>Clear search</button>' : ''}`;
    out.innerHTML = parts.join('');

    // The search, in the address.
    const p = new URLSearchParams();
    if (s.q) p.set('q', s.q);
    for (const k of ['day', 'age', 'area']) if (s[k]) p.set(k, s[k]);
    if (s.kind !== 'all') p.set('kind', s.kind);
    if (s.only.length) p.set('only', s.only.join(','));
    history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
  }

  // What people search for, told to Google Analytics as its own `search` event once they stop typing (or change a
  // choice), each different search once. The words and the choices, nothing else.
  let told = null, telling;
  const tell = () => {
    clearTimeout(telling);
    telling = setTimeout(() => {
      const s = state();
      if (s.q.length < 2) return;
      const key = JSON.stringify(s);
      if (key === told) return;
      told = key;
      try { window.gtag?.('event', 'search', { search_term: s.q.slice(0, 100).toLowerCase(), search_kind: s.kind, search_day: s.day ? 'day' : 'any', search_age: s.age || 'any', search_area: s.area || 'any' }); } catch { /* the page must not depend on it */ }
    }, 1500);
  };
  let typing;
  q.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(run, 120); tell(); });
  form.addEventListener('change', tell);
  form.addEventListener('change', () => run());
  for (const b of kindButtons) b.addEventListener('click', () => { press(kindButtons, (x) => x === b); run(); });
  for (const b of onlyButtons) b.addEventListener('click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); run(); });
  document.addEventListener('click', (e) => {
    const more = e.target.closest?.('[data-more]');
    if (more) { shown[more.dataset.more] += PAGE * 2; run({ keepPages: true }); return; }
    if (e.target.closest?.('[data-clear]')) {
      form.reset();
      press(kindButtons, (b) => b.dataset.kind === 'all');
      press(onlyButtons, () => false);
      run();
      q.focus();
    }
  });
  run();
});
