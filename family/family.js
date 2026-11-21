// The family page, in the browser. It reads the published plans from this site and works out the day here, with the
// same rule files the daily job runs (lib/, copied in by scripts/build-site.js). The family's details and saved plans
// belong to their account: they're loaded from it on sign-in and saved to it as they change (POST /v1/family/save),
// with a copy in this browser's storage so the page opens at once. Only our sync server gets them; Google Analytics
// gets none of it (ga() below).

import { AGE_BANDS } from './lib/src/plans/config.js';
import { clock, stopsOf } from './lib/src/plans/rules.js';
import { askedDay, NEAR_MIN, driveBetween, bandForMonths, bandsFor, dayAround, eventsOn, familyDay, homeFrom, kidsOn, MAX_FAMILY_DRIVE_MIN, monthsOld, patternTimes, savedStatus, swapsFor, laterFor, toCarry, toSaved, toWatch, dayFor, withPoints, useDrives, useHomeRow, tableStops, limitsFor, weekOf, useAdmissions, STRETCHES, DEFAULT_STRETCH } from './lib/src/family/plan.js';
import { makeLink } from './lib/src/family/link.js';
import { GROUPS, WEIGHTS, shares, cleanInterests, matchesFor, choicesFor } from './lib/src/family/interests.js';
import { typeOf, typeOfStop } from './lib/src/family/icons.js';
import { dayMap, tripLinks, useRoutes, useHomeRoads, TRIP_COLORS } from './lib/src/family/routemap.js';

// The local preview (scripts/preview-site.js) talks to a local sync server (scratch/family-dev.mjs) instead.
const API = location.hostname === 'localhost' ? 'http://localhost:7791' : 'https://sync.tottoolbox.com';
const K = { profile: 'family:profile', saved: 'family:saved', session: 'family:session', homeRow: 'family:homeRow' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const keep = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let profile = read(K.profile, { homeText: '', home: null, children: [] });
let saved = read(K.saved, []);
let session = read(K.session, null);
// Kept by the page before accounts kept it; the account has it now.
localStorage.removeItem('family:email');
let mapBase = '', formOpen = null, account = null, where = null, points = null, index = null, date = null, planRun = 0, files = [], day = null, swapping = false, accountMsg = '';

async function ask(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { session = null; localStorage.removeItem(K.session); account = null; headerAccount(); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'That didn’t go through. Check your connection and try again.'), { status: r.status });
  return j;
}
const dayLabel = (d, o) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });

// ---- Google Analytics ----
// The page's head loads Analytics (not the Ads tag). It's told a signed-in family's scrambled number, whether they're
// on a trial or paying, and what they did: signed in, went to checkout, came back with a plan. Nothing about the
// family itself: no profile, no address, no plans. The number is a hash of the account part of the session, which
// is itself a keyed hash of the address, so neither Google nor we can turn it back into anyone.
const ga = (...a) => { if (typeof window.gtag === 'function') window.gtag(...a); };
const PRICE = { month: 10, year: 100 };
async function gaUserId(s) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`triangletots-ga:${s.split('.')[0]}`)));
  return [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function gaWho() {
  if (!session) { ga('set', { user_id: null }); return; }
  ga('set', { user_id: await gaUserId(session) });
  if (account) ga('set', 'user_properties', { family_plan: !account.live ? 'none' : account.trialing ? 'trial' : 'paid' });
}
// Analytics' own numbers for this browser and visit, for the checkout: our server tells Analytics of the trial and the
// payments as Stripe reports them (apps/routines/sync/analytics.js), so they count for the visit that bought. null
// when Analytics isn't running (blocked, or off): then nothing is told.
async function gaIds() {
  const id = /[?&]id=(G-[A-Z0-9]+)/.exec(document.querySelector('script[src*="googletagmanager.com/gtag/js"]')?.src ?? '')?.[1];
  if (!id || typeof window.gtag !== 'function') return null;
  const get = (field) => new Promise((resolve) => { setTimeout(() => resolve(null), 800); ga('get', id, field, (v) => resolve(v ?? null)); });
  const [client, sid] = await Promise.all([get('client_id'), get('session_id')]);
  return client ? { client: String(client), ...(sid ? { session: String(sid) } : {}), ...(session ? { user: await gaUserId(session) } : {}) } : null;
}
const familyItem = (period) =>({ currency: 'USD', value: PRICE[period], items: [{ item_id: `triangle-tots-family-${period}`, item_name: 'Triangle Tots Family', price: PRICE[period] }] });

// ---- The account ----

const longDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const PERKS = [
  ['From your front door', 'Every outing shows the drive from your home, by road.'],
  ['Every child, every nap', 'Each child\'s wake-up, naps and bedtime. We only offer outings that fit all of them.'],
  ['Built around an event', 'Pick a storytime or a festival and the day is built around it.'],
  ['Swap, save and share', 'Swap an outing, save the days you like, and send them to Tot Routines.'],
];
const perksHtml = () => `<ul class="fa-perks">${PERKS.map(([t, s]) => `<li><strong>${esc(t)}</strong><span>${esc(s)}</span></li>`).join('')}</ul>`;
// Signed out: 'in' (email and password), 'new' (make an account) or 'forgot' (email me a code). `sentFor` is which
// one the emailed code is for: confirming a new account, or a forgotten password, after which `resetting` asks for
// a new password.
// Common misspellings of the big mail services, and what they likely meant: an address with one is asked about once.
const MAIL_TYPOS = {
  'gmail.com': ['gamil.com', 'gmial.com', 'gmai.com', 'gmal.com', 'gnail.com', 'gmaill.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmail.om', 'gmali.com', 'gmil.com', 'gimail.com'],
  'yahoo.com': ['yaho.com', 'yahooo.com', 'yhoo.com', 'yahoo.co', 'yahoo.con', 'yaoo.com'],
  'hotmail.com': ['hotmial.com', 'hotmal.com', 'hotmai.com', 'hotmail.co', 'hotmail.con', 'hormail.com'],
  'outlook.com': ['outlok.com', 'outloo.com', 'outlook.co', 'outlook.con', 'otlook.com'],
  'icloud.com': ['iclod.com', 'icloud.co', 'icloud.con', 'iclould.com', 'icoud.com'],
  'aol.com': ['aol.con', 'aol.co'],
};
const TYPO_FIX = new Map(Object.entries(MAIL_TYPOS).flatMap(([right, wrong]) => wrong.map((w) => [w, right])));
function meantEmail(address) {
  const at = address.lastIndexOf('@'), fix = at > 0 && TYPO_FIX.get(address.slice(at + 1).toLowerCase());
  return fix ? `${address.slice(0, at)}@${fix}` : null;
}
let warnedEmail = '';
let sentTo = '', sentFor = 'forgot', period = 'year', notice = null, mode = 'in', resetting = false, typedEmail = '';
const msgHtml = () => (accountMsg ? `<p class="fa-msg" role="status">${esc(accountMsg)}</p>` : '');
const whoHtml = () => `<p class="fa-who">${account?.email ? `Signed in as <strong>${esc(account.email)}</strong>` : 'Signed in'} <span aria-hidden="true">·</span> <button class="fa-link" id="fa-out">Sign out</button></p>`;

// A sign-in's answer (by link or by code): the session kept, and the family's things taken from the account.
// The header's account link (site.js sets it as the page loads): it follows a sign-in or sign-out here.
function headerAccount() {
  const a = document.querySelector('[data-acct]');
  if (a) a.textContent = session ? 'Your family' : 'Sign in';
}
function signedIn(r) {
  const { session: s, ...rest } = r;
  session = s;
  keep(K.session, session);
  headerAccount();
  sentTo = '';
  adopt(rest);
}

// The account's copy of the family wins. One that has none yet (a new account, or one from before accounts kept them)
// is given this device's. Saved plans from both are kept.
function adopt(a) {
  account = a;
  const local = profile.home || profile.children.length;
  if (a.profile) profile = a.profile;
  else if (local) push({ profile });
  keep(K.profile, profile);
  const ids = new Set((a.saved ?? []).map((s) => s.id));
  const extra = saved.filter((s) => !ids.has(s.id));
  saved = [...(a.saved ?? []), ...extra];
  keep(K.saved, saved);
  if (extra.length) push({ saved, app: appPlans() });
  // An exact home's drives, once the page knows the plan is live; the plan is worked out again with them.
  if (ready && exactHome(profile.home) && a.live) exactDrives().then(() => { renderProfile(); renderPlan(); });
}

// Saving to the account, a moment after the last change, so typing a name isn't a request a letter.
let pending = {}, pushTimer = null, syncMsg = '';
function push(what) {
  Object.assign(pending, what);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, 800);
}
async function flush() {
  clearTimeout(pushTimer);
  const body = pending;
  pending = {};
  if (!session || !Object.keys(body).length) return;
  try { await ask('/v1/family/save', { session, ...body }); if (syncMsg) { syncMsg = ''; renderProfile(); } } catch (err) {
    syncMsg = `Not saved to your account yet: ${err.message}`;
    pending = { ...body, ...pending };
    renderProfile();
  }
}
// A change still waiting goes before the page does.
addEventListener('pagehide', () => { if (session && Object.keys(pending).length) fetch(`${API}/v1/family/save`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ session, ...pending }) }); });

function renderAccount() {
  const box = $('fa-account');
  const banner = notice ? `<div class="fa-banner ${notice.kind}" role="status"><strong>${esc(notice.title)}</strong>${notice.text ? `<span>${esc(notice.text)}</span>` : ''}</div>` : '';
  if (!session && sentTo) {
    const confirming = sentFor === 'new';
    box.innerHTML = `<div class="fa-card fa-hero"><p class="fa-kicker">Almost there</p><h2>${confirming ? 'Confirm your email' : 'Check your email'}</h2>
<p>We sent a code to <strong>${esc(sentTo)}</strong>. Type it here, or tap the link in the email, ${confirming ? 'to finish making your account' : 'then choose a new password'}.</p>
<form id="fa-code" class="fa-login"><label class="fa-field">6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" placeholder="123456" required></label>
<button class="btn" type="submit">${confirming ? 'Confirm' : 'Sign in'}</button></form>
<p class="fa-note">It works once, for 15 minutes. Nothing there? Check your spam folder, or <button class="fa-link" id="fa-again">go back</button>${confirming ? ' to fix the address' : ''}.</p>${msgHtml()}</div>`;
    $('fa-again').onclick = () => { sentTo = ''; mode = confirming ? 'new' : 'in'; accountMsg = ''; renderAccount(); };
    $('fa-code').onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector('button[type=submit]');
      b.disabled = true;
      b.textContent = confirming ? 'Confirming…' : 'Signing in…';
      try {
        const r = await ask('/v1/family/verify', { email: sentTo, code: e.target.code.value });
        signedIn(r);
        accountMsg = '';
        resetting = !!r.reset;
        mode = 'in';
        await gaWho();
        ga('event', confirming ? 'sign_up' : 'login', { method: confirming ? 'password' : 'code' });
        render();
      } catch (err) { accountMsg = err.message; renderAccount(); }
    };
    return;
  }
  if (!session) {
    const emailField = `<label class="fa-field">Email<input name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(typedEmail)}" required></label>`;
    const hp = '<span class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></span>';
    const tabs = `<div class="fa-tabs" role="tablist"><button type="button" role="tab" class="fa-tab${mode === 'in' ? ' on' : ''}" aria-selected="${mode === 'in'}" data-mode="in">Sign in</button><button type="button" role="tab" class="fa-tab${mode === 'new' ? ' on' : ''}" aria-selected="${mode === 'new'}" data-mode="new">Create account</button></div>`;
    const form = mode === 'forgot'
      ? `<form id="fa-auth" class="fa-auth"><p class="fa-auth-lead">Type your email and we'll send a code to sign in and set a new password.</p>${emailField}${hp}
<button class="btn" type="submit">Email me a code</button><p class="fa-note"><button type="button" class="fa-link" data-mode="in">Back to sign in</button></p></form>`
      : `${tabs}<form id="fa-auth" class="fa-auth">${emailField}
<label class="fa-field">${mode === 'new' ? 'Choose a password' : 'Password'}<input name="password" type="password" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" minlength="${mode === 'new' ? 8 : 1}" required>${mode === 'new' ? '<span class="fa-hint">At least 8 characters.</span>' : ''}</label>${hp}
<button class="btn" type="submit">${mode === 'new' ? 'Create account' : 'Sign in'}</button>
${mode === 'in' ? '<p class="fa-note"><button type="button" class="fa-link" data-mode="forgot">Forgot password?</button></p>' : '<p class="fa-note">Your family\'s details are saved to your account, on every phone and computer you sign in on.</p>'}</form>`;
    box.innerHTML = `<div class="fa-card fa-hero"><p class="fa-kicker">Triangle Tots Family</p><h2>Plans made for your family</h2>
<p>Start from your home, fit every child's naps, and build the day around the event you want.</p>
<p class="fa-price"><b>14 days free</b>, then $${PRICE.month} a month or $${PRICE.year} a year. Cancel any time.</p>
${perksHtml()}<div class="fa-authbox">${form}${msgHtml()}</div></div>`;
    for (const t of box.querySelectorAll('[data-mode]')) t.onclick = () => { typedEmail = box.querySelector('input[name=email]').value.trim(); mode = t.dataset.mode; accountMsg = ''; renderAccount(); };
    $('fa-auth').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, b = f.querySelector('button[type=submit]'), address = f.email.value.trim();
      typedEmail = address;
      // A misspelled mail service is asked about once (2026-11-10: the owner's code went to @gamil.com and bounced).
      const meant = meantEmail(address);
      if (meant && warnedEmail !== address) {
        warnedEmail = address;
        accountMsg = `Did you mean ${meant}? Fix the address, or tap the button again to use ${address} as typed.`;
        return renderAccount();
      }
      b.disabled = true;
      b.textContent = mode === 'forgot' ? 'Sending…' : mode === 'new' ? 'Creating your account…' : 'Signing in…';
      try {
        if (mode === 'forgot') {
          await ask('/v1/family/login', { email: address, website: f.website.value });
          sentTo = address;
          sentFor = 'forgot';
        } else if (mode === 'new') {
          // Nothing is made until the address is confirmed with the emailed code or link.
          const r = await ask('/v1/family/signup', { email: address, password: f.password.value, website: f.website.value });
          if (r.confirm) { sentTo = address; sentFor = 'new'; }
        } else {
          const r = await ask('/v1/family/signin', { email: address, password: f.password.value, website: f.website.value });
          signedIn(r);
          await gaWho();
          ga('event', 'login', { method: 'password' });
          mode = 'in';
          accountMsg = '';
          return render();
        }
        accountMsg = '';
      } catch (err) {
        accountMsg = err.message;
        // An address with an account already: go to sign in, keeping what was typed.
        if (err.status === 409 && mode === 'new') mode = 'in';
      }
      renderAccount();
      // The code card is shorter than the form was: on a phone it would sit above the screen.
      if (sentTo) box.scrollIntoView({ block: 'start' });
    };
    return;
  }
  if (!account) { box.innerHTML = `${banner}<div class="fa-card fa-loading" aria-busy="true"><span class="fa-spin" aria-hidden="true"></span> Checking your plan…</div>`; return; }
  // Signed in by email (forgot password), or an account from before passwords: choose one now.
  if (resetting || !account.hasPassword) {
    box.innerHTML = `${banner}<div class="fa-card fa-hero"><p class="fa-kicker">${account.hasPassword ? 'Forgot password' : 'One more step'}</p><h2>${account.hasPassword ? 'Choose a new password' : 'Choose a password'}</h2>
<p>Next time, sign in with <strong>${esc(account.email || 'your email')}</strong> and this password. No email needed.</p>
<form id="fa-pass" class="fa-auth"><input type="email" name="email" autocomplete="username" value="${esc(account.email || '')}" hidden>
<label class="fa-field">New password<input name="password" type="password" autocomplete="new-password" minlength="8" required><span class="fa-hint">At least 8 characters.</span></label>
<button class="btn" type="submit">Save password</button></form>${msgHtml()}${whoHtml()}</div>`;
    $('fa-pass').onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector('button[type=submit]');
      b.disabled = true;
      b.textContent = 'Saving…';
      try {
        account = await ask('/v1/family/password', { session, password: e.target.password.value });
        resetting = false;
        accountMsg = '';
        notice = { kind: 'calm', title: 'Password saved.', text: 'Use it to sign in on any phone or computer.' };
      } catch (err) { accountMsg = err.message; }
      renderAccount();
    };
    $('fa-out').onclick = async () => { await ask('/v1/family/logout', { session }).catch(() => {}); signedOut(); };
    return;
  }
  if (!account.live) {
    const trial = account.trialDays;
    const plan = (p, name, price, per, extra) => `<label class="fa-plan${period === p ? ' on' : ''}"><input type="radio" name="period" value="${p}"${period === p ? ' checked' : ''}>
<span class="fa-plan-name">${name}${extra ? ` <span class="fa-tag">${extra}</span>` : ''}</span><span class="fa-plan-price"><b>${price}</b> ${per}</span>
<span class="fa-plan-sub">${p === 'year' ? 'Works out to $8.33 a month' : 'Billed monthly'}</span></label>`;
    const price = period === 'year' ? '$100 a year' : '$10 a month';
    const today = trial ? `<div class="fa-due"><span>Due today</span><b>$0.00</b></div><p class="fa-note">Then ${price}, starting ${longDate(Date.now() + trial * 864e5)}, until you cancel. Cancel before then and you won't pay anything.</p>`
      : `<p class="fa-note">${price}, renewing until you cancel.</p>`;
    box.innerHTML = `${banner}<div class="fa-card fa-hero"><p class="fa-kicker">${trial ? `${trial} days free` : 'Welcome back'}</p><h2>${trial ? 'Start your free trial' : 'Pick your plan'}</h2>
${perksHtml()}
<fieldset class="fa-plans"${account.selling ? '' : ' disabled'}><legend>Choose how to pay</legend>${plan('year', 'Yearly', '$100', 'a year', 'Save $20')}${plan('month', 'Monthly', '$10', 'a month')}</fieldset>
${account.selling ? `${today}<button class="btn big fa-go" id="fa-buy">${trial ? `Start my ${trial}-day free trial` : 'Continue to payment'}</button>
<p class="fa-fine">Secure checkout by Stripe. Includes Tot Toolbox Supporter for up to 4 phones. By starting, you agree to our <a href="/terms/#s5">terms</a>.</p>` : '<p class="fa-note">Family plans aren\'t on sale yet.</p>'}${msgHtml()}
${whoHtml()}</div>`;
    for (const r of box.querySelectorAll('input[name=period]')) r.onchange = () => { period = r.value; renderAccount(); };
    const buy = $('fa-buy');
    if (buy) buy.onclick = async () => {
      buy.disabled = true;
      buy.textContent = 'Opening checkout…';
      ga('event', 'begin_checkout', familyItem(period));
      try { location.href = (await ask('/v1/family/checkout', { session, period, ga: await gaIds() })).url; } catch (err) { accountMsg = err.message; renderAccount(); }
    };
  } else {
    const until = account.until ? longDate(account.until) : '';
    const price = account.period === 'year' ? '$100 a year' : '$10 a month';
    const [badge, line] = account.trialing ? ['Free trial', account.renews ? `Free until ${until}, then ${price}.` : `Your trial ends ${until}, and you won't be charged.`]
      : account.renews ? ['Family plan', `${price}. Renews ${until}.`] : ['Family plan', `Ends ${until}. It won't renew.`];
    box.innerHTML = `${banner}<div class="fa-card fa-member"><div class="fa-member-head"><span class="fa-badge">${badge}</span><span>${esc(line)}</span></div>
${msgHtml()}<div class="fa-member-foot">${whoHtml()}<span class="fa-member-links">${account.manage ? '<button class="fa-link" id="fa-manage">Manage or cancel</button>' : ''}<button class="fa-link fa-quiet" id="fa-del">Delete account</button></span></div></div>`;
    if (account.manage) $('fa-manage').onclick = async () => { try { location.href = (await ask('/v1/family/manage', { session })).url; } catch (err) { accountMsg = err.message; renderAccount(); } };
    $('fa-del').onclick = async () => {
      if (!confirm('Delete your account? Your family details and saved plans are deleted with it.')) return;
      try { await ask('/v1/family/delete', { session }); signedOut(); } catch (err) { accountMsg = err.message; renderAccount(); }
    };
  }
  $('fa-out').onclick = async () => {
    await flush();
    if (Object.keys(pending).length && !confirm('Your last changes haven\'t saved to your account yet. Sign out anyway and lose them?')) return;
    await ask('/v1/family/logout', { session }).catch(() => {}); signedOut(); };
}
// Signing out takes the family's things off this device too: they're on the account, for the next sign-in.
function signedOut() {
  session = null; account = null; accountMsg = ''; notice = null; sentTo = ''; mode = 'in'; resetting = false;
  headerAccount();
  clearTimeout(pushTimer);
  pending = {};
  profile = { homeText: '', home: null, children: [] };
  saved = [];
  formOpen = null;
  for (const k of Object.values(K)) localStorage.removeItem(k);
  gaWho();
  render();
}

// ---- The family ----

const newKid = () => {
  const band = AGE_BANDS[1], times = patternTimes(band, band.naps[0].id, '07:00');
  return { id: Math.random().toString(36).slice(2, 10), name: '', born: '', pattern: band.naps[0].id, ...times };
};
const hasNapFields = (c) => (c.naps ?? []).length;

// "10 months old", "1 year old", "1 year, 10 months old".
function ageText(months) {
  const y = Math.floor(months / 12), m = months % 12, s = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `${[y ? s(y, 'year') : '', m || !y ? s(m, 'month') : ''].filter(Boolean).join(', ')} old`;
}
// Why a child with a birth month isn't in the plan, or '' when they are (or no month is typed yet).
function ageProblem(c, on) {
  if (!c.born || !on) return '';
  const months = monthsOld(c.born, on), who = c.name || 'This child';
  if (months < 0) return `${who}'s birth month is after this day. Check the year.`;
  if (months < 12) return `${who} is ${ageText(months)}, and plans start at 12 months. If that's not right, check the year.`;
  if (months >= 72) return `${who} is ${ageText(months)}. Plans are made for ages 1 to 5. If that's not right, check the year.`;
  return '';
}

// ---- A child: a card in the family, and a window to add or change one ----

const PALETTE = ['#1d6fb8', '#d0592a', '#2e8b57', '#7a4cb0', '#c23b6e', '#b8860b', '#0f8a8a', '#5b6b7c'];
const weightLabel = (w) => WEIGHTS.find((x) => x.value === w)?.label ?? '';
const WEIGHT_MARK = { 1: '♥', 2: '♥♥', 3: '★' };

// One child as the family card shows them: name, age, sleep, and what they love most.
function kidCard(c, i) {
  const today = index?.days[0]?.date;
  const months = c.born && today ? monthsOld(c.born, today) : null;
  const problem = ageProblem(c, today);
  const top = shares(c.interests).slice(0, 4);
  const sleep = `Up ${clock(c.wake)}, ${(c.naps ?? []).length ? (c.naps.map(([a, b]) => `nap ${clock(a)}–${clock(b)}`).join(', ')) : 'no nap'}, asleep by ${clock(c.bed)}`;
  return `<div class="fa-kid-card" data-i="${i}">
<span class="fa-avatar" style="background:${PALETTE[i % PALETTE.length]}" aria-hidden="true">${esc((c.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
<div class="fa-kid-body"><strong>${esc(c.name || `Child ${i + 1}`)}</strong>
${problem ? `<p class="fa-bad">${esc(problem)}</p>` : months !== null ? `<p class="fa-note">${esc(ageText(months))}</p>` : '<p class="fa-bad">Add a birth month.</p>'}
<p class="fa-note">${esc(sleep)}</p>
${top.length ? `<ul class="fa-chips-mini">${top.map((t) => `<li>${t.emoji} ${esc(t.label)}${t.weight === 3 ? ' <span aria-label="top favorite">★</span>' : ''}</li>`).join('')}</ul>` : '<p class="fa-note">No interests picked yet.</p>'}
${timesProblem(c) ? `<p class="fa-bad">${esc(timesProblem(c))}</p>` : ''}</div>
<button class="btn fa-small fa-edit" type="button" data-edit="${i}">Edit</button></div>`;
}

// A grown-up as the family card shows them: name and what they enjoy.
function grownCard(g, i) {
  const top = shares(g.interests).slice(0, 4);
  return `<div class="fa-kid-card" data-g="${i}">
<span class="fa-avatar fa-avatar-grown" aria-hidden="true">${esc((g.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
<div class="fa-kid-body"><strong>${esc(g.name || `Grown-up ${i + 1}`)}</strong>
${top.length ? `<ul class="fa-chips-mini">${top.map((t) => `<li>${t.emoji} ${esc(t.label)}${t.weight === 3 ? ' <span aria-label="top favorite">★</span>' : ''}</li>`).join('')}</ul>` : '<p class="fa-note">Nothing picked yet.</p>'}</div>
<button class="btn fa-small fa-edit" type="button" data-edit-grown="${i}">Edit</button></div>`;
}

// The window works for a child or a grown-up: `draftWho` says which ('kids' or 'grown').
let draft = null, draftIndex = -1, draftWho = 'kids';
function kidDialog() {
  let d = $('fa-kid-dialog');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'fa-kid-dialog';
    d.className = 'fa-dialog';
    d.setAttribute('aria-labelledby', 'fa-kid-title');
    document.body.append(d);
    d.addEventListener('cancel', () => { draft = null; });
    // A tap on the dimmed page outside closes it, as Cancel.
    d.addEventListener('click', (e) => { if (e.target === d) { draft = null; d.close(); } });
  }
  return d;
}

/** Add a child (`i` -1) or change one: the window works on a copy, kept only with Save. */
function openKid(i) {
  draftIndex = i;
  draftWho = 'kids';
  draft = i < 0 ? newKid() : JSON.parse(JSON.stringify(profile.children[i]));
  draft.interests ??= {};
  const d = kidDialog();
  d.innerHTML = `<form method="dialog" class="fa-dialog-inner" id="fa-kid-form">
<header class="fa-dialog-head"><div><p class="fa-kicker">${i < 0 ? 'New child' : 'Your child'}</p><h2 id="fa-kid-title">${i < 0 ? 'Add a child' : `Edit ${esc(draft.name || 'your child')}`}</h2></div>
<button type="button" class="fa-x" id="fa-kid-close" aria-label="Close">×</button></header>
<div class="fa-dialog-body">
<section class="fa-sec"><h3>About</h3>
<div class="fa-row"><label class="fa-field">Name<input data-k="name" value="${esc(draft.name)}" autocomplete="off" placeholder="Optional"></label>
<label class="fa-field">Born<input type="month" data-k="born" value="${esc(draft.born)}"></label></div>
<p id="fa-kid-age"></p></section>
<section class="fa-sec"><h3>Sleep</h3><div id="fa-kid-sleep"></div></section>
<section class="fa-sec"><h3>What ${esc(draft.name || 'they')} love${draft.name ? 's' : ''}</h3>
<p class="fa-note">Tap once for <b>♥ Likes</b>, again for <b>♥♥ Loves</b>, again for <b>★ Top favorite</b>, and once more to clear. We plan around the favorites first.</p>
<div id="fa-kid-picks"></div></section>
<section class="fa-sec fa-priority-sec"><h3>Priority</h3><div id="fa-kid-priority"></div></section>
</div>
<footer class="fa-dialog-foot">${i < 0 ? '' : '<button type="button" class="fa-link fa-quiet" id="fa-kid-remove">Remove child</button>'}
<span class="fa-spacer"></span><button type="button" class="fa-link" id="fa-kid-cancel">Cancel</button><button type="submit" class="btn" id="fa-kid-save">${i < 0 ? 'Add child' : 'Save'}</button></footer></form>`;
  const form = $('fa-kid-form');
  for (const el of form.querySelectorAll('.fa-sec:first-child [data-k]')) {
    el.oninput = el.onchange = () => {
      applyKid(draft, el.dataset.k, el.value);
      if (el.dataset.k === 'born') { kidAge(); kidSleep(); }
      if (el.dataset.k === 'name') $('fa-kid-title').textContent = draftIndex < 0 ? 'Add a child' : `Edit ${draft.name || 'your child'}`;
    };
  }
  const close = () => { draft = null; d.close(); };
  $('fa-kid-close').onclick = close;
  $('fa-kid-cancel').onclick = close;
  const rm = $('fa-kid-remove');
  if (rm) rm.onclick = () => {
    if (!confirm(`Remove ${profile.children[draftIndex].name || 'this child'} from your family?`)) return;
    profile.children.splice(draftIndex, 1);
    saveProfile();
    close();
    renderProfile();
    renderPlan();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const problem = timesProblem(draft);
    if (problem) { $('fa-kid-times').hidden = false; $('fa-kid-times').scrollIntoView({ block: 'center' }); return; }
    draft.interests = cleanInterests(draft.interests);
    if (draftIndex < 0) ga('event', 'add_kid');
    if (draftIndex < 0) profile.children.push(draft); else profile.children[draftIndex] = draft;
    saveProfile();
    close();
    renderProfile();
    renderPlan();
  };
  kidAge(); kidSleep(); kidPicks();
  d.showModal();
  d.querySelector('.fa-dialog-body').scrollTop = 0;
  if (i < 0) form.querySelector('[data-k=name]').focus();
}

/**
 * Add a grown-up (`i` -1) or change one: a name and what they enjoy. The children come first in every plan; what the
 * grown-ups enjoy counts at half (GROWN_SHARE in interests.js) and tips the close calls.
 */
function openGrown(i) {
  draftIndex = i;
  draftWho = 'grown';
  profile.parents ??= [];
  draft = i < 0 ? { id: Math.random().toString(36).slice(2, 10), name: '', interests: {} } : JSON.parse(JSON.stringify(profile.parents[i]));
  draft.interests ??= {};
  const d = kidDialog();
  const title = () => (draftIndex < 0 ? 'Add a grown-up' : `Edit ${draft.name || 'grown-up'}`);
  d.innerHTML = `<form method="dialog" class="fa-dialog-inner" id="fa-kid-form">
<header class="fa-dialog-head"><div><p class="fa-kicker">${i < 0 ? 'New grown-up' : 'Grown-up'}</p><h2 id="fa-kid-title">${esc(title())}</h2></div>
<button type="button" class="fa-x" id="fa-kid-close" aria-label="Close">×</button></header>
<div class="fa-dialog-body">
<section class="fa-sec"><h3>About</h3>
<label class="fa-field">Name<input data-k="name" value="${esc(draft.name)}" autocomplete="off" placeholder="Mom, Dad, Grandma…"></label>
<p class="fa-note">The day is planned for the children first. What you enjoy counts too, at half as much, so when two outings suit them equally, we pick the one you'll like.</p></section>
<section class="fa-sec"><h3>What ${esc(draft.name || 'you')} enjoy${draft.name ? 's' : ''}</h3>
<p class="fa-note">Tap once for <b>♥ Likes</b>, again for <b>♥♥ Loves</b>, again for <b>★ Top favorite</b>, and once more to clear.</p>
<div id="fa-kid-picks"></div></section>
<section class="fa-sec fa-priority-sec"><h3>Priority</h3><div id="fa-kid-priority"></div></section>
</div>
<footer class="fa-dialog-foot">${i < 0 ? '' : '<button type="button" class="fa-link fa-quiet" id="fa-kid-remove">Remove</button>'}
<span class="fa-spacer"></span><button type="button" class="fa-link" id="fa-kid-cancel">Cancel</button><button type="submit" class="btn" id="fa-kid-save">${i < 0 ? 'Add' : 'Save'}</button></footer></form>`;
  const form = $('fa-kid-form');
  const name = form.querySelector('[data-k=name]');
  name.oninput = () => { draft.name = name.value; $('fa-kid-title').textContent = title(); };
  const close = () => { draft = null; d.close(); };
  $('fa-kid-close').onclick = close;
  $('fa-kid-cancel').onclick = close;
  const rm = $('fa-kid-remove');
  if (rm) rm.onclick = () => {
    if (!confirm(`Remove ${profile.parents[draftIndex].name || 'this grown-up'}?`)) return;
    profile.parents.splice(draftIndex, 1);
    saveProfile();
    close();
    renderProfile();
    renderPlan();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    draft.name = draft.name.trim();
    draft.interests = cleanInterests(draft.interests);
    if (draftIndex < 0) ga('event', 'add_grownup');
    if (draftIndex < 0) profile.parents.push(draft); else profile.parents[draftIndex] = draft;
    saveProfile();
    close();
    renderProfile();
    renderPlan();
  };
  kidPicks();
  d.showModal();
  d.querySelector('.fa-dialog-body').scrollTop = 0;
  if (i < 0) name.focus();
}

function kidAge() {
  const today = index?.days[0]?.date, c = draft;
  const problem = ageProblem(c, today);
  const el = $('fa-kid-age');
  el.className = problem ? 'fa-bad' : 'fa-note';
  el.textContent = problem || (c.born && today ? `${ageText(monthsOld(c.born, today))}.` : 'Plans are made for ages 1 to 5.');
}

function kidSleep() {
  const c = draft, today = index?.days[0]?.date;
  const band = c.born && today ? bandForMonths(monthsOld(c.born, today)) : null;
  const nap = (j, label) => `<div class="fa-row"><label class="fa-field">${label} starts<input type="time" data-k="nap${j}a" value="${esc(c.naps[j][0])}"></label><label class="fa-field">Ends<input type="time" data-k="nap${j}b" value="${esc(c.naps[j][1])}"></label></div>`;
  const box = $('fa-kid-sleep');
  box.innerHTML = `${band ? `<label class="fa-field">Usual day<select data-k="pattern">${band.naps.map((n) => `<option value="${n.id}"${n.id === c.pattern ? ' selected' : ''}>${esc(n.label)}</option>`).join('')}</select></label>` : ''}
<div class="fa-row"><label class="fa-field">Up at<input type="time" data-k="wake" value="${esc(c.wake)}"></label><label class="fa-field">Asleep by<input type="time" data-k="bed" value="${esc(c.bed)}"></label></div>
${hasNapFields(c) ? c.naps.map((_, j) => nap(j, c.naps.length > 1 ? `Nap ${j + 1}` : 'Nap')).join('') : ''}
<p class="fa-bad" id="fa-kid-times" role="status"${timesProblem(c) ? '' : ' hidden'}>${esc(timesProblem(c))}</p>`;
  for (const el of box.querySelectorAll('[data-k]')) {
    el.onchange = () => {
      if (applyKid(c, el.dataset.k, el.value)) return kidSleep();
      const note = $('fa-kid-times');
      note.textContent = timesProblem(c);
      note.hidden = !note.textContent;
    };
  }
}

// The interests by group, each a chip that steps through the weights.
function kidPicks() {
  const picks = draft.interests, offered = choicesFor(draftWho);
  $('fa-kid-picks').innerHTML = GROUPS.filter((g) => offered.some((c) => c.group === g.id)).map((g) => `<fieldset class="fa-group"><legend>${esc(g.label)}</legend><div class="fa-chips">${offered.filter((c) => c.group === g.id).map((c) => {
    const w = picks[c.id] ?? 0;
    return `<button type="button" class="fa-chip w${w}" data-pick="${c.id}" aria-pressed="${w > 0}" aria-label="${esc(c.label)}${w ? `: ${weightLabel(w)}` : ''}"><span class="fa-chip-emoji" aria-hidden="true">${c.emoji}</span>${esc(c.label)}${w ? `<span class="fa-chip-w" aria-hidden="true">${WEIGHT_MARK[w]}</span>` : ''}</button>`;
  }).join('')}</div></fieldset>`).join('');
  for (const b of $('fa-kid-picks').querySelectorAll('[data-pick]')) {
    b.onclick = () => {
      const id = b.dataset.pick, next = ((picks[id] ?? 0) + 1) % 4;
      if (next) picks[id] = next; else delete picks[id];
      const keep = $('fa-kid-picks').closest('.fa-dialog-body').scrollTop;
      kidPicks();
      $('fa-kid-picks').closest('.fa-dialog-body').scrollTop = keep;
      $(`fa-kid-picks`).querySelector(`[data-pick="${id}"]`)?.focus();
    };
  }
  kidPriority();
}

// How the picks share the planning: a bar, and each pick with its weight to change or clear.
function kidPriority() {
  const list = shares(draft.interests);
  const box = $('fa-kid-priority');
  if (!list.length) { box.innerHTML = '<p class="fa-note">Pick a few interests above, and you\'ll see here how much each one counts when we choose outings.</p>'; return; }
  box.innerHTML = `<p class="fa-note">How much each counts when we choose an outing. Raise or lower one to share it out differently.</p>
<div class="fa-share-bar" role="img" aria-label="${esc(list.map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(', '))}">${list.map((x, i) => `<span style="width:${(x.share * 100).toFixed(2)}%;background:${PALETTE[i % PALETTE.length]}" title="${esc(x.label)}"></span>`).join('')}</div>
<ul class="fa-shares">${list.map((x, i) => `<li><span class="fa-dot" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="fa-share-name">${x.emoji} ${esc(x.label)}</span><span class="fa-share-pct">${Math.round(x.share * 100)}%</span>
<span class="fa-seg" role="group" aria-label="${esc(x.label)}">${WEIGHTS.map((w) => `<button type="button" data-w="${x.id}:${w.value}" aria-pressed="${x.weight === w.value}">${WEIGHT_MARK[w.value]}<span class="fa-seg-label"> ${w.label}</span></button>`).join('')}</span>
<button type="button" class="fa-x fa-x-small" data-clear="${x.id}" aria-label="Clear ${esc(x.label)}">×</button></li>`).join('')}</ul>`;
  for (const b of box.querySelectorAll('[data-w]')) b.onclick = () => { const [id, w] = b.dataset.w.split(':'); draft.interests[id] = Number(w); kidPicks(); };
  for (const b of box.querySelectorAll('[data-clear]')) b.onclick = () => { delete draft.interests[b.dataset.clear]; kidPicks(); };
}
// A time typed as PM for AM (a nap at 11:30 PM) would plan a strange day: said, beside the times.
function timesProblem(c) {
  if (!(c.wake < c.bed)) return 'Asleep by has to be after Up at. Check AM and PM.';
  for (const [a, b] of c.naps ?? []) {
    if (!(c.wake < a && a < b && b < c.bed)) return 'Each nap has to start after Up at and end before Asleep by. Check AM and PM.';
  }
  return '';
}

function saveProfile() { keep(K.profile, profile); push({ profile }); }

// How far and how much: blank is no limit. The weeks run Monday to Sunday and count the days saved in them.
function limitsForm() {
  const l = profile.limits ?? {};
  const num = (k, label, hint) => `<label class="fa-field">${label}<input type="number" inputmode="decimal" min="0" step="1" data-limit="${k}" value="${esc(l[k] ?? '')}" placeholder="No limit"><span class="fa-hint">${hint}</span></label>`;
  return `<fieldset class="fa-limits"><legend>Driving and spending</legend>
<p class="fa-note">Leave a box blank for no limit. A week is Monday to Sunday, and counts the days you save.</p>
<div class="fa-row">${num('dayMiles', 'Most miles in a day', 'Every drive, there and back.')}${num('weekMiles', 'Most miles in a week', 'Across the days you save.')}</div>
<div class="fa-row">${num('weekDollars', 'Spend on outings each week ($)', 'With room to spend, we pick paid outings first: museums and classes are often the best of the week.')}
<label class="fa-field">Grown-ups going<select data-limit="adults">${[1, 2, 3, 4].map((n) => `<option value="${n}"${(l.adults ?? Math.max(1, (profile.parents ?? []).length)) === n ? ' selected' : ''}>${n}</option>`).join('')}</select><span class="fa-hint">For tickets priced per person.</span></label></div>
<label class="fa-field">Move naps and bedtime for something special<select data-limit="stretch">${STRETCHES.map((n) => `<option value="${n}"${(l.stretch ?? DEFAULT_STRETCH) === n ? ' selected' : ''}>${n ? `Up to ${minsWord(n)}` : 'Never'}</option>`).join('')}</select>
<span class="fa-hint">Only for an event you pick, a child's Top favorite, or a one-off like a festival. We always say what moved.</span></label></fieldset>`;
}

// ---- An exact home ----
// A street address is found by our server (which asks the U.S. Census Bureau's free address lookup), and the drive from
// it, or from the phone's location, to each of the day's stops comes from our own road router. Those drives are for one
// morning's drive table, so they're asked again when it changes, and kept in this browser until then.
const STREET = /^\s*\d+[A-Za-z]?\s+[A-Za-z]/;
const exactHome = (h) => h?.how === 'address' || h?.how === 'device';
let driveTable = null, homeMsg = '';
const homeKey = (h) => `${driveTable.made}|${h.lat},${h.lon}`;
function homeNote() {
  if (homeMsg) return homeMsg;
  const h = profile.home;
  if (!h) return '';
  if (!exactHome(h)) return `Starting from ${h.label}. For drive times from your door, type your street address.`;
  return `Starting from ${h.label}.${driveTable && homeRowFor(h) ? ' Drive times are from your door.' : ''}`;
}
const homeRowFor = (h) => read(K.homeRow, null)?.key === homeKey(h);
async function askHome(body) {
  if (!driveTable) throw new Error('Drive times aren\'t ready on this page. Use your ZIP for now.');
  return ask('/v1/family/home', { session, ...body, to: tableStops(), within: MAX_FAMILY_DRIVE_MIN });
}
function useHomeDrives(r) {
  const h = { lat: r.lat, lon: r.lon };
  keep(K.homeRow, { key: homeKey(h), minutes: r.minutes, miles: r.miles, roads: r.roads });
  useHomeRoads(useHomeRow(h, r.minutes, r.miles), r.roads, driveTable.to);
}
// On arrival: the home's drives for this morning's table, from this browser if it has them, or asked again.
async function exactDrives() {
  const h = profile.home;
  if (!exactHome(h) || !driveTable || !account?.live) return;
  const kept = read(K.homeRow, null);
  // One kept from before the server sent miles is asked again, so the day's miles are the router's.
  if (kept?.key === homeKey(h) && kept.miles) { useHomeRoads(useHomeRow(h, kept.minutes, kept.miles), kept.roads, driveTable.to); return; }
  try { useHomeDrives({ ...h, ...(await askHome({ at: [h.lat, h.lon] })) }); } catch (err) {
    homeMsg = `Drive times are from the nearest town for now. ${err.message}`;
  }
}

function applyKid(c, k, v) {
  if (k === 'pattern' || k === 'born') {
    if (k === 'born') c.born = v;
    const band = c.born && index ? bandForMonths(monthsOld(c.born, index.days[0].date)) : null;
    if (band) {
      c.pattern = k === 'pattern' ? v : band.naps.some((n) => n.id === c.pattern) ? c.pattern : band.naps[0].id;
      Object.assign(c, patternTimes(band, c.pattern, c.wake));
    }
    return true;
  }
  const m = /^nap(\d)([ab])$/.exec(k);
  if (m) c.naps[Number(m[1])][m[2] === 'a' ? 0 : 1] = v;
  else c[k] = v;
  return false;
}

// A member without a plan (signed in, not paying) can still say where they live: a ZIP or town, or this phone's
// location, saved to the account. Drive times from their door (a street address, or the phone) come with the plan, so
// those two show the sign-up instead of asking the server, which would refuse.
function memberNote() {
  const h = profile.home;
  if (homeMsg) return homeMsg;
  if (!h) return '';
  return exactHome(h) ? `Saved: ${h.label}.` : `Starting from ${h.label}.`;
}
function renderMemberHome(box) {
  box.hidden = false;
  const offer = account.selling ? `<div class="fa-upsell"><strong>Want real drive times?</strong>
<p>The plan works out the drive by road from your own door to every stop, so each day fits the nap. ${account.trialDays ? `It starts with ${account.trialDays} days free.` : ''}</p>
<button class="btn" type="button" id="fa-drives">${account.trialDays ? 'Start my free trial' : 'See the plan'}</button></div>` : '';
  box.innerHTML = `<div class="fa-card" id="fa-where"><h2>Where you live</h2>
<p class="fa-note">Saved to your account, so it's here on any phone or computer you sign in on.</p>
<label class="fa-field">ZIP or town<input id="fa-home" value="${esc(profile.homeText)}" autocomplete="postal-code" placeholder="27511 or Cary"></label>
<div class="fa-buttons"><button class="fa-link" type="button" id="fa-locate">Use this phone's location</button></div>
<p class="fa-note" id="fa-home-note">${esc(memberNote())}</p>${offer}</div>`;
  const toPlan = () => { $('fa-account').scrollIntoView({ behavior: 'smooth', block: 'start' }); ga('event', 'drive_times_offer'); };
  const go = $('fa-drives');
  if (go) go.onclick = toPlan;
  $('fa-home').onchange = (e) => {
    const text = e.target.value.trim();
    profile.homeText = text;
    homeMsg = '';
    if (STREET.test(text)) {
      // Not looked up: that takes the plan. Kept as typed, so it's the home once they have one.
      profile.home = null;
      homeMsg = 'A street address gives drive times from your door. That comes with the plan, below. For now, type your ZIP or town.';
    } else {
      profile.home = homeFrom(text, where);
      if (!profile.home && text) homeMsg = 'We don\'t know that place. Try your ZIP or town.';
    }
    saveProfile();
    $('fa-home-note').textContent = memberNote();
  };
  $('fa-locate').onclick = () => navigator.geolocation.getCurrentPosition((p) => {
    profile.home = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), label: 'this phone\'s location', how: 'device' };
    profile.homeText = '';
    homeMsg = '';
    saveProfile();
    $('fa-home-note').textContent = `${memberNote()} Drive times from here come with the plan.`;
    $('fa-home').value = '';
  }, () => { $('fa-home-note').textContent = 'That didn\'t work. Type your ZIP or town instead.'; });
}

function renderProfile() {
  if (!ready) return;
  const box = $('fa-profile');
  if (account && !account.live) return renderMemberHome(box);
  box.hidden = !account?.live;
  if (box.hidden) return;
  // Folded on arrival when it's filled in; after that, as the parent left it, so adding a second child doesn't hide the form.
  formOpen ??= !(profile.home && profile.children.length);
  box.innerHTML = `<details class="fa-card" id="fa-form"${formOpen ? ' open' : ''}><summary><h2>Your family</h2></summary><p class="fa-note">Saved to your account, so it's here on any phone or computer you sign in on.</p>${syncMsg ? `<p class="fa-bad" role="status">${esc(syncMsg)}</p>` : ''}
<label class="fa-field">Home address<input id="fa-home" value="${esc(profile.homeText)}" autocomplete="street-address" placeholder="123 Oak St, Cary"></label>
<div class="fa-buttons"><button class="fa-link" type="button" id="fa-locate">Use this phone's location</button></div>
<p class="fa-note" id="fa-home-note">${esc(homeNote())}</p>
<h3 class="fa-kids-head">Children</h3>
<div id="fa-kids">${profile.children.map(kidCard).join('')}</div>
<div class="fa-buttons"><button class="fa-ghost" type="button" id="fa-add">+ Add ${profile.children.length ? 'another' : 'a'} child</button></div>
<h3 class="fa-kids-head">Grown-ups</h3>
<p class="fa-note">What you enjoy counts too. The more we know about everyone, the better the day.</p>
<div id="fa-grown">${(profile.parents ?? []).map(grownCard).join('')}</div>
<div class="fa-buttons"><button class="fa-ghost" type="button" id="fa-add-grown">+ Add ${(profile.parents ?? []).length ? 'another grown-up' : 'yourself'}</button></div>
${limitsForm()}</details>`;
  $('fa-form').ontoggle = (e) => { formOpen = e.target.open; };
  for (const el of box.querySelectorAll('[data-limit]')) {
    el.onchange = () => {
      const v = el.value.trim(), k = el.dataset.limit;
      const limits = { ...(profile.limits ?? {}) };
      if (v === '' || !(Number(v) >= 0)) delete limits[k];
      else limits[k] = k === 'adults' ? Math.max(1, Math.round(Number(v))) : Number(v);
      profile.limits = limits;
      saveProfile();
      renderPlan();
    };
  }
  $('fa-home').onchange = async (e) => {
    const text = e.target.value.trim();
    profile.homeText = text;
    homeMsg = '';
    if (STREET.test(text)) {
      // A street address: found by our server, and planned from the door.
      $('fa-home-note').textContent = 'Finding your address…';
      try {
        const r = await askHome({ address: text });
        profile.home = { lat: r.lat, lon: r.lon, label: r.label, how: 'address' };
        useHomeDrives(r);
      } catch (err) {
        profile.home = null;
        homeMsg = err.message;
      }
    } else {
      profile.home = homeFrom(text, where);
      if (!profile.home && text) homeMsg = 'We don\'t know that place. Type your street address, like "123 Oak St, Cary", or your ZIP.';
    }
    saveProfile();
    $('fa-home-note').textContent = homeNote();
    renderPlan();
  };
  $('fa-locate').onclick = () => navigator.geolocation.getCurrentPosition(async (p) => {
    profile.home = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), label: 'this phone\'s location', how: 'device' };
    profile.homeText = '';
    homeMsg = '';
    saveProfile();
    await exactDrives();
    render();
  }, () => { $('fa-home-note').textContent = 'That didn\'t work. Type your address instead.'; });
  $('fa-add').onclick = () => openKid(-1);
  for (const b of box.querySelectorAll('[data-edit]')) b.onclick = () => openKid(Number(b.dataset.edit));
  $('fa-add-grown').onclick = () => openGrown(-1);
  for (const b of box.querySelectorAll('[data-edit-grown]')) b.onclick = () => openGrown(Number(b.dataset.editGrown));
}

// ---- The plan ----

const AXIS = [360, 1320]; // 6 am to 10 pm
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pct = (m) => +(((Math.min(Math.max(m, AXIS[0]), AXIS[1]) - AXIS[0]) / (AXIS[1] - AXIS[0])) * 100).toFixed(2);

function strip(blocks, indoors, iconFor = () => '') {
  const name = { nap: 'Nap', quiet: 'Quiet', travel: '' };
  const segs = blocks.filter((b) => ['nap', 'quiet', 'travel', 'outing'].includes(b.kind)).map((b) => {
    const left = pct(mins(b.start)), width = +(pct(mins(b.end)) - left).toFixed(2);
    // An outing shows its type's icon (icons.js), with a word too where there's room.
    const icon = b.kind === 'outing' ? iconFor(b.title) : '';
    const label = b.kind === 'outing' ? (width < 4 ? '' : width < 9 ? icon : `${icon} Out`.trim()) : width < 9 ? '' : name[b.kind];
    return `<span class="seg s-${b.kind}${b.kind !== 'nap' && b.kind !== 'quiet' && indoors ? ' in' : ''}" style="left:${left}%;width:${width}%">${label ? `<span>${label}</span>` : ''}</span>`;
  }).join('');
  return `<div class="strip" role="img" aria-label="The day from ${clock(blocks[0].start)} to ${clock(blocks.at(-1).end)}">${segs}</div><div class="fa-hours" aria-hidden="true"><span>6 am</span><span>10 am</span><span>2 pm</span><span>6 pm</span><span>10 pm</span></div>`;
}

const childDayHtml = (c, outing, iconFor) => `<div class="fa-child"><p class="fa-name">${esc(c.name || 'Your child')}</p>${strip(c.timeline, outing && !outing.outdoor, iconFor)}
<details><summary>The whole day</summary><ul class="fa-times">${c.timeline.map((b) => `<li><span class="t">${clock(b.start)}</span><span>${b.kind === 'outing' && iconFor(b.title) ? `<span aria-hidden="true">${iconFor(b.title)}</span> ` : ''}${esc(b.title)}${b.detail ? ` <span class="fa-note">${esc(b.detail)}</span>` : ''}</span></li>`).join('')}</ul></details></div>`;

const dollars = (usd) => (Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`);
const milesText = (m) => `${Number.isInteger(m) ? m : m.toFixed(1)} mile${m === 1 ? '' : 's'}`;
// What an outing costs, as the listing lets us say it.
function costText(c) {
  if (!c) return '';
  if (c.usd == null) return 'It charges; the listing doesn\'t say how much.';
  if (c.usd === 0) return c.unlisted ? 'No price listed.' : 'Free.';
  return `About ${dollars(c.usd)} for your family${c.unlisted ? ', plus a stop with no price listed' : ''}.`;
}

// Which of each child's interests an outing answers: "For Daniel: ★ Trains, ♥♥ Animals".
function lovesHtml(o) {
  const who = [...kidsOn(profile, date).kids.map((k) => [k, k.name || 'your child']), ...(profile.parents ?? []).map((g) => [g, g.name || 'you'])];
  const lines = who.map(([k, name]) => {
    const m = matchesFor(o, k.interests).slice(0, 3);
    return m.length ? `<li><b>For ${esc(name)}:</b> ${m.map((x) => `${WEIGHT_MARK[x.weight]} ${esc(x.label)}`).join(', ')}</li>` : '';
  }).filter(Boolean);
  return lines.length ? `<ul class="fa-loves">${lines.join('')}</ul>` : '';
}

// What kind of outing it is, as a small badge: its icon and name (icons.js).
const typeBadge = (o) => { const t = typeOf(o); return `<span class="fa-type"><span aria-hidden="true">${t.icon}</span> ${esc(t.label)}</span>`; };
// The icon for a timeline block, by the stop it's named for in the day's outings.
function iconsOf(d) {
  const by = new Map();
  for (const o of [d.outing, d.second, d.rainBackup]) for (const s of o ? stopsOf(o) : []) if (!by.has(s.title)) by.set(s.title, typeOfStop(s).icon);
  return (title) => by.get(title) ?? '';
}

function outingHtml(o, drive, cost) {
  const stops = stopsOf(o), first = stops[0];
  const name = stops.map((s) => s.title).join(', then ');
  const link = first.url ? `<a href="${esc(first.url)}" rel="noreferrer">${esc(name)}</a>` : esc(name);
  return `<div class="fa-out${o.outdoor ? '' : ' in'}">${typeBadge(o)}<strong>${link}</strong>
<p>Arrive ${clock(o.arrive)}, leave by ${clock(o.leave)}. About ${drive} minutes' drive from home, in typical traffic. ${esc(costText(cost))}</p>
${lovesHtml(o)}${first.address ? `<p class="fa-note">${esc(first.address)}</p>` : ''}</div>`;
}

// When a trip is, by the naps: the map's key says which part of the day each colour is.
function tripWhen(o, naps) {
  const at = mins(o.arrive);
  if (!naps.length) return at < 12 * 60 ? 'Morning' : 'Afternoon';
  const after = naps.filter(([, end]) => mins(end) <= at).length;
  if (after === 0) return naps.length > 1 ? 'Before the first nap' : 'Before the nap';
  if (after === naps.length) return naps.length > 1 ? 'After the last nap' : 'After the nap';
  return 'Between naps';
}

// The day's drives on one map, a colour for each trip, with its key and the day's and week's totals. The family goes
// home only for a nap: with none between two trips the map (and the key) drives on from one to the next.
function routeHtml(d) {
  if (!d.trips?.length) return '';
  const naps = d.children.flatMap((c) => c.nap?.sleep ?? []);
  const map = dayMap({ home: profile.home, trips: d.trips, base: mapBase, naps });
  const links = tripLinks(d.trips, naps);
  const lastStop = (t) => stopsOf(t.outing).filter((s) => s.lat != null).at(-1);
  const firstStop = (t) => stopsOf(t.outing).find((s) => s.lat != null);
  // The drive times are for typical traffic at the hour (traffic.js); where that is longer than an empty road, say so.
  const slowBy = (minutes, clear) => (Number.isFinite(clear) && minutes > clear ? ` (${clear} on a clear road)` : '');
  const note = (t, i) => {
    const { fromHome, backHome } = links[i], prev = d.trips[i - 1], next = d.trips[i + 1];
    const a = fromHome ? null : lastStop(prev), b = firstStop(t);
    const between = fromHome ? null : driveBetween(a, b, { date, at: [mins(prev.outing.leave)] }).minutes;
    const clear = fromHome ? driveBetween(profile.home, b).minutes : driveBetween(a, b).minutes;
    const out = fromHome ? `Leave about ${clock(hm(mins(t.outing.arrive) - t.drive))}: about ${t.drive} minutes in typical traffic${slowBy(t.drive, clear)}.`
      : `Drive on from ${esc(a.title)}${Number.isFinite(between) ? `, about ${between} minutes in typical traffic${slowBy(between, clear)}, leaving about ${clock(hm(mins(t.outing.arrive) - between))}` : ''}.`;
    const end = backHome ? ` Home about ${clock(hm(mins(t.outing.leave) + t.drive))}${fromHome ? `. ${esc(milesText(t.miles))} there and back.` : '.'}` : ` Then straight on to ${esc(firstStop(next)?.title ?? 'the next stop')}, no nap between.`;
    return `${out}${end}`;
  };
  const key = d.trips.map((t, i) => `<li><span class="fa-swatch" style="background:${TRIP_COLORS[i % TRIP_COLORS.length]}"></span><span><b>${esc(tripWhen(t.outing, naps))}</b>: ${stopsOf(t.outing).map((s) => `<span aria-hidden="true">${typeOfStop(s).icon}</span> ${esc(s.title)}`).join(', then ')}</span>
<p class="fa-note">${note(t, i)}</p></li>`).join('');
  return `<h3>The day's drives</h3>${map}<ul class="fa-legend">${key}</ul>${totalsHtml(d)}`;
}

// The day's miles and spending, and the week's with this day in it, against the family's limits.
function totalsHtml(d) {
  const L = limitsFor(profile, saved, date), set = L.set;
  const chip = (text, over) => `<li${over ? ' class="over"' : ''}>${esc(text)}</li>`;
  const out = [chip(`${milesText(d.miles)} today${Number.isFinite(set.dayMiles) ? ` of ${set.dayMiles}` : ''}`, d.miles > set.dayMiles)];
  out.push(chip(d.dollars ? `${dollars(d.dollars)} on outings` : 'Nothing to pay today', false));
  const { from, to } = weekOf(date), weekMiles = L.week.miles + d.miles, weekSpend = L.week.dollars + d.dollars;
  if (Number.isFinite(set.weekMiles)) out.push(chip(`${milesText(Math.round(weekMiles * 10) / 10)} this week of ${set.weekMiles}`, weekMiles > set.weekMiles));
  if (Number.isFinite(set.weekDollars)) out.push(chip(`${dollars(weekSpend)} this week of ${dollars(set.weekDollars)}`, weekSpend > set.weekDollars));
  const span = `${dayLabel(from, { weekday: 'short', month: 'short', day: 'numeric' })} to ${dayLabel(to, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const weekly = Number.isFinite(set.weekMiles) || Number.isFinite(set.weekDollars);
  return `<ul class="fa-totals">${out.join('')}</ul>${weekly ? `<p class="fa-note">The week is ${esc(span)}, with ${L.week.days ? `${L.week.days} other saved day${L.week.days === 1 ? '' : 's'}` : 'no other days saved yet'} and this one.</p>` : ''}`;
}

/**
 * A day's published files for the family's ages, with their stops' points on them, and last the day's pool
 * (src/family/pool.js): only typed requests plan from it, but a saved plan or "go later" finds its outing there.
 * A build from before pools has none.
 */
async function filesOn(on) {
  const { kids } = kidsOn(profile, on);
  const row = index.days.find((d) => d.date === on);
  const get = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${u} answered ${r.status}`);
    return r.json();
  };
  const [bands, pool] = await Promise.all([
    Promise.all(bandsFor(kids).filter((b) => row.bands[b]).map((b) => get(`/data/${on}/${b}.json`))),
    fetch(`/family/pool/${on}.json`).then((r) => {
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      throw new Error(`/family/pool/${on}.json answered ${r.status}`);
    }),
  ]);
  return [...withPoints(bands, points), ...(pool ? [pool] : [])];
}

// The rules' findings as a parent would say them. Anything not listed is the rule's own words.
const REASONS = {
  'long-stay': 'It runs longer than we plan for this age.', 'tight-nap': 'It runs too close to a nap.', 'nap-window': 'It doesn\'t fit around sleep and meals.',
  'early-start': 'It starts too soon after waking.', 'late-home': 'It ends too close to dinner and bedtime.', 'after-dark': 'It\'s outdoors and runs past sunset.',
  'too-young': 'It\'s for older children.', 'too-old': 'It\'s for younger children.', closed: 'It\'s closed that day.', hours: 'It isn\'t open then.',
  weather: 'It\'s outdoors, and the forecast is bad.', 'no-address': 'Its listing has no address.', 'no-location': 'We can\'t place it on the map.',
  'drive-time': 'The drive is longer than we plan for.', 'no-lunch': 'There\'s no room for lunch.', 'no-dinner': 'There\'s no room for dinner.',
};
function whyNot(problems, most = 3) {
  const said = new Set();
  for (const p of problems ?? []) said.add(`${p.child ? `${p.child}: ` : ''}${p.rule === 'drive-time' ? p.message : REASONS[p.rule] ?? p.message}`);
  return [...said].slice(0, most).map((t) => `<li>${esc(t)}</li>`).join('');
}

function minsWord(m) {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h === 1 ? '1 hour' : `${h} hours`} ${rest} minutes` : h === 1 ? '1 hour' : `${h} hours`;
}

// What moved in each child's day for this outing, in words.
function movedLines(d) {
  const out = [];
  for (const c of d.children) {
    const m = c.moved;
    if (!m) continue;
    const who = c.name || 'Your child';
    if (m.wake) out.push(`${who} is up ${minsWord(-m.wake)} earlier, at ${clock(c.nap.wake)}.`);
    if (m.nap) {
      const naps = c.nap.sleep.length ? c.nap.sleep : c.nap.quiet;
      const what = c.nap.sleep.length ? (naps.length > 1 ? 'naps' : 'nap') : 'quiet time';
      out.push(`${who}'s ${what} ${naps.length > 1 ? 'move' : 'moves'} ${minsWord(Math.abs(m.nap))} ${m.nap > 0 ? 'later' : 'earlier'}: ${naps.map(([a, b]) => `${clock(a)} to ${clock(b)}`).join(' and ')}.`);
    }
    for (const [a] of m.skipped ?? []) out.push(`${who} misses the ${clock(a)} nap at home. A nap in the car on the way back is likely, and an early night helps.`);
    if (m.bed) out.push(`${who}'s bedtime is ${minsWord(m.bed)} later, at ${clock(c.nap.bed)}.`);
  }
  return out;
}

// Before the plan: what was moved for it and why, or, planned anyway, everything it breaks.
function flagHtml(d) {
  const moved = movedLines(d).map((t) => `<li>${esc(t)}</li>`).join('');
  if (d.forced) {
    return `<div class="fa-flag warn" role="note"><p class="fa-flag-head">Planned anyway, as you asked</p>
${moved ? `<p>To make room for it:</p><ul>${moved}</ul>` : ''}${d.warnings.length ? `<p>Still, keep in mind:</p><ul>${whyNot(d.warnings, 8)}</ul>` : ''}<p class="fa-note">There's no second outing on a day like this. Pick a day above to go back to a plan that fits.</p></div>`;
  }
  if (!moved) return '';
  const names = (list) => [...new Set(list.map((x) => x.child || 'your child'))].join(' and ');
  const why = d.special?.kind === 'loves' ? `It's ${esc(names(d.special.loves))}'s Top favorite: ${esc([...new Set(d.special.loves.map((x) => `★ ${x.label}`))].join(', '))}.`
    : d.special?.kind === 'one-off' ? 'It\'s a one-off, not on every week.' : 'You picked it.';
  const most = limitsFor(profile, saved, date).stretch;
  return `<div class="fa-flag moved" role="note"><p class="fa-flag-head">We moved the day a little for this</p><p>${why} Everything else still fits around the new times.</p><ul>${moved}</ul>
<p class="fa-note">Your setting lets naps and bedtime move up to ${esc(minsWord(most))}. Change it under Your family.</p></div>`;
}

function failHtml(d) {
  const widen = d.wider ? `<p>It fits if naps and bedtime can move up to ${esc(minsWord(d.wider))}. <button class="fa-link" id="fa-widen" data-to="${d.wider}">Allow that</button></p>` : '';
  const anyway = d.ref ? `<div class="fa-buttons"><button class="btn fa-small" id="fa-anyway">Plan it anyway</button></div><p class="fa-note">We'll build the day around it and list everything it breaks, so you can decide.</p>`
    : '<p class="fa-note">We don\'t bend a nap or a bedtime to fit an outing.</p>';
  return `<div class="fa-fail"><p class="fa-bad">That doesn't fit this day.</p><ul>${whyNot(d.problems)}</ul>${widen}${anyway}</div>`;
}

// The better outings the family's limits (or the longest drive we plan) kept out of the day, so they know they're
// there: each with why, what it answers, and a way to plan the day around it anyway.
function beyondHtml(d) {
  if (!d.beyond?.length) return '';
  const items = d.beyond.map((x) => {
    const first = stopsOf(x.outing)[0];
    const price = x.cost.usd ? `about ${dollars(x.cost.usd)}` : x.cost.usd === 0 && !x.cost.unlisted ? 'free' : 'price not listed';
    return `<li>${typeBadge(x.outing)}<strong>${first.url ? `<a href="${esc(first.url)}" rel="noreferrer">${esc(first.title)}</a>` : esc(first.title)}</strong>
<p class="fa-note">${clock(x.outing.arrive)} to ${clock(x.outing.leave)}, ${x.drive} minutes away, ${esc(price)}.</p>
<ul class="fa-over">${x.over.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul>${lovesHtml(x.outing)}
<button class="fa-link" data-beyond="${esc(x.outing.ref)}">Plan the day around it anyway</button></li>`;
  }).join('');
  const lead = d.outing ? 'These would suit your family even better, but they\'re past your limits:' : 'These would fit everyone\'s day, but they\'re past your limits:';
  return `<section class="fa-beyond"><h3>Just outside your limits</h3><p class="fa-note">${lead}</p><ul class="fa-beyond-list">${items}</ul>
<p class="fa-note">Change your limits under Your family, or plan one anyway and we'll show what it costs your week.</p></section>`;
}

function dayHtml(d) {
  if (!d.ok) return failHtml(d);
  const left = d.left?.length ? `<p class="fa-note">Plans are made for ages 1 to 5, so this day doesn't count ${esc(d.left.map((c) => c.name || 'one child').join(' or '))}.</p>` : '';
  const home = d.limited ? 'Nothing on the checked list fits everyone inside your driving and spending limits today. Raise one under Your family to see more.'
    : 'Nothing on the checked list fits everyone today, and we don\'t bend a nap to fit an outing.';
  const head = d.outing ? outingHtml(d.outing, d.drive, d.cost) : `<p><strong>A day at home.</strong> ${home}</p>`;
  const backup = d.rainBackup ? `<h3>If it rains</h3>${outingHtml(d.rainBackup, d.rainBackupDrive)}` : '';
  // A second, shorter outing in the time at home, before or after the main one.
  const early = d.second && mins(d.second.arrive) < mins(d.outing.arrive);
  const second = d.second ? `<h3>${early ? 'Earlier' : 'Later on'}</h3>${outingHtml(d.second, d.secondDrive, d.secondCost)}` : '';
  const iconFor = iconsOf(d);
  return `${flagHtml(d)}${early ? second : ''}${head}${early ? '' : second}${beyondHtml(d)}${backup}${routeHtml(d)}${left}${d.children.map((c) => childDayHtml(c, d.outing, iconFor)).join('')}
<p class="fa-note">${d.approximate ? 'Drive times are approximate: worked out from distance, not traffic.' : 'Drive times are by road, without traffic.'} Check an event's own page before you go.</p>
<div class="fa-buttons"><button class="btn fa-small" id="fa-save">Save this day</button>${d.outing ? '<button class="fa-link" id="fa-later">Go later</button>' : ''}${d.before ? `<button class="fa-link" id="fa-back">Back to ${esc(clock(d.before.outing.arrive))}</button>` : ''}${d.outing ? '<button class="fa-link" id="fa-swap">Swap the outing</button>' : ''}</div><div id="fa-swaps"></div>`;
}

const isEvent = (o) => stopsOf(o).some((s) => s.kind === 'event' && !s.dropIn);

// The day around a picked event: moved as far as the family allows, or with `anyway`, planned whatever it breaks.
function around(ref, anyway = false) {
  day = dayAround({ files, profile, date, ref, limits: limitsFor(profile, saved, date), anyway });
  if (day.reason === 'too-far') day.problems[0].message = `It's about ${day.drive} minutes from home, and we plan up to ${MAX_FAMILY_DRIVE_MIN}.`;
  showDay();
}

function showDay() {
  $('fa-day').innerHTML = dayHtml(day);
  $('fa-anyway')?.addEventListener('click', () => { ga('event', 'plan_anyway', { from: 'event' }); around(day.ref, true); });
  // Planned from the list below the day: up to the new day's top, where it says what it breaks.
  for (const b of $('fa-day').querySelectorAll('[data-beyond]')) b.onclick = () => { ga('event', 'plan_anyway', { from: 'beyond_limits' }); around(b.dataset.beyond, true); $('fa-day').scrollIntoView({ block: 'start' }); };
  $('fa-widen')?.addEventListener('click', (e) => {
    profile.limits = { ...(profile.limits ?? {}), stretch: Number(e.currentTarget.dataset.to) };
    saveProfile();
    const ref = day.ref;
    renderProfile();
    around(ref);
  });
  $('fa-save')?.addEventListener('click', () => {
    const s = toSaved(day, day.outing ? `${dayLabel(date, { weekday: 'long' })}: ${stopsOf(day.outing)[0].title}` : `${dayLabel(date, { weekday: 'long' })} at home`);
    saved = [s, ...saved.filter((x) => x.id !== s.id)];
    keep(K.saved, saved);
    savedChanged();
    renderSaved();
    ga('event', 'save_day');
    $('fa-save').textContent = 'Saved';
  });
  // The same outing, later: each step remembers the one before, so "Back to" undoes it.
  $('fa-later')?.addEventListener('click', () => {
    const later = laterFor({ files, profile, date, current: day.outing, drive: day.drive, limits: limitsFor(profile, saved, date) });
    if (!later) {
      $('fa-swaps').innerHTML = `<p class="fa-note">There's no later time today that fits everyone${isEvent(day.outing) ? ': it\'s at a set time' : ''}. We don't bend a nap or a bedtime to fit an outing.</p>`;
      return;
    }
    day = { ...later, before: day };
    showDay();
  });
  $('fa-back')?.addEventListener('click', () => { day = day.before; showDay(); });
  $('fa-swap')?.addEventListener('click', () => {
    const limits = limitsFor(profile, saved, date);
    const list = swapsFor({ files, profile, date, current: day.outing, limits }).slice(0, 8);
    const price = (c) => (c.usd ? `, about ${dollars(c.usd)}` : c.usd === 0 && !c.unlisted ? ', free' : '');
    $('fa-swaps').innerHTML = list.length ? `<h3>Other checked outings nearby</h3><ul class="fa-swaps">${list.map((x, i) => `<li><span><span aria-hidden="true">${typeOf(x.outing).icon}</span> ${esc(stopsOf(x.outing)[0].title)}<br><span class="fa-note">${clock(x.outing.arrive)}, about ${x.drive} minutes away${esc(price(x.cost))}</span></span><button class="fa-link" data-pick="${i}">Use this</button></li>`).join('')}</ul>`
      : `<p class="fa-note">Nothing else on today's list fits everyone${Number.isFinite(limits.miles) || Number.isFinite(limits.dollars) ? ' inside your limits' : ''}.</p>`;
    for (const b of $('fa-swaps').querySelectorAll('[data-pick]')) {
      b.onclick = () => {
        const x = list[Number(b.dataset.pick)];
        const { kids, left } = kidsOn(profile, date);
        ga('event', 'swap_outing');
        day = { ...dayFor({ outing: x.outing, drive: x.drive, kids, date, files, home: profile.home, limits }), left };
        showDay();
      };
    }
  });
}

// ---- Typed requests ----
// The sentence goes to our server, which asks Claude to read it as the plan's settings (apps/routines/sync/ask.js);
// nothing about the family goes with it. The day is then worked out here like any other (askedDay), from the
// checked outings, so Claude never picks a place. Offered only when the server has it switched on (asksLeft).

const todayHere = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const PART_WORDS = { indoors: 'indoors', outdoors: 'outdoors', free: 'free', time: 'at that time' };
let askMsg = '', asking = false, lastAsk = '';

function askHtml() {
  if (account?.asksLeft == null) return '';
  const left = account.asksLeft;
  return `<form class="fa-ask" id="fa-ask"><label class="fa-field">Or ask for something<input name="q" maxlength="300" autocomplete="off" placeholder="Somewhere indoors near Cary after 3" value="${esc(lastAsk)}" ${left > 0 ? '' : 'disabled'}></label>
<div class="fa-buttons"><button class="btn fa-small" ${asking || left <= 0 ? 'disabled' : ''}>${asking ? 'Looking…' : 'Find it'}</button></div>
<p class="fa-note" id="fa-ask-msg" role="status">${askMsg ? esc(askMsg) : `${left} of 30 typed requests left this month. We only plan from outings checked this morning that fit every child's naps.`}</p></form>`;
}

function wireAsk() {
  const form = $('fa-ask');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = form.q.value.trim();
    if (!text || asking) return;
    lastAsk = text;
    asking = true; askMsg = '';
    form.outerHTML = askHtml();
    try {
      const r = await ask('/v1/family/ask', { session, text, today: todayHere(), days: index.days.map((d) => d.date) });
      account.asksLeft = r.asksLeft;
      ga('event', 'typed_request');
      await showAsked(r.settings);
    } catch (err) {
      askMsg = err.message;
    } finally {
      asking = false;
      $('fa-ask')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: askHtml() }).firstElementChild);
      wireAsk();
    }
  };
}

// The asked-for day, on the asked-for date, with what was looked for said above it.
async function showAsked(s) {
  // Not a request for an outing: say so, and leave the day as it was.
  if (!s.outing) {
    askMsg = s.understood || 'We can only help find outings.';
    return;
  }
  if (s.day && s.day !== date) {
    date = s.day;
    await renderPlan();
    // The day's files didn't load: renderPlan has said so, and the old day's files mustn't be planned from.
    if (files[0]?.date !== date) return;
  }
  const near = s.near ? homeFrom(s.near, where) : null;
  day = askedDay({ files, profile, date, settings: s, near, limits: limitsFor(profile, saved, date) });
  const notes = [];
  if (s.near && !near) notes.push(`We don't know where "${s.near}" is, so we didn't use it.`);
  if (day.unmatched?.length) notes.push(`Nothing on today's list matched "${day.unmatched.join('", "')}", so this is the closest fit.`);
  const head = `<div class="fa-flag moved" role="note"><p class="fa-flag-head">${esc(s.understood || 'Here\'s what we found.')}</p>${notes.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;
  if (!day.ok && day.reason === 'nothing-asked') {
    const give = day.without.map((k) => (k === 'near' ? `near ${near.label}` : PART_WORDS[k])).filter(Boolean);
    // A town past the longest drive we plan: nothing near it can fit, and that's why.
    const away = near ? driveBetween(profile.home, near).minutes : 0;
    const far = away > MAX_FAMILY_DRIVE_MIN ? `We plan outings up to ${MAX_FAMILY_DRIVE_MIN} minutes from home, and ${near.label} is about ${away} minutes away.` : '';
    $('fa-day').innerHTML = `${head}<div class="fa-fail"><p class="fa-bad">Nothing on ${esc(dayLabel(date, { weekday: 'long' }))}'s checked list fits all of that and everyone's naps.</p>
${far ? `<p>${esc(far)}</p>` : ''}
${give.length ? `<p>Something fits if it doesn't have to be ${esc(give.join(', or '))}.</p>` : '<p>Try another day, or ask for something else.</p>'}
${near && !far ? `<p class="fa-note">"Near" is within ${NEAR_MIN} minutes' drive of ${esc(near.label)}.</p>` : ''}</div>`;
    return;
  }
  showDay();
  $('fa-day').insertAdjacentHTML('afterbegin', head);
}

async function renderPlan() {
  const run = ++planRun; // a later change wins over one still loading
  const box = $('fa-plan');
  box.hidden = !account?.live;
  if (box.hidden) return;
  if (!profile.home || !kidsOn(profile, date).kids.length) {
    // Say exactly what's missing, so a typed address or birth month that didn't take isn't a silent blank.
    const need = [];
    if (!profile.home) need.push(homeMsg && profile.homeText ? `Your home: ${homeMsg}` : 'Add your home address, like "123 Oak St, Cary", or your ZIP.');
    if (!profile.children.length) need.push('Add a child aged 1 to 5.');
    else if (!kidsOn(profile, date).kids.length) {
      for (const c of profile.children) need.push(ageProblem(c, date) || `Add ${c.name ? `${c.name}'s` : 'your child\'s'} birth month.`);
    }
    box.innerHTML = `<div class="fa-card"><h2>Your day</h2><p>To plan your day:</p><ul class="fa-need">${need.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
    return;
  }
  box.innerHTML = `<div class="fa-card"><h2>Your day</h2>
<div class="fa-days">${index.days.map((d) => `<button data-date="${d.date}" aria-pressed="${d.date === date}">${esc(dayLabel(d.date, { weekday: 'short' }))}<b>${esc(dayLabel(d.date, { day: 'numeric' }))}</b></button>`).join('')}</div>
<div id="fa-day"><p>Working out your day…</p></div>
<label class="fa-field">Or build the day around an event<select id="fa-event"><option value="">Pick an event</option></select></label>${askHtml()}</div>`;
  for (const b of box.querySelectorAll('[data-date]')) b.onclick = () => { date = b.dataset.date; renderPlan(); };
  wireAsk();
  try {
    const got = await filesOn(date);
    if (run !== planRun) return;
    files = got;
    day = familyDay({ files, profile, date, limits: limitsFor(profile, saved, date) });
    showDay();
    const pick = $('fa-event');
    pick.insertAdjacentHTML('beforeend', eventsOn(files).map((e) => `<option value="${esc(e.ref)}">${esc([typeOfStop(e).icon, e.start?.length > 11 ? clock(e.start.slice(11, 16)) : '', e.title].filter(Boolean).join(' '))}</option>`).join(''));
    pick.onchange = () => { if (pick.value) { ga('event', 'plan_around_event'); around(pick.value); } };
  } catch (err) {
    console.error('the day could not be worked out:', err);
    if (run === planRun) $('fa-day').innerHTML = `<p class="fa-bad">We couldn't load this day's plans. Check your connection and try again.</p>`;
  }
}

// ---- Saved plans, and carrying them to Tot Routines ----

let alertsMsg = '';
// With the emails on, the server's list follows this device's: the last device to change it wins.
// The saved days in Tot Routines' shape, from today on, kept on the account for linked phones (POST /link/plans).
function appPlans() { return toCarry(saved, null, index?.days[0]?.date ?? null).plans; }
function savedChanged() {
  push({ saved, app: appPlans() });
  if (!account?.alerts) return;
  ask('/v1/family/alerts', { session, on: true, plans: toWatch(saved) }).catch((err) => { alertsMsg = `Your emails didn't get the change: ${err.message}`; renderSaved(); });
}

function alertsHtml() {
  const msg = alertsMsg ? `<p class="fa-note" role="status">${esc(alertsMsg)}</p>` : '';
  if (!account.canAlert) return '';
  if (account.alerts) return `<p class="fa-note">We'll email you if one of these changes. <button class="fa-link" id="fa-alerts-off">Stop the emails</button></p>${msg}`;
  return `<form id="fa-alerts" class="fa-alerts"><p>Email me${account.email ? ` at <strong>${esc(account.email)}</strong>` : ''} if one of these is cancelled, moves or gets bad weather.</p>
<button class="btn fa-small" type="submit">Turn on</button></form>${msg}`;
}

// A saved day as a chip: "Sat" over "14", and the month under it.
const whenChip = (date) => {
  const d = new Date(`${date}T12:00:00Z`), f = (o) => d.toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  return `<span class="fa-when">${f({ weekday: 'short' })}<b>${f({ day: 'numeric' })}</b>${f({ month: 'short' })}</span>`;
};
async function renderSaved() {
  const box = $('fa-saved');
  box.hidden = !account?.live || !saved.length;
  if (box.hidden) return;
  box.innerHTML = `<div class="fa-card"><h2>Saved plans</h2>
<ul class="fa-swaps">${saved.map((s, i) => `<li><span class="fa-saved-row">${whenChip(s.date)}<span>${esc(String(s.title).replace(/^\w+day: /, ''))}<span class="fa-bad" data-status="${i}"></span></span></span><button class="fa-link" data-del="${i}">Remove</button></li>`).join('')}</ul>
${account.canAlert ? `<div class="fa-saved-sub"><h3>📧 If a plan changes</h3>${alertsHtml()}</div>` : ''}
<div class="fa-saved-sub"><h3>📲 On your phone</h3>
${account.apps ? `<p class="fa-note">🔗 Tot Routines is linked${account.apps > 1 ? ` on ${account.apps} phones` : ''}: days you save or remove here change there by themselves, the next time it opens. <button class="fa-link" id="fa-unpair">Unlink</button></p>` : '<p class="fa-note">Link Tot Routines once and these days show up in it by themselves, with each child\'s day around them.</p>'}
<div class="fa-buttons"><button class="btn fa-small" id="fa-carry">${account.apps ? 'Link another phone' : 'Link Tot Routines'}</button></div><div id="fa-link"></div></div></div>`;
  for (const b of box.querySelectorAll('[data-del]')) b.onclick = () => { saved.splice(Number(b.dataset.del), 1); keep(K.saved, saved); savedChanged(); renderSaved(); };
  const on = $('fa-alerts');
  if (on) on.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await ask('/v1/family/alerts', { session, on: true, plans: toWatch(saved) });
      account.alerts = true;
      alertsMsg = '';
    } catch (err) { alertsMsg = err.message; }
    renderSaved();
  };
  const off = $('fa-alerts-off');
  if (off) off.onclick = async () => {
    try {
      await ask('/v1/family/alerts', { session, on: false });
      account.alerts = false;
      alertsMsg = 'The emails are off.';
    } catch (err) { alertsMsg = err.message; }
    renderSaved();
  };
  const unpair = $('fa-unpair');
  if (unpair) unpair.onclick = async () => {
    if (!confirm('Unlink Tot Routines on every phone? The plans already there stay until you remove them in the app.')) return;
    try { account.apps = (await ask('/v1/family/unpair', { session })).apps; } catch (err) { alertsMsg = err.message; }
    renderSaved();
  };
  // Linking: a pair token from the server goes in the sealed box with the plans and the pass, so the app (1.93 on)
  // asks for the plans by itself from then on. An older app takes the plans in the box, as before.
  $('fa-carry').onclick = async () => {
    const out = $('fa-link');
    try {
      const carry = toCarry(saved, account.planKey, index?.days[0]?.date ?? null);
      const { pair, apps } = await ask('/v1/family/pair', { session, app: appPlans() });
      const link = await makeLink({ ...carry, pair });
      await ask('/v1/family/link', { session, id: link.id, box: link.box });
      const q = window.qrcode(0, 'L');
      // A link, so the phone's own camera opens it (tottoolbox.com/routines/plans.html, which hands it to the app);
      // the code is after the #, which browsers never send. Tot Routines' own scanner reads the code out of it.
      q.addData(`https://tottoolbox.com/routines/plans.html#${link.text}`);
      q.make();
      const n = carry.plans.length;
      // The preview keeps the box on this computer's test server, which a phone can't reach (2026-11-09: the owner
      // scanned one and the live server answered "didn't work").
      const local = API.startsWith('http://localhost') ? '<p class="fa-bad">This is the preview on this computer, so this code only works with its test server: a phone will say it didn\'t work. For your phone, use triangletots.com/family.</p>' : '';
      out.innerHTML = `${local}<p>Scan this QR code once with your phone's camera and tap <strong>Open in Tot Routines</strong>. Or in Tot Routines, tap <strong>Photos and privacy</strong> at the bottom of the home screen, then <strong>📷 Scan the code</strong> under Plans from Triangle Tots, or paste the code there. The code works once, for 15 minutes. From then on, days you save or remove here change in Tot Routines by themselves, on every phone in your family. Each shows on its Today card and in the family's day.</p><div class="fa-qr">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'Code for Tot Routines' })}</div><p class="fa-code">${esc(link.text)}</p><p class="fa-note">The code is sealed on this device. Your saved days are kept with your account, as they already are, and only phones you link can ask for them.</p>`;
      account.apps = apps;
      ga('event', 'send_to_routines', { plans: n });
    } catch (err) { out.innerHTML = `<p class="fa-bad">${esc(err.message)}</p>`; }
  };
  // Each saved plan against this morning's list: told, not changed.
  for (const [i, s] of saved.entries()) {
    const row = index.days.find((d) => d.date === s.date);
    if (!row || !s.outing) continue;
    const st = savedStatus(s, await filesOn(s.date), profile);
    const el = box.querySelector(`[data-status="${i}"]`);
    if (el && !st.ok) el.textContent = ` Changed: ${st.message}`;
  }
}

// The account shows at once; the family, the plan and the saved days once the day's files have loaded (`ready`).
let ready = false;
function render() {
  renderAccount();
  // The example day, how it works and the questions are for someone deciding: gone once the plan is on.
  const more = $('fa-more');
  if (more) more.hidden = !!account?.live;
  if (!ready) return;
  renderProfile();
  renderPlan();
  renderSaved();
}

async function refresh() {
  if (!session) return;
  try { adopt(await ask('/v1/family/me', { session })); } catch (err) { accountMsg = err.message; }
}

addEventListener('DOMContentLoaded', async () => {
  // A sign-in link: the token is taken out of the address at once. The query stays: it says which email the visit
  // came from, and Analytics may read the address after this.
  const login = /^#login=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1];
  if (login) history.replaceState(null, '', location.pathname + location.search);
  // The account first, while the day's files load: the sign-in form, or "Checking your plan…" and then the plan.
  renderAccount();
  const who = (async () => {
    if (login) {
      try {
        const r = await ask('/v1/family/verify', { token: login });
        signedIn(r);
        resetting = !!r.reset;
      } catch (err) { accountMsg = err.message; }
    } else await refresh();
    renderAccount();
  })();
  try { await loadDay(); } catch (err) {
    await who;
    $('fa-plan').hidden = false;
    $('fa-plan').innerHTML = `<div class="fa-card"><p class="fa-bad" role="status">Today's plans didn't load. Reload the page to try again. (${esc(err.message)})</p></div>`;
    throw err;
  }
  await who;
  ready = true;
  // Drives from an exact home need the drive table, which may have come after the account.
  if (exactHome(profile.home) && account?.live) await exactDrives();
  await afterLoad(login);
});

async function loadDay() {
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} answered ${r.status}`); return r.json(); });
  let admissions;
  [index, where, points, admissions] = await Promise.all(['/data/index.json', '/family/where.json', '/family/points.json', '/family/admissions.json'].map(json));
  useAdmissions(admissions);
  // Road drive times, when the build had the router. A preview without them works from distance and says so.
  const drives = await fetch('/family/drives.json');
  if (drives.ok) {
    const table = await drives.json();
    useDrives(table);
    driveTable = table;
    // The roads for the route map, from the same build. Without them each leg is a straight dashed line.
    const roads = await fetch('/family/routes.json');
    if (roads.ok) useRoutes(await roads.json(), table.made);
    else if (roads.status !== 404) throw new Error(`/family/routes.json answered ${roads.status}`);
  } else if (drives.status !== 404) throw new Error(`/family/drives.json answered ${drives.status}`);
  // The map under the route: the site's own, with no words on it.
  const base = await fetch('/map-base.svg');
  if (!base.ok) throw new Error(`/map-base.svg answered ${base.status}`);
  mapBase = (await base.text()).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  date = index.days[0]?.date;
  if (!date) throw new Error('/data/index.json has no days');
}

async function afterLoad(login) {
  // Back from Stripe's checkout. The address loses ?paid at once, so a reload doesn't count it twice.
  const paid = new URLSearchParams(location.search).get('paid');
  if (paid !== null) history.replaceState(null, '', location.pathname);
  await gaWho();
  // A link that confirmed a new account is its sign-up; any other is a sign-in by email.
  if (login && session) ga('event', resetting ? 'login' : 'sign_up', { method: resetting ? 'email' : 'password' });
  if (paid === '0') notice = { kind: 'calm', title: 'Checkout closed.', text: 'Nothing was charged. Pick a plan whenever you\'re ready.' };
  render();
  // From a day map's "Set my address" (map.js): straight to where home is typed in.
  if (location.hash === '#home' && session) {
    $('fa-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('fa-home')?.focus({ preventScroll: true });
  }
  if (paid === '1' && session) {
    // Stripe tells the server by its webhook, which can land a few seconds after the family does: wait for it.
    for (let i = 0; i < 12 && !account?.live; i++) {
      notice = { kind: 'calm', title: 'Finishing up with Stripe…', text: '' };
      renderAccount();
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    }
    if (!account?.live) {
      notice = { kind: 'calm', title: 'Stripe hasn\'t confirmed it yet.', text: 'Reload this page in a minute. If you were charged and it still doesn\'t show, email support@tottoolbox.com.' };
      renderAccount();
      return;
    }
    // The trial or payment itself is told to Analytics by our server, as Stripe reports it (gaIds above).
    await gaWho();
    notice = { kind: 'good', title: account.trialing ? 'You\'re in. Your free trial has started.' : 'You\'re in. Thank you!', text: profile.home && profile.children.length ? 'Your day is below.' : 'Add your home and your children below, and your day appears.' };
    if (!(profile.home && profile.children.length)) formOpen = true;
    render();
  }
}
