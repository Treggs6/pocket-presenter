// pocket-presenter phone (internet mode): serves the deck the phone downloaded, from its own storage.
// phone.html puts each file in the "pp-deck" cache under deck/<build>/<path>; the slide preview loads from there,
// so the deck's own relative links (images, CSS, scripts) work as they do on the laptop.
const DECK = new URL('deck/', self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(DECK)) return;
  e.respondWith((async () => {
    const hit = await (await caches.open('pp-deck')).match(url.origin + url.pathname);
    if (!hit) return new Response('Not part of this deck (files over 3 MB stay on the laptop).', { status: 404 });
    const range = e.request.headers.get('Range');
    if (!range) return hit;
    const buf = await hit.arrayBuffer(), m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? +m[1] : Math.max(0, buf.byteLength - +(m[2] || 0));
    let end = m[1] && m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
    if (!m[1]) end = buf.byteLength - 1;
    return new Response(buf.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1) } });
  })());
});
