/* Library screen: saved pages plus the upload flow — drop in a page
 * saved from D&D Beyond (Webpage, Single File → .mhtml, or plain
 * .html), pick which of its images are the maps, done.
 */
import { useRef, useState } from "react";
import type { ModuleDef } from "./modules";
import {
  buildModule, collectPinsByMap, exportAllBundles, exportPageBundle,
  parseBundleFile, writeImportedPins,
} from "./modules";
import { SaveImporter } from "./SaveImport";

function downloadJson(name: string, json: string) {
  const a = document.createElement("a");
  const blob = new Blob([json], { type: "application/json" });
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function Home({ modules, onOpen, onCreate, onDelete, onRename }: {
  modules: ModuleDef[];
  onOpen: (id: string) => void;
  onCreate: (m: ModuleDef) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const pageFileRef = useRef<HTMLInputElement>(null);
  const [pageError, setPageError] = useState("");

  async function handlePageFile(file: File) {
    setPageError("");
    try {
      const pages = parseBundleFile(await file.text());
      const clashes = pages.filter(p => modules.some(m => m.id === p.module.id)).map(p => p.module.title);
      if (clashes.length &&
          !confirm(`Replace ${clashes.length} existing page${clashes.length === 1 ? "" : "s"} (pins included)?\n${clashes.join("\n")}`))
        return;
      for (const { module, pins } of pages) {
        writeImportedPins(module.id, pins);
        onCreate(module);
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : String(e));
    }
  }

  const exportOne = (m: ModuleDef) =>
    downloadJson(
      m.title.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() + ".dmmap.json",
      exportPageBundle(m, collectPinsByMap(m)),
    );

  const exportAll = () => downloadJson("dm-mapper-pages.dmmap.json", exportAllBundles(modules));

  return (
    <>
      <header className="home-head">
        <div className="masthead">
          <h1>5e DM mapper</h1>
        </div>
        <p className="sub">your D&D Beyond adventure pages as interactive maps</p>
      </header>

      <main className="home">
        <div className="modlist">
          {modules.map(m => (
            <div key={m.id} className="modcard">
              <button className="modopen" onClick={() => onOpen(m.id)}>
                <span className="modtitle">{m.title}</span>
                <span className="modmeta">
                  {m.maps.length} map{m.maps.length === 1 ? "" : "s"} · {m.expected.length} areas
                  {m.areas ? " · text" : ""}{m.builtin ? " · built-in" : ""}
                </span>
              </button>
              <button className="modexp" aria-label={"export " + m.title} title="export this page"
                onClick={() => exportOne(m)}>
                ⤓
              </button>
              <button className="modrename" aria-label={"rename " + m.title} title="rename"
                onClick={() => {
                  const t = prompt("Rename this page:", m.title);
                  if (t && t.trim()) onRename(m.id, t.trim());
                }}>
                ✎
              </button>
              {!m.builtin && (
                <button className="moddel" aria-label={"delete " + m.title} title="delete"
                  onClick={() => { if (confirm(`Remove “${m.title}” and its saved maps? Pins in localStorage are kept.`)) onDelete(m.id); }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="upload">
          <SaveImporter
            mode="create"
            buttonLabel="＋ import from D&D Beyond"
            buttonClass="btn big pri"
            onPicked={(page, picked) => onCreate(buildModule(page, picked))}
          />
          <p className="uphint">save the adventure page first: Ctrl/Cmd-S → “Webpage, Single File”</p>
          <div className="uprow">
            <button className="btn" onClick={() => pageFileRef.current?.click()}>
              ⇞ import pages
            </button>
            <button className="btn" onClick={exportAll}>
              ⤓ export all
            </button>
          </div>
          <input ref={pageFileRef} type="file" accept=".json,application/json" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) void handlePageFile(f); e.target.value = ""; }} />
          {pageError && <p className="uperror">{pageError}</p>}
        </div>
      </main>
    </>
  );
}
