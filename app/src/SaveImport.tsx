/* Shared save-upload flow: button → parse the .mhtml/.html → image
 * picker. Home uses it to create a new page; an open page uses it to
 * merge more out of the same save (second map, the area text).
 */
import { useRef, useState } from "react";
import { parseSavedPage } from "./mhtml";
import type { PageImage, ParsedPage } from "./mhtml";

export interface PickedImage {
  image: PageImage;
  width: number;
  height: number;
}

interface Candidate {
  image: PageImage;
  src: string;         // object/remote URL for preview
  width: number;
  height: number;
}

interface PickerState {
  page: ParsedPage;
  candidates: Candidate[];
  selected: Set<number>;
}

export function SaveImporter({ buttonLabel, buttonClass, mode, onPicked }: {
  buttonLabel: string;
  buttonClass?: string;
  mode: "create" | "merge";     // merge allows zero maps (text-only import)
  onPicked: (page: ParsedPage, picked: PickedImage[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<PickerState | null>(null);

  async function handleFile(file: File) {
    setBusy(true); setError("");
    try {
      const page = await parseSavedPage(file);
      const candidates = await measureImages(page.images);
      if (!candidates.length && mode === "create")
        throw new Error("No usable images found — save the page as “Webpage, Single File” (.mhtml) so the map is embedded.");
      /* preselect the likely maps: D&D Beyond names its map files
         "map-…", which beats any size heuristic (the biggest images
         are usually art). Fallback: largest portrait-ish image. */
      const byName = candidates
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => /(^|[/_.-])map[-._]/i.test(c.image.location))
        .map(({ i }) => i);
      const mapish = candidates.findIndex(c => c.width / c.height <= 1.6);
      const selected = byName.length ? byName : (mapish >= 0 ? [mapish] : []);
      setPicker({ page, candidates, selected: new Set(selected) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!picker) return;
    if (mode === "create" && !picker.selected.size) return;
    const picked = [...picker.selected].sort((a, b) => a - b)
      .map(i => picker.candidates[i])
      .map(c => ({ image: c.image, width: c.width, height: c.height }));
    const page = picker.page;
    setPicker(null);
    onPicked(page, picked);
  }

  const n = picker?.selected.size ?? 0;

  return (
    <>
      <button className={buttonClass || "btn"} disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "reading…" : buttonLabel}
      </button>
      <input ref={fileRef} type="file" accept=".mhtml,.mht,.html,.htm,message/rfc822,text/html"
        hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
      {error && <p className="uperror">{error}</p>}
      {picker && (
        <div className="picker">
          <div className="pickerbox">
            <div className="pickerhead">
              <b>{picker.page.title}</b>
              <span>
                pick the map image{picker.candidates.length === 1 ? "" : "(s)"}
                {mode === "merge" ? " — pick none to import just the text" : ""}
              </span>
            </div>
            <div className="pickergrid">
              {picker.candidates.map((c, i) => (
                <button key={i}
                  className={"pickimg" + (picker.selected.has(i) ? " on" : "")}
                  onClick={() => setPicker(p => {
                    if (!p) return p;
                    const sel = new Set(p.selected);
                    if (sel.has(i)) sel.delete(i); else sel.add(i);
                    return { ...p, selected: sel };
                  })}>
                  <img src={c.src} alt="" loading="lazy" />
                  <span>{c.width}×{c.height}{c.image.player ? " · player" : ""}</span>
                </button>
              ))}
            </div>
            <div className="pickerrow">
              <button className="btn" onClick={() => setPicker(null)}>cancel</button>
              <button className="btn pri" disabled={mode === "create" && !n} onClick={confirm}>
                {mode === "create"
                  ? `add page${n ? ` · ${n} map${n === 1 ? "" : "s"}` : ""}`
                  : n ? `add ${n} map${n === 1 ? "" : "s"} + text` : "import text only"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* learn every image's size — from the file header when we have the
   bytes (instant; decoding 50 embedded images just for dimensions
   takes ten seconds), by loading only for remote URLs — then drop
   icons and decorations, biggest first */
async function measureImages(images: PageImage[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  /* embedded images resolve instantly from their headers; remote ones
     need a network round-trip that can stall (offline, slow CDN) — show
     the picker with whatever has resolved after a short grace period */
  const all = Promise.all(images.map(async im => {
    let dims = im.blob ? await dimsFromHeader(im.blob) : null;
    let src = "";
    if (!dims) {
      src = im.blob ? URL.createObjectURL(im.blob) : im.url || "";
      if (!src) return;
      dims = await new Promise<{ w: number; h: number } | null>(resolve => {
        const el = new Image();
        el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight });
        el.onerror = () => resolve(null);
        el.src = src;
      });
      if (!dims || Math.min(dims.w, dims.h) < 220) {
        if (im.blob && src) URL.revokeObjectURL(src);
        return;
      }
    } else if (Math.min(dims.w, dims.h) < 220) {
      return;
    }
    if (!src) src = im.blob ? URL.createObjectURL(im.blob) : im.url || "";
    out.push({ image: im, src, width: dims.w, height: dims.h });
  }));
  await Promise.race([all, new Promise(res => setTimeout(res, 3500))]);
  /* drop byte-identical duplicates (same image saved under two URLs) */
  const seen = new Set<string>();
  const unique = out.filter(c => {
    const key = `${c.width}x${c.height}:${c.image.blob?.size ?? c.image.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 24);
}

/* image dimensions straight from the container header — no decode */
async function dimsFromHeader(blob: Blob): Promise<{ w: number; h: number } | null> {
  const b = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

  /* PNG */
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { w: u32be(16), h: u32be(20) };
  /* GIF */
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)
    return { w: u16le(6), h: u16le(8) };
  /* JPEG: scan for a start-of-frame marker */
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) ||
          (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf))
        return { w: u16be(i + 7), h: u16be(i + 5) };
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  /* WebP */
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8X") return { w: u24le(24) + 1, h: u24le(27) + 1 };
    if (fourcc === "VP8 ") return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
    if (fourcc === "VP8L") {
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
