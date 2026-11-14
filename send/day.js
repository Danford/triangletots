// A day from one of Triangle Tots' public pages, carried whole in the code a phone scans: "Send to Tot Routines" on
// every outing. The outing is public, with no home or child in it, so it isn't sealed and no server holds it: the code
// is the plan, deflated and written in base64url after TOTDAY1:. It goes in a link after the # (a browser never sends
// that part), tottoolbox.com/routines/plans.html#TOTDAY1:<code>. The other end is plansDay in
// apps/routines/www/sync.js; site/site.js loads this file from /send/day.js (scripts/build-site.js copies it).
export const DAY_TAG = 'TOTDAY1:';

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function dayCode(content) {
  const json = new TextEncoder().encode(JSON.stringify(content));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return DAY_TAG + b64u(new Uint8Array(await new Response(stream).arrayBuffer()));
}
