# 5e DM mapper

Single-file, tablet-first map launchers for running published D&D 5e
adventures at the table. Open the HTML file, see the dungeon map, tap a
room — that room's text opens in your D&D Beyond copy of the module.

**Maps:**

- [`index.html`](index.html) — The Sunless Citadel, Fortress Level

GitHub Pages serves the repo root of `main` (repo **Settings → Pages →
Deploy from a branch → `main` / `/ (root)`**), so every push updates the
live page. The file is fully self-contained, so downloading it onto a
tablet works just as well.

## Objectives

1. **At the table (the main loop).** The DM has the map open on a tablet
   mid-session. The map is the hero: pan and pinch freely, tap a room pin
   to open that area's text on D&D Beyond. All area links share one named
   browser tab, so a session doesn't end in forty duplicates. The chip row
   is the index — tapping a chip *finds* the room, flying the map to its
   pin and pulsing it (a chip for a room with no pin yet just opens the
   text directly). `T` and `S` pins mark traps and secret doors and link
   to the relevant area.

2. **Prep (pin placement).** Room pins are placed once, in **edit pins**
   mode. Tap an empty spot on the map and it reads the printed room number
   under your finger (normalized cross-correlation against digit glyphs
   sampled from the map itself — no network, no OCR service) and drops a
   pin there. Confirm the guess, pick an alternative, or choose from the
   full number rail. `T`/`S` markers pick their room number from a
   dedicated rail (`T1`…`T41`), so a trap marker always knows which area
   text it belongs to. Fine-tune with the nudge d-pad (touch) or by
   dragging (mouse). Your placements are saved per-device in
   `localStorage` and survive reloads.

3. **One self-contained file.** Map image, pin data, recognition
   templates, styles and code all live in the single HTML file. No build,
   no server, no dependencies; works offline (except the outbound links).
   Without JavaScript it degrades to a plain image with clickable pins and
   chips.

## Baking in your pins

Pins you place live only in your browser. To make them part of the file
for everyone:

1. In edit mode, hit **⤓ export pins** — a panel shows the JSON with
   copy / share / download buttons (each with fallbacks, since tablet
   browsers are picky about all three). It maps each label to image-pixel
   coordinates, e.g. `{"12": [[86, 801]], "T24": [[201, 649]]}`.
2. Run the bake script — it replaces all baked pins in the file with
   the export's contents, then commit and push to redeploy:

   ```
   python3 bake_pins.py user_pins.json index.html
   ```

Baked-in state right now: **complete** — all 41 Fortress Level rooms
(a few numbers appear at more than one spot on the map and get a pin at
each) plus 11 trap/secret-door markers, hand-placed. The canonical
export lives in [`user_pins.json`](user_pins.json).

## Ideas / not done yet

- Grove Level map (area links for rooms 42–56 are already in the data).
