/* Pin model + per-device persistence.
 *
 * Baked pins come from user_pins.json at build time. Pins the DM
 * places or moves in edit mode overlay them and are stored in
 * localStorage under the same key (and JSON shape) as earlier builds:
 * label → [[x, y], …] in image pixels. The same semantics as always:
 * a placement within 12px of an existing same-label pin moves that
 * pin; anything farther away creates a new one.
 */
import { clamp, isMarkLabel, storage } from "./helpers";

export interface Pin {
  id: number;
  label: string;
  x: number;
  y: number;
  mark: boolean;
  user: boolean;   // touched on this device (green in edit mode)
}

/** everything needed to undo one placement */
export interface PlaceResult {
  id: number;
  created: boolean;
  prev: [number, number] | null;
  wasUser: boolean;
  lbl: string;
  x: number;
  y: number;
}

type Pt = [number, number];

export class PinStore {
  pins: Pin[] = [];
  private userPins: Record<string, Pt[]> = {};
  private version = 0;
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(
    private key: string,
    base: Record<string, number[][]>,
    private imgW: number,
    private imgH: number,
  ) {
    for (const [label, pts] of Object.entries(base))
      for (const pt of pts)
        this.pins.push({
          id: this.nextId++, label, x: pt[0], y: pt[1],
          mark: isMarkLabel(label), user: false,
        });

    /* restore this device's saved pins */
    try {
      const stored: Record<string, unknown> = JSON.parse(storage.getItem(key) || "{}");
      for (const lbl of Object.keys(stored)) {
        let pts = stored[lbl] as number[] | number[][];
        if (Array.isArray(pts) && pts.length && typeof pts[0] === "number")
          pts = [pts as number[]];   // legacy single-point format
        if (!Array.isArray(pts)) continue;
        for (const pt of pts as number[][])
          if (Array.isArray(pt) && pt.length >= 2 && isFinite(pt[0]) && isFinite(pt[1]))
            this.setPin(lbl, pt[0], pt[1], isMarkLabel(lbl));
      }
    } catch (e) {
      console.warn("pin-load skipped:", e);
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getVersion = () => this.version;
  private emit() { this.version++; this.listeners.forEach(f => f()); }
  private save() { storage.setItem(this.key, JSON.stringify(this.userPins)); }

  byId(id: number): Pin | null { return this.pins.find(p => p.id === id) ?? null; }

  private rmEntry(lbl: string, x: number, y: number) {
    const a = this.userPins[lbl];
    if (!a) return;
    let bi = -1, bd = 1e9;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i][0] - x) + Math.abs(a[i][1] - y);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi >= 0 && bd <= 60) a.splice(bi, 1);
    if (!a.length) delete this.userPins[lbl];
    this.save();
  }

  /* place (or move) a pin; returns enough to undo it */
  setPin(lbl: string, mx: number, my: number, mark: boolean): PlaceResult {
    mx = clamp(mx, 0, this.imgW);
    my = clamp(my, 0, this.imgH);
    let el: Pin | null = null, ed = 1e9;
    for (const p of this.pins) if (p.label === lbl) {
      const d = Math.abs(p.x - mx) + Math.abs(p.y - my);
      if (d < ed) { ed = d; el = p; }
    }
    const created = !el || ed > 12;
    let prev: Pt | null = null, wasUser = false;
    if (created) {
      el = { id: this.nextId++, label: lbl, x: mx, y: my, mark, user: true };
      this.pins.push(el);
    } else {
      prev = [el!.x, el!.y];
      wasUser = el!.user;
      if (wasUser) this.rmEntry(lbl, prev[0], prev[1]);
      el!.x = mx; el!.y = my; el!.user = true;
    }
    (this.userPins[lbl] ||= []).push([Math.round(mx), Math.round(my)]);
    this.save();
    this.emit();
    return { id: el!.id, created, prev, wasUser, lbl, x: mx, y: my };
  }

  revert(r: PlaceResult | null) {
    if (!r) return;
    const pin = this.byId(r.id);
    if (!pin) return;
    this.rmEntry(r.lbl, pin.x, pin.y);
    if (r.created) {
      this.pins = this.pins.filter(p => p.id !== r.id);
    } else {
      pin.x = r.prev![0]; pin.y = r.prev![1];
      if (r.wasUser) (this.userPins[r.lbl] ||= []).push([Math.round(pin.x), Math.round(pin.y)]);
      else pin.user = false;
      this.save();
    }
    this.emit();
  }

  delPin(id: number) {
    const pin = this.byId(id);
    if (!pin) return;
    this.pins = this.pins.filter(p => p.id !== id);
    this.rmEntry(pin.label, pin.x, pin.y);
    this.emit();
  }

  nudge(id: number, dx: number, dy: number) {
    const pin = this.byId(id);
    if (!pin) return;
    const nx = clamp(pin.x + dx, 0, this.imgW);
    const ny = clamp(pin.y + dy, 0, this.imgH);
    if (pin.user) this.rmEntry(pin.label, pin.x, pin.y);
    pin.x = nx; pin.y = ny; pin.user = true;
    (this.userPins[pin.label] ||= []).push([Math.round(nx), Math.round(ny)]);
    this.save();
    this.emit();
  }

  /* end of a mouse drag: ox,oy is where the drag started */
  commitDrag(id: number, ox: number, oy: number, nx: number, ny: number) {
    const pin = this.byId(id);
    if (!pin) return;
    nx = clamp(nx, 0, this.imgW);
    ny = clamp(ny, 0, this.imgH);
    if (pin.user) this.rmEntry(pin.label, ox, oy);
    pin.x = nx; pin.y = ny; pin.user = true;
    (this.userPins[pin.label] ||= []).push([Math.round(nx), Math.round(ny)]);
    this.save();
    this.emit();
  }

  rawUserPins(): Record<string, Pt[]> { return this.userPins; }
  clearStored() { storage.removeItem(this.key); }
}
