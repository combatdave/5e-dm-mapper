/* Library screen: saved pages plus the upload flow — drop in a page
 * saved from D&D Beyond (Webpage, Single File → .mhtml, or plain
 * .html), pick which of its images are the maps, done.
 */
import type { ModuleDef } from "./modules";
import { buildModule } from "./modules";
import { SaveImporter } from "./SaveImport";

export function Home({ modules, onOpen, onCreate, onDelete, onRename }: {
  modules: ModuleDef[];
  onOpen: (id: string) => void;
  onCreate: (m: ModuleDef) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  return (
    <>
      <header>
        <div className="masthead">
          <h1>5e DM mapper</h1>
        </div>
        <p className="sub">
          save an adventure page from D&D Beyond (Ctrl/Cmd-S → “Webpage, Single File”), upload it here,
          pick the map image, then pin the rooms — the map becomes the index of an interactive adventure book
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
                  {m.areas ? " · text" : ""}{m.builtin ? " · built-in" : ""}
                </span>
              </button>
              <button className="modrename" aria-label={"rename " + m.title}
                onClick={() => {
                  const t = prompt("Rename this page:", m.title);
                  if (t && t.trim()) onRename(m.id, t.trim());
                }}>
                ✎
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
          <SaveImporter
            mode="create"
            buttonLabel="⇪ upload a saved page (.mhtml / .html)"
            buttonClass="btn big"
            onPicked={(page, picked) => onCreate(buildModule(page, picked))}
          />
        </div>
      </main>
    </>
  );
}
