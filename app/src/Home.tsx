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
import { ConfirmDialog, PromptDialog, TextDialog } from "./Dialogs";
import { saveFile } from "./helpers";

type Bundle = ReturnType<typeof parseBundleFile>;

export function Home({ modules, onOpen, onCreate, onDelete, onRename }: {
  modules: ModuleDef[];
  onOpen: (id: string) => void;
  onCreate: (m: ModuleDef) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const pageFileRef = useRef<HTMLInputElement>(null);
  const [pageError, setPageError] = useState("");
  const [deleting, setDeleting] = useState<ModuleDef | null>(null);
  const [renaming, setRenaming] = useState<ModuleDef | null>(null);
  const [clash, setClash] = useState<{ pages: Bundle; titles: string[] } | null>(null);
  const [exportText, setExportText] = useState<{ name: string; json: string } | null>(null);

  function importPages(pages: Bundle) {
    for (const { module, pins } of pages) {
      writeImportedPins(module.id, pins);
      onCreate(module);
    }
  }

  async function handlePageFile(file: File) {
    setPageError("");
    try {
      const pages = parseBundleFile(await file.text());
      const titles = pages.filter(p => modules.some(m => m.id === p.module.id)).map(p => p.module.title);
      if (titles.length) { setClash({ pages, titles }); return; }
      importPages(pages);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : String(e));
    }
  }

  const doExport = (name: string, json: string) =>
    void saveFile(name, json).then(handled => { if (!handled) setExportText({ name, json }); });

  const exportOne = (m: ModuleDef) =>
    doExport(
      m.title.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() + ".dmmap.json",
      exportPageBundle(m, collectPinsByMap(m)),
    );

  const exportAll = () => doExport("dm-mapper-pages.dmmap.json", exportAllBundles(modules));

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
          {modules.length === 0 && (
            <p className="empty">your library is empty — add your first adventure below</p>
          )}
          {modules.map(m => (
            <div key={m.id} className="modcard">
              <button className="modopen" onClick={() => onOpen(m.id)}>
                <span className="modtitle">{m.title}</span>
                <span className="modmeta">
                  {m.maps.length} map{m.maps.length === 1 ? "" : "s"} · {m.expected.length} areas
                  {m.areas ? " · text" : ""}
                </span>
              </button>
              <button className="modexp" aria-label={"export " + m.title} title="export this page"
                onClick={() => exportOne(m)}>
                ⤓
              </button>
              <button className="modrename" aria-label={"rename " + m.title} title="rename"
                onClick={() => setRenaming(m)}>
                ✎
              </button>
              <button className="moddel" aria-label={"delete " + m.title} title="delete"
                onClick={() => setDeleting(m)}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="upload">
          <SaveImporter
            mode="create"
            buttonLabel="＋ add new adventure"
            buttonClass="btn big pri"
            onPicked={(page, picked) => onCreate(buildModule(page, picked))}
          />
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

      {deleting && (
        <ConfirmDialog
          title={`Remove “${deleting.title}”?`}
          body="Its saved maps are removed too. Pins stay in this device's storage."
          confirmLabel="remove page"
          danger
          onConfirm={() => { onDelete(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename this page"
          initial={renaming.title}
          confirmLabel="rename"
          onSubmit={t => { onRename(renaming.id, t); setRenaming(null); }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {exportText && (
        <TextDialog
          title={exportText.name}
          hint="downloads are blocked in this environment — copy the contents and save them under this filename instead"
          text={exportText.json}
          onClose={() => setExportText(null)}
        />
      )}
      {clash && (
        <ConfirmDialog
          title={clash.titles.length === 1
            ? `Replace “${clash.titles[0]}”?`
            : `Replace ${clash.titles.length} existing pages?`}
          body={"Already in your library (pins included): " + clash.titles.join(", ")}
          confirmLabel="replace"
          danger
          onConfirm={() => { importPages(clash.pages); setClash(null); }}
          onCancel={() => setClash(null)}
        />
      )}
    </>
  );
}
