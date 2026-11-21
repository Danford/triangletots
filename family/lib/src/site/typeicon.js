// The icon for what an outing, event or place is (src/family/icons.js, the same ones the family page shows), for the
// public pages: a storytime is a 📖 and a museum a 🏛️ on a map pin, a card's heading and a list alike. Built at build
// time, so a page carries the picture itself.

import { typeOfStop } from '../family/icons.js';

/** A stop or event ({ title, venue, kind }) as it is in the plans, or a place ({ name, kind }): its icon. */
export const iconOf = (x) => typeOfStop({ kind: x.kind, title: x.title ?? x.name, venue: x.venue }).icon;

/** Nap time on the day strip: a sleepy teddy bear in a nightcap and striped pajamas (no emoji has the pajamas). */
export const NAP_BEAR = '<svg class="bear" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="9" r="2.6" fill="#a8744a"/><circle cx="18" cy="9" r="2.6" fill="#a8744a"/>'
  + '<path d="M5.5 24v-3.2q0-3.4 6.5-3.4t6.5 3.4V24z" fill="#7d93e0"/><path d="M9 17.7V24M12 17.4V24M15 17.7V24" stroke="#fff" stroke-opacity=".75" stroke-width="1.1"/>'
  + '<circle cx="12" cy="11.5" r="6.2" fill="#c08a58"/><ellipse cx="12" cy="13.8" rx="2.8" ry="2.1" fill="#f1d5ae"/>'
  + '<path d="M9 11.1q1 .9 2 0M13 11.1q1 .9 2 0" stroke="#3b2a1d" stroke-width=".9" fill="none" stroke-linecap="round"/><ellipse cx="12" cy="13" rx=".9" ry=".65" fill="#3b2a1d"/>'
  + '<path d="M6.3 8.2Q7.6 2.6 16.8 2.2 15 4.2 17.7 8.2Q12 6 6.3 8.2z" fill="#6c86d6"/><circle cx="17" cy="2.4" r="1.5" fill="#fff"/></svg>';

/** The icon ahead of a name or heading, as markup (decoration: the words beside it say the same). '' with no icon. */
export const typeIcon = (x) => `<span class="ti" aria-hidden="true">${iconOf(x)}</span> `;
