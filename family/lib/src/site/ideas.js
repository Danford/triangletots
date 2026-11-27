// Things to do in a day's play-at-home time, so "Play at home" comes with ideas.
//
// Code only, no Claude call: a fixed list of activities, each marked with where it
// goes (in, out or either), its mood (calm, busy or either), the ages it suits and
// its themes (the plan interests, the seasons and holidays). Each play block of a
// timeline gets a few, picked by its mood (calm before a nap, quiet time or bed),
// where it can be (outside only in daylight and fine weather), the day's season and
// holiday and the outing's interests, and different every block of the day.

import { badWeather } from '../plans/day-facts.js';
import { sunTimes } from './sky.js';

// ages: [youngest, oldest] band, 1 = 12–23 months … 4 = 4–5 years.
const A = (place, mood, ages, themes, title, how) => ({ place, mood, ages, themes, title, how });

export const IDEAS = [
  // Inside, calm
  A('in', 'calm', [1, 4], ['stories'], 'Book basket', 'Spread a few favourite books on the floor and let them choose; read the same one twice if they ask.'),
  A('in', 'calm', [1, 4], ['science'], 'Scoop and pour', 'A shallow tub of dry oats with cups, spoons and a funnel. A towel underneath catches the spills.'),
  A('in', 'calm', [1, 4], ['art'], 'Big-paper crayons', 'Tape a big sheet of paper to the floor or table and draw together with chunky crayons.'),
  A('in', 'calm', [1, 4], [], 'Chunky puzzles', 'Knob or chunky puzzles; name each piece as it goes in.'),
  A('in', 'calm', [1, 3], [], 'Stack and topple', 'Stack cups or blocks as high as they can go, then knock them down and start again.'),
  A('in', 'calm', [1, 2], [], 'Posting box', 'Cut a slot in a shoebox lid and post jar lids or old playing cards through it.'),
  A('in', 'calm', [1, 4], ['animals', 'vehicles', 'nature'], 'Window spotting', 'Look out of the window together and name what goes by: birds, dogs, trucks, buses.'),
  A('in', 'calm', [1, 3], ['music'], 'Songs with hands', 'Slow songs with actions: Itsy Bitsy Spider, Twinkle Twinkle, Wheels on the Bus.'),
  A('in', 'calm', [1, 4], ['stories'], 'Family photos', 'Look through photos on your phone and name everyone in them.'),
  A('in', 'calm', [1, 4], ['water'], 'Toy wash', 'A dishpan of soapy water, a washcloth and the plastic toys that need a bath. Towel underneath.'),
  A('in', 'calm', [1, 4], ['water', 'science'], 'Sink play', 'A step stool at the sink, a trickle of water and cups to fill, pour and tip.'),
  A('in', 'calm', [2, 4], ['art'], 'Stickers', 'A sheet of big stickers and a piece of paper; peel one corner to start each for little fingers.'),
  A('in', 'calm', [2, 4], ['art'], 'Playdough', 'Rolling pin, cookie cutters and a blunt knife. Make snakes, pancakes and birthday cakes.'),
  A('in', 'calm', [2, 4], [], 'Sock match', 'Tip out the clean socks and find the pairs together.'),
  A('in', 'calm', [2, 4], ['animals'], 'Homes for the animals', 'Give each toy animal a home in a box or basket: the farm on one side, the zoo on the other.'),
  A('in', 'calm', [2, 4], ['dinosaurs', 'science'], 'Dinosaur dig', 'Hide toy dinosaurs in a tub of dry rice and dig them out with a paintbrush and spoon.'),
  A('in', 'calm', [2, 4], ['stories'], 'Blanket fort reading', 'Drape a blanket over two chairs and read in there with a flashlight.'),
  A('in', 'calm', [2, 4], ['art', 'water'], 'Water painting', 'A paintbrush and a cup of water on dark paper: the pictures appear, then fade away.'),
  A('in', 'calm', [2, 4], ['art', 'science'], 'Shaving-cream tray', 'Squirt shaving cream on a baking tray and draw in it with fingers. A drop of food colouring to swirl.'),
  A('in', 'calm', [2, 4], ['water', 'science'], 'Sink or float', 'A bowl of water and a handful of things from around the house: guess, drop in, see.'),
  A('in', 'calm', [2, 4], ['animals', 'movement'], 'Animal yoga', 'Stretch like a cat, sit like a frog, stand like a flamingo, curl up like a sleeping mouse.'),
  A('in', 'calm', [2, 4], [], 'Pizza back', 'Make a pizza on their back: knead the dough, spread the sauce, sprinkle the cheese. Then swap.'),
  A('in', 'calm', [3, 4], ['science'], 'Colour sort', 'Sort pom-poms or buttons by colour into a muffin tin, with tongs for an extra challenge.'),
  A('in', 'calm', [3, 4], ['art'], 'Threading', 'Thread big beads, cut straws or penne onto a pipe cleaner or shoelace.'),
  A('in', 'calm', [3, 4], ['animals'], 'Animal hospital', 'Bandage the stuffed animals with tape and scraps of cloth, and check them with a toy stethoscope.'),
  A('in', 'calm', [3, 4], ['science', 'water'], 'Colour mixing', 'Cups of coloured water and a dropper or spoon: mix red and yellow, blue and yellow, and see.'),
  A('in', 'calm', [3, 4], ['stories'], 'Shadow puppets', 'Shine a flashlight on the wall and make a dog, a bird and a bunny with your hands.'),
  A('in', 'calm', [3, 4], ['stories'], 'Tell it back', 'Read a short story, then let them tell it back to you with the pictures.'),

  // Inside, busy
  A('in', 'busy', [1, 4], ['music', 'movement'], 'Freeze dance', 'Put on a song and dance; pause it and everyone freezes.'),
  A('in', 'busy', [1, 4], ['movement'], 'Cushion course', 'Couch cushions on the floor to climb, crawl over and jump onto.'),
  A('in', 'busy', [1, 4], ['vehicles'], 'Box car', 'A big cardboard box to sit in and be pushed around, or to drive with a paper-plate wheel.'),
  A('in', 'busy', [1, 3], ['music'], 'Kitchen band', 'Pots, pans, wooden spoons and a box of rice to shake. March around playing.'),
  A('in', 'busy', [1, 4], ['music', 'movement'], 'Scarf dancing', 'Wave scarves or dish towels high and low, fast and slow, to music.'),
  A('in', 'busy', [1, 3], ['movement'], 'Bubble-wrap stomp', 'Tape a sheet of bubble wrap to the floor and stomp, jump and crawl across it.'),
  A('in', 'busy', [1, 3], ['vehicles'], 'Laundry-basket rides', 'Give them rides in the laundry basket, or let them push a teddy around in it.'),
  A('in', 'busy', [1, 2], ['movement'], 'Ball drop', 'A pile of soft balls to roll, chase, and drop into a box or basket.'),
  A('in', 'busy', [2, 4], ['movement'], 'Balloon keep-up', 'Keep a balloon off the floor with hands, feet and heads. Pick up any popped pieces straight away.'),
  A('in', 'busy', [2, 4], ['movement'], 'Hallway bowling', 'Line up empty plastic bottles and roll a soft ball at them.'),
  A('in', 'busy', [2, 4], ['vehicles'], 'Tape roads', 'Painter\'s tape roads across the floor for toy cars, with a block tunnel and a parking spot.'),
  A('in', 'busy', [2, 4], ['animals', 'movement'], 'Animal walks', 'Bear crawl, frog hop, crab walk and penguin waddle from one side of the room to the other.'),
  A('in', 'busy', [2, 4], ['movement'], 'Tape balance beam', 'A long line of tape on the floor to walk heel to toe, sideways and backwards.'),
  A('in', 'busy', [2, 4], ['movement'], 'Beanbag toss', 'Toss beanbags or rolled socks into a laundry basket; step back after each one that goes in.'),
  A('in', 'busy', [2, 4], [], 'Hide the toy', 'Hide a favourite toy while they cover their eyes, then say "warmer" and "colder" as they hunt.'),
  A('in', 'any', [2, 4], ['science'], 'Kitchen helper', 'Wash vegetables, tear lettuce or stir the batter for a snack together.'),
  A('in', 'busy', [3, 4], ['movement'], 'Simon says', 'Touch your toes, jump twice, spin around: only when Simon says.'),
  A('in', 'busy', [3, 4], ['stories'], 'Puppet show', 'Socks or stuffed animals behind the couch put on a show; you get to be the audience.'),
  A('in', 'any', [3, 4], [], 'Pretend shop', 'Set out cans and boxes from the cupboard as a shop, with a bag and play money.'),
  A('in', 'busy', [3, 4], ['science', 'dinosaurs'], 'Fizzy volcano', 'Baking soda in a cup on a tray, then vinegar with a drop of food colouring. Dinosaurs optional.'),
  A('any', 'calm', [2, 4], ['science', 'water'], 'Ice rescue', 'Keep an ice-cube tray of little frozen toys in the freezer for a day like this; rescue them with warm water, spoons and salt.'),

  // Outside, busy
  A('out', 'busy', [1, 4], ['movement'], 'Bubbles', 'Blow bubbles for them to chase, pop and stomp.'),
  A('out', 'busy', [1, 4], ['movement'], 'Ball in the yard', 'Kick, roll and throw a big ball; set up two buckets as a goal.'),
  A('out', 'busy', [1, 4], ['vehicles'], 'Ride and push', 'Ride-on toy, push walker, tricycle or a toy stroller up and down the driveway.'),
  A('out', 'busy', [1, 4], ['nature'], 'Dig', 'Sandbox, a patch of dirt or a big pot: a shovel and bucket to dig, fill and dump.'),
  A('out', 'busy', [2, 4], ['nature'], 'Scavenger hunt', 'Find something red, something bumpy, a leaf, a stick and a smooth rock.'),
  A('out', 'busy', [2, 4], ['art', 'movement'], 'Chalk path', 'Draw a chalk path of zigzags, circles to jump in and lines to tiptoe along.'),
  A('out', 'busy', [2, 4], ['nature', 'art'], 'Mud kitchen', 'Old pots, spoons, dirt and water for mud pies and leaf soup. Clothes you don\'t mind.'),
  A('out', 'busy', [2, 4], ['movement'], 'Yard obstacle course', 'Hop over a pool noodle, crawl under a chair, run round a tree and back.'),
  A('out', 'busy', [2, 4], ['science'], 'Roll it down', 'Roll balls and toy cars down the slide or a board on a step: which goes farthest?'),
  A('out', 'busy', [3, 4], ['movement'], 'Red light, green light', 'Run on green, freeze on red, tiptoe on yellow.'),
  A('out', 'busy', [3, 4], ['movement'], 'Races', 'Run, hop, skip or walk backwards to the tree and back. Everyone wins.'),

  // Outside, calm
  A('out', 'calm', [1, 4], ['art', 'water'], 'Paint with water', 'A bucket of water and a big paintbrush to "paint" the fence, steps and sidewalk.'),
  A('out', 'calm', [1, 4], ['animals', 'vehicles'], 'Wagon or stroller walk', 'A slow loop of the block; count the dogs, cats and trucks you pass.'),
  A('out', 'calm', [1, 4], ['nature'], 'Blanket in the grass', 'Lie on a blanket under a tree and watch the leaves and clouds move. Bring a book.'),
  A('out', 'calm', [2, 4], ['art'], 'Sidewalk chalk', 'Draw on the driveway together: the family, the sun, a house, a road for cars.'),
  A('out', 'calm', [2, 4], ['nature', 'science'], 'Bug hunt', 'Look under rocks and logs for roly-polies, worms and ants. A magnifying glass helps.'),
  A('out', 'calm', [2, 4], ['animals', 'nature'], 'Bird watch', 'Sit quietly and look for birds: count them, point out colours, copy their songs.'),
  A('out', 'calm', [2, 4], ['nature', 'science'], 'Sort the treasures', 'Collect sticks, rocks and leaves into a bucket, then sort them by size or colour.'),
  A('out', 'calm', [3, 4], ['art', 'science'], 'Shadow tracing', 'On a sunny day, set toys on paper and trace their shadows with chalk or crayon.'),

  // Seasons and holidays
  A('out', 'busy', [1, 4], ['fall', 'nature'], 'Leaf pile', 'Rake up a pile of leaves to jump in, throw up in the air and bury feet.'),
  A('out', 'calm', [2, 4], ['fall', 'nature', 'art'], 'Leaf colours', 'Collect leaves and sort them: red, yellow, orange, brown. Biggest and smallest.'),
  A('out', 'busy', [2, 4], ['fall', 'nature'], 'Acorn and pinecone hunt', 'Fill a bucket with acorns and pinecones, then count them out.'),
  A('any', 'calm', [3, 4], ['fall', 'art'], 'Leaf rubbings', 'Put a leaf under paper and rub a crayon on its side to see the veins appear.'),
  A('out', 'busy', [2, 4], ['fall', 'halloween'], 'Pumpkin roll', 'Roll small pumpkins down a gentle slope, or bowl them at plastic bottles.'),
  A('any', 'calm', [2, 4], ['halloween', 'fall', 'art'], 'Decorate a pumpkin', 'Stickers, markers or paint on a small pumpkin; no carving.'),
  A('any', 'calm', [2, 4], ['halloween', 'science'], 'Pumpkin guts', 'Scoop the inside of a pumpkin into a bowl with spoons and hands; find the seeds.'),
  A('out', 'busy', [2, 4], ['halloween'], 'Costume parade', 'Costumes on and a parade down the driveway, with a pot to drum.'),
  A('in', 'busy', [1, 4], ['halloween', 'music'], 'Monster dance', 'Stomp like a monster, fly like a bat, creep like a cat, then freeze.'),
  A('out', 'calm', [1, 4], ['halloween', 'christmas'], 'Decoration walk', 'Walk the street and spot the decorations: pumpkins, lights, wreaths.'),
  A('in', 'calm', [2, 4], ['thanksgiving', 'art'], 'Handprint turkey', 'Paint their hand and print it as a turkey; add eyes and legs with a marker.'),
  A('in', 'any', [2, 4], ['thanksgiving'], 'Pretend feast', 'Set a table for the stuffed animals with play food, and pass the dishes round.'),
  A('out', 'calm', [3, 4], ['fall', 'winter', 'animals'], 'Pinecone bird feeder', 'Spread sunflower butter on a pinecone, roll it in birdseed and hang it outside.'),
  A('out', 'calm', [1, 4], ['winter', 'nature'], 'Frost hunt', 'On a cold morning, look for frost on the grass, cars and leaves, and breathe "dragon smoke".'),
  A('in', 'calm', [4, 4], ['winter', 'art'], 'Paper snowflakes', 'Fold paper and snip the edges with child scissors; open them up and hang them in the window.'),
  A('in', 'calm', [2, 4], ['christmas', 'art'], 'Sticker tree', 'Draw a big tree on paper and decorate it with dot stickers and star stickers.'),
  A('in', 'calm', [2, 4], ['valentines', 'art'], 'Heart cards', 'Stickers and crayons on folded paper for the grandparents.'),
  A('out', 'calm', [2, 4], ['spring', 'nature', 'science'], 'Plant a seed', 'A cup of soil and a big seed (bean or sunflower); water it and check it each day.'),
  A('out', 'calm', [2, 4], ['spring', 'nature', 'art'], 'Petal collage', 'Collect fallen petals and leaves and stick them on contact paper.'),
  A('out', 'busy', [1, 4], ['summer', 'water'], 'Sprinkler', 'Swimsuit on and run through the sprinkler, or fill a small tub to splash in.'),
  A('out', 'calm', [1, 4], ['spring', 'summer', 'water'], 'Water table', 'A tub of water with cups, funnels, a sponge and boats on a little table or the ground.'),
  A('out', 'calm', [2, 4], ['summer', 'art'], 'Ice painting', 'Freeze coloured water in an ice cube tray; paint with the cubes on paper outside.'),
  A('out', 'busy', [2, 4], ['july4', 'music'], 'Flag parade', 'A paper flag or ribbons on a stick and a march round the yard with a drum.'),
];

const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const HOLIDAYS = ['halloween', 'thanksgiving', 'christmas', 'valentines', 'july4'];
const dated = (t) => SEASONS.includes(t) || HOLIDAYS.includes(t);

/** The day's season, and any holiday within `lead` days ahead (each holiday's own lead by default). */
export function dayThemes(date, lead) {
  const [y, m, d] = date.split('-').map(Number);
  const season = m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'fall' : 'winter';
  const out = [season];
  const within = (mm, dd, days) => { const t = Date.UTC(y, mm - 1, dd) - Date.UTC(y, m - 1, d); return t >= 0 && t <= (lead ?? days) * 864e5; };
  if (within(10, 31, 14)) out.push('halloween');
  const firstThu = (11 - new Date(Date.UTC(y, 10, 1)).getUTCDay() + 7) % 7 + 1; // 4 = Thursday
  if (within(11, firstThu + 21, 7)) out.push('thanksgiving');
  if (within(12, 25, 24)) out.push('christmas');
  if (within(2, 14, 7)) out.push('valentines');
  if (within(7, 4, 6)) out.push('july4');
  return out;
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// A play block worth ideas: free play, not a set thing like trick-or-treating.
const IDEA_BLOCK = /\b(play|outside|unwind|wind[- ]down)\b/i;
const SET_THING = /trick-or-treat|treat haul/i;
const CALM_TITLE = /\b(calm|quiet|wind|unwind|rest|evening)\b/i;
const OUT_TITLE = /\b(park|playground|outside|outdoors?|backyard|yard|garden|walk)\b/i;
const IN_TITLE = /\b(home|indoors?|inside)\b/i;

// A small seeded number in [0, 1), so a day's picks are the same every build.
const rand = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007; };

/**
 * Ideas for each play block of a timeline: an array as long as `blocks`, with a
 * list of `{ title, how, outside }` for each play block worth some and null for
 * the rest. `band` is the age band id (t1–t4); `outing` the day's outing, whose
 * interests lean the picks.
 */
export function playIdeas(blocks, { date, band, weather, outing, second = null, seed = '' }) {
  const age = Number(band.slice(1));
  if (!(age >= 1 && age <= 4)) throw new Error(`playIdeas needs an age band t1–t4, got ${band}`);
  const wet = badWeather(weather).length > 0;
  const { set: sunset } = sunTimes(date);
  const themes = new Set([...dayThemes(date), ...(outing?.interests ?? []), ...(second?.interests ?? [])]);
  const bigDay = dayThemes(date, 1).some((t) => HOLIDAYS.includes(t));
  const used = new Set();
  return blocks.map((b, i) => {
    if (b.kind !== 'play' || !IDEA_BLOCK.test(b.title) || SET_THING.test(b.title)) return null;
    const s = toMin(b.start), e = toMin(b.end);
    const next = blocks[i + 1]?.kind;
    const calm = CALM_TITLE.test(b.title) || next === 'nap' || next === 'quiet' || toMin(blocks.at(-1).end) - e < 120;
    // Outside only in daylight and fine weather; the block's own title says if it is meant to be.
    const daylight = e <= sunset - 15 || s <= sunset - 45;
    const canOut = !wet && daylight;
    const place = OUT_TITLE.test(b.title) && !IN_TITLE.test(b.title) ? 'out' : OUT_TITLE.test(b.title) ? 'either' : 'in';
    const wantOut = canOut && place !== 'in';
    // A couple of good ideas rather than a list: none for a few minutes, two at most.
    const n = e - s < 20 ? 0 : e - s < 60 ? 1 : 2;
    if (!n) return null;
    const fits = (x) => age >= x.ages[0] && age <= x.ages[1] && !used.has(x.title)
      && (calm ? x.mood !== 'busy' : true)
      && (!x.themes.some(dated) || x.themes.some((t) => dated(t) && themes.has(t)))
      && (x.place === 'any' || (x.place === 'out' ? canOut && (place !== 'in' || n > 1) : place !== 'out' || !canOut));
    // Led by the outing's interests (after the farm, the animals), then the season; chance keeps the rest in play.
    const score = (x) => (x.themes.some((t) => dated(t) && themes.has(t)) ? 0.8 : 0) + (x.themes.some((t) => !dated(t) && themes.has(t)) ? 1.6 : 0)
      + (calm ? 0 : x.mood === 'busy' ? 0.7 : 0) + rand(`${seed}|${date}|${band}|${b.start}|${x.title}`) * 2;
    const ranked = IDEAS.filter(fits).sort((x, y) => score(y) - score(x));
    const picks = [];
    // One seasonal or holiday idea a block (two on the holiday itself or its eve).
    const seasonal = (x) => x.themes.some(dated);
    const take = (want) => {
      const x = ranked.find((y) => want(y) && !picks.includes(y) && (!seasonal(y) || picks.filter(seasonal).length < (bigDay ? 2 : 1)));
      if (x && picks.length < n) picks.push(x);
    };
    // A block that can go outside leads with an outside idea; "at home" ones get one only when there's room for two.
    if (wantOut || (canOut && n > 1)) take((x) => x.place === 'out');
    // An inside one too where it's meant for home, so either works.
    if (place !== 'out' || !canOut) take((x) => x.place !== 'out');
    while (picks.length < n && ranked.some((y) => !picks.includes(y))) { const k = picks.length; take(() => true); if (picks.length === k) break; }
    for (const x of picks) used.add(x.title);
    return picks.map((x) => ({ title: x.title, how: x.how, outside: x.place === 'out' }));
  });
}
