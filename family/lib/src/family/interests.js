// What a child loves, as a parent picks it on the family page, and how much that counts toward an outing.
//
// Each choice is something a parent would say ("trains", "splash pads"), tied to the published plans' own interest
// tags (INTERESTS in plans/config.js, which every outing carries) and to words in its stops' names, features and
// copy, so "trains" finds a park with a train ride even when its tags only say "movement". Runs in the browser and in
// the tests: no Node imports.

import { INTERESTS } from '../plans/config.js';
import { stopsOf } from '../plans/rules.js';

/** How much a child cares, as the page offers it: tapped once, twice, three times. */
export const WEIGHTS = [
  { value: 1, label: 'Likes' },
  { value: 2, label: 'Loves' },
  { value: 3, label: 'Top favorite' },
];

export const GROUPS = [
  { id: 'outside', label: 'Animals and outdoors' },
  { id: 'go', label: 'Things that go' },
  { id: 'water', label: 'Water' },
  { id: 'move', label: 'Moving and playing' },
  { id: 'make', label: 'Making and music' },
  { id: 'learn', label: 'Books and learning' },
  { id: 'grown', label: 'For grown-ups' },
];

// [id, label, emoji, group, tags, words, who]: who it's offered for, 'kids', 'grown' (a parent) or 'both'.
const LIST = [
  ['history', 'History', '🏰', 'grown', ['science'], /\b(history|historic\w*|heritage|colonial)\b/, 'grown'],
  ['coffee', 'Coffee and treats', '☕', 'grown', [], /\b(caf[eé]s?|coffee|bakery|bakeries|ice cream|treats?)\b/, 'grown'],
  ['markets', 'Markets', '🧺', 'grown', [], /\b(markets?|farmers'?|makers)\b/, 'grown'],
  ['shows', 'Live shows', '🎭', 'grown', ['music'], /\b(shows?|theat(er|re)|concerts?|performances?|ballet|nutcracker)\b/, 'grown'],
  ['photos', 'Pretty places for photos', '📷', 'grown', ['nature'], /\b(gardens?|lakes?|views?|overlook|lights?|scenic)\b/, 'grown'],
  ['animals', 'Animals', '🐾', 'outside', ['animals'], /\b(animals?|zoo|petting)\b/, 'both'],
  ['farm', 'Farm animals', '🐄', 'outside', ['animals'], /\b(farm|farmyard|goats?|barn|ponies|pony|chickens?)\b/, 'both'],
  ['bugs', 'Bugs and butterflies', '🐛', 'outside', ['nature', 'science'], /\b(bugs?|butterfl\w*|insects?|caterpillars?)\b/, 'both'],
  ['birds', 'Birds and ducks', '🦆', 'outside', ['nature', 'animals'], /\b(birds?|ducks?|geese|owls?|raptors?)\b/, 'both'],
  ['walks', 'Nature walks', '🌳', 'outside', ['nature'], /\b(trails?|greenway|hikes?|walks?|woods|forest|nature)\b/, 'both'],
  ['gardens', 'Flowers and gardens', '🌷', 'outside', ['nature'], /\b(gardens?|arboretum|flowers?|blooms?)\b/, 'both'],
  ['digging', 'Sand and digging', '🪣', 'outside', ['nature', 'movement'], /\b(sand|sandbox|dig(ging)?|dirt|mud)\b/, 'kids'],
  ['trains', 'Trains', '🚂', 'go', ['vehicles'], /\b(trains?|railroad|railway|locomotive)\b/, 'both'],
  ['trucks', 'Trucks and diggers', '🚜', 'go', ['vehicles'], /\b(trucks?|tractors?|diggers?|construction|fire ?trucks?)\b/, 'kids'],
  ['cars', 'Cars and buses', '🚌', 'go', ['vehicles'], /\b(cars?|bus(es)?|vehicles?)\b/, 'kids'],
  ['planes', 'Planes', '✈️', 'go', ['vehicles'], /\b(planes?|airport|aviation|airplanes?)\b/, 'both'],
  ['boats', 'Boats', '⛵', 'go', ['vehicles', 'water'], /\b(boats?|kayaks?|canoes?|paddle)\b/, 'both'],
  ['rides', 'Carousels and rides', '🎠', 'go', ['movement'], /\b(carousel|rides?|amusements?)\b/, 'kids'],
  ['splash', 'Splash pads', '💦', 'water', ['water'], /\b(splash ?pads?|sprayground|fountains?)\b/, 'kids'],
  ['swimming', 'Swimming', '🏊', 'water', ['water'], /\b(swim\w*|pools?|aquatic)\b/, 'both'],
  ['lakes', 'Lakes and creeks', '🏞️', 'water', ['water', 'nature'], /\b(lakes?|creeks?|ponds?|rivers?|streams?)\b/, 'both'],
  ['playgrounds', 'Playgrounds', '🛝', 'move', ['movement'], /\b(playgrounds?|play ?structures?|slides?|swings?)\b/, 'kids'],
  ['climbing', 'Climbing', '🧗', 'move', ['movement'], /\b(climb\w*|treehouses?)\b/, 'kids'],
  ['running', 'Running around', '🏃', 'move', ['movement'], /\b(run(ning)?|open (field|lawn)|fields?)\b/, 'kids'],
  ['dancing', 'Dancing', '💃', 'move', ['music', 'movement'], /\b(danc\w*|wiggle|move and groove)\b/, 'kids'],
  ['balls', 'Balls and sports', '⚽', 'move', ['movement'], /\b(balls?|soccer|sports?|t-?ball)\b/, 'both'],
  ['tumbling', 'Tumbling and gym', '🤸', 'move', ['movement'], /\b(gym\w*|tumbl\w*|bounce|open play)\b/, 'kids'],
  ['pretend', 'Pretend play', '🎭', 'move', ['art'], /\b(pretend|dress[- ]up|play ?house|imagin\w*|puppets?)\b/, 'kids'],
  ['painting', 'Painting and drawing', '🎨', 'make', ['art'], /\b(paint\w*|draw\w*|art)\b/, 'both'],
  ['crafts', 'Crafts', '✂️', 'make', ['art'], /\b(crafts?|make (and|&) take|collage)\b/, 'both'],
  ['building', 'Blocks and building', '🧱', 'make', ['science', 'art'], /\b(blocks?|lego|build\w*|stem)\b/, 'kids'],
  ['singing', 'Singing', '🎤', 'make', ['music'], /\b(sing\w*|songs?|rhymes?)\b/, 'kids'],
  ['instruments', 'Instruments and music', '🥁', 'make', ['music'], /\b(music\w*|drums?|instruments?|jam)\b/, 'both'],
  ['books', 'Books', '📚', 'learn', ['stories'], /\b(books?|librar\w*|read\w*)\b/, 'both'],
  ['storytime', 'Storytime', '📖', 'learn', ['stories'], /\b(story ?times?|stories|lapsit)\b/, 'kids'],
  ['science', 'Science', '🔬', 'learn', ['science'], /\b(science|experiments?|discovery)\b/, 'both'],
  ['dinosaurs', 'Dinosaurs', '🦕', 'learn', ['dinosaurs'], /\b(dino\w*|fossils?)\b/, 'both'],
  ['space', 'Space and stars', '🚀', 'learn', ['science'], /\b(space|planets?|stars?|planetarium|astronom\w*)\b/, 'both'],
  ['letters', 'Letters and numbers', '🔤', 'learn', ['stories', 'science'], /\b(letters?|numbers?|math\w*|abc|counting)\b/, 'kids'],
  ['puzzles', 'Puzzles', '🧩', 'learn', ['science'], /\b(puzzles?|shapes?)\b/, 'kids'],
  ['museums', 'Museums', '🏛️', 'learn', ['science', 'art'], /\b(museums?|exhibits?)\b/, 'both'],
];

/** Every interest a parent can pick: { id, label, emoji, group, tags, words, who }. */
export const CHOICES = LIST.map(([id, label, emoji, group, tags, words, who]) => {
  for (const t of tags) if (!INTERESTS.includes(t)) throw new Error(`${id}: ${t} isn't one of the plans' interests`);
  if (!GROUPS.some((g) => g.id === group)) throw new Error(`${id}: no group ${group}`);
  if (!['kids', 'grown', 'both'].includes(who)) throw new Error(`${id}: who is ${who}`);
  return { id, label, emoji, group, tags, words: new RegExp(words.source, 'i'), who };
});
/** The choices offered for a child (`kids`) or a grown-up (`grown`). */
export const choicesFor = (who) => CHOICES.filter((c) => c.who === 'both' || c.who === who);
const BY_ID = new Map(CHOICES.map((c) => [c.id, c]));

/** A child's picks as saved, kept to known choices and weights: { trains: 3, books: 2 }. */
export function cleanInterests(picks) {
  const out = {};
  for (const [id, w] of Object.entries(picks ?? {})) if (BY_ID.has(id) && WEIGHTS.some((x) => x.value === w)) out[id] = w;
  return out;
}

/** The words an outing is about: its stops' names, places and features, and why we picked it. */
function textOf(o) {
  return [o.why, ...stopsOf(o).flatMap((s) => [s.title, s.venue, s.kind, ...(s.amenities ?? [])])].filter(Boolean).join(' ');
}

/**
 * Which of a child's picks an outing answers, strongest first: [{ id, label, weight, named }]. `named` is a pick the
 * outing's own words name ("train ride"), which counts double a pick only its tags share.
 */
export function matchesFor(o, picks) {
  const text = textOf(o), tags = new Set(o.interests ?? []);
  const out = [];
  for (const [id, weight] of Object.entries(cleanInterests(picks))) {
    const c = BY_ID.get(id);
    const named = c.words.test(text);
    if (named || c.tags.some((t) => tags.has(t))) out.push({ id, label: c.label, weight, named });
  }
  return out.sort((a, b) => b.weight * (1 + b.named) - a.weight * (1 + a.named));
}

/** How well an outing suits these children: each child's matched picks, by weight, double where named. 0 for none. */
export function interestScore(o, kids) {
  return kids.reduce((sum, k) => sum + matchesFor(o, k.interests).reduce((s, m) => s + m.weight * (m.named ? 2 : 1), 0), 0);
}

/**
 * How much a grown-up's pick counts beside a child's: the day is for the children, and what the parents enjoy tips
 * the close calls (a garden walk over a playground when both suit the toddler).
 */
export const GROWN_SHARE = 0.5;

/** How well an outing suits the whole family: the children's score, and the grown-ups' at GROWN_SHARE. */
export function familyScore(o, kids, grownups = []) {
  return interestScore(o, kids) + GROWN_SHARE * interestScore(o, grownups);
}

/** A child's picks as shares of their whole: [{ id, label, emoji, weight, share }], biggest first. */
export function shares(picks) {
  const clean = cleanInterests(picks);
  const total = Object.values(clean).reduce((a, b) => a + b, 0);
  return Object.entries(clean).map(([id, weight]) => ({ ...BY_ID.get(id), weight, share: weight / total })).sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}
