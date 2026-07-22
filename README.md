# 5e DM mapper

Tablet-first tool for running published D&D 5e adventures at the table.
Save an adventure page from D&D Beyond, upload it, pick the map image,
pin the rooms — then during play, tap a pin to open that room's text in
your D&D Beyond copy.

**Live app:** `index.html` at the repo root (built output, committed so
GitHub Pages can serve it — repo **Settings → Pages → Deploy from a
branch → `main` / `/ (root)`**). It's one fully self-contained file, so
downloading it onto a tablet works just as well.

## How it works

1. **Upload.** On D&D Beyond, save the adventure page with
   Ctrl/Cmd-S → *"Webpage, Single File"* (`.mhtml`; plain `.html` works
   too when its images are embedded or remote). Upload it on the
   library screen. The app parses the archive — no server involved —
   and shows the images it found; tap the map(s), done. Modules persist
   in IndexedDB (map image included), and the app reopens the last-used
   module directly.

2. **Annotate.** In **edit pins** mode, tap a printed room number on
   the map. The built-in module matches glyphs sampled from its own
   map; uploaded maps get segment-then-classify OCR — the digit-shaped
   ink blobs under your tap are cut out (either polarity), normalized
   to a canonical grid, and scored against digit templates rendered in
   several fonts, plus every glyph this map has taught us: confirming
   a placement (✓) samples the number's real pixels into a per-module
   learned set. Cold guesses on dense old-school maps are hit-or-miss;
   after a handful of confirmations the learned glyphs take over (on
   the Sunless Citadel maps: ~1/8 cold → 6/8 after eight taps). Wrong
   guess? Alternatives are on the bar, the full number rail is one tap
   away, and `T`/`S` marker rails tag traps and secret doors to a
   room. Fine-tune with the nudge d-pad (touch) or by dragging
   (mouse). If nothing recognizable sits under the tap, the rail
   simply opens to pick the label by hand.

3. **Play.** Pan and pinch freely; pins keep constant screen size. Tap
   a room pin to open that area's text — the numbered headings of the
   saved page ("12. Larder") become deep links to its anchors, and all
   of them share one named browser tab. Chips along the top are the
   index: tapping one flies the map to the pin and pulses it (or opens
   the text directly if the room has no pin yet).

4. **Save & export.** Pins live per-device in `localStorage`
   (`edpins:<module id>`, unchanged from earlier builds). **⤓ export
   pins** shows the JSON with copy / share / download; **✖ clear my
   pins** resets the device.

The Sunless Citadel (Fortress Level) ships built in, with all 41 rooms
and 11 trap/secret-door markers pinned. To update its baked pins,
replace [`user_pins.json`](user_pins.json) with a fresh export and
rebuild.

## Development

React + TypeScript + Vite; source in [`app/`](app/). `npm run build`
type-checks and emits the single-file `index.html` at the repo root
(`vite-plugin-singlefile`; the built-in map image is inlined).

```
npm install
npm run dev      # dev server
npm run build    # type-check + emit ./index.html
```

Layout:

- `app/src/App.tsx` — routing: library ↔ module
- `app/src/Home.tsx` — library, upload, map-image picker
- `app/src/ModuleView.tsx` — one module: header, chips, map tabs
- `app/src/MapView.tsx` — pan/zoom viewport, pins, the whole edit mode
- `app/src/EditChrome.tsx` — action bar, rails, nudge pad, export panel
- `app/src/mhtml.ts` — MHTML / HTML save parsing
- `app/src/modules.ts` — module model + IndexedDB persistence
- `app/src/recognize.ts` — built-in map recognition (template matching)
- `app/src/segment.ts` — upload OCR: segmentation, classification, learning
- `app/src/pins.ts` — pin model + localStorage persistence
- `app/src/mapdata.ts`, `app/src/glyphs.json`, `user_pins.json` — the
  built-in Sunless Citadel module

## Ideas / not done yet

- Grove Level for the built-in module (its area links are already in
  the data — or just re-save the page and upload it).
