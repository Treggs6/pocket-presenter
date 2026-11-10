#!/usr/bin/env python3
"""pocket-presenter: present your own HTML deck from your laptop, with your phone as the remote.

    python3 present.py [--port 8000] [--no-open] [--relay URL] [--phone-url URL]

The browser opens a page where you drop your deck (an .html file, or its folder if it has images or videos). The
laptop then shows the deck full screen (press F) with a QR code: scan it with your phone and it becomes the remote,
with the slide, your notes, the first line after the next click, and a clock. Clicks on either one move both.
Python 3.8+, nothing to install.

Two ways to connect, picked on the drop page:
  Internet (default): the phone and laptop can be on any networks, as long as both are online. The laptop
    encrypts the deck and sends it through a relay (ntfy.sh by default); the key only lives in the QR code.
  Same Wi-Fi: no internet; the phone talks straight to the laptop (the laptop on the phone's hotspot).

Deck format: each slide is a <section>; speaker notes go in <aside class="notes"> inside it; elements with
class="fragment" appear one click at a time. reveal.js decks work as they are. See README.md."""
import argparse, hashlib, http.server, json, os, posixpath, re, shutil, socket, sys, tempfile, threading, time
import urllib.parse, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, 'app')                     # the app's own pages: drop page, audience shell, phone remote
STORE = tempfile.mkdtemp(prefix='pocket-presenter-')  # dropped decks live here while the app runs
cond = threading.Condition()
state = {'step': 0, 't0': None, 'black': False, 'remotes': 0, 'build': '', 'entry': '', 'title': '', 'target': 0,
         'mode': 'internet'}
args = None


def lan_ips():
    """This laptop's address on the local network, a phone hotspot's first (iPhone 172.20.10.x, Android 192.168.43.x)."""
    ips = []
    try:  # the address used to reach the outside; sends nothing, and works offline on a hotspot
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1))
        ips.append(s.getsockname()[0]); s.close()
    except OSError:
        pass
    try:
        ips += [a[4][0] for a in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
    except OSError:
        pass
    ips = [ip for ip in dict.fromkeys(ips) if not ip.startswith('127.')]
    ips.sort(key=lambda ip: not ip.startswith(('172.20.10.', '192.168.43.', '10.')))
    return ips or ['127.0.0.1']


def safe_rel(path):
    """A dropped file's relative path, or None if it would escape the deck folder."""
    p = posixpath.normpath('/' + urllib.parse.unquote(path).replace('\\', '/')).lstrip('/')
    return None if not p or p.startswith('..') or '\0' in p else p


RUNTIME_TAG = b'<script src="/pp/runtime.js"></script>'


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def local(self):
        return self.client_address[0] in ('127.0.0.1', '::1', '::ffff:127.0.0.1')

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    # ---- pages and files
    def do_GET(self):
        url = urllib.parse.urlparse(self.path); path = url.path
        if path == '/':                                   # the laptop lands on the drop page; a phone on the remote
            return self.redirect('/drop.html' if self.local() else '/remote.html')
        if path.startswith('/events'):
            return self.events('role=remote' in url.query)
        if path == '/info':
            return self.send_json({'remote': [f'http://{ip}:{args.port}/remote.html' for ip in lan_ips()],
                                   'relay': args.relay.rstrip('/'), 'phone_url': args.phone_url, **state})
        if path == '/files':                              # the laptop packs these for the phone (internet mode)
            if not self.local():
                return self.send_json({'error': 'laptop only'}, 403)
            deck, out = os.path.join(STORE, 'deck'), []
            for root, _, files in os.walk(deck):
                for f in sorted(files):
                    fp = os.path.join(root, f)
                    out.append({'path': os.path.relpath(fp, deck).replace(os.sep, '/'), 'size': os.path.getsize(fp),
                                'type': self.guess_type(fp)})
            return self.send_json({'entry': state['entry'], 'build': state['build'], 'title': state['title'], 'files': out})
        if path.startswith('/raw/'):                      # a deck file as it is, without the runtime added
            rel = safe_rel(path[len('/raw/'):])
            if not self.local():
                return self.send_json({'error': 'laptop only'}, 403)
            return self.file(os.path.join(STORE, 'deck', rel) if rel else None)
        if path.startswith('/deck/'):
            rel = safe_rel(path[len('/deck/'):])
            return self.file(os.path.join(STORE, 'deck', rel) if rel else None, inject=True)
        if path.startswith('/pp/'):
            rel = safe_rel(path[len('/pp/'):])
            return self.file(os.path.join(APP, rel) if rel else None)
        rel = safe_rel(path)
        return self.file(os.path.join(APP, rel) if rel else None)

    def redirect(self, to):
        self.send_response(302); self.send_header('Location', to); self.end_headers()

    def file(self, fp, inject=False):
        if not fp or not os.path.isfile(fp):
            return self.send_error(404)
        ctype = self.guess_type(fp)
        if inject and fp.lower().endswith(('.html', '.htm')):   # add the runtime that drives the deck
            html = open(fp, 'rb').read()
            m = re.search(rb'</body\s*>', html, re.I)
            html = html[:m.start()] + RUNTIME_TAG + html[m.start():] if m else html + RUNTIME_TAG
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html))); self.end_headers(); self.wfile.write(html)
            return
        size = os.path.getsize(fp)
        rng = self.headers.get('Range')
        start, end = 0, size - 1
        m = re.match(r'bytes=(\d*)-(\d*)', rng or '')
        if m and (m.group(1) or m.group(2)):                     # byte ranges: Safari won't play video without them
            if m.group(1):
                start = int(m.group(1)); end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            if start > end:
                self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return
            self.send_response(206); self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        else:
            self.send_response(200)
        self.send_header('Content-Type', ctype); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1)); self.end_headers()
        with open(fp, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 16, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    # ---- live sync: every page holds one of these open
    def events(self, remote):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream'); self.send_header('Connection', 'keep-alive')
        self.end_headers()
        if remote:
            with cond:
                state['remotes'] += 1; cond.notify_all()
            print('  phone connected')
        last = None
        try:
            while True:
                with cond:
                    if dict(state) == last:
                        cond.wait(timeout=15)
                    cur = dict(state)
                self.wfile.write(f'data: {json.dumps(cur)}\n\n'.encode() if cur != last else b': ping\n\n')
                self.wfile.flush(); last = cur
        except (BrokenPipeError, ConnectionResetError, OSError):
            return
        finally:
            if remote:
                with cond:
                    state['remotes'] -= 1; cond.notify_all()
                print('  phone disconnected')

    # ---- clicks (from any page) and deck uploads (from the laptop only)
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        body = self.rfile.read(int(self.headers.get('Content-Length', 0) or 0))
        if path == '/go':
            d = json.loads(body or b'{}')
            with cond:
                if 'step' in d:
                    state['step'] = max(0, int(d['step']))
                    if state['t0'] is None and state['step'] > 0:
                        state['t0'] = time.time() * 1000
                if d.get('reset'):
                    state['t0'] = None
                if 'black' in d:
                    state['black'] = bool(d['black'])
                cond.notify_all()
            return self.send_json(state)
        if not self.local():
            return self.send_json({'error': 'decks can only be loaded from the laptop'}, 403)
        if path == '/new':                                   # start a fresh upload
            shutil.rmtree(os.path.join(STORE, 'incoming'), ignore_errors=True)
            os.makedirs(os.path.join(STORE, 'incoming'))
            return self.send_json({'ok': True})
        if path.startswith('/upload/'):
            rel = safe_rel(path[len('/upload/'):])
            if not rel:
                return self.send_json({'error': 'bad path'}, 400)
            fp = os.path.join(STORE, 'incoming', rel)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            open(fp, 'wb').write(body)
            return self.send_json({'ok': True})
        if path == '/load':                                  # swap the uploaded files in as the deck
            d = json.loads(body or b'{}')
            entry = safe_rel(d.get('entry', ''))
            inc, deck = os.path.join(STORE, 'incoming'), os.path.join(STORE, 'deck')
            if not entry or not os.path.isfile(os.path.join(inc, entry)):
                return self.send_json({'error': 'deck file not found'}, 400)
            h = hashlib.sha1()
            for root, _, files in sorted(os.walk(inc)):
                for f in sorted(files):
                    h.update(os.path.relpath(os.path.join(root, f), inc).encode())
                    h.update(open(os.path.join(root, f), 'rb').read())
            shutil.rmtree(deck, ignore_errors=True); shutil.move(inc, deck)
            with cond:
                state.update(step=0, t0=None, black=False, entry=entry, title=d.get('title') or entry,
                             target=int(d.get('target') or 0), build=h.hexdigest()[:10],
                             mode='local' if d.get('mode') == 'local' else 'internet')
                cond.notify_all()
            print(f'  deck loaded: {entry} (build {state["build"]})')
            return self.send_json(state)
        return self.send_json({'error': 'not found'}, 404)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    global args
    ap = argparse.ArgumentParser(description='Present your HTML deck with your phone as the remote.')
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--no-open', action='store_true', help="don't open the browser")
    ap.add_argument('--relay', default='https://ntfy.sh',
                    help='internet mode: the ntfy server that carries clicks and the encrypted deck (default ntfy.sh)')
    ap.add_argument('--phone-url', default='https://treggs6.github.io/pocket-presenter/app/phone.html',
                    help='internet mode: where the phone page is hosted (a fork can host its own on GitHub Pages)')
    args = ap.parse_args()
    try:
        srv = Server(('0.0.0.0', args.port), Handler)
    except OSError as e:
        sys.exit(f'Port {args.port} is busy ({e.strerror}). Try: python3 present.py --port 8001')
    url = f'http://localhost:{args.port}/'
    print(f'\n  pocket-presenter is running.\n  Laptop:  {url}  (drop your deck there)')
    print(f'  Phone:   http://{lan_ips()[0]}:{args.port}/remote.html  (or scan the QR code on the laptop)')
    print('  Put the laptop on your phone\'s hotspot (or one network with the phone). Ctrl+C to stop.\n')
    if not args.no_open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(STORE, ignore_errors=True)


if __name__ == '__main__':
    main()
