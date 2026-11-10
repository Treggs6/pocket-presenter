# pocket-presenter

Present your own HTML deck from your laptop, with your phone as the remote.

The laptop shows the slides to the room, full screen and nothing else. Your phone shows the current slide, the
notes to say before the next click, the first line after it, and a clock. Tap NEXT on the phone (or press → on
the laptop, or use a clicker) and both move together.

- **One file to run:** `python3 present.py`. Python 3.8+, nothing to install.
- **Connects any way you have:** over the internet (the default; phone and laptop can be on different networks),
  or straight over the same Wi-Fi or your phone's hotspot with no internet at all.
- **Your deck, as it is:** any HTML page. Each slide is a `<section>`, notes go in `<aside class="notes">`, and builds
  use `class="fragment"`. reveal.js decks work unchanged.

## Quick start

1. Make sure the laptop and the phone both have internet. They don't need to be on the same network: venue Wi-Fi
   for the laptop and mobile data for the phone is fine. (No internet? See [Same Wi-Fi mode](#same-wi-fi-mode).)
2. On the laptop, in the pocket-presenter folder, run:

   ```bash
   python3 present.py
   ```

   Your browser opens on the drop page.
3. **Drop your deck** onto it: the `.html` file, or the whole folder if the deck uses images or videos from other
   files. To see how it works first, click **Try the sample deck**.
4. The laptop sends the deck to your phone, encrypted, and a **QR code** appears. Scan it with your phone's camera
   and open the link. The phone downloads the deck, and when the laptop says *Phone connected ✓*, the code fades
   away.
5. Press **F** on the laptop for full screen and present from your phone.

## How the phone connects

**Internet (the default).** The laptop and phone pass clicks through a relay on the internet, so it doesn't matter
which networks they're on.

- **Pairing:** the first time, the laptop makes a pairing: a random channel name and a 256-bit encryption key. Both
  are in the QR code's link, after the `#`, a part browsers never send to a server.
- **The deck:** the laptop encrypts the deck with that key and uploads it to the relay. The phone page
  (on GitHub Pages, at `treggs6.github.io/pocket-presenter/app/phone.html`) downloads it, decrypts it and keeps it
  on the phone. The relay stores the deck for a few hours but can't read it.
- **Clicks:** taps, keys and black screen go through the relay as tiny messages, in about 0.2 seconds.
- **Remembered:** the laptop and phone remember the pairing. Next time, open the phone page again (from your
  browser history, or add it to the home screen) and it picks up whatever deck the laptop has open. No need to
  rescan.
- **What goes to the phone:** what the phone needs to preview your slides. Files over 3 MB, usually video, stay on
  the laptop and show as a blank on the phone; the room still sees them. At most 12 MB goes up.

The relay is [ntfy.sh](https://ntfy.sh), a free public service, by default. Its free tier allows each network 250
messages a day (a click is one message), files of up to 2 MB (pocket-presenter splits the deck to fit) and 20 MB
stored at once. That's plenty for a few run-throughs and the talk.

**Your own relay.** Any [ntfy server](https://docs.ntfy.sh/install/) works. Put its address in the **Relay** box on
the drop page (it's remembered), or start with `python3 present.py --relay https://your-ntfy-server`. With your
own relay, the whole deck goes to the phone, video included (files up to 20 MB, 120 MB in all), and there are no
public daily limits. The relay must be `https://`, or the phone page can't reach it. A small server with
[Caddy](https://caddyserver.com) in front of ntfy is enough; to keep it from being used as a general relay, set
`auth-default-access: deny-all` and allow only pocket-presenter's channels:
`ntfy access everyone 'pp-*' read-write`.

### Same Wi-Fi mode

Pick **the same Wi-Fi or hotspot** on the drop page to skip the internet entirely. The phone then loads everything
straight from the laptop, so they must be on the same network: turn on your phone's **Personal Hotspot** and join
it from the laptop. Venue Wi-Fi often keeps devices from reaching each other, and the laptop's firewall has to let
Python accept connections. Those are the usual reasons this mode can't connect.

## Mac app

To get a double-clickable app instead of the terminal, run this once:

```bash
mac/make-app.sh            # builds ~/Applications/Pocket Presenter.app (or pass another folder)
```

The app carries its own copy of `present.py` and `app/`, so it works from anywhere, and you can drag it to
`/Applications` or the Dock. Open it and your browser shows the drop page: choose your deck and the QR code
appears. Click the Dock icon to bring the page back, and quit the app to stop presenting. It uses whichever port
is free, starting at 8000, and needs Python 3.8 or newer. Rebuild it after you change `present.py` or `app/`.

## Writing a deck

```html
<section>
  <h1>Hello</h1>
  <aside class="notes">
    <p>What you say on this slide.</p>
  </aside>
</section>

<section>
  <h2>Three reasons</h2>
  <ul>
    <li class="fragment">One   <aside class="notes"><p>Said as "One" appears.</p></aside></li>
    <li class="fragment">Two   <aside class="notes"><p>[pause] Then "Two".</p></aside></li>
    <li class="fragment">Three <aside class="notes"><p>And "Three".</p></aside></li>
  </ul>
  <aside class="notes"><p>Said before the first reason appears.</p></aside>
</section>
```

- **Slides:** each top-level `<section>` is one slide, shown one at a time. Style them however you like; making a
  section fill the screen (`height: 100vh`) usually looks best.
- **Notes:** `<aside class="notes">` inside a slide. They're hidden from the room. Use `<p>` for separate
  paragraphs.
- **Builds:** elements with `class="fragment"` appear one click at a time, in page order. Fragments that share a
  `data-fragment-index` appear together.
- **Notes per click:** a notes block inside a fragment belongs to that click. Your phone then shows exactly what to
  say before each click. Without these, the slide's notes stay up for all its builds.
- **Cues:** a notes line that starts with `[brackets]`, like `[pause]` or `[let them laugh]`, shows highlighted.
- **Video and audio:** a `<video autoplay>` or `<audio autoplay>` plays from the start when its slide comes up and
  stops when you move on. Add `muted` if you don't want sound.
- **reveal.js:** drop the deck folder as it is. Vertical slides, fragments, `<aside class="notes">` and `data-notes`
  all work. pocket-presenter turns off reveal's own controls and keyboard so the phone stays in charge.

`app/sample/deck.html` is a working example.

**Already have a deck in PowerPoint, Keynote, Google Slides or PDF?** [CONVERTING.md](CONVERTING.md) has a
prompt to give an AI coding agent that converts it, speaker notes included.

## Keys on the laptop

| Key | Does |
|---|---|
| → Space PageDown Enter | next |
| ← PageUp Backspace | back |
| Home / End | first / last |
| F | full screen |
| B | black screen (and back) |
| Q | show or hide the phone QR code |

A clicker plugged into the laptop works too, since clickers send the same keys. So does a Bluetooth clicker
paired with the phone.

## On the phone

- **NEXT ›** and **‹**, or swipe left and right.
- **Black screen**, **Reset clock** and **Back to start** are along the bottom.
- The **dot** in the corner is green while connected. If the connection drops, the phone reconnects by itself.
- Your next click always wins: if the connection blips, the phone sends where you are now, not every tap in between.
- If you set a talk length on the drop page, the clock turns orange when you go over.
- Load a different deck on the laptop and the phone switches to it by itself.

## Before you go on

- **Internet on both:** check the laptop has internet at the venue (or tether it to your phone).
- **Open the deck early:** sending the deck takes a moment. Do it before you go on, and scan the code.
- **Phone screen:** set **Auto-Lock to Never** for the talk.
- **Same Wi-Fi mode only:** the first time, macOS may ask whether Python can accept incoming connections. Allow
  it, or the phone can't reach the laptop.
- **Run through once** on the real phone and laptop.

## Troubleshooting

- **"The relay is rate-limiting" or "refused the deck":** the free relay's daily limit for that network ran out.
  Wait, use another network, or switch to Same Wi-Fi mode.
- **The phone says the deck expired:** the relay keeps the deck for about 3 hours. Load the deck on the laptop
  again (drop it again, or reload the presenting page) and the phone picks it up.
- **Same Wi-Fi mode, the phone can't open the link:** check both are on the same network, and allow Python in the
  laptop's firewall. The terminal also prints the phone link, if you'd rather type it.
- **"Port 8000 is busy":** run `python3 present.py --port 8001`.
- **Missing images or video:** drop the deck's whole folder, not just the `.html` file.
- **Fonts or images from the web don't show:** without internet, only files in the deck's folder are available.
  Download those files into the folder.

## Privacy

The deck you drop is copied to a temporary folder on the laptop for as long as pocket-presenter runs, and deleted
when you stop it (Ctrl+C). Decks can only be loaded from the laptop itself.

- **Internet mode:** the deck goes to the relay encrypted (AES-256-GCM). The key exists only on your laptop, in the
  QR code, and on the paired phone. The relay deletes the files after about 3 hours. Click messages (which slide
  you're on) aren't encrypted, and say nothing about the deck's content.
- **Same Wi-Fi mode:** nothing leaves the laptop and phone. Only devices on the same network that know the
  address can see the slides.

## Credits

QR codes by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT),
included as `app/qrcode.js`.

## License

MIT. See [LICENSE](LICENSE).
