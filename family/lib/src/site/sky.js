// The sky over Raleigh on a given day: when the sun rises and sets, and the
// colours of the sky through the day built around those times, so a December
// strip is dark by 5:30 pm and a June one is light past 8.

import { FORECAST_POINT } from '../plans/config.js';

const RAD = Math.PI / 180;

/** Minutes the plans' clock (America/New_York) is ahead of UTC on a date: -240 in summer, -300 in winter. */
export function utcOffsetMin(date) {
  const [y, m, d] = date.split('-').map(Number);
  // Noon: daylight saving changes at 2 am, so the daytime hours have noon's offset.
  const noon = Date.UTC(y, m - 1, d, 12);
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(noon));
  return (h - 12) * 60;
}

/**
 * Sunrise and sunset on a date ("2026-10-27"), in minutes from local midnight.
 * NOAA's general solar position formulas, good to a minute or two.
 */
export function sunTimes(date, { lat, lon } = FORECAST_POINT) {
  const [y, m, d] = date.split('-').map(Number);
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const g = (2 * Math.PI / (leap ? 366 : 365)) * (dayOfYear - 1 + 0.5); // the fractional year, at noon
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  // The hour angle at which the sun's top edge crosses the horizon, refraction included.
  const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl)) / RAD;
  const offset = utcOffsetMin(date);
  return {
    rise: Math.round(720 - 4 * (lon + ha) - eqTime + offset),
    set: Math.round(720 - 4 * (lon - ha) - eqTime + offset),
  };
}

/**
 * The sky's colours through the day as [minute, colour] stops: night, the glow
 * before sunrise, morning, midday at solar noon, the gold of late afternoon,
 * dusk at sunset and night again. Dawn and dusk each take about an hour and a
 * half (twilight runs that long), in small steps so neither shows a seam.
 */
export function skyStops({ rise, set }) {
  const noon = Math.round((rise + set) / 2);
  return [
    [0, '#26305e'], [rise - 95, '#26305e'], [rise - 70, '#2c3669'], [rise - 50, '#363f78'], [rise - 32, '#4a4b88'],
    [rise - 18, '#6e5f95'], [rise - 6, '#a27a9c'], [rise + 6, '#d2979f'], [rise + 20, '#efb6a1'], [rise + 38, '#f6caa8'],
    [rise + 65, '#ead8cc'], [rise + 100, '#d6e3ee'], [rise + 140, '#cfe6f6'],
    [noon, '#b2d7f1'], [set - 160, '#b2d7f1'], [set - 110, '#cdd8d6'], [set - 75, '#ead7a6'], [set - 45, '#f4d08c'],
    [set - 22, '#f2bb8c'], [set - 6, '#dc9f98'], [set + 8, '#b993af'], [set + 22, '#8f80b4'], [set + 38, '#66629f'],
    [set + 56, '#4b4f8e'], [set + 76, '#363f78'], [set + 100, '#2c3669'], [set + 125, '#26305e'], [1440, '#26305e'],
  ];
}
