// What the Triangle Tots site says about itself and the paid custom plans.
// Prices and the sign-up link are business decisions: change them here only.

export const SITE = {
  name: 'Triangle Tots',
  domain: 'triangletots.com',
  tagline: 'A whole day out with your little one, planned around the nap.',
  publisher: 'Danford Enterprises, LLC',
  // The day the site first went up. The home page greets new arrivals with how new we are ("Day 9") for the first
  // `newForDays` days; set newForDays to 0 to take the greeting down.
  opened: '2026-10-28',
  newForDays: 120,
  // The Google Ads tag (gtag.js), so Ads can count who came from an ad and joined (/welcome/). On every page but
  // /family/, which holds a family's own details. The privacy page says so; set to '' to take it off everywhere.
  googleAds: 'AW-18557917533',
  // Google Analytics (GA4), so the owner can see how the site is used: visitors, return visits, devices, the path
  // to a sign-up. Shares the one gtag.js load with the Ads tag, on the same pages, and is alone on /family/, where a
  // signed-in family has a scrambled User-ID (src/family/www/family.js). '' takes it off everywhere.
  googleAnalytics: 'G-8XG7Z6P3H6',
};

export const SIGNUP = {
  // The visit count and the email lists. See docs/ecosystem-plan.md.
  api: 'https://sync.tottoolbox.com',
  contact: 'support@tottoolbox.com',
  // false until the Sunday email really goes out, so the sign-up doesn't promise this Sunday.
  sundayStarted: true,
  // The switch for Triangle Tots Family. false: the build has no trace of it. The owner turned it on 2026-11-09;
  // docs/family-plans.md lists everything it needs.
  familyOpen: true,
};

export const CUSTOM_PLANS = {
  // Shown on /custom/. Yearly is 10 months' worth, as Tot Routines.
  monthly: '$10',
  yearly: '$100',
  // Where "Get my plans" goes. null: paid sign-up is off, and /custom/ is a free waitlist.
  // Keep it null until the launch gates in docs/ecosystem-plan.md are met and the owner says so.
  signupUrl: null,
};

// Short links for what's handed out or posted: triangletots.com/go/<name>/. See docs/marketing-review.md.
// The handout cards (scripts/flyer-cards.mjs) get one per place and design, e.g. flyer-library-rain, so every
// printed card can be told apart.
export const FLYER_PLACES = ['library', 'play'];
export const FLYER_DESIGNS = ['sun', 'rain', 'nap', 'story', 'free'];
export const GO_LINKS = ['flyer-library', 'flyer-doctor', 'flyer-preschool', 'flyer-play', 'facebook', 'reddit', 'magazine', 'neighbor',
  ...FLYER_PLACES.flatMap(p => FLYER_DESIGNS.map(d => `flyer-${p}-${d}`))];

export const AREA_NAMES = {
  'raleigh': 'Raleigh',
  'north-raleigh': 'North Raleigh / Wake Forest',
  'cary-apex': 'Cary / Apex',
  'south-wake': 'South Wake',
  'east-wake': 'East Wake',
  'durham': 'Durham',
  'chapel-hill': 'Chapel Hill / Pittsboro',
};

export const BAND_NAMES = {
  t1: { short: '1', long: '12–23 months', kid: 'young toddler', plans: 'Toddler day plans' },
  t2: { short: '2', long: '2 years', kid: '2-year-old', plans: 'Toddler day plans' },
  t3: { short: '3', long: '3 years', kid: '3-year-old', plans: 'Toddler day plans' },
  // A 5-year-old is nobody's toddler.
  t4: { short: '4–5', long: '4–5 years', kid: 'preschooler', plans: 'Preschooler day plans' },
};
