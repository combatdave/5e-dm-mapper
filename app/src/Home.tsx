/* Library screen: saved modules plus the upload flow — drop in a page
 * saved from D&D Beyond (Webpage, Single File → .mhtml, or plain
 * .html), pick which of its images are the maps, done.
 */
import { useRef, useState } from "react";
import type { ModuleDef } from "./modules";
import { buildModule } from "./modules";
import { parseSavedPage } from "./mhtml";
import type { PageImage, ParsedPage } from "./mhtml";

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

export function Home({ modules, onOpen, onCreate, onDelete }: {
  modules: ModuleDef[];
  onOpen: (id: string) => void;
  onCreate: (m: ModuleDef) => void;
  onDelete: (id: string) => void;
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
      if (!candidates.length)
        throw new Error("No usable images found — save the page as “Webpage, Single File” (.mhtml) so the map is embedded.");
      /* biggest image is almost always the map — preselect it */
      setPicker({ page, candidates, selected: new Set([0]) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function createModule() {
    if (!picker || !picker.selected.size) return;
    const picked = [...picker.selected].sort((a, b) => a - b)
      .map(i => picker.candidates[i])
      .map(c => ({ image: c.image, width: c.width, height: c.height }));
    const mod = buildModule(picker.page, picked);
    setPicker(null);
    onCreate(mod);
  }

  return (
    <>
      <header>
        <div className="masthead">
          <h1>5e DM mapper</h1>
        </div>
        <p className="sub">
          save an adventure page from D&D Beyond (Ctrl/Cmd-S → “Webpage, Single File”), upload it here,
          pick the map image, then pin the rooms — pins deep-link back to the area text
        </p>
      </header>

      <main className="home">
        <div className="modlist">
          {modules.map(m => (
            <div key={m.id} className="modcard">
              <button className="modopen" onClick={() => onOpen(m.id)}>
                <span className="modtitle">{m.title}</span>
                <span className="modmeta">
                  {m.maps.length} map{m.maps.length === 1 ? "" : "s"} · {m.expected.length} areas
                  {m.builtin ? " · built-in" : ""}
                </span>
              </button>
              {!m.builtin && (
                <button className="moddel" aria-label={"delete " + m.title}
                  onClick={() => { if (confirm(`Remove “${m.title}” and its saved maps? Pins in localStorage are kept.`)) onDelete(m.id); }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="upload">
          <button className="btn big" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "reading…" : "⇪ upload a saved page (.mhtml / .html)"}
          </button>
          <input ref={fileRef} type="file" accept=".mhtml,.mht,.html,.htm,message/rfc822,text/html"
            hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
          {error && <p className="uperror">{error}</p>}
        </div>
      </main>

      {picker && (
        <div className="picker">
          <div className="pickerbox">
            <div className="pickerhead">
              <b>{picker.page.title}</b>
              <span>{picker.candidates.length} images found — tap the map{picker.candidates.length > 1 ? "(s)" : ""}</span>
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
                  <span>{c.width}×{c.height}</span>
                </button>
              ))}
            </div>
            <div className="pickerrow">
              <button className="btn" onClick={() => setPicker(null)}>cancel</button>
              <button className="btn pri" disabled={!picker.selected.size} onClick={createModule}>
                add module ({picker.selected.size} map{picker.selected.size === 1 ? "" : "s"})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* load every image once to learn its real size; drop icons and
   decorations, biggest first */
async function measureImages(images: PageImage[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  await Promise.all(images.map(im => new Promise<void>(resolve => {
    const src = im.blob ? URL.createObjectURL(im.blob) : im.url || "";
    if (!src) return resolve();
    const el = new Image();
    const done = (keep: boolean) => {
      if (keep) out.push({ image: im, src, width: el.naturalWidth, height: el.naturalHeight });
      else if (im.blob) URL.revokeObjectURL(src);
      resolve();
    };
    el.onload = () => done(Math.min(el.naturalWidth, el.naturalHeight) >= 220);
    el.onerror = () => done(false);
    el.src = src;
  })));
  return out.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 24);
}
