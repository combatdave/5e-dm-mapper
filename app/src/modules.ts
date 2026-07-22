/* Module registry: the built-in Sunless Citadel plus any modules the
 * DM creates by uploading a saved D&D Beyond page. Uploaded modules
 * (including their map images, as Blobs) persist in IndexedDB; pin
 * placements always live in localStorage under "edpins:<module id>"
 * (the built-in module's id is the historical key, so nothing is
 * orphaned).
 */
import { BASE_PINS, EXPECTED, HREFS, MAP, MODULE_URL, NAMES } from "./mapdata";
import glyphData from "./glyphs.json";
import type { PageHeading, PageImage } from "./mhtml";
import type { LearnedDigits } from "./segment";

export interface GlyphData {
  cells: Record<string, number[][]>;
  p: { pitch: number; cw: number; chh: number; rx: number; ry: number; comp: number; pen: number };
  combos?: number;   // glyph variants to try per digit (default 2)
}

export interface MapDef {
  title: string;
  width: number;
  height: number;
  url?: string;      // bundled data URI or remote URL
  blob?: Blob;       // embedded image from an upload
}

export interface ModuleDef {
  id: string;                       // doubles as the pin-storage key suffix
  title: string;
  sourceUrl: string;                // "" = no outbound links
  names: Record<string, string>;    // area number -> room name
  hrefs: Record<string, string>;    // area number -> deep link
  expected: string[];               // labels offered on the pin rail
  maps: MapDef[];
  builtin?: boolean;
  glyphs?: GlyphData;               // glyphs sampled from the map itself (built-in)
  learnedDigits?: LearnedDigits;    // canonical crops from confirmed placements
  basePins?: Record<string, number[][]>;
}

export const BUILTIN: ModuleDef = {
  /* id kept identical to the historical document.title so existing
     localStorage pins keep working */
  id: "The Sunless Citadel — map launcher",
  title: "The Sunless Citadel",
  sourceUrl: MODULE_URL,
  names: NAMES,
  hrefs: HREFS,
  expected: EXPECTED,
  maps: [{ title: MAP.title, width: MAP.width, height: MAP.height, url: MAP.src }],
  builtin: true,
  glyphs: glyphData as GlyphData,
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
  page: { title: string; sourceUrl: string; headings: PageHeading[] },
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
    maps: picked.map((p, i) => ({
      title: picked.length > 1 ? `Map ${i + 1}` : "Map",
      width: p.width,
      height: p.height,
      url: p.image.blob ? undefined : p.image.url,
      blob: p.image.blob,
    })),
  };
}

export const pinStoreKey = (moduleId: string, mapIndex: number) =>
  "edpins:" + moduleId + (mapIndex ? ":" + mapIndex : "");

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
      req.onsuccess = () => resolve((req.result as ModuleDef[]) || []);
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
