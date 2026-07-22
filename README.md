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
   images included). The library is the app's home screen; it also
   has **⤓ export all** / **⇞ import pages** for moving every page
   between machines in one `.dmmap.json` (the import button accepts
   single-page files too).

   A save often holds several maps (the Citadel's fortress and grove
   levels share one page): inside a page, edit mode has **⇪ import
   save** — upload the same file again to add its other maps as tabs
   and merge in the area text, links and names. Existing pins are
   untouched, duplicate maps are skipped, and importing with no maps
   selected attaches the text alone (that's how the built-in page
   gets its reader).

2. **Annotate.** In **edit** mode, tap the map and a focused
   input opens: type the room number and press enter — the pin lands
   on the tap point. Type `t` or `s` for a trap / secret-door marker:
   it links itself to the nearest room pin (or type `t7` to target
   room 7 explicitly). Every location link is always plain
   `page#AreaAnchor` (older stored modules with doubled anchors are
   repaired on load). Fine-tune with the nudge d-pad (tap a pin) or
   by dragging (mouse); tapping a pin also offers delete.

3. **Play.** The app is an interactive adventure book with the map as
   its index. Pan and pinch freely; pins keep constant screen size,
   and rooms with creatures carry a small red dot.

   **Hover a pin** (long-press on touch) for the at-a-glance card:
   read-aloud opener, creatures with counts, DCs, and hazard lead-in
   paragraphs ("Arrow Trap.", "Secret Door.", …) from the text —
   hovering a T/S marker shows its room's hazards directly. Re-run
   "import save" (text only) on older pages to refresh their digests.

   **Click a pin** (or a pinless chip) and the area's own section
   from the saved page opens in a book-styled reader panel — no more
   scrolling the whole D&D Beyond page hunting for a room. Every link
   inside (monsters, spells, cross-references) opens on D&D Beyond in
   one shared tab; the panel's header button jumps to the area there
   too. All of it works offline: the section HTML is sanitized and
   stored with the module at upload time. (The built-in page has no
   stored text — upload your own save to get the reader.)

4. **Save & export.** Pins live per-device in `localStorage`
   (`edpins:<module id>`, unchanged from earlier builds). **⤓ export
   pins** shows the JSON with copy / share / download; **✖ clear my
   pins** resets the device.

   **⤓ export page** (edit mode) downloads your whole page as a small
   `.dmmap.json` — title, links, room names, map slots and every pin,
   but no map images and no adventure text. **⇞ import a page file**
   on the library screen recreates it on another machine; the maps
   show as empty slots until you **⇪ import save** there, which fills
   the matching slots and attaches the text. Your work travels as a
   clean little file; the content re-attaches from your own save.

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
- `app/src/Home.tsx` — library screen
- `app/src/SaveImport.tsx` — shared upload button + map-image picker
- `app/src/ModuleView.tsx` — one module: header, chips, map tabs
- `app/src/MapView.tsx` — pan/zoom viewport, pins, the whole edit mode
- `app/src/AreaCard.tsx` — hover/long-press at-a-glance card
- `app/src/AreaPanel.tsx` — book-styled reader for one area's section
- `app/src/EditChrome.tsx` — action bar, typed-input placement, nudge pad, export panel
- `app/src/mhtml.ts` — MHTML / HTML save parsing
- `app/src/modules.ts` — module model + IndexedDB persistence
- `app/src/pins.ts` — pin model + localStorage persistence
- `app/src/mapdata.ts`, `user_pins.json` — the built-in module
  ("The Citadel - Fortress Level")

## Ideas / not done yet

- Search across room names/text with fly-to; type a number outside
  edit mode to jump to that room.
