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
      const url = b.dataset.url ?? location.href;
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
    // The thank-you page, if the list has one. The beacon above still goes as the page changes.
    if (form.dataset.next) location.assign(form.dataset.next);
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

// The map can show each side of the Triangle in turn: its button lights up and its outings
// show beside it. It starts by itself until a family picks their side (not when motion is
// turned down), and the tour button starts or stops it any time. It waits while someone is
// pointing at or tabbing through the map or the lists, while it's off screen or the tab is
// hidden. A pick stops it. Nothing is remembered until they pick.
const TOUR_MS = 4500;
function areaTour(buttons, show, onchange) {
  const section = buttons[0]?.closest('.near');
  const watched = [buttons[0]?.closest('.picker'), document.querySelector('.nearlists')].filter(Boolean);
  let timer = null, i = -1, hovered = false, focused = false, seen = false, running = false;
  const paused = () => hovered || focused || !seen || document.hidden;
  const step = () => {
    if (!running || paused()) return;
    buttons[i]?.classList.remove('touring');
    i = (i + 1) % buttons.length;
    buttons[i].classList.add('touring');
    show(buttons[i].dataset.area);
  };
  if (section) {
    for (const el of watched) {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovered = true; });
      el.addEventListener('pointerleave', () => { hovered = false; });
      el.addEventListener('focusin', () => { focused = true; });
      el.addEventListener('focusout', (e) => { focused = watched.some((w) => w.contains(e.relatedTarget)); });
    }
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && running && i < 0) step(); }, { threshold: 0.3 }).observe(section);
  }
  return {
    get running() { return running; },
    // `from` is the side showing now, so the tour carries on from the one after it.
    start(from) {
      if (!section || running) return;
      running = true;
      if (from) i = buttons.findIndex((b) => b.dataset.area === from);
      timer = setInterval(step, TOUR_MS);
      step();
      onchange(true);
    },
    // Gives back the side it stopped on.
    stop() {
      if (!running) return null;
      running = false;
      clearInterval(timer);
      buttons[i]?.classList.remove('touring');
      onchange(false);
      return buttons[i]?.dataset.area ?? null;
    },
  };
}
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

// The home page's age cards: a nap picker on each (every age has its own nap patterns) and one wake-up for all.
// The usual wake-up's plans are on the page; another wake-up's come from that age's day page, which has every
// one, fetched the first time it's asked for. Both choices are remembered, and the day pages open on them.
function homeCards(cards, wake) {
  if (!cards.length) return;
  const pages = new Map();
  const dayPage = (url) => {
    if (!pages.has(url)) {
      pages.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url} answered ${r.status}`);
        return r.text();
      }).then((t) => new DOMParser().parseFromString(t, 'text/html')));
    }
    return pages.get(url);
  };
  async function variant(card, nap, shift) {
    const have = card.querySelector(`.variant[data-nap="${nap}"][data-shift="${shift}"]`);
    if (have) return have;
    const base = card.querySelector(`.variant[data-nap="${nap}"][data-shift="0"]`);
    const doc = await dayPage(base.pathname);
    const plan = doc.querySelector(`section.plan[data-nap="${nap}"][data-shift="${shift}"]`);
    if (!plan) throw new Error(`${base.pathname} has no ${nap} plan for a wake-up moved ${shift} minutes`);
    const v = base.cloneNode(true);
    v.dataset.shift = shift;
    v.hidden = true;
    v.querySelector('strong').innerHTML = plan.querySelector('h2').innerHTML;
    v.querySelector('.daystrip').replaceWith(document.importNode(plan.querySelector('.daystrip'), true));
    v.setAttribute('aria-label', `${base.getAttribute('aria-label').split(':')[0]}: ${plan.querySelector('h2').textContent}`);
    base.after(v);
    document.dispatchEvent(new CustomEvent('strips', { detail: [...v.querySelectorAll('.strip[data-day]')] }));
    return v;
  }
  const napOf = (card) => card.querySelector('.napchips [aria-pressed="true"]')?.dataset.nap ?? card.querySelector('.variant').dataset.nap;
  async function show(card, nap, shift, slide = true) {
    const v = await variant(card, nap, shift);
    const swap = () => { for (const x of card.querySelectorAll('.variant')) x.hidden = x !== v; };
    if (slide) morph(() => card.querySelector('.variant:not([hidden])'), swap); else swap();
    for (const b of card.querySelectorAll('.napchips button')) b.setAttribute('aria-pressed', String(b.dataset.nap === nap));
    card.querySelector('.num').href = v.href;
  }
  const shiftNow = () => wake?.value ?? '0';
  const showAll = (slide) => Promise.all(cards.map((c) => show(c, napOf(c), shiftNow(), slide))).catch((e) => console.error('home cards:', e));
  for (const card of cards) {
    const saved = store.get(`nap:${card.dataset.band}`);
    for (const b of card.querySelectorAll('.napchips button')) b.setAttribute('aria-pressed', String(b.dataset.nap === saved));
    if (!card.querySelector('.napchips [aria-pressed="true"]')) card.querySelector('.napchips button')?.setAttribute('aria-pressed', 'true');
    for (const b of card.querySelectorAll('.napchips button')) {
      b.addEventListener('click', () => {
        store.set(`nap:${card.dataset.band}`, b.dataset.nap);
        show(card, b.dataset.nap, shiftNow()).catch((e) => console.error('home cards:', e));
      });
    }
  }
  const savedWake = store.get('wake');
  if (wake && [...wake.options].some((o) => o.value === savedWake)) wake.value = savedWake;
  wake?.addEventListener('change', () => {
    store.set('wake', wake.value);
    for (const c of cards) store.set(`wake:${c.dataset.band}`, wake.value);
    showAll(true);
  });
  showAll(false);
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
  const cards = [...document.querySelectorAll('.today[data-band]')];
  for (const row of cards) if (row.dataset.band === myAge) row.classList.add('mine');
  homeCards(cards, document.querySelector('[data-homewake]'));

  // Home: one age at a time in the days ahead, each day showing the nap pattern last chosen for that age.
  const ages = [...document.querySelectorAll('.agepick [data-age]')];
  const showAge = (age) => {
    for (const b of ages) b.setAttribute('aria-pressed', String(b.dataset.age === age));
    const nap = store.get(`nap:${age}`);
    for (const day of document.querySelectorAll('.dayrows li')) {
      const lines = [...day.querySelectorAll(`[data-band="${age}"]`)];
      const shown = lines.find((l) => l.dataset.nap === nap) ?? lines[0];
      for (const l of day.children) l.hidden = l !== shown;
    }
  };
  for (const b of ages) {
    b.addEventListener('click', () => {
      store.set('age', b.dataset.age);
      showAge(b.dataset.age);
      for (const row of document.querySelectorAll('.today[data-band]')) row.classList.toggle('mine', row.dataset.band === b.dataset.age);
    });
  }
  if (ages.some((b) => b.dataset.age === myAge)) showAge(myAge);

  // Home: tap a side of the Triangle to see what's on there today. It's remembered on this phone.
  const areas = [...document.querySelectorAll('.picker [data-area]')];
  const lists = document.querySelector('.nearlists');
  // On a wide screen the lists scroll in their own column beside the map; on a phone they sit under it.
  const listsScroll = () => lists && getComputedStyle(lists).overflowY !== 'visible';
  const showNear = (area) => {
    for (const list of document.querySelectorAll('[data-near]')) list.classList.toggle('on', list.dataset.near === area);
    if (lists) lists.scrollTop = 0;
  };
  const mark = (area) => {
    for (const b of areas) { b.setAttribute('aria-pressed', String(b.dataset.area === area)); b.classList.remove('touring'); }
  };
  const pick = (area) => { mark(area); showNear(area); };
  // The tour button: stopping leaves the side it was on showing (not remembered); starting
  // carries on from whichever side is showing.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tourbtn';
  const label = (on) => {
    toggle.innerHTML = on ? '<span aria-hidden="true">❚❚</span> Stop the tour' : '<span aria-hidden="true">▶</span> Tour the Triangle';
    toggle.classList.toggle('on', on);
  };
  const tour = areaTour(areas, showNear, label);
  label(false);
  toggle.addEventListener('click', () => {
    if (tour.running) { const area = tour.stop(); if (area) mark(area); return; }
    const showing = areas.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.area;
    mark(null);
    tour.start(showing);
  });
  if (areas.length) document.querySelector('.nearhead')?.append(toggle);
  for (const b of areas) {
    b.addEventListener('click', () => {
      tour.stop();
      store.set('area', b.dataset.area);
      pick(b.dataset.area);
      if (!listsScroll()) document.querySelector('.nearlist.on')?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'nearest' });
    });
  }
  if (areas.some((b) => b.dataset.area === store.get('area'))) pick(store.get('area'));
  else if (!still()) tour.start();

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
    wake?.addEventListener('change', () => { store.set(`wake:${band}`, wake.value); store.set('wake', wake.value); morph(strip, () => show(current)); });
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

// The day strips and the day's steps. Point at (or drag along) a strip for a card about that moment: what's on,
// from when to when, the forecast then, and sunrise or sunset near it. On today's plans a line marks now on the
// strip, and the step under way is marked in the list, the ones done greyed. Times are Raleigh's. ?at= (a local
// date and time) shows another moment, for checking.
document.addEventListener('DOMContentLoaded', () => {
  const strips = [...document.querySelectorAll('.strip[data-day]')];
  const lists = [...document.querySelectorAll('ol.timeline[data-date]')];
  if (!strips.length && !lists.length) return;
  const fmt = (m) => { const r = Math.round(m), h = Math.floor(r / 60) % 24, mm = r % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`; };
  const dataOf = (el) => { if (!el._day) el._day = JSON.parse(el.dataset.day); return el._day; };
  const text = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // What the strip shows at minute m.
  function moment(d, m) {
    const first = d.blocks[0], last = d.blocks[d.blocks.length - 1];
    let what, when = '', detail = '';
    if (m < first[0]) { what = 'Still asleep'; when = `Up at ${fmt(first[0])}`; }
    else if (m >= last[1]) { what = 'Asleep'; when = `In bed by ${fmt(last[1])}`; }
    else {
      const b = d.blocks.find((x) => m >= x[0] && m < x[1]) ?? last;
      what = b[3]; when = `${fmt(b[0])} to ${fmt(b[1])}`; detail = b[4];
    }
    const h = d.hours.find((x) => m >= x[0] && m < x[0] + 60);
    const sky = [];
    if (h) sky.push(`${h[1]}°F${h[2] >= 10 ? `, ${h[2]}% chance of rain` : ''}`);
    if (Math.abs(m - d.sun[0]) <= 20) sky.push(`Sunrise ${fmt(d.sun[0])}`);
    else if (Math.abs(m - d.sun[1]) <= 20) sky.push(`Sunset ${fmt(d.sun[1])}`);
    else if (m < d.sun[0] || m > d.sun[1]) sky.push('Dark out');
    return `<b class="tt">${fmt(m)}</b><strong>${text(what)}</strong>${when ? `<span>${text(when)}</span>` : ''}${detail ? `<span class="tdetail">${text(detail)}</span>` : ''}${sky.length ? `<span class="tsky">${text(sky.join(' · '))}</span>` : ''}`;
  }

  const tip = document.createElement('div');
  tip.className = 'striptip';
  tip.hidden = true;
  tip.setAttribute('role', 'status');
  document.body.append(tip);
  const hide = (strip) => { tip.hidden = true; strip.querySelector('.hoverline')?.remove(); };
  function point(strip, e) {
    const d = dataOf(strip), r = strip.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const m = d.from + f * (d.to - d.from);
    let line = strip.querySelector('.hoverline');
    if (!line) { line = document.createElement('i'); line.className = 'hoverline'; strip.append(line); }
    line.style.left = `${f * 100}%`;
    tip.innerHTML = moment(d, m);
    tip.hidden = false;
    // Over the strip, centred on the pointer, kept on the screen.
    const w = tip.offsetWidth, x = Math.min(innerWidth - w - 8, Math.max(8, e.clientX - w / 2));
    tip.style.left = `${x + scrollX}px`;
    tip.style.top = `${r.top + scrollY - tip.offsetHeight - 10}px`;
  }
  const wire = (s) => {
    s.addEventListener('pointermove', (e) => point(s, e));
    s.addEventListener('pointerdown', (e) => point(s, e));
    // A mouse leaving hides the card; a finger lifting leaves it up to read, until a tap somewhere else.
    s.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(s); });
  };
  strips.forEach(wire);
  // Strips added later (the home cards at another wake-up) get the same, and the Now line.
  document.addEventListener('strips', (e) => { for (const s of e.detail) { strips.push(s); wire(s); } mark(); });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.strip[data-day]')) for (const s of strips) hide(s); });

  // Now, in Raleigh.
  const q = new URLSearchParams(location.search);
  const at = Date.parse(q.get('at') ?? ''), loaded = Date.now();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function now() {
    const p = Object.fromEntries(parts.formatToParts(new Date(Number.isNaN(at) ? Date.now() : at + Date.now() - loaded)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, m: Number(p.hour) * 60 + Number(p.minute) };
  }
  function mark() {
    const n = now();
    for (const s of strips) {
      const d = dataOf(s);
      let line = s.querySelector('.nowline');
      if (d.date !== n.date || n.m < d.from || n.m > d.to) { line?.remove(); continue; }
      if (!line) { line = document.createElement('i'); line.className = 'nowline'; line.innerHTML = '<b>Now</b>'; s.append(line); }
      line.style.left = `${((n.m - d.from) / (d.to - d.from)) * 100}%`;
      line.classList.toggle('end', (n.m - d.from) / (d.to - d.from) > 0.9);
    }
    for (const ol of lists) {
      const today = ol.dataset.date === n.date;
      for (const li of ol.children) {
        const [s, e] = (li.dataset.m ?? '').split('-').map(Number);
        const on = today && n.m >= s && n.m < e;
        li.classList.toggle('past', today && n.m >= e);
        li.classList.toggle('now', on);
        if (on) li.style.setProperty('--done', `${Math.round(((n.m - s) / (e - s)) * 100)}%`);
      }
    }
  }
  mark();
  setInterval(mark, 30000);
});
