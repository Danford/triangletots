// Triangle Tots: the sign-up forms, the home page's ages and map, the nap and wake-up
// pickers on a day page and the "Or swap in" filter. The pages read fine without it:
// the first nap on the home page, all three plans on a day page.

// Choices are kept in this browser only. A browser that refuses storage just doesn't remember.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* nothing to remember it in */ } },
};

// A tap on a button that matters is counted like a page view, under its name and nothing more.
function goal(name) {
  try {
    if (/(^|\.)triangletots\.com$/.test(location.hostname)) navigator.sendBeacon('https://sync.tottoolbox.com/v1/hit', JSON.stringify({ site: 'triangletots', path: `/_goal/${name}` }));
  } catch { /* the page must not depend on it */ }
}
addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-goal]');
  if (el) goal(el.dataset.goal);
});

// "Send this plan to someone": the phone's share sheet, or else a copied link.
addEventListener('DOMContentLoaded', () => {
  for (const bar of document.querySelectorAll('[data-share-bar]')) {
    const b = bar.querySelector('[data-share]'), said = bar.querySelector('.shared');
    if (!navigator.share && !navigator.clipboard) continue;
    bar.hidden = false;
    b.addEventListener('click', async () => {
      const url = location.href.split('#')[0] + location.hash;
      if (navigator.share) { await navigator.share({ title: b.dataset.title, url }).catch(() => {}); return; }
      await navigator.clipboard.writeText(url);
      said.textContent = ' Link copied.';
    });
  }
});

// Sign-up forms. They post as text/plain so the browser needs no preflight, which saves a
// round trip on a slow phone, and they never lose what was typed.
const JOIN_WAIT_MS = 15000;
// The list's areas, for the side of the Triangle already chosen on the map.
const LIST_AREA = { raleigh: 'raleigh', 'north-raleigh': 'wake-forest', 'cary-apex': 'cary', durham: 'durham', 'chapel-hill': 'chapel-hill', 'south-wake': 'other', 'east-wake': 'other' };
function failure(status) {
  if (status === 400) return 'That email address doesn’t look right. Check it and try again.';
  if (status === 429) return 'Too many tries from here. Wait a little while and try again.';
  return 'That didn’t go through. Check your connection and try again, or email support@tottoolbox.com.';
}
async function join(form) {
  const button = form.querySelector('button');
  const result = form.querySelector('.result');
  const label = button.textContent;
  const show = (text, cls) => { result.textContent = text; result.className = `result ${cls}`; result.hidden = false; };
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), JOIN_WAIT_MS);
  button.disabled = true;
  button.textContent = 'Sending…';
  result.hidden = true;
  let status = 0;
  try {
    const res = await fetch(`${form.dataset.api}/v1/list/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      signal: stop.signal,
      body: JSON.stringify({ email: form.email.value.trim(), list: form.dataset.signup, area: form.area.value, website: form.website.value }),
    });
    status = res.status;
    if (!(await res.json()).ok) throw new Error(`join answered ${status}`);
    form.classList.add('joined');
    show(form.dataset.done, 'ok');
    goal(`joined-${form.dataset.signup}`);
  } catch (err) {
    console.error('sign-up failed:', err.message);
    show(failure(status), 'bad');
  } finally {
    clearTimeout(timer);
    button.disabled = false;
    button.textContent = label;
  }
}
addEventListener('DOMContentLoaded', () => {
  for (const form of document.querySelectorAll('[data-signup]')) {
    form.area.value = LIST_AREA[store.get('area')] ?? '';
    form.addEventListener('submit', (e) => { e.preventDefault(); join(form); });
  }
});

// A change the person made slides the day strip's blocks from their old times to their new ones.
// `visible` finds the strip on show; `fn` swaps which plan is shown. Each block in the new strip
// starts where the block of the same name (nap1, outing1, wake…) was, wherever it was mid-slide.
const EASE = { duration: 650, easing: 'cubic-bezier(.45,0,.2,1)' };
const still = () => !document.body.animate || matchMedia('(prefers-reduced-motion: reduce)').matches;
function morph(visible, fn) {
  const from = visible();
  if (!from || still()) return fn();
  const width = from.querySelector('.strip').clientWidth || 1;
  // Where each named block is now, as a share of the strip, including any slide still running.
  const was = new Map([...from.querySelectorAll('[data-k]:not(.leaving)')].map((el) => {
    const cs = getComputedStyle(el);
    return [`${el.parentElement.className}:${el.dataset.k}`, { el, left: (parseFloat(cs.left) / width) * 100, width: (parseFloat(cs.width) / width) * 100, opacity: cs.opacity }];
  }));
  fn();
  const to = visible();
  if (!to || to === from) return;
  // The strip going out of sight is left at rest, for whenever it is shown again.
  for (const el of from.querySelectorAll('.leaving')) el.remove();
  for (const el of from.querySelectorAll('[data-k]')) el.getAnimations().forEach((a) => a.cancel());
  for (const el of to.querySelectorAll('.leaving')) el.remove();
  const moves = [];
  for (const el of to.querySelectorAll('[data-k]')) {
    el.getAnimations().forEach((a) => a.cancel());
    const key = `${el.parentElement.className}:${el.dataset.k}`;
    const end = { left: el.style.left, width: el.style.width };
    const old = was.get(key);
    was.delete(key);
    if (el.parentElement.classList.contains('ticks')) {
      if (old) el.animate([{ left: `${old.left}%` }, { left: end.left }], EASE);
      continue;
    }
    // A block that wasn't there grows out of its own middle.
    if (!old) {
      el.animate([{ left: `${parseFloat(end.left) + parseFloat(end.width) / 2}%`, width: '0%', opacity: 0 }, { ...end, opacity: 1 }], EASE);
      continue;
    }
    const mid = (l, w) => l + w / 2;
    moves.push({ el, old, end, a: mid(old.left, old.width), b: mid(parseFloat(end.left), parseFloat(end.width)) });
  }
  // Blocks that pass each other (the nap jumping the outing) swap like two cars on a road:
  // sleep takes the top lane and the outing and its drives the bottom, then both settle back.
  const sleepy = (m) => m.el.matches('.s-nap, .s-quiet');
  const blocky = (m) => !m.el.matches('.s-asleep');
  const crossing = new Set();
  for (const m of moves.filter(blocky)) {
    for (const n of moves.filter(blocky)) {
      if (sleepy(m) && !sleepy(n) && Math.sign(m.a - n.a) !== Math.sign(m.b - n.b)) crossing.add(m).add(n);
    }
  }
  for (const m of moves) {
    const start = { left: `${m.old.left}%`, width: `${m.old.width}%`, opacity: m.old.opacity, top: '0%', bottom: '0%', offset: 0 };
    const last = { ...m.end, opacity: 1, top: '0%', bottom: '0%', offset: 1 };
    if (!crossing.has(m)) { m.el.animate([start, last], EASE); continue; }
    const lane = sleepy(m) ? { top: '0%', bottom: '54%' } : { top: '54%', bottom: '0%' };
    m.el.animate([{ ...start, borderRadius: '0' }, { ...lane, borderRadius: '.45rem', offset: 0.22 }, { ...lane, borderRadius: '.45rem', offset: 0.78 }, { ...last, borderRadius: '0' }], { ...EASE, duration: 800 });
  }
  // A block that's gone shrinks into its middle and fades.
  for (const [key, old] of was) {
    if (!key.startsWith('strip')) continue;
    const ghost = old.el.cloneNode(true);
    ghost.classList.add('leaving');
    to.querySelector('.strip').append(ghost);
    ghost.animate([{ left: `${old.left}%`, width: `${old.width}%`, opacity: old.opacity }, { left: `${old.left + old.width / 2}%`, width: '0%', opacity: 0 }], EASE).onfinish = () => ghost.remove();
  }
  for (const el of to.querySelectorAll('.ticks span:not([data-k]), .temps span, .strip .rain, .strip .tline, .strip .tdot,.suns span, .strip .sunline')) el.animate([{ opacity: 0 }, { opacity: 1 }], { ...EASE, delay: 200, fill: 'backwards' });
}

addEventListener('DOMContentLoaded', () => {
  // The page is rebuilt each morning. If that didn't happen, it mustn't go on calling an old day today.
  const stamp = document.querySelector('[data-today]');
  if (stamp) {
    const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    if (stamp.dataset.today !== now) { stamp.textContent = `Latest plans: ${stamp.textContent}`; document.querySelector('.sky h1').textContent = 'Our latest plans'; }
  }
  // The day being looked at stays in view in a list that scrolls sideways.
  const days = document.querySelector('.days');
  const day = days?.querySelector('[aria-current]');
  if (day) days.scrollLeft = day.offsetLeft - days.offsetLeft - days.clientWidth / 2 + day.offsetWidth / 2;

  // Home: each age shows the nap pattern last chosen, and the age last looked at comes first.
  const myAge = store.get('age');
  for (const row of document.querySelectorAll('.today[data-band]')) {
    const nap = store.get(`nap:${row.dataset.band}`);
    const variants = [...row.querySelectorAll('.variant')];
    if (variants.some((v) => v.dataset.nap === nap)) for (const v of variants) v.hidden = v.dataset.nap !== nap;
    if (row.dataset.band === myAge) row.classList.add('mine');
  }
  for (const a of document.querySelectorAll(`.dayrows a[data-band="${myAge}"]`)) a.classList.add('mine');

  // Home: tap a side of the Triangle to see what's on there today. It's remembered on this phone.
  const areas = [...document.querySelectorAll('.picker [data-area]')];
  const pick = (area) => {
    for (const b of areas) b.setAttribute('aria-pressed', String(b.dataset.area === area));
    for (const list of document.querySelectorAll('[data-near]')) list.classList.toggle('on', list.dataset.near === area);
  };
  for (const b of areas) {
    b.addEventListener('click', () => {
      store.set('area', b.dataset.area);
      pick(b.dataset.area);
      document.querySelector('.nearlist.on')?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'nearest' });
    });
  }
  if (areas.some((b) => b.dataset.area === store.get('area'))) pick(store.get('area'));

  const tabs = [...document.querySelectorAll('[data-tab]')];
  if (tabs.length) {
    // The nap and wake-up last chosen for this age are remembered, so the next day opens on them.
    const band = location.pathname.split('/').filter(Boolean)[1];
    const wake = document.querySelector('[data-wake]');
    store.set('age', band);
    const savedWake = store.get(`wake:${band}`);
    if (wake && [...wake.options].some((o) => o.value === savedWake)) wake.value = savedWake;
    let current = null;
    const show = (nap) => {
      current = nap;
      const shift = wake?.value ?? '0';
      for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === nap));
      for (const s of document.querySelectorAll('[data-nap]')) {
        const on = s.dataset.nap === nap && s.dataset.shift === shift;
        s.classList.toggle('on', on);
        if (s.dataset.shift !== '0') s.hidden = !on;
      }
    };
    const strip = () => document.querySelector('.plan.on .daystrip');
    wake?.addEventListener('change', () => { store.set(`wake:${band}`, wake.value); morph(strip, () => show(current)); });
    const has = (nap) => tabs.some((t) => t.dataset.tab === nap);
    const saved = store.get(`nap:${band}`);
    const hash = location.hash.slice(1);
    show(has(hash) ? hash : has(saved) ? saved : tabs[0].dataset.tab);
    for (const t of tabs) {
      t.addEventListener('click', (e) => {
        e.preventDefault();
        morph(strip, () => show(t.dataset.tab));
        store.set(`nap:${band}`, t.dataset.tab);
        history.replaceState(null, '', `#${t.dataset.tab}`);
      });
    }
  }

  // Interests: any chosen one matches. Areas: any chosen one matches. Both kinds must match when both are chosen.
  for (const box of document.querySelectorAll('.alts')) {
    const buttons = [...box.querySelectorAll('[data-filter]')];
    const apply = () => {
      const on = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.filter.split(':'));
      const want = (kind) => on.filter(([k]) => k === kind).map(([, v]) => v);
      const interests = want('interest'), areas = want('area');
      let shown = 0;
      for (const li of box.querySelectorAll('.alt')) {
        const ok = (!interests.length || li.dataset.interests.split(' ').some((i) => interests.includes(i)))
          && (!areas.length || areas.includes(li.dataset.area));
        li.hidden = !ok;
        if (ok) shown++;
      }
      box.querySelector('.none').hidden = shown > 0;
    };
    for (const b of buttons) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const pressing = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(pressing));
        apply();
        // The area is the family's own choice, the same one the home page's map makes.
        if (b.dataset.filter.startsWith('area:')) store.set('area', pressing ? b.dataset.filter.slice(5) : '');
      });
    }
    // Their side of the Triangle is chosen already, if anything here is on that side.
    const mine = buttons.find((b) => b.dataset.filter === `area:${store.get('area')}`);
    if (mine && box.querySelector(`.alt[data-area="${mine.dataset.filter.slice(5)}"]`)) { mine.setAttribute('aria-pressed', 'true'); apply(); }
  }
});
