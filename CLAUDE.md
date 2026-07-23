# Dungeon Atlas — notes for Claude

## Standing instructions

- **Always republish the claude.ai artifact after any change to the app.**
  Do it as part of every delivery (after building, testing, committing and
  pushing) and **never ask for permission or confirmation first**. Republish
  by regenerating the artifact variant (built `index.html` stripped of the
  doctype/html/head/body shell, keeping `<title>`, styles, body content and
  scripts) at the same scratchpad path used previously in the session, so
  the artifact URL stays stable.
- Push directly to `main`, and keep the session branch fast-forwarded to it.

## Project facts

- `npm run build` type-checks and emits the single-file `index.html` at the
  repo root (served by GitHub Pages from `main` / root).
- Client-side only: user saves persist in IndexedDB (`dm-mapper` db) and
  localStorage (`edpins:*`) — never rename those keys, and never bake
  D&D Beyond adventure content into the repo.
- The hosted artifact runs in a sandboxed iframe: no native
  confirm/prompt/alert, no window.open, no <a download> — use the in-app
  dialogs, real links, and the saveFile()/openArea() helpers, which handle
  the fallbacks.
