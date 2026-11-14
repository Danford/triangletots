// Carrying saved plans from the site into Tot Routines, without the server reading them and
// without the family's key ever leaving the phone. The same steps as a Tot Routines invite
// (apps/routines/www/sync.js): 32 random bytes shown as a QR code or typed, an id and a sealing
// key made from them by HKDF, a box sealed with AES-GCM as "e1.…". The server holds the box
// for 15 minutes under the id, hands it out once, and never sees the code. The code never
// touches the family's secret: the app opens the box and seals what's in it with the family's
// own keys, as it does everything else. Runs in the browser and in Node's WebCrypto.

/** What a link's QR code holds, or what's typed: the tag and 43 characters. */
export const LINK_TAG = 'TOTPLANS1:';
const LINK_RE = /^TOTPLANS1:([A-Za-z0-9_-]{43})$/;

const utf8 = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hkdf = (what) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8.encode(`tot-routines ${what}`) });

/** The code in a scanned or typed text, or null. */
export const linkCode = (text) => LINK_RE.exec(String(text).trim())?.[1] ?? null;

async function linkKeys(code) {
  const root = await crypto.subtle.importKey('raw', unb64(code), 'HKDF', false, ['deriveBits', 'deriveKey']);
  return {
    id: b64(await crypto.subtle.deriveBits(hkdf('plans link id'), root, 128)),
    seal: await crypto.subtle.deriveKey(hkdf('plans link seal'), root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  };
}

/** Seals `content` for the app. @returns {{ text, id, box }} text for the code; id and box for the server. */
export async function makeLink(content) {
  const code = b64(crypto.getRandomValues(new Uint8Array(32)));
  const { id, seal } = await linkKeys(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(id) }, seal, utf8.encode(JSON.stringify(content))));
  const all = new Uint8Array(12 + sealed.length);
  all.set(iv);
  all.set(sealed, 12);
  return { text: LINK_TAG + code, id, box: `e1.${b64(all)}` };
}

/** The id to ask the server for, from a link's text. */
export const linkId = async (text) => (await linkKeys(linkCode(text))).id;

/** Opens a box. Throws when the code isn't the one it was sealed with. */
export async function openLink(text, box) {
  const { id, seal } = await linkKeys(linkCode(text));
  const all = unb64(box.slice(3));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: utf8.encode(id) }, seal, all.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}
