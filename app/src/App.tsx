import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BASE_PINS, EXPECTED, HREFS, MAP, MODULE_URL, NAMES } from "./mapdata";
import { openArea } from "./helpers";
import { PinStore } from "./pins";
import { MapView } from "./MapView";
import type { MapHandle } from "./MapView";

/* per-device pin storage — key kept identical to earlier builds so
   nobody's placements are orphaned */
const LSKEY = "edpins:" + document.title;

export default function App() {
  const store = useMemo(() => new PinStore(LSKEY, BASE_PINS, MAP.width, MAP.height), []);
  const [editing, setEditing] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);
  const mapRef = useRef<MapHandle>(null);

  useSyncExternalStore(store.subscribe, store.getVersion);

  useEffect(() => {
    document.body.classList.toggle("editing", editing);
    if (!editing) setExportJson(null);
  }, [editing]);

  /* swallow clicks on pin links while editing (belt and braces —
     hrefs are also removed in edit mode) */
  useEffect(() => {
    const block = (e: MouseEvent) => {
      if (document.body.classList.contains("editing") && (e.target as Element).closest?.("a.pin")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener("click", block, true);
    return () => document.removeEventListener("click", block, true);
  }, []);

  const pinnedRooms = new Set(store.pins.filter(p => !p.mark).map(p => p.label));
  const markCount = store.pins.filter(p => p.mark).length;
  const pinned = EXPECTED.filter(n => pinnedRooms.has(n)).length;
  const countText =
    (pinned === EXPECTED.length ? `${EXPECTED.length} rooms` : `${pinned}/${EXPECTED.length} rooms pinned`) +
    (markCount ? ` · ${markCount} marker${markCount === 1 ? "" : "s"}` : "");

  const onChipClick = (e: React.MouseEvent, num: string, href: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (!mapRef.current?.locate(num)) openArea(href);
  };

  return (
    <>
      <header>
        <div className="masthead">
          <h1>
            <a href={MODULE_URL} target="_blank" rel="noopener">The Sunless Citadel</a>
          </h1>
          <div className="actions">
            <button id="exportBtn" className="btn"
              onClick={() => { mapRef.current?.closeChrome(); setExportJson(store.exportJson()); }}>
              ⤓ export pins
            </button>
            <button id="clearBtn" className="btn danger"
              onClick={() => {
                if (!confirm("Delete all pins you placed on this device?")) return;
                store.clearStored();
                location.reload();
              }}>
              ✖ clear my pins
            </button>
            <button id="editBtn" className="btn" onClick={() => setEditing(on => !on)}>
              {editing ? "✓ done" : "✎ edit pins"}
            </button>
          </div>
        </div>
        <p className="sub" data-view="">
          chip: find the room on the map · pin: open it in your D&D Beyond copy · pinch / scroll to zoom, drag to pan
        </p>
        <p className="sub" data-edit="">
          editing — tap an empty spot to add a pin (it reads the room number under your finger) · tap a pin to move or delete it
        </p>
      </header>

      <main>
        <section className="level">
          <div className="level-head">
            <h2>{MAP.title}</h2>
            <span className="count">{countText}</span>
          </div>
          <div className="chips">
            {EXPECTED.map(num => (
              <a
                key={num}
                href={HREFS[num]}
                target="_blank"
                rel="noopener"
                data-pin={num}
                className={pinnedRooms.has(num) ? undefined : "nopin"}
                onClick={e => onChipClick(e, num, HREFS[num])}
              >
                <b>{num}</b>{NAMES[num]}
              </a>
            ))}
          </div>
          <MapView
            ref={mapRef}
            store={store}
            editing={editing}
            exportJson={exportJson}
            onCloseExport={() => setExportJson(null)}
          />
        </section>
      </main>
    </>
  );
}
