/* One module (adventure) open for play or pin editing: header with
 * actions, area chips, and one MapView per map (tabbed when a module
 * has several).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ModuleDef } from "./modules";
import { mergeSaveIntoModule, pinStoreKey } from "./modules";
import { SaveImporter } from "./SaveImport";
import { openArea } from "./helpers";
import { PinStore } from "./pins";
import { MapView } from "./MapView";
import type { MapHandle } from "./MapView";
import { AreaPanel } from "./AreaPanel";

export function ModuleView({ module, onBack, onUpdate }: {
  module: ModuleDef;
  onBack: () => void;
  onUpdate: (m: ModuleDef) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [activeMap, setActiveMap] = useState(0);
  const [panelNum, setPanelNum] = useState<string | null>(null);
  const mapRefs = useRef<(MapHandle | null)[]>([]);

  const stores = useMemo(
    () => module.maps.map((m, i) =>
      new PinStore(pinStoreKey(module.id, i), i === 0 ? (module.basePins ?? {}) : {}, m.width, m.height)),
    [module],
  );

  /* re-render when any store changes (combined version counter) */
  const subscribe = useMemo(() => (fn: () => void) => {
    const offs = stores.map(s => s.subscribe(fn));
    return () => offs.forEach(off => off());
  }, [stores]);
  useSyncExternalStore(subscribe, () => stores.reduce((n, s) => n + s.getVersion(), 0));

  /* object URLs for uploaded (Blob) map images */
  const imgSrcs = useMemo(
    () => module.maps.map(m => (m.blob ? URL.createObjectURL(m.blob) : m.url || "")),
    [module],
  );
  useEffect(() => () => {
    imgSrcs.forEach((u, i) => { if (module.maps[i].blob) URL.revokeObjectURL(u); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSrcs]);

  useEffect(() => {
    document.body.classList.toggle("editing", editing);
    if (editing) setPanelNum(null);
    return () => document.body.classList.remove("editing");
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelNum(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* pin tap: open the area's own text in-app when we have it */
  const openAreaPanel = (num: string): boolean => {
    if (!module.areas?.[num]?.html) return false;
    setPanelNum(num);
    return true;
  };

  /* hidden maps have zero size; refit when a tab becomes active */
  useEffect(() => { mapRefs.current[activeMap]?.refit(); }, [activeMap]);

  const pinnedRooms = new Set(stores.flatMap(s => s.pins).filter(p => !p.mark).map(p => p.label));
  const chipRooms = module.expected.filter(n => module.names[n] || module.hrefs[n]);

  const onChipClick = (e: React.MouseEvent, num: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (mapRefs.current[activeMap]?.locate(num)) return;
    if (openAreaPanel(num)) return;
    const href = module.hrefs[num] || module.sourceUrl;
    if (href) openArea(href);
  };

  const clearPins = () => {
    if (!confirm("Delete all pins you placed on this device?")) return;
    stores.forEach(s => s.clearStored());
    location.reload();
  };

  return (
    <>
      <header>
        <div className="masthead">
          <h1>
            <button className="backbtn" aria-label="back to library" onClick={onBack}>‹</button>
            {module.sourceUrl
              ? <a href={module.sourceUrl} target="_blank" rel="noopener">{module.title}</a>
              : module.title}
          </h1>
          <div className="actions">
            {editing && (
              <SaveImporter
                mode="merge"
                buttonLabel="⇪ import from D&D Beyond"
                onPicked={(page, picked) => onUpdate(mergeSaveIntoModule(module, page, picked))}
              />
            )}
            {editing && (
              <button id="clearBtn" className="btn danger" onClick={clearPins}>✕ clear pins</button>
            )}
            <button id="editBtn" className={"btn" + (editing ? " on" : "")}
              onClick={() => setEditing(on => !on)}>
              {editing ? "✓ done" : "✎ edit"}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="level">
          {module.maps.length > 1 && (
            <div className="maptabs">
              {module.maps.map((m, i) => (
                <button key={i} className={"maptab" + (i === activeMap ? " on" : "")}
                  onClick={() => setActiveMap(i)}>
                  {m.title}
                </button>
              ))}
            </div>
          )}
          {chipRooms.length > 0 && (
            <div className="chips">
              {chipRooms.map(num => (
                <a
                  key={num}
                  href={module.hrefs[num] || module.sourceUrl || undefined}
                  target="_blank"
                  rel="noopener"
                  data-pin={num}
                  className={pinnedRooms.has(num) ? undefined : "nopin"}
                  onClick={e => onChipClick(e, num)}
                >
                  <b>{num}</b>{module.names[num] || ""}
                </a>
              ))}
            </div>
          )}
          {panelNum && module.areas?.[panelNum] && (
            <AreaPanel
              num={panelNum}
              name={module.names[panelNum]}
              digest={module.areas[panelNum]}
              href={module.hrefs[panelNum] || module.sourceUrl || undefined}
              onClose={() => setPanelNum(null)}
            />
          )}
          {module.maps.map((m, i) => (
            <div key={i} className="mapslot" style={i === activeMap ? undefined : { display: "none" }}>
              <MapView
                ref={el => { mapRefs.current[i] = el; }}
                module={module}
                map={m}
                imgSrc={imgSrcs[i]}
                store={stores[i]}
                editing={editing}
                onOpenArea={openAreaPanel}
              />
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
