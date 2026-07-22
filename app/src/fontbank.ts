/* Generic digit templates for maps we have no sampled glyphs for.
 *
 * Because the DM taps the number's location themselves, recognition is
 * only ever "which of 0-9 (in sequence) sits here" — so rendering the
 * digits in a few common font styles and sizes with canvas gives the
 * matcher a workable cold start on any map. Every confirmed placement
 * then samples the real pixels of that number into a per-module
 * "learned" bank (persisted with the module), so accuracy converges on
 * the map's actual font after a few confirmations.
 */
import type { GlyphData } from "./modules";
import type { Guess } from "./recognize";

const FONTS = [
  "bold %PXpx Georgia, 'Times New Roman', serif",
  "%PXpx Georgia, 'Times New Roman', serif",
  "bold %PXpx Arial, Helvetica, sans-serif",
  "%PXpx 'Times New Roman', serif",
];
const HEIGHTS = [11, 14, 18];

let cache: GlyphData[] | null = null;

export function genericBanks(): GlyphData[] {
  if (cache) return cache;
  const banks: GlyphData[] = [];
  for (const h of HEIGHTS) {
    const cw = Math.round(h * 0.72);
    const chh = Math.round(h * 1.2);
    const pitch = Math.round(h * 0.58);
    const cells: Record<string, number[][]> = {};
    for (let d = 0; d <= 9; d++) {
      const variants: number[][] = [];
      for (const spec of FONTS) {
        const c = document.createElement("canvas");
        c.width = cw; c.height = chh;
        const x = c.getContext("2d")!;
        x.fillStyle = "#fff";
        x.fillRect(0, 0, cw, chh);
        x.fillStyle = "#000";
        x.font = spec.replace("%PX", String(h));
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(String(d), cw / 2, chh / 2 + 0.5);
        const data = x.getImageData(0, 0, cw, chh).data;
        const cell: number[] = new Array(cw * chh);
        for (let i = 0, j = 0; i < cell.length; i++, j += 4)
          cell[i] = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
        variants.push(cell);
      }
      cells[String(d)] = variants;
    }
    banks.push({
      cells,
      p: { pitch, cw, chh, rx: 14, ry: 9, comp: 0.55, pen: 0.15 },
      combos: FONTS.length,
    });
  }
  cache = banks;
  return banks;
}

/* Sample the map's own pixels for a confirmed label: crop each digit
 * cell at the matched position and add it to the module's learned
 * bank. Only crops from the same scale as the bank the learned set
 * was started with (map lettering is consistent per map). */
export function learnFromMatch(
  gray: Float32Array, W: number, H: number,
  guess: Guess, banks: GlyphData[],
  learned: GlyphData | null,
): GlyphData | null {
  const [score, label, gx, gy, bankIdx] = guess;
  if (score < 0.5 || bankIdx == null || !/^\d+$/.test(label)) return learned;
  const src = banks[bankIdx];
  if (!src) return learned;
  const p = learned ? learned.p : { ...src.p };
  if (learned && (learned.p.cw !== src.p.cw || learned.p.chh !== src.p.chh)) return learned;

  const tw = p.pitch * (label.length - 1) + p.cw, th = p.chh;
  const x0 = Math.round(gx - tw / 2), y0 = Math.round(gy - th / 2);
  if (x0 < 0 || y0 < 0 || x0 + tw > W || y0 + th > H) return learned;

  const next: GlyphData = learned
    ? { cells: { ...learned.cells }, p, combos: learned.combos }
    : { cells: {}, p, combos: 1 };
  for (let i = 0; i < label.length; i++) {
    const cell: number[] = new Array(p.cw * th);
    for (let r = 0; r < th; r++)
      for (let q = 0; q < p.cw; q++)
        cell[r * p.cw + q] = Math.round(gray[(y0 + r) * W + x0 + i * p.pitch + q]);
    const prev = next.cells[label[i]] || [];
    next.cells[label[i]] = [cell, ...prev].slice(0, 3);   // keep the freshest 3 samples
  }
  next.combos = Math.max(...Object.values(next.cells).map(v => v.length));
  return next;
}
