/* The map viewport: pan / pinch / zoom, tap-a-pin-to-open, chip
 * fly-to, and the whole edit mode (tap-to-recognize placement,
 * confirm bar, number/mark rails, nudge pad, mouse drag).
 *
 * Pan/zoom state lives in refs and is applied imperatively to the
 * world element (a CSS transform plus a --pin-scale variable that
 * counter-scales pins), so nothing re-renders at 60fps. React owns
 * the pin list and the floating edit chrome.
 *
 * Recognition sources, in order of preference: glyphs sampled from
 * the map itself (built-in module), glyphs learned from this map's
 * confirmed placements, canvas-rendered generic fonts. If the image
 * can't be read at all (remote image on a plain-HTML save → tainted
 * canvas), tapping falls back to picking the label from the rail.
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
  useSyncExternalStore,
} from "react";
import type { MapDef, ModuleDef } from "./modules";
import { clamp, MAX_ZOOM, MIN_ZOOM, openArea, pinTitle } from "./helpers";
import { rankGuesses, toGrayscale } from "./recognize";
import type { Guess } from "./recognize";
import { genericBanks, learnFromMatch } from "./fontbank";
import { PinStore } from "./pins";
import type { Pin, PlaceResult } from "./pins";
import { EditBar, NudgePad, Rail } from "./EditChrome";
import type { BarItem, RailEntry } from "./EditChrome";

export interface MapHandle {
  locate(label: string): boolean;
  closeChrome(): void;
  refit(): void;
}

interface ChromeState {
  bar: BarItem[] | null;
  pad: { pinId: number } | null;
  rail: RailEntry[] | null;
}

const NO_CHROME: ChromeState = { bar: null, pad: null, rail: null };

const pct = (v: number, total: number) => (v / total * 100).toFixed(2) + "%";

interface Props {
  module: ModuleDef;
  map: MapDef;
  imgSrc: string;
  store: PinStore;
  editing: boolean;
  onLearned?: (learned: NonNullable<ModuleDef["learned"]>) => void;
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { module, map, imgSrc, store, editing, onLearned }, ref,
) {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useSyncExternalStore(store.subscribe, store.getVersion);

  const [chrome, setChrome] = useState<ChromeState>(NO_CHROME);

  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
    setChrome(NO_CHROME);          // entering or leaving edit mode resets the chrome
    curRef.current = null;
  }, [editing]);

  /* ----- viewer state (refs: no re-render while panning) ----- */
  const view = useRef({ s: 1, tx: 0, ty: 0, fitS: 1 });
  const animRef = useRef<number | null>(null);
  const curRef = useRef<PlaceResult | null>(null);
  const grayRef = useRef<Float32Array | null>(null);
  const methods = useRef({
    locate: (_: string) => false as boolean,
    refit: () => {},
  });

  useImperativeHandle(ref, () => ({
    locate: (label: string) => methods.current.locate(label),
    closeChrome: () => setChrome(NO_CHROME),
    refit: () => methods.current.refit(),
  }), []);

  const hrefFor = (pin: Pin): string => {
    const num = pin.label.replace(/^[TS]/, "");
    return (pin.mark ? module.hrefs[num] : module.hrefs[pin.label]) || module.sourceUrl || "";
  };

  useEffect(() => {
    const vp = vpRef.current!, world = worldRef.current!, img = imgRef.current!;
    const v = view.current;
    const W = map.width, H = map.height;
    const ptrs = new Map<number, [number, number]>();
    let moved = 0;
    let pinch0: { d: number; s: number } | null = null;
    let tap: Element | null = null;
    let edTap: HTMLElement | null = null;
    let drag: { id: number; el: HTMLElement; ox: number; oy: number; px: number; py: number; moved: boolean } | null = null;

    function apply() {
      world.style.transform = `translate(${v.tx}px,${v.ty}px) scale(${v.s})`;
      world.style.setProperty("--pin-scale", String(1 / v.s));  // pins keep constant screen size
    }
    function fit() {
      const r = vp.getBoundingClientRect();
      if (!r.width || !r.height) return;   // hidden (inactive map tab)
      v.fitS = Math.min(r.width / W, r.height / H);
      v.s = v.fitS;
      v.tx = (r.width - W * v.s) / 2;
      v.ty = (r.height - H * v.s) / 2;
      stopFly();
      apply();
    }
    function zoomAt(px: number, py: number, factor: number) {
      const ns = clamp(v.s * factor, MIN_ZOOM, MAX_ZOOM);
      v.tx = px - (px - v.tx) * ns / v.s;
      v.ty = py - (py - v.ty) * ns / v.s;
      v.s = ns;
      apply();
    }
    function stopFly() {
      if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    }
    function flyTo(ns: number, ntx: number, nty: number) {
      stopFly();
      const s0 = v.s, x0 = v.tx, y0 = v.ty, t0 = performance.now(), D = 380;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
        v.s = s0 + (ns - s0) * e; v.tx = x0 + (ntx - x0) * e; v.ty = y0 + (nty - y0) * e;
        apply();
        animRef.current = k < 1 ? requestAnimationFrame(step) : null;
      };
      animRef.current = requestAnimationFrame(step);
    }

    methods.current.refit = fit;

    /* chip tap: fly to the room's pin and pulse it */
    methods.current.locate = (label: string) => {
      const pin = store.pins.find(p => p.label === label);
      if (!pin) return false;
      const r = vp.getBoundingClientRect();
      const ns = clamp(Math.max(v.s, 2.6, v.fitS * 2.2), MIN_ZOOM, MAX_ZOOM);
      flyTo(ns, r.width / 2 - pin.x * ns, r.height / 2 - pin.y * ns);
      const el = world.querySelector(`a[data-id="${pin.id}"]`);
      if (el) {
        el.classList.remove("flash");
        void (el as HTMLElement).offsetWidth;
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 2200);
      }
      return true;
    };

    /* ----- edit mode: tap placement + confirm flow ----- */
    const closeRail = () => setChrome(c => ({ ...c, rail: null }));

    function fullRailEntries(onPick: (sn: string, r: Guess | undefined) => void, ranked: Guess[]): RailEntry[] {
      const byNum: Record<string, Guess> = {};
      for (const r of ranked) byNum[r[1]] = r;
      const entries: [string, string][] = ([["T", "T mark"], ["S", "S mark"]] as [string, string][])
        .concat(module.expected.slice().sort((a, b) => +a - +b).map(sn => [sn, sn] as [string, string]));
      return entries.map(([sn, txt]) => ({
        text: txt,
        cls: sn === "T" || sn === "S" ? "mkb" : undefined,
        onTap: () => { closeRail(); onPick(sn, byNum[sn]); },
      }));
    }

    /* rail for picking which room a new T/S marker belongs to */
    function markRailEntries(prefix: string, onPick: (lb: string) => void): RailEntry[] {
      const head: RailEntry = { text: prefix + " #", cls: "mkb", onTap: closeRail };
      return [head].concat(
        module.expected.slice().sort((a, b) => +a - +b).map(sn => ({
          text: prefix + sn,
          onTap: () => { closeRail(); onPick(prefix + sn); },
        })),
      );
    }

    function recognitionBanks() {
      if (module.glyphs) return [module.glyphs];
      return module.learned ? [module.learned, ...genericBanks()] : genericBanks();
    }

    function tapPlace(mx: number, my: number) {
      closeRail();

      /* shared confirm-flow pieces */
      let ranked: Guess[] = [];
      function confirmBar(sn: string, learnGuess?: Guess) {
        setChrome(c => ({
          ...c,
          bar: [
            {
              text: sn + " ✓",
              onTap: () => {
                closeRail();
                if (learnGuess && !module.glyphs && grayRef.current && onLearned) {
                  const learned = learnFromMatch(grayRef.current, W, H, learnGuess,
                    recognitionBanks(), module.learned ?? null);
                  if (learned && learned !== module.learned) onLearned(learned);
                }
              },
              cls: "pri",
            },
            { text: "123 ▾", onTap: openFullRail, keepOpen: true },
            { text: "cancel", onTap: () => { store.revert(curRef.current); curRef.current = null; closeRail(); }, cls: "del" },
          ],
          pad: { pinId: curRef.current!.id },
        }));
      }
      function commit(sn: string, x: number, y: number, learnGuess?: Guess) {
        store.revert(curRef.current); closeRail();
        curRef.current = store.setPin(sn, x, y, false);
        confirmBar(sn, learnGuess);
      }
      function commitMark(lb: string) {
        store.revert(curRef.current); closeRail();
        curRef.current = store.setPin(lb, mx, my, true);
        confirmBar(lb);
      }
      function showMarkRail(prefix: string) {
        setChrome(c => ({ ...c, rail: markRailEntries(prefix, commitMark) }));
      }
      function openFullRail() {
        setChrome(c => ({
          ...c,
          rail: fullRailEntries((sn, r) => {
            if (sn === "T" || sn === "S") { showMarkRail(sn); return; }
            store.revert(curRef.current);
            if (r && r[0] >= 0.5) {
              curRef.current = store.setPin(sn, r[2], r[3], false);
              confirmBar(sn, r);
            } else {
              curRef.current = store.setPin(sn, mx, my, false);
              confirmBar(sn);
            }
          }, ranked),
        }));
      }

      /* try recognition; a tainted canvas (remote image) falls back
         to picking the label from the rail */
      let gray: Float32Array | null = grayRef.current;
      if (!gray && img.complete && img.naturalWidth) {
        try { gray = grayRef.current = toGrayscale(img); } catch { gray = null; }
      }

      if (gray) {
        const placed = new Set(store.pins.filter(p => !p.mark).map(p => p.label));
        ranked = rankGuesses(recognitionBanks(), gray, W, H,
          Math.round(mx), Math.round(my), module.expected, placed);
        const top = ranked.slice(0, 3);
        curRef.current = store.setPin(top[0][1], top[0][2], top[0][3], false);
        const items: BarItem[] = [{
          text: top[0][1] + " ✓",
          onTap: () => {
            closeRail();
            if (!module.glyphs && grayRef.current && onLearned) {
              const learned = learnFromMatch(grayRef.current, W, H, top[0],
                recognitionBanks(), module.learned ?? null);
              if (learned && learned !== module.learned) onLearned(learned);
            }
          },
          cls: "pri",
        }];
        for (const t of top.slice(1))
          items.push({ text: t[1], onTap: () => commit(t[1], t[2], t[3], t), keepOpen: true });
        items.push({ text: "T", onTap: () => showMarkRail("T"), cls: "mkb", keepOpen: true });
        items.push({ text: "S", onTap: () => showMarkRail("S"), cls: "mkb", keepOpen: true });
        items.push({ text: "123 ▾", onTap: openFullRail, keepOpen: true });
        items.push({ text: "cancel", onTap: () => { store.revert(curRef.current); curRef.current = null; closeRail(); }, cls: "del" });
        setChrome(c => ({ ...c, bar: items, pad: { pinId: curRef.current!.id } }));
      } else {
        /* manual: pick the label first, pin lands on the tap point */
        setChrome(c => ({
          ...c,
          bar: null, pad: null,
          rail: fullRailEntries((sn, _r) => {
            if (sn === "T" || sn === "S") { showMarkRail(sn); return; }
            curRef.current = store.setPin(sn, mx, my, false);
            confirmBar(sn);
          }, []),
        }));
      }
    }

    /* ----- listeners, in the same order as always: viewer first,
       then editor (its pointerup runs on the capture phase) ----- */
    const prevent = (e: Event) => e.preventDefault();
    (["dragstart", "contextmenu", "selectstart"] as const).forEach(ev =>
      vp.addEventListener(ev, prevent, true));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); stopFly();
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });

    const onDblClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("a.pin")) return;
      stopFly();
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, 1.9);
    };
    vp.addEventListener("dblclick", onDblClick);

    const onViewDown = (e: PointerEvent) => {
      stopFly();
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
      tap = (ptrs.size === 1 && (e.target as Element).closest) ? (e.target as Element).closest("a.pin") : null;
      if (ptrs.size === 2) {
        const p = [...ptrs.values()];
        pinch0 = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), s: v.s };
        tap = null;
      }
      vp.setPointerCapture(e.pointerId);
    };
    vp.addEventListener("pointerdown", onViewDown);

    const onViewMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId)!;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        v.tx += e.clientX - prev[0]; v.ty += e.clientY - prev[1];
        moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
        apply();
      } else if (ptrs.size === 2 && pinch0) {
        const p = [...ptrs.values()];
        const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        const r = vp.getBoundingClientRect();
        const cx = (p[0][0] + p[1][0]) / 2 - r.left;
        const cy = (p[0][1] + p[1][1]) / 2 - r.top;
        const ns = clamp(pinch0.s * d / pinch0.d, MIN_ZOOM, MAX_ZOOM);
        v.tx = cx - (cx - v.tx) * ns / v.s;
        v.ty = cy - (cy - v.ty) * ns / v.s;
        v.s = ns; moved += 9; apply();
      }
    };
    vp.addEventListener("pointermove", onViewMove);

    const onViewUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId); pinch0 = null;
      if (e.type === "pointerup" && tap && moved <= 6 && !editingRef.current) {
        const h = tap.getAttribute("href");
        if (h) openArea(h);
      }
      tap = null;
    };
    vp.addEventListener("pointerup", onViewUp);
    vp.addEventListener("pointercancel", onViewUp);

    const onEditDown = (e: PointerEvent) => {
      if (!editingRef.current) return;
      edTap = ((e.target as Element).closest?.("a.pin") as HTMLElement) || null;
      if (edTap && e.pointerType !== "touch") {          // mouse: drag pins directly
        const id = Number(edTap.dataset.id);
        const pin = store.byId(id);
        if (!pin) return;
        drag = { id, el: edTap, ox: pin.x, oy: pin.y, px: e.clientX, py: e.clientY, moved: false };
        ptrs.delete(e.pointerId);                        // suppress panning
        document.body.classList.add("dragging");
      }
    };
    vp.addEventListener("pointerdown", onEditDown);

    const onEditMove = (e: PointerEvent) => {
      if (!drag) return;
      const nx = drag.ox + (e.clientX - drag.px) / v.s;
      const ny = drag.oy + (e.clientY - drag.py) / v.s;
      if (Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 2) drag.moved = true;
      drag.el.style.left = pct(clamp(nx, 0, W), W);
      drag.el.style.top = pct(clamp(ny, 0, H), H);
    };
    vp.addEventListener("pointermove", onEditMove);

    const onEditUp = (e: PointerEvent) => {
      if (!editingRef.current) return;
      document.body.classList.remove("dragging");
      if (drag) {
        const dg = drag; drag = null;
        if (dg.moved) {
          const nx = parseFloat(dg.el.style.left) / 100 * W;
          const ny = parseFloat(dg.el.style.top) / 100 * H;
          store.commitDrag(dg.id, dg.ox, dg.oy, nx, ny);
          edTap = null;
          ptrs.delete(e.pointerId); pinch0 = null;
          e.stopImmediatePropagation(); e.preventDefault();
          return;
        }
      }
      ptrs.delete(e.pointerId); pinch0 = null;
      e.stopImmediatePropagation(); e.preventDefault();
      if (moved > 6) { edTap = null; return; }           // was a pan, not a tap
      const t = edTap; edTap = null;
      const r = vp.getBoundingClientRect();
      const mx = (e.clientX - r.left - v.tx) / v.s;
      const my = (e.clientY - r.top - v.ty) / v.s;
      if (t) {                                           // pin tapped: delete / nudge
        const id = Number(t.dataset.id);
        const pin = store.byId(id);
        if (!pin) return;
        setChrome(c => ({
          ...c,
          bar: [
            { text: "delete " + pin.label, onTap: () => store.delPin(id), cls: "del" },
            { text: "done", onTap: () => {} },
          ],
          pad: { pinId: id },
        }));
        return;
      }
      tapPlace(mx, my);
    };
    vp.addEventListener("pointerup", onEditUp, true);

    fit();
    addEventListener("resize", fit);

    return () => {
      stopFly();
      (["dragstart", "contextmenu", "selectstart"] as const).forEach(ev =>
        vp.removeEventListener(ev, prevent, true));
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("dblclick", onDblClick);
      vp.removeEventListener("pointerdown", onViewDown);
      vp.removeEventListener("pointermove", onViewMove);
      vp.removeEventListener("pointerup", onViewUp);
      vp.removeEventListener("pointercancel", onViewUp);
      vp.removeEventListener("pointerdown", onEditDown);
      vp.removeEventListener("pointermove", onEditMove);
      vp.removeEventListener("pointerup", onEditUp, true);
      removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, module]);

  const zoomBy = (factor: number) => {
    const vp = vpRef.current!, world = worldRef.current!;
    const r = vp.getBoundingClientRect();
    const v = view.current;
    if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    const ns = clamp(v.s * factor, MIN_ZOOM, MAX_ZOOM);
    const px = r.width / 2, py = r.height / 2;
    v.tx = px - (px - v.tx) * ns / v.s;
    v.ty = py - (py - v.ty) * ns / v.s;
    v.s = ns;
    world.style.transform = `translate(${v.tx}px,${v.ty}px) scale(${v.s})`;
    world.style.setProperty("--pin-scale", String(1 / v.s));
  };

  const padPin = chrome.pad ? store.byId(chrome.pad.pinId) : null;

  return (
    <div className="map">
      <div className="viewport" ref={vpRef}>
        <div className="world" ref={worldRef}>
          <img ref={imgRef} src={imgSrc} width={map.width} height={map.height}
            alt={map.title + " map"} />
          {store.pins.map(p => (
            <a
              key={p.id}
              data-id={p.id}
              className={"pin" + (p.mark ? " mk" : "") + (p.user ? " user" : "")}
              href={editing ? undefined : hrefFor(p) || undefined}
              target="_blank"
              rel="noopener"
              title={pinTitle(module.names, p.label)}
              style={{ left: pct(p.x, map.width), top: pct(p.y, map.height) }}
              onClick={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>
      <div className="zoomctl">
        <button className="zin" aria-label="zoom in" onClick={() => zoomBy(1.45)}>+</button>
        <button className="zout" aria-label="zoom out" onClick={() => zoomBy(1 / 1.45)}>−</button>
        <button className="zfit" aria-label="fit map to screen" onClick={() => methods.current.refit()}>⛶</button>
      </div>
      {chrome.bar && <EditBar items={chrome.bar} onClose={() => setChrome(c => ({ ...c, bar: null, pad: null }))} />}
      {chrome.rail && <Rail entries={chrome.rail} />}
      {padPin && <NudgePad label={padPin.label} onNudge={(dx, dy) => store.nudge(padPin.id, dx, dy)} />}
    </div>
  );
});
