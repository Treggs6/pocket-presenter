// pocket-presenter internet mode, shared by the laptop (present.html) and the phone (phone.html).
// The relay is an ntfy server (https://ntfy.sh by default; https://ntfy.sh/docs/ to host your own):
//   <topic>        small JSON messages: the deck's manifest, the current slide, "a phone joined"
//   <topic>-files  the deck itself, AES-GCM encrypted, uploaded as attachments in 1.9 MB parts
// The pairing is a random topic name plus a 256-bit key. Both travel only in the QR code's #fragment, which
// browsers never send to a server, so the relay carries the deck but can't read it.
const PP = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const PART = 1900 * 1000;                          // ntfy.sh's free tier: attachments up to 2 MB each, 20 MB held at once
  const me = Math.random().toString(36).slice(2, 10);  // tells our own messages apart from the other side's

  async function newPairing() {
    const key = crypto.getRandomValues(new Uint8Array(32)), id = crypto.getRandomValues(new Uint8Array(16));
    return { topic: 'pp-' + [...id].map(b => b.toString(16).padStart(2, '0')).join(''), key: b64u(key) };
  }
  const importKey = k => crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['encrypt', 'decrypt']);

  // A deck as one blob: "PPB1", 4-byte header length, JSON header, then every file's bytes in order.
  function pack(header, blobs) {
    const h = enc.encode(JSON.stringify(header)), len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, h.length);
    const total = 8 + h.length + blobs.reduce((a, b) => a + b.byteLength, 0), out = new Uint8Array(total);
    out.set(enc.encode('PPB1'), 0); out.set(len, 4); out.set(h, 8);
    let at = 8 + h.length; for (const b of blobs) { out.set(new Uint8Array(b), at); at += b.byteLength; }
    return out;
  }
  function unpack(buf) {
    const u = new Uint8Array(buf);
    if (dec.decode(u.slice(0, 4)) !== 'PPB1') throw new Error('not a pocket-presenter deck');
    const n = new DataView(u.buffer, u.byteOffset).getUint32(4), header = JSON.parse(dec.decode(u.slice(8, 8 + n)));
    let at = 8 + n;
    const files = header.files.map(f => { const b = u.slice(at, at + f.size); at += f.size; return { ...f, bytes: b }; });
    return { header, files };
  }
  async function encrypt(keyStr, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyStr), bytes);
    return { iv: b64u(iv), ct: new Uint8Array(ct) };
  }
  async function decrypt(keyStr, iv, ct) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await importKey(keyStr), ct));
  }

  class Relay {
    constructor(base, topic) { this.base = base.replace(/\/$/, ''); this.topic = topic; this.queue = null; this.busy = false; }
    url(t = this.topic) { return `${this.base}/${t}`; }

    // Live messages from the other side (ours are filtered out). onState(open) reports the connection.
    listen(onMsg, onState) {
      const es = new EventSource(`${this.url()}/sse`);
      es.onopen = () => onState && onState(true);
      es.onerror = () => onState && onState(false);
      es.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event !== 'message' || !m.message) return;
        let d; try { d = JSON.parse(m.message); } catch (e) { return; }
        if (d.pp === 1 && d.from !== me) onMsg(d);
      };
      return es;
    }
    // Everything the relay still holds for this pairing, oldest first.
    async history() {
      const r = await fetch(`${this.url()}/json?poll=1&since=all`);
      if (!r.ok) throw new Error(`relay ${r.status}`);
      const out = [];
      for (const line of (await r.text()).split('\n')) {
        try { const m = JSON.parse(line); const d = JSON.parse(m.message); if (d.pp === 1) out.push(d); } catch (e) {}
      }
      return out;
    }
    // Send a message. Slide changes coalesce: if one is already on its way, only the newest one goes next.
    send(d) {
      this.queue = { ...d, pp: 1, from: me, at: Date.now() };
      if (!this.busy) this._flush();
    }
    async _flush() {
      this.busy = true;
      while (this.queue) {
        const d = this.queue; this.queue = null;
        for (let tries = 0; tries < 6; tries++) {
          try {
            const r = await fetch(this.url(), { method: 'POST', body: JSON.stringify(d) });
            if (r.ok) break;
            if (this.onError) this.onError(r.status === 429 ? 'The relay is rate-limiting; retrying…' : `Relay error ${r.status}`);
          } catch (e) { if (this.onError) this.onError('No internet; retrying…'); }
          if (this.queue) break;                       // a newer click is waiting: send that instead
          await new Promise(res => setTimeout(res, 800 * (tries + 1)));
        }
      }
      this.busy = false;
      if (this.onError) this.onError('');
    }
    async publishNow(d) {                            // for the manifest: must arrive, in order
      const r = await fetch(this.url(), { method: 'POST', body: JSON.stringify({ ...d, pp: 1, from: me, at: Date.now() }) });
      if (!r.ok) throw new Error(r.status === 429 ? 'The relay is rate-limiting this laptop; wait a minute and try again.'
        : r.status === 413 ? 'The relay refused the deck (over its size or daily limit).' : `Relay error ${r.status}`);
    }

    // The deck: encrypt, split, upload; returns the manifest the phone needs.
    async uploadDeck(keyStr, bytes, onProgress) {
      const { iv, ct } = await encrypt(keyStr, bytes), parts = [];
      for (let at = 0, n = 0; at < ct.length; at += PART, n++) {
        const r = await fetch(this.url(this.topic + '-files'), { method: 'PUT', headers: { Filename: `part${n}.bin` }, body: ct.slice(at, at + PART) });
        if (!r.ok) throw new Error(r.status === 413 ? 'The relay refused the deck (over its size or daily limit).'
          : r.status === 429 ? 'The relay is rate-limiting this laptop; wait a minute and try again.' : `Upload failed (${r.status})`);
        parts.push((await r.json()).attachment.url);
        onProgress && onProgress(Math.min(1, (at + PART) / ct.length));
      }
      return { iv, parts, bytes: ct.length };
    }
    static async downloadDeck(keyStr, manifest, onProgress) {
      const chunks = []; let got = 0;
      for (const url of manifest.parts) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status === 404 ? 'The deck has expired on the relay: open it on the laptop again.' : `Download failed (${r.status})`);
        const b = new Uint8Array(await r.arrayBuffer()); chunks.push(b); got += b.length;
        onProgress && onProgress(got / manifest.bytes);
      }
      const ct = new Uint8Array(got); let at = 0; for (const c of chunks) { ct.set(c, at); at += c.length; }
      return unpack(await decrypt(keyStr, manifest.iv, ct));
    }
  }
  return { newPairing, pack, unpack, encrypt, decrypt, Relay, me, b64u, unb64u };
})();
