// The frame of the site's map of the Triangle (site/map*.svg, drawn by scripts/make-map.js) and
// its towns. Kept apart from map.js, which writes pages, so the family page's route map can
// run this one file in the browser (src/family/routemap.js).

export const BOUNDS = { west: -79.25, east: -78.25, north: 36.12, south: 35.5 };
export const MAP_W = 1000;
// Degrees of longitude are shorter than degrees of latitude here, by the cosine of 35.8°.
export const MAP_H = 764;

/** A point's place on the map, in the map's own units. */
export function xyOf(lat, lon) {
  return [((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * MAP_W, ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * MAP_H];
}

export const TOWNS = [
  { name: 'Raleigh', lat: 35.7796, lon: -78.6382, big: true },
  { name: 'Durham', lat: 35.994, lon: -78.8986, big: true },
  { name: 'Chapel Hill', lat: 35.9132, lon: -79.0558, big: true, dy: 26 },
  { name: 'Cary', lat: 35.7915, lon: -78.7811 },
  { name: 'Apex', lat: 35.7327, lon: -78.8503, dy: 20 },
  { name: 'Morrisville', lat: 35.8235, lon: -78.8256, anchor: 'end', dy: -6 },
  { name: 'Wake Forest', lat: 35.9799, lon: -78.5097 },
  { name: 'Garner', lat: 35.7113, lon: -78.6142, dy: 20 },
  { name: 'Holly Springs', lat: 35.6513, lon: -78.8336, dy: 20 },
  { name: 'Fuquay-Varina', lat: 35.5843, lon: -78.8 , dy: 20 },
  { name: 'Knightdale', lat: 35.7877, lon: -78.4806, anchor: 'start', dy: 5 },
  { name: 'Pittsboro', lat: 35.72, lon: -79.1772 },
  { name: 'Hillsborough', lat: 36.0754, lon: -79.0997 },
];
