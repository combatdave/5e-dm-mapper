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
import { ExportPanel } from "./EditChrome";
import { AreaPanel } from "./AreaPanel";

export function ModuleView({ module, onBack, onUpdate }: {
  module: ModuleDef;
  onBack: () => void;
  onUpdate: (m: ModuleDef) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);
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
    if (!editing) setExportJson(null);
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

  const allPins = stores.flatMap(s => s.pins);
  const pinnedRooms = new Set(allPins.filter(p => !p.mark).map(p => p.label));
  const markCount = allPins.filter(p => p.mark).length;
  const pinned = module.expected.filter(n => pinnedRooms.has(n)).length;
  const countText =
    (pinned === module.expected.length
      ? `${module.expected.length} rooms`
      : `${pinned}/${module.expected.length} rooms pinned`) +
    (markCount ? ` · ${markCount} marker${markCount === 1 ? "" : "s"}` : "");

  const chipRooms = module.expected.filter(n => module.names[n] || module.hrefs[n]);

  const onChipClick = (e: React.MouseEvent, num: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (mapRefs.current[activeMap]?.locate(num)) return;
    if (openAreaPanel(num)) return;
    const href = module.hrefs[num] || module.sourceUrl;
    if (href) openArea(href);
  };

  const exportPins = () => {
    mapRefs.current.forEach(r => r?.closeChrome());
    const payload = stores.length === 1
      ? stores[0].rawUserPins()
      : Object.fromEntries(stores.map((s, i) => [i, s.rawUserPins()]));
    setExportJson(JSON.stringify(payload, null, 1));
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
            <button className="backbtn" aria-label="all maps" onClick={onBack}>‹</button>
            {module.sourceUrl
              ? <a href={module.sourceUrl} target="_blank" rel="noopener">{module.title}</a>
              : module.title}
          </h1>
          <div className="actions">
            {editing && (
              <SaveImporter
                mode="merge"
                buttonLabel="⇪ import save"
                onPicked={(page, picked) => onUpdate(mergeSaveIntoModule(module, page, picked))}
              />
            )}
            <button id="exportBtn" className="btn" onClick={exportPins}>⤓ export pins</button>
            <button id="clearBtn" className="btn danger" onClick={clearPins}>✖ clear my pins</button>
            <button id="editBtn" className="btn" onClick={() => setEditing(on => !on)}>
              {editing ? "✓ done" : "✎ edit pins"}
            </button>
          </div>
        </div>
        <p className="sub" data-view="">
          chip: find the room on the map · pin: open the area text · pinch / scroll to zoom, drag to pan
        </p>
        <p className="sub" data-edit="">
          editing — tap the map, type the room number (t / s = trap / secret-door marker on the nearest room) · tap a pin to move or delete it
        </p>
      </header>

      <main>
        <section className="level">
          <div className="level-head">
            <h2>
              {module.maps.length > 1
                ? module.maps.map((m, i) => (
                  <button key={i} className={"maptab" + (i === activeMap ? " on" : "")}
                    onClick={() => setActiveMap(i)}>
                    {m.title}
                  </button>
                ))
                : module.maps[0]?.title}
            </h2>
            <span className="count">{countText}</span>
          </div>
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

      {exportJson !== null && <ExportPanel json={exportJson} onClose={() => setExportJson(null)} />}
    </>
  );
}
