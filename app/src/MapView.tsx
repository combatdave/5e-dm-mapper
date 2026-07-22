/* The map viewport: pan / pinch / zoom, tap-a-pin-to-open, chip
 * fly-to, and edit mode: tap an empty spot and a focused input opens —
 * type the room number (or t / s for a trap / secret-door marker,
 * which links itself to the nearest room pin) and press enter. Pins
 * can be nudged (d-pad), dragged (mouse) and deleted.
 *
 * Pan/zoom state lives in refs and is applied imperatively to the
 * world element (a CSS transform plus a --pin-scale variable that
 * counter-scales pins), so nothing re-renders at 60fps. React owns
 * the pin list and the floating edit chrome.
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
  useSyncExternalStore,
} from "react";
import type { MapDef, ModuleDef } from "./modules";
import { clamp, MAX_ZOOM, MIN_ZOOM, openArea, pinTitle } from "./helpers";
import { PinStore } from "./pins";
import type { Pin } from "./pins";
import { EditBar, NudgePad, PlaceInput } from "./EditChrome";
import type { BarItem } from "./EditChrome";
import { AreaCard } from "./AreaCard";

export interface MapHandle {
  locate(label: string): boolean;
  closeChrome(): void;
  refit(): void;
}

interface ChromeState {
  bar: BarItem[] | null;
  pad: { pinId: number } | null;
  place: { x: number; y: number } | null;   // typed-input placement point
}

const NO_CHROME: ChromeState = { bar: null, pad: null, place: null };

const pct = (v: number, total: number) => (v / total * 100).toFixed(2) + "%";

interface Props {
  module: ModuleDef;
  map: MapDef;
  imgSrc: string;
  store: PinStore;
  editing: boolean;
  /* open the in-app reader for an area; returns false when the area
     has no stored text (caller falls back to the D&D Beyond link) */
  onOpenArea?: (num: string) => boolean;
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { module, map, imgSrc, store, editing, onOpenArea }, ref,
) {
  const onOpenAreaRef = useRef(onOpenArea);
  onOpenAreaRef.current = onOpenArea;
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useSyncExternalStore(store.subscribe, store.getVersion);

  const [chrome, setChrome] = useState<ChromeState>(NO_CHROME);
  const [card, setCard] = useState<{ pinId: number; px: number; py: number } | null>(null);

  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
    setChrome(NO_CHROME);          // entering or leaving edit mode resets the chrome
    setCard(null);
  }, [editing]);

  /* ----- viewer state (refs: no re-render while panning) ----- */
  const view = useRef({ s: 1, tx: 0, ty: 0, fitS: 1 });
  const animRef = useRef<number | null>(null);
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
    const vp = vpRef.current!, world = worldRef.current!;
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

    /* ----- edit mode: tap an empty spot → typed placement ----- */
    function tapPlace(mx: number, my: number) {
      setChrome(c => ({ ...c, bar: null, pad: null, place: { x: mx, y: my } }));
    }

    /* ----- at-a-glance card: hover (mouse) / long-press (touch) ----- */
    let hoverTimer: number | null = null;
    let hideTimer: number | null = null;
    let lpTimer: number | null = null;
    let lpFired = false;

    function openCardFor(el: Element) {
      const id = Number((el as HTMLElement).dataset.id);
      const pin = store.byId(id);
      if (!pin) return;
      setCard({ pinId: id, px: pin.x * v.s + v.tx, py: pin.y * v.s + v.ty });
    }
    const clearHover = () => { if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; } };
    const clearLp = () => { if (lpTimer !== null) { clearTimeout(lpTimer); lpTimer = null; } };
    const hideCard = () => setCard(null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || editingRef.current) return;
      const pinEl = (e.target as Element).closest?.("a.pin");
      if (!pinEl) return;
      if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
      clearHover();
      hoverTimer = window.setTimeout(() => openCardFor(pinEl), 220);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!(e.target as Element).closest?.("a.pin")) return;
      clearHover();
      if (hideTimer !== null) clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hideCard, 250);   // grace to reach the card
    };
    vp.addEventListener("pointerover", onOver);
    vp.addEventListener("pointerout", onOut);

    /* ----- listeners, in the same order as always: viewer first,
       then editor (its pointerup runs on the capture phase) ----- */
    const prevent = (e: Event) => e.preventDefault();
    (["dragstart", "contextmenu", "selectstart"] as const).forEach(ev =>
      vp.addEventListener(ev, prevent, true));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); stopFly(); hideCard();
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
      hideCard(); clearHover();
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
      tap = (ptrs.size === 1 && (e.target as Element).closest) ? (e.target as Element).closest("a.pin") : null;
      clearLp();
      if (tap && e.pointerType === "touch" && !editingRef.current) {
        const el = tap;
        lpTimer = window.setTimeout(() => { lpFired = true; openCardFor(el); }, 480);
      }
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
      if (moved > 6) clearLp();
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
      clearLp();
      if (lpFired) { lpFired = false; tap = null; return; }   // long-press showed the card
      if (e.type === "pointerup" && tap && moved <= 6 && !editingRef.current) {
        const pin = store.byId(Number((tap as HTMLElement).dataset.id));
        const num = pin ? pin.label.replace(/^[TS]/, "") : "";
        if (!(num && onOpenAreaRef.current?.(num))) {
          const h = tap.getAttribute("href");
          if (h) openArea(h);
        }
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
      clearHover(); clearLp();
      if (hideTimer !== null) clearTimeout(hideTimer);
      vp.removeEventListener("pointerover", onOver);
      vp.removeEventListener("pointerout", onOut);
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

  /* "12" → room pin · "t"/"s" → marker linked to the nearest room pin
     (or "t7" for room 7 explicitly) */
  const placeTyped = (text: string, mx: number, my: number): boolean => {
    const t = text.trim().toLowerCase();
    let m = t.match(/^(\d{1,3})$/);
    if (m) {
      store.setPin(String(parseInt(m[1], 10)), mx, my, false);
      return true;
    }
    m = t.match(/^([ts])\s*(\d{1,3})?$/);
    if (m) {
      let num = m[2] ? String(parseInt(m[2], 10)) : "";
      if (!num) {
        let bd = Infinity;
        for (const p of store.pins) if (!p.mark) {
          const d = Math.abs(p.x - mx) + Math.abs(p.y - my);
          if (d < bd) { bd = d; num = p.label; }
        }
      }
      store.setPin(m[1].toUpperCase() + num, mx, my, true);
      return true;
    }
    return false;
  };

  const padPin = chrome.pad ? store.byId(chrome.pad.pinId) : null;

  /* at-a-glance card contents + placement (clamped inside the viewport) */
  const cardData = (() => {
    if (!card) return null;
    const pin = store.byId(card.pinId);
    if (!pin) return null;
    const num = pin.label.replace(/^[TS]/, "");
    const digest = module.areas?.[num];
    const markType = pin.mark && /^[TS]/.test(pin.label) ? (pin.label[0] as "T" | "S") : undefined;
    const vpEl = vpRef.current;
    const vw = vpEl?.clientWidth || 600, vh = vpEl?.clientHeight || 400;
    const left = clamp(card.px - 140, 8, Math.max(8, vw - 288));
    const above = card.py > vh * 0.45;
    const top = above ? clamp(card.py - 16, 100, vh - 10) : clamp(card.py + 18, 8, vh - 80);
    return { pin, num, digest, markType, left, top, above };
  })();

  return (
    <div className="map">
      <div className="viewport" ref={vpRef}>
        <div className="world" ref={worldRef}>
          {imgSrc
            ? <img ref={imgRef} src={imgSrc} width={map.width} height={map.height}
                alt={map.title + " map"} />
            : <div className="noimg" style={{ width: map.width, height: map.height }}>
                no map image — open ✎ edit and use “import from D&D Beyond”
              </div>}
          {store.pins.map(p => {
            const num = p.label.replace(/^[TS]/, "");
            const creatures = !p.mark ? module.areas?.[num]?.creatures : undefined;
            return (
            <a
              key={p.id}
              data-id={p.id}
              data-label={p.label}
              className={"pin" + (p.mark ? " mk" : "") + (p.user ? " user" : "")}
              href={editing ? undefined : hrefFor(p) || undefined}
              target="_blank"
              rel="noopener"
              title={pinTitle(module.names, p.label)}
              style={{ left: pct(p.x, map.width), top: pct(p.y, map.height) }}
              onClick={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
            >
              {p.mark ? p.label[0] : p.label}
              {creatures?.length ? <span className="pinbadge" aria-hidden="true" /> : null}
            </a>
            );
          })}
        </div>
      </div>
      {editing && !chrome.bar && !chrome.place && !chrome.pad && (
        <div className="edhint">tap the map to add a pin · tap a pin to move or delete</div>
      )}
      <div className="zoomctl">
        <button className="zin" aria-label="zoom in" onClick={() => zoomBy(1.45)}>+</button>
        <button className="zout" aria-label="zoom out" onClick={() => zoomBy(1 / 1.45)}>−</button>
        <button className="zfit" aria-label="fit map to screen" onClick={() => methods.current.refit()}>⛶</button>
      </div>
      {chrome.bar && <EditBar items={chrome.bar} onClose={() => setChrome(c => ({ ...c, bar: null, pad: null }))} />}
      {chrome.place && (
        <PlaceInput
          key={`${chrome.place.x},${chrome.place.y}`}
          onCommit={text => {
            const ok = placeTyped(text, chrome.place!.x, chrome.place!.y);
            if (ok) setChrome(NO_CHROME);
            return ok;
          }}
          onCancel={() => setChrome(NO_CHROME)}
        />
      )}
      {padPin && <NudgePad label={padPin.label} onNudge={(dx, dy) => store.nudge(padPin.id, dx, dy)} />}
      {cardData && (
        <AreaCard
          num={cardData.num}
          name={module.names[cardData.num]}
          digest={cardData.digest}
          href={hrefFor(cardData.pin) || undefined}
          mark={cardData.markType}
          left={cardData.left}
          top={cardData.top}
          above={cardData.above}
          onOpenCreature={h => openArea(h)}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
});
