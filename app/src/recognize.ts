/* Glyph recognition: guesses the room number printed under a tap.
 *
 * glyphs.json holds small grayscale crops of the digits 0-9 as printed
 * on this map (up to 3 samples each, p.cw × p.chh pixels). Multi-digit
 * templates are slid around the tap point and scored with normalized
 * cross-correlation. p: cw/chh glyph size, pitch = px between glyph
 * starts, rx/ry search radius, comp/pen = stray-digit check for
 * single-digit guesses sitting inside a two-digit number.
 */
import type { GlyphData } from "./modules";

/** [score, label, x, y, bankIndex] — bankIndex says which glyph bank won */
export type Guess = [number, string, number, number, number];

export function toGrayscale(im: HTMLImageElement): Float32Array {
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const x = c.getContext("2d")!;
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const g = new Float32Array(c.width * c.height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4)
    g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return g;
}

/* best |NCC| for tpl in a (2rx+1)×(2ry+1) window around cx,cy → [score,x,y] */
function matchAround(
  g: Float32Array, W: number, H: number,
  tpl: Float32Array, tw: number, th: number,
  cx: number, cy: number, rx: number, ry: number,
): [number, number, number] {
  let best = 0, bx = cx, by = cy;
  const n = tw * th;
  let tm = 0;
  for (let i = 0; i < n; i++) tm += tpl[i];
  tm /= n;
  let tv = 0;
  for (let i = 0; i < n; i++) { const d = tpl[i] - tm; tv += d * d; }
  if (tv < 1e-6) return [0, cx, cy];
  for (let oy = -ry; oy <= ry; oy++) for (let ox = -rx; ox <= rx; ox++) {
    const x0 = Math.round(cx + ox - tw / 2), y0 = Math.round(cy + oy - th / 2);
    if (x0 < 0 || y0 < 0 || x0 + tw > W || y0 + th > H) continue;
    let pm = 0;
    for (let r = 0; r < th; r++) { const b = (y0 + r) * W + x0; for (let q = 0; q < tw; q++) pm += g[b + q]; }
    pm /= n;
    let pv = 0, cc = 0;
    for (let r = 0; r < th; r++) {
      const b = (y0 + r) * W + x0, tb = r * tw;
      for (let q = 0; q < tw; q++) {
        const dp = g[b + q] - pm, dt = tpl[tb + q] - tm;
        pv += dp * dp; cc += dp * dt;
      }
    }
    if (pv < 1e-6) continue;
    const v = Math.abs(cc / Math.sqrt(pv * tv));
    if (v > best) { best = v; bx = cx + ox; by = cy + oy; }
  }
  return [best, bx, by];
}

/* build template variants for a (possibly multi-digit) label — every
   digit uses the same variant index (same font per rendering) */
function templatesFor(G: GlyphData, label: string): [Float32Array, number, number][] {
  const CELLS = G.cells, P = G.p;
  const maxCombos = G.combos ?? 2;
  const outs: [Float32Array, number, number][] = [];
  for (let combo = 0; combo < maxCombos; combo++) {
    let ok = true;
    const tw = P.pitch * (label.length - 1) + P.cw, th = P.chh;
    const t = new Float32Array(tw * th), w = new Float32Array(tw * th);
    for (let i = 0; i < label.length; i++) {
      const cs = CELLS[label[i]];
      if (!cs || !cs.length) { ok = false; break; }
      const c = cs[Math.min(combo, cs.length - 1)];
      for (let r = 0; r < th; r++) for (let q = 0; q < P.cw; q++) {
        const k = r * tw + i * P.pitch + q;
        t[k] += c[r * P.cw + q]; w[k] += 1;
      }
    }
    if (!ok) continue;
    for (let k = 0; k < t.length; k++) if (w[k] > 0) t[k] /= w[k];
    outs.push([t, tw, th]);
    if (combo === 0 && label.split("").every(ch => (CELLS[ch] || []).length < 2)) break;
  }
  return outs;
}

/* does another digit sit right next to bx,by?  (used to penalise a
   single-digit guess that is really half of a two-digit number) */
function strayDigitScore(G: GlyphData, g: Float32Array, W: number, H: number, bx: number, by: number): number {
  const CELLS = G.cells, P = G.p;
  let b = 0;
  for (const side of [-P.pitch, P.pitch]) for (const ch in CELLS) {
    const c = CELLS[ch][0];
    const t = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) t[i] = c[i];
    const r = matchAround(g, W, H, t, P.cw, P.chh, bx + side, by, 4, 2);
    if (r[0] > b) b = r[0];
  }
  return b;
}

/* score every candidate label around x,y across all banks → best first.
   Banks are alternate glyph sets: the built-in map has one sampled from
   the map itself; uploads get canvas-rendered generic fonts at a few
   sizes plus the module's learned samples. */
export function rankGuesses(
  banks: GlyphData[],
  g: Float32Array, W: number, H: number, x: number, y: number,
  cands: string[], placed: Set<string>,
): Guess[] {
  const scored: Guess[] = [];
  for (const label of cands) {
    let best = 0, bx = x, by = y, bBank = 0;
    for (let bi = 0; bi < banks.length; bi++) {
      const G = banks[bi], P = G.p;
      let bankBest = 0, bankX = x, bankY = y;
      for (const [t, tw, th] of templatesFor(G, label)) {
        const r = matchAround(g, W, H, t, tw, th, x, y, P.rx, P.ry);
        if (r[0] > bankBest) { bankBest = r[0]; bankX = r[1]; bankY = r[2]; }
      }
      if (label.length === 1 && bankBest > 0 && strayDigitScore(G, g, W, H, bankX, bankY) >= P.comp)
        bankBest -= P.pen;
      if (bankBest > best) { best = bankBest; bx = bankX; by = bankY; bBank = bi; }
    }
    if (!placed.has(label)) best += 0.06;   // prefer rooms that still lack a pin
    scored.push([best, label, bx, by, bBank]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored;
}
