# pocket-presenter

Present your own HTML deck from your laptop, with your phone as the remote.

The laptop shows the slides to the room, full screen and nothing else. Your phone shows the current slide, the
notes to say before the next click, the first line after it, and a clock. Tap NEXT on the phone (or press → on
the laptop, or use a clicker) and both move together.

- **One file to run:** `python3 present.py`. Python 3.8+, nothing to install.
- **No internet needed:** the phone talks straight to the laptop over your phone's hotspot (or any network
  they share).
- **Your deck, as it is:** any HTML page. Each slide is a `<section>`, notes go in `<aside class="notes">`, and builds
  use `class="fragment"`. reveal.js decks work unchanged.

## Quick start

1. Turn on your phone's **Personal Hotspot** and join it from the laptop. Any network that both are on also works.
2. On the laptop, in the pocket-presenter folder, run:

   ```bash
   python3 present.py
   ```

   Your browser opens on the drop page.
3. **Drop your deck** onto it: the `.html` file, or the whole folder if the deck uses images or videos from other
   files. To see how it works first, click **Try the sample deck**.
4. A **QR code** appears. Scan it with your phone's camera and open the link. When the laptop says
   *Phone connected ✓*, the code fades away.
5. Press **F** on the laptop for full screen and present from your phone.

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
- If you set a talk length on the drop page, the clock turns orange when you go over.
- Load a different deck on the laptop and the phone switches to it by itself.

## Before you go on

- **Mac firewall:** the first time, macOS may ask whether Python can accept incoming connections. Allow it, or
  the phone can't reach the laptop.
- **Phone screen:** set **Auto-Lock to Never** for the talk. The page can't keep the screen awake over a local
  connection.
- **Same network:** venue Wi-Fi often keeps devices from reaching each other. That's why the phone's hotspot is
  the reliable choice.
- **Run through once** on the real phone and laptop.

## Troubleshooting

- **The phone can't open the link:** check both are on the same network, and allow Python in the laptop's
  firewall. The terminal also prints the phone link, if you'd rather type it.
- **"Port 8000 is busy":** run `python3 present.py --port 8001`.
- **Missing images or video:** drop the deck's whole folder, not just the `.html` file.
- **Fonts or images from the web don't show:** without internet, only files in the deck's folder are available.
  Download those files into the folder.

## Privacy

Everything stays on your laptop. The deck you drop is copied to a temporary folder for as long as
pocket-presenter runs, and deleted when you stop it (Ctrl+C). Only devices on the same network that know the
address can see the slides, and decks can only be loaded from the laptop itself.

## Credits

QR codes by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT),
included as `app/qrcode.js`.

## License

MIT. See [LICENSE](LICENSE).
