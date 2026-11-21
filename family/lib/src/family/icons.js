// What kind of outing a stop is, with an icon: the family page shows it on the plan, the day's strip, the times and
// the map, so a storytime looks like a storytime wherever it's mentioned. Read from the stop's own words first (an
// event's title says what it is), then from what kind of place it is. Runs in the browser and the tests.

import { stopsOf } from '../plans/rules.js';

// [id, label, icon, words]: the first whose words a stop's title or venue has. Order matters: a "Santa Storytime"
// is a special event before it's a storytime, and a StoryWalk is a walk, not a storytime.
const BY_WORDS = [
  ['special', 'Special event', '🎉', /\b(festival|fest|fair|parade|carnival|celebration|halloween|trunk[- ]or[- ]treat|santa|tree lighting|fireworks|egg hunt|grand opening)\b/i],
  ['show', 'Show', '🎭', /\b(shows?|theat(er|re)|puppets?|performances?|nutcracker|ballet|circus|magic)\b/i],
  ['nature', 'Nature walk', '🌿', /\b(story ?walk|hikes?|trails?|nature walk|greenway)\b/i],
  ['story', 'Storytime', '📖', /\b(story ?times?|stories|lapsit|book ?babies|read(ing)? ?(time|together))\b/i],
  ['music', 'Music and movement', '🎵', /\b(music\w*|sing\w*|songs?|danc\w*|concerts?|drums?|wiggle|groove|jam)\b/i],
  ['art', 'Art and making', '🎨', /\b(arts?|crafts?|paint\w*|draw\w*|clay|make (and|&) take|kits?)\b/i],
  ['animals', 'Animals', '🐾', /\b(animals?|zoo|farm|petting|goats?|ponies|pony|horses?|aquarium|wildlife|raptors?|reptiles?)\b/i],
  ['science', 'Science', '🔬', /\b(science|stem|steam|experiments?|discovery|planetarium|explore)\b/i],
  ['water', 'Water play', '💦', /\b(splash|sprayground|swim\w*|pools?|aquatic)\b/i],
  ['vehicles', 'Things that go', '🚂', /\b(trains?|railroad|trucks?|tractors?|carousel|buses|planes?)\b/i],
  ['market', 'Market', '🧺', /\b(markets?)\b/i],
  ['play', 'Play time', '🤸', /\b(play ?time|open play|playgroups?|tumbl\w*|gym\w*|bounce|meet-?ups?|baby time|toddler time|play ?date)\b/i],
  ['playground', 'Playground', '🛝', /\b(playgrounds?)\b/i],
];

// A place with nothing in its name to go by: by its kind.
const BY_KIND = {
  park: ['park', 'Park', '🌳'], garden: ['garden', 'Garden', '🌷'], museum: ['museum', 'Museum', '🏛️'],
  library: ['library', 'Library', '📚'], playground: ['playground', 'Playground', '🛝'], greenway: ['nature', 'Nature walk', '🌿'],
  farm: ['animals', 'Animals', '🐾'],
  event: ['event', 'Event', '📅'],
};

/** Every type a stop can be: { id, label, icon }, once each. */
export const TYPES = [...new Map([...BY_WORDS, ...Object.values(BY_KIND)].map(([id, label, icon]) => [id, { id, label, icon }])).values()];

/** What kind of stop this is: { id, label, icon }. */
export function typeOfStop(s) {
  const text = `${s.title ?? ''} ${s.venue ?? ''}`;
  // A place's kind says more than a word in its name (a museum called Marbles), except a zoo or a farm park.
  if (s.kind !== 'event' && BY_KIND[s.kind] && !/\b(zoo|farm|splash|playground)\b/i.test(text)) {
    const [id, label, icon] = BY_KIND[s.kind];
    return { id, label, icon };
  }
  const hit = BY_WORDS.find(([, , , words]) => words.test(text)) ?? BY_KIND[s.kind] ?? BY_KIND.event;
  return { id: hit[0], label: hit[1], icon: hit[2] };
}

/** What kind of outing this is: its first stop's type. */
export const typeOf = (o) => typeOfStop(stopsOf(o)[0]);
