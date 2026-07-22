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
   and shows the images it found: the "map-…" files D&D Beyond uses
   come preselected, including the linked **"View Player Version"**
   maps (those load from the CDN, so they need to be online). Pages
   can be renamed from the library (✎), persist in IndexedDB (map
   images included), and the app reopens the last-used one directly.

2. **Annotate.** In **edit pins** mode, tap the map and a focused
   input opens: type the room number and press enter — the pin lands
   on the tap point. Type `t` or `s` for a trap / secret-door marker:
   it links itself to the nearest room pin (or type `t7` to target
   room 7 explicitly). Every location link is always plain
   `page#AreaAnchor` (older stored modules with doubled anchors are
   repaired on load). Fine-tune with the nudge d-pad (tap a pin) or
   by dragging (mouse); tapping a pin also offers delete.

3. **Play.** Pan and pinch freely; pins keep constant screen size. Tap
   a room pin to open that area's text — the numbered headings of the
   saved page ("12. Larder") become deep links to its anchors, and all
   of them share one named browser tab. Chips along the top are the
   index: tapping one flies the map to the pin and pulses it (or opens
   the text directly if the room has no pin yet).

   **Hover a pin** (long-press on touch) for the at-a-glance card:
   the area's read-aloud opener, its creatures with counts (tap one
   for the stat block), DCs, the treasure line, and a "nearby" strip
   of adjacent rooms with their threat counts — scout what the party
   might face soon without opening anything. The digests are
   extracted from the saved page's text at upload time, so they work
   offline; the built-in page has no stored text (upload your own
   save of the same page to get cards for it).

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
- `app/src/AreaCard.tsx` — hover/long-press at-a-glance card
- `app/src/EditChrome.tsx` — action bar, typed-input placement, nudge pad, export panel
- `app/src/mhtml.ts` — MHTML / HTML save parsing
- `app/src/modules.ts` — module model + IndexedDB persistence
- `app/src/pins.ts` — pin model + localStorage persistence
- `app/src/mapdata.ts`, `user_pins.json` — the built-in module
  ("The Citadel - Fortress Level")

## Ideas / not done yet

- Quick wins: search across room names/text with fly-to; type a
  number outside edit mode to jump to that room.
- Session layer: draggable party marker, visited/cleared/alerted room
  states, per-room notes surfaced in the hover card, new-session reset.
- Player second screen: a synced window showing the player map,
  driven by the DM's pan/zoom (BroadcastChannel); fog-of-war later.
