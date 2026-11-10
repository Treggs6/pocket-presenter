# Converting a presentation for pocket-presenter

pocket-presenter plays HTML decks: one `<section>` per slide, notes in `<aside class="notes">`, builds as
`class="fragment"` (see [Writing a deck](README.md#writing-a-deck)). To bring a PowerPoint, Keynote, Google
Slides, PDF or custom HTML deck over, speaker notes included, give an AI coding agent (Claude Code or similar)
the prompt below. Fill in the two lines at the top.

```text
Convert my presentation into a deck for pocket-presenter (https://github.com/Treggs6/pocket-presenter).

Source: <path to my presentation: .pptx, .key, .pdf, Google Slides export, reveal.js, custom HTML, folder of images, etc.>
Output folder: <where to put the result; default: a new folder named "<deck name>-pocket" next to the source>

## What pocket-presenter needs
A folder with one HTML file (call it deck.html) and every image, video and font it uses, referenced by relative
paths. It must work with no internet: no CDN scripts, web fonts or remote images. Download or embed anything remote.

- Slides: each top-level <section> is one slide, shown one at a time. Make each fill the screen (position:fixed;
  inset:0, or height:100vh) on a background that matches the original.
- Notes: speaker notes go in <aside class="notes"> inside the slide, one <p> per paragraph. They show on my phone,
  never to the room. Lines like "[pause]" in square brackets show as cues.
- Builds: elements with class="fragment" appear one click at a time, in page order. Elements that appear together
  share a data-fragment-index. An <aside class="notes"> inside a fragment holds what to say before that click.
- Media: <video autoplay> or <audio autoplay> plays from the start when its slide comes up and stops when I move
  on. Add muted only if the original was silent. Add playsinline. A video that should hold its last frame needs
  no loop attribute.
- Don't add your own keyboard handling, navigation, controls or slide counters. pocket-presenter drives the deck.
  reveal.js decks work as they are, so just make them self-contained.

## Speaker notes: required
My speaker notes are the main reason I use pocket-presenter, so carry over every one of them, word for word.
- PowerPoint (.pptx): read the notes from the file itself, not from an export.
  - Use python-pptx (slide.has_notes_slide, then slide.notes_slide.notes_text_frame), or parse the XML directly.
  - If you parse the XML, match each slide to its notes through its relationships file
    (ppt/slides/_rels/slideN.xml.rels, type ".../notesSlide"). Don't match by filename number, because the
    numbering drifts after slides are reordered or deleted.
  - Walk slides in the order given by ppt/presentation.xml (p:sldIdLst), and skip hidden slides (show="0") unless
    I say otherwise.
  - Keep each paragraph as its own <p>, including bullets and line breaks. Drop the slide-number and date
    placeholders. Escape the text as HTML.
- Old .ppt: convert it to .pptx first (LibreOffice: soffice --headless --convert-to pptx), then do the above.
- Keynote (.key): export to .pptx (Keynote: File > Export To > PowerPoint, or AppleScript: tell application
  "Keynote" to export ... as Microsoft PowerPoint), then do the above. If export isn't possible, read each
  slide's "presenter notes" through AppleScript.
- Google Slides: download it as .pptx (File > Download > Microsoft PowerPoint), which keeps the notes.
- PDF: a PDF usually has no notes. Look for an exported "notes pages" PDF, annotations or a separate notes file.
  If there's none, tell me.
- When a slide has click-builds, split its notes across the clicks only where the text clearly lines up with them
  (one paragraph per bullet that appears, for example). Otherwise keep all the notes on the slide's first step,
  so nothing is lost.

## How to convert
1. Work out what the source is and how it stores slides, notes, builds and media. Tell me before converting if
   anything can't be carried over.
2. Pick the most faithful route:
   - PowerPoint / Keynote / Google Slides: export every slide as a full-resolution image (1920x1080 or the deck's
     native size), for example soffice --headless --convert-to pdf, then pdftoppm -r 200 -png, or Keynote/PowerPoint's
     own image export. Take the notes from the .pptx as described above, not from the images. Make one <section>
     per slide with the image and its notes. If a slide has click-builds, export one image per build state and
     make each one its own section. Pull embedded videos out of ppt/media/ and place them as <video> on the slide
     where they appear.
   - PDF: render each page to an image (pdftoppm -r 200 -png).
   - HTML decks with their own player (slides in a JS array, an image sequence, etc.): read the data structure
     and generate the sections from it with a small script, so it can be re-run when the deck changes.
   - Real HTML slides whose text matters (selectable text, crisp at any size): keep them as HTML. Wrap each slide
     in <section> and turn its animations into fragments.
   - Folder of images or videos: one section each, in filename order, with notes from any matching text file.
3. Keep the original's aspect ratio. Letterbox on black (object-fit:contain); never crop or stretch.
4. Never invent or rewrite notes. A slide with no notes gets an empty notes block.

## Before you finish, check
- The number of sections plus fragment clicks equals the number of clicks in the original. List the count.
- Notes: print a table of slide number, the first ~60 characters of the original notes, and the first ~60
  characters of the notes in deck.html. They must match. Also list the slides that have no notes in the source.
- Every src/href in deck.html points to a file that exists in the folder (no http:// or https:// URLs).
- Opening deck.html straight from disk shows all slides stacked, with no errors in the console.
- If the conversion is scripted, save the script in the output folder so I can rebuild.

Finish with: the output folder path, the slide and click counts, the notes table, anything you couldn't convert
faithfully, and how to present it: open Pocket Presenter, choose the output folder, pick deck.html, scan the QR
code with the phone.
```
