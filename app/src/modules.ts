/* Module registry: the built-in Sunless Citadel plus any modules the
 * DM creates by uploading a saved D&D Beyond page. Uploaded modules
 * (including their map images, as Blobs) persist in IndexedDB; pin
 * placements always live in localStorage under "edpins:<module id>"
 * (the built-in module's id is the historical key, so nothing is
 * orphaned).
 */
import { BASE_PINS, EXPECTED, HREFS, MAP, MODULE_URL, NAMES } from "./mapdata";
import type { AreaDigest, PageHeading, PageImage } from "./mhtml";

export interface MapDef {
  title: string;
  width: number;
  height: number;
  url?: string;      // bundled data URI or remote URL
  blob?: Blob;       // embedded image from an upload
  player?: boolean;  // clean player-facing version (no numbers/secrets)
}

export interface ModuleDef {
  id: string;                       // doubles as the pin-storage key suffix
  title: string;
  sourceUrl: string;                // "" = no outbound links
  names: Record<string, string>;    // area number -> room name
  hrefs: Record<string, string>;    // area number -> deep link
  expected: string[];               // labels offered on the pin rail
  maps: MapDef[];
  areas?: Record<string, AreaDigest>;   // per-area digests for hover cards
  builtin?: boolean;
  basePins?: Record<string, number[][]>;
}

export const BUILTIN: ModuleDef = {
  /* id kept identical to the historical document.title so existing
     localStorage pins keep working */
  id: "The Sunless Citadel — map launcher",
  title: "The Citadel - Fortress Level",
  sourceUrl: MODULE_URL,
  names: NAMES,
  hrefs: HREFS,
  expected: EXPECTED,
  maps: [{ title: MAP.title, width: MAP.width, height: MAP.height, url: MAP.src }],
  builtin: true,
  basePins: BASE_PINS,
};

/* generic rail labels for uploads whose headings aren't numbered */
export const GENERIC_EXPECTED = Array.from({ length: 60 }, (_, i) => String(i + 1));

/* "12. Larder" / "Area 12: Larder" → { num: "12", name: "Larder" } */
export function numberedArea(text: string): { num: string; name: string } | null {
  const m = text.match(/^\s*(?:area\s+)?(\d{1,3})[.:)\-–—]?\s+(.{2,})$/i);
  return m ? { num: m[1], name: m[2].trim() } : null;
}

export function buildModule(
  page: { title: string; sourceUrl: string; headings: PageHeading[]; areas: Record<string, AreaDigest> },
  picked: { image: PageImage; width: number; height: number }[],
): ModuleDef {
  const names: Record<string, string> = {};
  const hrefs: Record<string, string> = {};
  const expected: string[] = [];
  for (const h of page.headings) {
    const area = numberedArea(h.text);
    if (!area || names[area.num]) continue;
    names[area.num] = area.name;
    if (page.sourceUrl) hrefs[area.num] = page.sourceUrl + "#" + h.id;
    expected.push(area.num);
  }
  expected.sort((a, b) => +a - +b);
  return {
    id: page.sourceUrl || "upload:" + page.title,
    title: page.title.replace(/\s*[-|–].*$/, "").trim() || page.title,
    sourceUrl: page.sourceUrl,
    names,
    hrefs,
    expected: expected.length ? expected : GENERIC_EXPECTED,
    areas: page.areas,
    maps: picked.map((p, i) => ({
      title: (picked.length > 1 ? `Map ${i + 1}` : "Map") + (p.image.player ? " · player" : ""),
      width: p.width,
      height: p.height,
      url: p.image.blob ? undefined : p.image.url,
      blob: p.image.blob,
      player: p.image.player || undefined,
    })),
  };
}

/* merge a (re-)uploaded save into an existing page: text, names and
   links refresh; picked maps append as new tabs (byte-identical maps
   are skipped); pins are untouched — they key off the page id and
   map index */
export function mergeSaveIntoModule(
  m: ModuleDef,
  page: { title: string; sourceUrl: string; headings: PageHeading[]; areas: Record<string, AreaDigest> },
  picked: { image: PageImage; width: number; height: number }[],
): ModuleDef {
  const fresh = buildModule(page, picked);
  const maps = m.maps.map(x => ({ ...x }));
  for (const nm of fresh.maps) {
    /* an imported page bundle carries imageless map slots — a matching
       map from the save fills the slot instead of adding a tab */
    const empty = maps.find(x => !x.url && !x.blob && x.width === nm.width && x.height === nm.height);
    if (empty) {
      empty.blob = nm.blob; empty.url = nm.url;
      if (nm.player) empty.player = true;
      continue;
    }
    const dup = maps.some(x => {
      if (nm.url && x.url) return x.url === nm.url;
      if (x.width !== nm.width || x.height !== nm.height) return false;
      if (nm.blob && x.blob) return x.blob.size === nm.blob.size;
      /* embedded copy of the bundled built-in map: same image */
      return !!(x.url && x.url.startsWith("data:"));
    });
    if (dup) continue;
    maps.push({ ...nm, title: `Map ${maps.length + 1}` + (nm.player ? " · player" : "") });
  }
  const expected = [...new Set([...m.expected, ...fresh.expected])].sort((a, b) => +a - +b);
  return {
    ...m,
    sourceUrl: m.sourceUrl || fresh.sourceUrl,
    names: { ...m.names, ...fresh.names },
    hrefs: { ...m.hrefs, ...fresh.hrefs },
    expected,
    areas: { ...(m.areas || {}), ...(fresh.areas || {}) },
    maps,
  };
}

export const pinStoreKey = (moduleId: string, mapIndex: number) =>
  "edpins:" + moduleId + (mapIndex ? ":" + mapIndex : "");

/* ---------- page bundles: your work as a small portable file ---------
   Title, links, room names, map slots (dimensions only — no images)
   and every pin. No adventure text and no map images: re-attach those
   on the destination with "import save". */

export type PinsByMap = Record<string, Record<string, [number, number][]>>;

export function exportPageBundle(m: ModuleDef, pinsByMap: PinsByMap): string {
  return JSON.stringify({
    format: "5e-dm-mapper-page",
    version: 1,
    id: m.id,
    title: m.title,
    sourceUrl: m.sourceUrl,
    names: m.names,
    hrefs: m.hrefs,
    expected: m.expected,
    maps: m.maps.map(x => ({
      title: x.title,
      width: x.width,
      height: x.height,
      player: x.player || undefined,
      /* keep only shareable remote urls; blobs and the bundled data
         URI come back via "import save" */
      url: x.url && /^https?:/.test(x.url) ? x.url : undefined,
      bundled: x.url?.startsWith("data:") || undefined,
    })),
    pins: pinsByMap,
  }, null, 1);
}

export function importPageBundle(json: string): { module: ModuleDef; pins: PinsByMap } {
  const b = JSON.parse(json);
  if (b?.format !== "5e-dm-mapper-page" || !Array.isArray(b.maps) || !b.id)
    throw new Error("Not a page file — expected an export from “⤓ export page”.");
  const module: ModuleDef = sanitizeModule({
    id: String(b.id),
    title: String(b.title || "Imported page"),
    sourceUrl: String(b.sourceUrl || ""),
    names: b.names || {},
    hrefs: b.hrefs || {},
    expected: Array.isArray(b.expected) && b.expected.length ? b.expected.map(String) : GENERIC_EXPECTED,
    maps: b.maps.map((x: Record<string, unknown>, i: number) => ({
      title: String(x.title || `Map ${i + 1}`),
      width: Number(x.width) || 100,
      height: Number(x.height) || 100,
      player: x.player ? true : undefined,
      url: typeof x.url === "string" && /^https?:/.test(x.url) ? x.url
        /* the bundled built-in map can be restored locally */
        : (x.bundled && String(b.id) === BUILTIN.id
            ? BUILTIN.maps.find(bm => bm.width === Number(x.width) && bm.height === Number(x.height))?.url
            : undefined),
    })),
    builtin: String(b.id) === BUILTIN.id || undefined,
    basePins: String(b.id) === BUILTIN.id ? BUILTIN.basePins : undefined,
  });
  const pins: PinsByMap = (b.pins && typeof b.pins === "object") ? b.pins : {};
  return { module, pins };
}

/* imported pins land in the page's normal pin storage */
export function writeImportedPins(moduleId: string, pins: PinsByMap) {
  try {
    for (const [idx, labels] of Object.entries(pins))
      localStorage.setItem(pinStoreKey(moduleId, Number(idx)), JSON.stringify(labels));
  } catch { /* private mode */ }
}

/* location links must always be base#AreaAnchor — saves made while a
   page was scrolled used to store base#ScrollAnchor#AreaAnchor */
export function cleanHref(href: string): string {
  const i = href.indexOf("#"), j = href.lastIndexOf("#");
  return i < 0 || i === j ? href : href.slice(0, i) + "#" + href.slice(j + 1);
}

function sanitizeModule(m: ModuleDef): ModuleDef {
  m.sourceUrl = (m.sourceUrl || "").split("#")[0];
  for (const k of Object.keys(m.hrefs || {})) m.hrefs[k] = cleanHref(m.hrefs[k]);
  return m;
}

/* ---------- user-chosen page titles (any module, built-in too) ------- */

const TITLES_KEY = "dm-mapper:titles";
export function titleOverrides(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TITLES_KEY) || "{}"); } catch { return {}; }
}
export function setTitleOverride(id: string, title: string) {
  try {
    const t = titleOverrides();
    t[id] = title;
    localStorage.setItem(TITLES_KEY, JSON.stringify(t));
  } catch { /* private mode */ }
}

/* ---------- persistence (IndexedDB, in-memory fallback) -------------- */

const DB_NAME = "dm-mapper", STORE = "modules";
const memory = new Map<string, ModuleDef>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function listSavedModules(): Promise<ModuleDef[]> {
  const db = await openDb();
  if (!db) return [...memory.values()];
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(((req.result as ModuleDef[]) || []).map(sanitizeModule));
      req.onerror = () => resolve([...memory.values()]);
    } catch {
      resolve([...memory.values()]);
    }
  });
}

export async function saveModule(m: ModuleDef): Promise<void> {
  memory.set(m.id, m);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(m);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteModule(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* remember which module was open so the table view comes right back */
const LAST_KEY = "dm-mapper:last";
export function getLastModuleId(): string {
  try { return localStorage.getItem(LAST_KEY) || BUILTIN.id; } catch { return BUILTIN.id; }
}
export function setLastModuleId(id: string) {
  try { localStorage.setItem(LAST_KEY, id); } catch { /* private mode */ }
}
