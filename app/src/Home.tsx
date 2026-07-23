/* Library screen: saved pages plus the upload flow — drop in a page
 * saved from D&D Beyond (Webpage, Single File → .mhtml, or plain
 * .html), pick which of its images are the maps, done.
 */
import { useMemo, useRef, useState } from "react";
import type { ModuleDef } from "./modules";
import type { ParsedPage } from "./mhtml";
import {
  buildModule, collectPinsByMap, exportAllBundles, exportPageBundle,
  parseBundleFile, writeImportedPins,
} from "./modules";
import { SaveImporter } from "./SaveImport";
import { ConfirmDialog, PromptDialog, TextDialog } from "./Dialogs";
import { saveFile } from "./helpers";

type Bundle = ReturnType<typeof parseBundleFile>;

export function Home({ modules, onOpen, onCreate, onDelete, onRename, incoming, onIncomingHandled }: {
  modules: ModuleDef[];
  onOpen: (id: string) => void;
  onCreate: (m: ModuleDef) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  incoming?: ParsedPage | null;
  onIncomingHandled?: () => void;
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

  /* the bookmarklet: from a D&D Beyond page you're reading (logged in),
     it opens this app and posts that page's live DOM over — no file.
     Needs the app on its own http(s) origin; hidden in the hosted
     preview (its iframe can't receive the hand-off). */
  const canBookmarklet = /^https?:$/.test(location.protocol) && !window.claude;
  const bookmarklet = useMemo(() => {
    const app = location.href.split("#")[0];
    const src =
      `(()=>{var w=window.open(${JSON.stringify(app)},"dm-mapper-import");if(!w)return;` +
      `var d={dmMapperImport:1,url:location.href,title:document.title,html:document.documentElement.outerHTML},n=0,` +
      `t=setInterval(function(){if(n++>60)clearInterval(t);else try{w.postMessage(d,${JSON.stringify(location.origin)})}catch(e){}},350);` +
      `addEventListener("message",function h(e){if(e.data&&e.data.dmMapperAck){clearInterval(t);removeEventListener("message",h)}})})()`;
    return "javascript:" + encodeURIComponent(src);
  }, []);

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
                onClick={() => setRenaming(m)}>
                ✎
              </button>
              {!m.builtin && (
                <button className="moddel" aria-label={"delete " + m.title} title="delete"
                  onClick={() => setDeleting(m)}>
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
            incoming={incoming}
            onIncomingHandled={onIncomingHandled}
          />
          <p className="uphint">save the adventure page first: Ctrl/Cmd-S → “Webpage, Single File”</p>
          {canBookmarklet && (
            <p className="uphint">
              or skip the file: drag{" "}
              <a className="bmk" href={bookmarklet} draggable onClick={e => e.preventDefault()}>
                ⚓ send to DM mapper
              </a>{" "}
              to your bookmarks bar once — then click it while reading any D&D Beyond page
            </p>
          )}
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
