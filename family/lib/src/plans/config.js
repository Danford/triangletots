// Fixed settings for the day-plan library. See docs/day-plans.md.

/** How many days ahead are kept planned, today included. */
export const HORIZON_DAYS = 14;

/**
 * Age bands, matching Tot Routines (apps/routines/www/data.js), each with the three
 * common nap patterns one Claude run plans for. Times are typical, not prescriptive:
 * the app replaces them with the family's own.
 */
export const AGE_BANDS = [
  {
    id: 't1', label: '12–23 months', ageYears: 1.5,
    naps: [
      { id: 'two-naps', label: 'Two naps', wake: '07:00', bed: '19:00', sleep: [['09:30', '10:30'], ['14:30', '15:30']] },
      { id: 'early-nap', label: 'One nap, 12 to 2', wake: '07:00', bed: '19:00', sleep: [['12:00', '14:00']] },
      { id: 'late-nap', label: 'One nap, 1 to 3', wake: '07:00', bed: '19:30', sleep: [['13:00', '15:00']] },
    ],
  },
  {
    id: 't2', label: '2 years', ageYears: 2.5,
    naps: [
      { id: 'early-nap', label: 'One nap, 12 to 2', wake: '07:00', bed: '19:30', sleep: [['12:00', '14:00']] },
      { id: 'late-nap', label: 'One nap, 1 to 3', wake: '07:00', bed: '20:00', sleep: [['13:00', '15:00']] },
      { id: 'short-nap', label: 'Short nap, 1 to 2', wake: '07:00', bed: '19:30', sleep: [['13:00', '14:00']] },
    ],
  },
  {
    id: 't3', label: '3 years', ageYears: 3.5,
    naps: [
      { id: 'nap', label: 'Nap, 1 to 2:30', wake: '07:00', bed: '20:00', sleep: [['13:00', '14:30']] },
      { id: 'quiet', label: 'Quiet time, no sleep', wake: '07:00', bed: '19:30', quiet: [['13:00', '13:45']] },
      { id: 'no-nap', label: 'No nap', wake: '07:00', bed: '19:30' },
    ],
  },
  {
    id: 't4', label: '4–5 years', ageYears: 4.5,
    naps: [
      { id: 'short-nap', label: 'Short nap, 1 to 2', wake: '07:00', bed: '20:00', sleep: [['13:00', '14:00']] },
      { id: 'quiet', label: 'Quiet time', wake: '07:00', bed: '19:30', quiet: [['13:00', '13:45']] },
      { id: 'no-nap', label: 'No nap', wake: '07:00', bed: '19:30' },
    ],
  },
];

export const INTERESTS = ['animals', 'vehicles', 'dinosaurs', 'water', 'art', 'music', 'movement', 'stories', 'science', 'nature'];

/** See areaOfPoint in gather.js. */
export const AREAS = ['raleigh', 'north-raleigh', 'cary-apex', 'south-wake', 'east-wake', 'durham', 'chapel-hill'];

/** The point the forecast is taken for: downtown Raleigh. */
export const FORECAST_POINT = { lat: 35.7796, lon: -78.6382 };

/**
 * Event sources searched. The parks and recreation registration sites (RecLink
 * and the ActiveNet towns) are mostly multi-week classes, which candidatesFor
 * leaves out; their one-day programs and drop-ins are what a plan can use.
 */
export const PLAN_SOURCES = [
  'wake-county', 'libcal', 'raleigh', 'cary', 'apex', 'durham-city', 'museum',
  'reclink', 'wake-parks', 'durham-rec', 'apex-rec', 'morrisville-rec',
  'cary-rec', 'holly-springs-rec', 'fuquay-rec', 'dix-park', 'state-parks',
  'north-hills', 'weekly',
];

/** What makes a published plan need revising. See docs/day-plans.md. */
export const THRESHOLDS = { rainPct: 50, hotF: 90, coldF: 40, movedMinutes: 15 };

/** Candidate events shown to Claude per band per day, best first. Keeps the prompt small. */
export const MAX_EVENTS_PER_DAY = 45;

/**
 * Named in full: the CLI's `sonnet` alias means whatever its version thinks, and an old
 * CLI's alias is a model that costs seven times as much here. See docs/day-plans.md.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Takes over from the default model for a day it can't do, as on a CLI too old to run it. */
export const FALLBACK_MODEL = 'sonnet';
