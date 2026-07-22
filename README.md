# 5e DM mapper

Tablet-first map launcher for running published D&D 5e adventures at
the table. Open the map, see the dungeon, tap a room — that room's text
opens in your D&D Beyond copy of the module.

**Maps:**

- [`index.html`](index.html) — The Sunless Citadel, Fortress Level
  (built output, committed so GitHub Pages can serve it)

GitHub Pages serves the repo root of `main` (repo **Settings → Pages →
Deploy from a branch → `main` / `/ (root)`**), so pushing a rebuilt
`index.html` updates the live page. The build is one fully
self-contained file — map image, pins and code inlined — so downloading
it onto a tablet works just as well.

## Objectives

1. **At the table (the main loop).** The DM has the map open on a tablet
   mid-session. The map is the hero: pan and pinch freely, tap a room pin
   to open that area's text on D&D Beyond. All area links share one named
   browser tab, so a session doesn't end in forty duplicates. The chip row
   is the index — tapping a chip *finds* the room, flying the map to its
   pin and pulsing it. `T` and `S` pins mark traps and secret doors and
   link to the relevant area.

2. **Prep (pin placement).** Room pins are placed in **edit pins** mode.
   Tap an empty spot on the map and it reads the printed room number
   under your finger (normalized cross-correlation against digit glyphs
   sampled from the map itself — no network, no OCR service) and drops a
   pin there. Confirm the guess, pick an alternative, or choose from the
   full number rail. `T`/`S` markers pick their room number from a
   dedicated rail (`T1`…`T41`). Fine-tune with the nudge d-pad (touch) or
   by dragging (mouse). Placements are saved per-device in
   `localStorage` (same key as earlier builds) and survive reloads.

## Development

React + TypeScript + Vite. Source lives in [`app/`](app/); the build
emits a single self-contained `index.html` at the repo root
(`vite-plugin-singlefile` inlines the code and CSS, and the map image is
inlined as a data URI).

```
npm install
npm run dev      # dev server
npm run build    # type-check + emit ./index.html
```

Layout:

- `app/src/App.tsx` — shell: header, chips, edit/export/clear actions
- `app/src/MapView.tsx` — pan/zoom viewport, pins, the whole edit mode
- `app/src/EditChrome.tsx` — action bar, number/mark rails, nudge pad, export panel
- `app/src/pins.ts` — pin model + localStorage persistence
- `app/src/recognize.ts` — room-number recognition (template matching)
- `app/src/mapdata.ts` + `app/src/glyphs.json` — links, names, digit templates
- `user_pins.json` — the baked pin set (see below)

## Updating the baked pins

Pins placed in edit mode live only in that device's browser. To bake
them in for everyone:

1. In edit mode, hit **⤓ export pins** — a panel shows the JSON with
   copy / share / download buttons. It maps each label to image-pixel
   coordinates, e.g. `{"12": [[86, 801]], "T24": [[203, 650]]}`.
2. Replace [`user_pins.json`](user_pins.json) with the export, then
   `npm run build` and commit — the JSON is imported at build time.

Baked-in state right now: **complete** — all 41 Fortress Level rooms
(a few numbers appear at more than one spot on the map and get a pin at
each) plus 11 trap/secret-door markers, hand-placed.

## Ideas / not done yet

- Grove Level map (area links for rooms 42–56 are already in the data).
