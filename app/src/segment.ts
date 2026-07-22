/* Segment-then-classify digit recognition for uploaded maps.
 *
 * Sliding rendered-font templates over textured parchment barely beats
 * noise, so uploads use the standard OCR shape instead: find the
 * digit-shaped ink blobs around the tap (either polarity — numbers are
 * printed dark-on-light or light-on-dark), cut each one out, resample
 * it to a canonical grid, and NCC-classify it against digit templates
 * rendered at the same canonical size. Normalization removes the font
 * scale problem entirely; segmentation removes the spurious-texture
 * problem. Confirmed placements store their normalized crops as
 * per-module learned templates, so accuracy converges on the map's
 * real font.
 */

/* canonical glyph grid */
export const GW = 12, GH = 16;

export type LearnedDigits = Record<string, number[][]>;   // digit -> [GW*GH crops]

export interface SegGuess {
  score: number;
  label: string;
  x: number;          // image coords of the glyph-group centre
  y: number;
  crops: Float32Array[];   // the canonical glyphs this label was scored on
}

export interface Segmentation {
  boxes: { x0: number; y0: number; x1: number; y1: number }[];  // image coords, left→right
  crops: Float32Array[];   // canonical GW×GH, ink dark, one per box
  cx: number; cy: number;  // group centre
}

const FONTS = [
  "bold 40px Georgia, 'Times New Roman', serif",
  "40px Georgia, 'Times New Roman', serif",
  "bold 40px Arial, Helvetica, sans-serif",
  "40px 'Times New Roman', serif",
];

/* ---------- canonical digit templates --------------------------------- */

let fontTemplates: Record<string, Float32Array[]> | null = null;

function renderDigitCanonical(d: string, font: string): Float32Array | null {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#000"; x.font = font;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(d, 32, 33);
  const data = x.getImageData(0, 0, 64, 64).data;
  const g = new Float32Array(64 * 64);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = data[j];
  /* tight-crop the ink */
  let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
  for (let yy = 0; yy < 64; yy++) for (let xx = 0; xx < 64; xx++)
    if (g[yy * 64 + xx] < 128) {
      if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
      if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
    }
  if (x1 < 0) return null;
  return resampleAspect(g, 64, x0, y0, x1 + 1, y1 + 1, false);
}

export function digitTemplates(): Record<string, Float32Array[]> {
  if (!fontTemplates) {
    fontTemplates = {};
    for (let d = 0; d <= 9; d++) {
      const t: Float32Array[] = [];
      for (const f of FONTS) {
        const r = renderDigitCanonical(String(d), f);
        if (r) t.push(r);
      }
      fontTemplates[String(d)] = t;
    }
  }
  return fontTemplates;
}

/* aspect-preserving normalization: scale the region by height into the
   GW×GH grid and center it horizontally on background. Stretch-to-fit
   would erase the width cue that separates a "1" from everything else. */
function resampleAspect(
  g: Float32Array, W: number,
  x0: number, y0: number, x1: number, y1: number,
  invert: boolean,
): Float32Array {
  const rw = x1 - x0, rh = y1 - y0;
  const tw = Math.max(2, Math.min(GW, Math.round(rw * GH / rh)));
  const tight = resampleGrid(g, W, x0, y0, x1, y1, invert, tw, GH);
  if (tw === GW) return tight;
  const out = new Float32Array(GW * GH).fill(255);
  const off = Math.floor((GW - tw) / 2);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < tw; x++)
      out[y * GW + off + x] = tight[y * tw + x];
  return out;
}

/* bilinear-resample a region of a W-wide grayscale into tw×th; invert
   makes light ink read as dark so templates only need one polarity */
function resampleGrid(
  g: Float32Array, W: number,
  x0: number, y0: number, x1: number, y1: number,
  invert: boolean, tw: number, th: number,
): Float32Array {
  const out = new Float32Array(tw * th);
  const rows = Math.floor(g.length / W);
  const rw = x1 - x0, rh = y1 - y0;
  for (let oy = 0; oy < th; oy++) {
    for (let ox = 0; ox < tw; ox++) {
      const sx = x0 + (ox + 0.5) / tw * rw - 0.5;
      const sy = y0 + (oy + 0.5) / th * rh - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      const fx = sx - ix, fy = sy - iy;
      const p = (xx: number, yy: number) =>
        g[Math.min(rows - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
      const v = p(ix, iy) * (1 - fx) * (1 - fy) + p(ix + 1, iy) * fx * (1 - fy) +
                p(ix, iy + 1) * (1 - fx) * fy + p(ix + 1, iy + 1) * fx * fy;
      out[oy * tw + ox] = invert ? 255 - v : v;
    }
  }
  return out;
}

/* zero-mean, unit-variance NCC between two canonical crops */
function ncc(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let va = 0, vb = 0, cc = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    va += da * da; vb += db * db; cc += da * db;
  }
  if (va < 1e-6 || vb < 1e-6) return 0;
  return cc / Math.sqrt(va * vb);
}

/* ---------- segmentation ---------------------------------------------- */

const WIN_RX = 26, WIN_RY = 16;

interface Comp { x0: number; y0: number; x1: number; y1: number; area: number }

function components(mask: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(mask.length);
  const out: Comp[] = [];
  const qx = new Int32Array(mask.length), qy = new Int32Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i] || seen[i]) continue;
    let head = 0, tail = 0;
    qx[tail] = x; qy[tail++] = y; seen[i] = 1;
    let x0 = x, x1 = x, y0 = y, y1 = y, area = 0;
    while (head < tail) {
      const cx = qx[head], cy = qy[head++];
      area++;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] && !seen[ni]) { seen[ni] = 1; qx[tail] = nx; qy[tail++] = ny; }
      }
    }
    out.push({ x0, y0, x1, y1, area });
  }
  return out;
}

/* union components whose boxes sit essentially inside another
   (outlined text splits into outline + body blobs on the same spot) */
function mergeOverlapping(comps: Comp[]): Comp[] {
  const sorted = comps.slice().sort((a, b) =>
    (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1));
  const out: Comp[] = [];
  for (const c of sorted) {
    const w = c.x1 - c.x0 + 1;
    const host = out.find(o =>
      Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) + 1 >= 0.8 * w &&
      c.y0 >= o.y0 - 1 && c.y1 <= o.y1 + 1);
    if (host) {
      host.x0 = Math.min(host.x0, c.x0); host.x1 = Math.max(host.x1, c.x1);
      host.y0 = Math.min(host.y0, c.y0); host.y1 = Math.max(host.y1, c.y1);
      host.area += c.area;
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/* a box holding two touching digits is roughly square-or-wider —
   split it at the column with the least ink */
function splitWide(comps: Comp[], mask: Uint8Array, w: number): Comp[] {
  const out: Comp[] = [];
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (bw < Math.max(7, bh * 1.15)) { out.push(c); continue; }
    let bestX = -1, bestInk = 1e9;
    const from = c.x0 + Math.round(bw * 0.3), to = c.x0 + Math.round(bw * 0.7);
    for (let x = from; x <= to; x++) {
      let ink = 0;
      for (let y = c.y0; y <= c.y1; y++) ink += mask[y * w + x];
      if (ink < bestInk) { bestInk = ink; bestX = x; }
    }
    if (bestX < 0 || bestInk > bh * 0.35) { out.push(c); continue; }
    out.push({ x0: c.x0, x1: bestX - 1, y0: c.y0, y1: c.y1, area: Math.round(c.area / 2) });
    out.push({ x0: bestX + 1, x1: c.x1, y0: c.y0, y1: c.y1, area: Math.round(c.area / 2) });
  }
  return out;
}

function glyphLine(comps: Comp[], tapX: number, tapY: number): Comp[] {
  const digitish = comps.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    return h >= 4 && h <= 22 && w >= 2 && w <= 20 && c.area >= 5;
  });
  if (!digitish.length) return [];
  /* seed: digit-ish blob nearest the tap */
  let seed = digitish[0], sd = 1e9;
  for (const c of digitish) {
    const d = Math.abs((c.x0 + c.x1) / 2 - tapX) + Math.abs((c.y0 + c.y1) / 2 - tapY);
    if (d < sd) { sd = d; seed = c; }
  }
  if (sd > 24) return [];
  const seedH = seed.y1 - seed.y0 + 1;
  const seedCy = (seed.y0 + seed.y1) / 2;
  /* same text line: similar vertical centre and height, digit-shaped */
  const line = digitish.filter(c => {
    const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
    return Math.abs((c.y0 + c.y1) / 2 - seedCy) <= seedH * 0.6 &&
           h >= seedH * 0.55 && h <= seedH * 1.8 && h >= w * 0.55;
  }).sort((a, b) => a.x0 - b.x0);
  /* walk outward from the seed, allowing only small gaps */
  const si = line.indexOf(seed);
  const keep = [seed];
  const maxGap = Math.max(3, seedH * 0.75);
  for (let i = si - 1; i >= 0; i--) {
    if (keep[0].x0 - line[i].x1 <= maxGap) keep.unshift(line[i]); else break;
  }
  for (let i = si + 1; i < line.length; i++) {
    if (line[i].x0 - keep[keep.length - 1].x1 <= maxGap) keep.push(line[i]); else break;
  }
  return keep.slice(0, 3);
}

/* both polarities are segmented and returned — classification decides
   which one held the real number */
export function segmentations(raw: Float32Array, W: number, H: number, cx: number, cy: number): Segmentation[] {
  const x0 = Math.max(1, Math.round(cx) - WIN_RX), x1 = Math.min(W - 1, Math.round(cx) + WIN_RX);
  const y0 = Math.max(1, Math.round(cy) - WIN_RY), y1 = Math.min(H - 1, Math.round(cy) + WIN_RY);
  const w = x1 - x0, h = y1 - y0;
  if (w < 8 || h < 8) return [];
  /* percentile thresholds are robust to windows whose contrast is
     dominated by a nearby shadow or highlight */
  const sample = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sample[y * w + x] = raw[(y0 + y) * W + x0 + x];
  const sorted = Float32Array.from(sample).sort();
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.round(p * sorted.length))];
  const darkT = pct(0.12), lightT = pct(0.88);

  const tapX = Math.round(cx) - x0, tapY = Math.round(cy) - y0;
  const out: Segmentation[] = [];
  for (const invert of [false, true]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < sample.length; i++)
      mask[i] = (invert ? sample[i] > lightT : sample[i] < darkT) ? 1 : 0;
    const comps = splitWide(mergeOverlapping(components(mask, w, h)), mask, w);
    const line = glyphLine(comps, tapX, tapY);
    if (!line.length) continue;
    /* crops come from the ink mask — shape without texture, and an
       outlined glyph loses its halo ring */
    const boxes = line.map(c => ({ x0: c.x0 + x0, y0: c.y0 + y0, x1: c.x1 + x0 + 1, y1: c.y1 + y0 + 1 }));
    const maskF = new Float32Array(w * h);
    for (let i = 0; i < mask.length; i++) maskF[i] = mask[i] ? 0 : 255;
    const crops = line.map(c =>
      resampleAspect(maskF, w, c.x0, c.y0, c.x1 + 1, c.y1 + 1, false));
    const gx = (boxes[0].x0 + boxes[boxes.length - 1].x1) / 2;
    const gy = boxes.reduce((s, b) => s + (b.y0 + b.y1) / 2, 0) / boxes.length;
    out.push({ boxes, crops, cx: gx, cy: gy });
  }
  return out;
}

/* ---------- classification -------------------------------------------- */

function digitScore(crop: Float32Array, d: string, learned: LearnedDigits | null): number {
  let best = 0;
  for (const t of digitTemplates()[d]) { const v = ncc(crop, t); if (v > best) best = v; }
  const ld = learned?.[d];
  if (ld) for (const cell of ld) {
    const t = Float32Array.from(cell);
    const v = ncc(crop, t);
    if (v > best) best = v;
  }
  return best;
}

/* rank the module's candidate labels against the segmented glyphs.
   A stray blob sometimes joins the line (map flourish, a smudge), so
   every contiguous subrange of the glyph row is tried and the best
   score per label wins. */
export function rankBySegmentation(
  segs: Segmentation[], cands: string[], placed: Set<string>,
  learned: LearnedDigits | null,
): SegGuess[] {
  const bestByLabel = new Map<string, SegGuess>();
  for (const seg of segs) {
    const n = seg.crops.length;
    const perDigit: Record<string, number>[] = seg.crops.map(() => ({}));
    const digit = (i: number, d: string): number => {
      if (perDigit[i][d] === undefined) perDigit[i][d] = digitScore(seg.crops[i], d, learned);
      return perDigit[i][d];
    };
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
      const len = b - a + 1;
      const crops = seg.crops.slice(a, b + 1);
      const bx0 = seg.boxes[a].x0, bx1 = seg.boxes[b].x1;
      const x = (bx0 + bx1) / 2;
      const y = seg.boxes.slice(a, b + 1).reduce((s, bb) => s + (bb.y0 + bb.y1) / 2, 0) / len;
      /* trimming real glyphs must not beat the full row: subranges pay
         a penalty per dropped glyph */
      const trimPenalty = 0.12 * (n - len);
      for (const label of cands) {
        if (label.length !== len) continue;
        let s = 0;
        for (let i = 0; i < len; i++) s += digit(a + i, label[i]);
        s = s / len - trimPenalty + (placed.has(label) ? 0 : 0.03);
        const prev = bestByLabel.get(label);
        if (!prev || s > prev.score) bestByLabel.set(label, { score: s, label, x, y, crops });
      }
    }
  }
  const out = [...bestByLabel.values()];
  out.sort((a, b) => b.score - a.score);
  return out;
}

/* confirmed placement → remember these exact glyph crops */
export function learnDigits(guess: SegGuess, learned: LearnedDigits | null): LearnedDigits | null {
  if (guess.label.length !== guess.crops.length || !/^\d+$/.test(guess.label)) return learned;
  const next: LearnedDigits = { ...(learned || {}) };
  for (let i = 0; i < guess.label.length; i++) {
    const crop = Array.from(guess.crops[i], v => Math.round(v));
    next[guess.label[i]] = [crop, ...(next[guess.label[i]] || [])].slice(0, 4);
  }
  return next;
}
