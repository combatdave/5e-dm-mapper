/* Parse a page saved from the browser — either an MHTML archive
 * (Chrome/Edge "Save as → Webpage, Single File", .mhtml/.mht) or a
 * plain .html file — into the bits the mapper needs: the page title,
 * its original URL, every image (as a Blob when embedded, or a plain
 * URL when the save references it remotely), and the headings that
 * look like numbered areas ("12. Larder") so pins can deep-link back
 * to the right anchor.
 */

export interface PageImage {
  location: string;        // original URL / content-location (dedupe key)
  blob?: Blob;             // embedded image data
  url?: string;            // remote src (not embedded in the save)
  player?: boolean;        // a "View Player Version" link
}

export interface PageHeading {
  id: string;
  text: string;
}

/* at-a-glance digest of one numbered area, extracted from the text
   between its heading and the next */
export interface AreaDigest {
  readAloud?: string;                    // boxed text, trimmed
  creatures: { name: string; href: string; count?: number }[];
  dcs: string[];                         // "DC 15 Wisdom (Perception)"
  treasure?: string;
  text?: string;                         // plain text (cards + search)
  html?: string;                         // sanitized section markup (reader panel)
}

export interface ParsedPage {
  title: string;
  sourceUrl: string;       // "" when unknown
  images: PageImage[];
  headings: PageHeading[];
  areas: Record<string, AreaDigest>;     // area number -> digest
}

export async function parseSavedPage(file: File): Promise<ParsedPage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = latin1(bytes.subarray(0, 8192));
  if (/multipart\/related/i.test(head) && /boundary=/i.test(head)) {
    return parseMhtml(latin1(bytes));
  }
  return parseHtmlText(new TextDecoder().decode(bytes), "", file.name);
}

/* ---------- MHTML (multipart MIME) ---------------------------------- */

interface MimePart {
  type: string;
  location: string;
  body: Uint8Array;
}

function parseMhtml(raw: string): ParsedPage {
  const bm = raw.match(/boundary="?([^"\r\n]+)"?/i);
  if (!bm) throw new Error("No MIME boundary found — is this an .mhtml save?");
  const boundary = "--" + bm[1];
  const snapshotUrl = (raw.slice(0, 4096).match(/^Snapshot-Content-Location:\s*(\S+)/im) || [])[1] || "";

  const parts: MimePart[] = [];
  const chunks = raw.split(boundary).slice(1);      // drop preamble
  for (const chunk of chunks) {
    if (chunk.startsWith("--")) break;              // closing boundary
    const sep = chunk.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const header = chunk.slice(0, sep).replace(/\r\n[ \t]+/g, " ");  // unfold
    const body = chunk.slice(sep + 4);
    const h = (name: string) =>
      (header.match(new RegExp("^" + name + ":\\s*(.+)$", "im")) || [])[1]?.trim() ?? "";
    const type = h("Content-Type").split(";")[0].trim().toLowerCase();
    const encoding = h("Content-Transfer-Encoding").toLowerCase();
    const location = h("Content-Location");
    let bodyBytes: Uint8Array;
    if (encoding === "base64") bodyBytes = b64Bytes(body);
    else if (encoding === "quoted-printable") bodyBytes = qpBytes(body);
    else bodyBytes = latin1Bytes(body);
    parts.push({ type, location, body: bodyBytes });
  }

  const htmlPart = parts.find(p => p.type === "text/html");
  if (!htmlPart) throw new Error("No HTML document found in the archive.");
  const html = new TextDecoder().decode(htmlPart.body);
  /* the save may carry the scroll anchor of the moment it was made —
     drop it, pins/chips append their own area anchors */
  const sourceUrl = (snapshotUrl || htmlPart.location).split("#")[0];

  const byLocation = new Map<string, MimePart>();
  for (const p of parts) if (p.location) byLocation.set(p.location, p);

  const page = parseHtmlText(html, sourceUrl, "");
  const images: PageImage[] = [];
  const seen = new Set<string>();
  const push = (im: PageImage) => {
    if (seen.has(im.location)) return;
    seen.add(im.location);
    images.push(im);
  };
  /* referenced by <img> tags first (document order) … */
  for (const im of page.images) {
    const part = byLocation.get(im.location);
    if (part && part.type.startsWith("image/"))
      push({ location: im.location, blob: new Blob([part.body as BlobPart], { type: part.type }) });
    else push(im);
  }
  /* … then any other image parts in the archive (srcset, lightboxes) */
  for (const p of parts)
    if (p.type.startsWith("image/") && p.location)
      push({ location: p.location, blob: new Blob([p.body as BlobPart], { type: p.type }) });

  return { ...page, sourceUrl, images };
}

/* ---------- plain HTML ----------------------------------------------- */

function parseHtmlText(html: string, sourceUrl: string, fallbackTitle: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const canonical =
    doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href") ||
    doc.querySelector("base")?.getAttribute("href") || "";
  const url = (sourceUrl || canonical || "").split("#")[0];

  const images: PageImage[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll("img").forEach(img => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("cid:")) return;
    let loc = src;
    try { loc = url ? new URL(src, url).href : src; } catch { /* keep raw */ }
    if (seen.has(loc)) return;
    seen.add(loc);
    if (src.startsWith("data:")) {
      const blob = dataUrlToBlob(src);
      if (blob) images.push({ location: loc, blob });
    } else if (/^https?:/.test(loc)) {
      images.push({ location: loc, url: loc });
    }
  });
  /* links to images too — D&D Beyond's "View Player Version" maps are
     plain <a href> links, never loaded into the page */
  doc.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href") || "";
    if (!/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href)) return;
    let loc = href;
    try { loc = url ? new URL(href, url).href : href; } catch { /* keep raw */ }
    if (seen.has(loc) || !/^https?:/.test(loc)) return;
    seen.add(loc);
    const player = /player/i.test((a.textContent || "") + " " + loc);
    images.push({ location: loc, url: loc, player });
  });

  const headings: PageHeading[] = [];
  doc.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]").forEach(h => {
    const text = (h.textContent || "").trim().replace(/\s+/g, " ");
    if (text) headings.push({ id: h.id, text });
  });

  return {
    title: (doc.title || fallbackTitle || "Untitled module").trim(),
    sourceUrl: url,
    images,
    headings,
    areas: extractAreas(doc, url),
  };
}

/* ---------- area digests ---------------------------------------------- */

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

/* "12. Larder" headings bound each area's slice of the document */
function extractAreas(doc: Document, baseUrl: string): Record<string, AreaDigest> {
  const areas: Record<string, AreaDigest> = {};
  const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName) && el.id;
  const all = [...doc.body.querySelectorAll("*")];
  const headingIdx: { i: number; num: string | null }[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!isHeading(all[i])) continue;
    const m = (all[i].textContent || "").trim().match(/^(?:area\s+)?(\d{1,3})[.:)\-\u2013\u2014]?\s+.{2,}/i);
    headingIdx.push({ i, num: m ? String(+m[1]) : null });
  }
  for (let h = 0; h < headingIdx.length; h++) {
    const { i, num } = headingIdx[h];
    if (!num || areas[num]) continue;
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1].i : all.length;
    /* block elements strictly between the two headings, top-level only */
    const blocks: Element[] = [];
    for (let j = i + 1; j < end; j++) {
      const el = all[j];
      if (!/^(P|UL|OL|BLOCKQUOTE|TABLE|ASIDE|DIV|FIGURE)$/.test(el.tagName)) continue;
      if (blocks.some(b => b.contains(el))) continue;
      blocks.push(el);
    }
    const digest: AreaDigest = { creatures: [], dcs: [] };
    const textParts: string[] = [];
    for (const b of blocks) {
      const txt = (b.textContent || "").trim().replace(/\s+/g, " ");
      if (!txt) continue;
      const cls = (b.className || "").toString();
      if (!digest.readAloud && (b.tagName === "BLOCKQUOTE" || /read-?aloud/i.test(cls)))
        digest.readAloud = txt.slice(0, 400);
      else if (!digest.treasure && /^treasure\b/i.test(txt))
        digest.treasure = txt.slice(0, 300);
      else
        textParts.push(txt);
      /* creatures: monster links, with a count just before when present */
      b.querySelectorAll('a[href*="/monsters/"]').forEach(a => {
        const name = (a.textContent || "").trim();
        if (!name || name.length > 40) return;
        let href = a.getAttribute("href") || "";
        try { href = baseUrl ? new URL(href, baseUrl).href : href; } catch { /* raw */ }
        const before = (a.previousSibling?.textContent || "").trim().split(/\s+/).slice(-1)[0] || "";
        const count = /^\d+$/.test(before) ? +before : NUM_WORDS[before.toLowerCase()];
        const seen = digest.creatures.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (seen) { if (count && !(seen.count && seen.count >= count)) seen.count = count; }
        else if (digest.creatures.length < 8) digest.creatures.push({ name, href, count });
      });
    }
    const flat = textParts.join(" ");
    for (const m of flat.matchAll(/DC\s*\d+\s*(?:\([^)]{0,40}\)|[A-Z][a-z]+(?:\s*\([^)]{0,40}\))?)?/g)) {
      const dc = m[0].replace(/\s+/g, " ").trim();
      if (digest.dcs.length < 6 && !digest.dcs.includes(dc)) digest.dcs.push(dc);
    }
    digest.text = flat.slice(0, 2000) || undefined;
    digest.html = sanitizeArea(blocks, baseUrl) || undefined;
    if (digest.html || digest.readAloud || digest.creatures.length || digest.dcs.length || digest.treasure || digest.text)
      areas[num] = digest;
  }
  return areas;
}

/* ---------- section sanitizer ------------------------------------------
   Keeps the area's real markup for the in-app reader, stripped to a
   safe whitelist: structural + inline tags, hrefs absolutized so every
   link opens on D&D Beyond, classes kept for book-style CSS hooks,
   everything else (scripts, images, handlers, ids) dropped. */

const KEEP_TAGS = new Set([
  "P", "BLOCKQUOTE", "ASIDE", "DIV", "SECTION",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION",
  "H3", "H4", "H5", "H6", "B", "I", "EM", "STRONG", "U", "S", "SPAN", "A",
  "BR", "HR", "SUP", "SUB", "FIGCAPTION", "DL", "DT", "DD",
]);

function cleanAttrs(n: Element, baseUrl: string) {
  for (const a of [...n.attributes]) {
    if (a.name === "href" && n.tagName === "A") {
      let h = a.value;
      try { h = baseUrl ? new URL(h, baseUrl).href : h; } catch { /* raw */ }
      if (/^https?:/.test(h)) n.setAttribute("href", h);
      else n.removeAttribute("href");
    } else if (a.name === "class" ||
      ((n.tagName === "TD" || n.tagName === "TH") && (a.name === "colspan" || a.name === "rowspan"))) {
      /* keep */
    } else {
      n.removeAttribute(a.name);
    }
  }
}

function sanitizeArea(blocks: Element[], baseUrl: string): string {
  let out = "";
  for (const b of blocks) {
    if (out.length > 100_000) break;
    if (!KEEP_TAGS.has(b.tagName)) continue;
    const c = b.cloneNode(true) as Element;
    for (const n of [...c.querySelectorAll("*")]) {
      if (!KEEP_TAGS.has(n.tagName)) n.replaceWith(document.createTextNode(n.textContent || ""));
      else cleanAttrs(n, baseUrl);
    }
    cleanAttrs(c, baseUrl);
    if ((c.textContent || "").trim()) out += c.outerHTML;
  }
  return out;
}

/* ---------- decoding helpers ------------------------------------------ */

function latin1(bytes: Uint8Array): string {
  /* iso-8859-1 maps every byte to the same code point, so this string
     round-trips bytes exactly — and TextDecoder is native-fast, which
     matters on 10MB+ archives */
  return new TextDecoder("iso-8859-1").decode(bytes);
}

function latin1Bytes(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}

function b64Bytes(s: string): Uint8Array {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function qpBytes(s: string): Uint8Array {
  s = s.replace(/=\r?\n/g, "");
  const out = new Uint8Array(s.length);
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out[j++] = parseInt(s.slice(i + 1, i + 3), 16);
      i += 2;
    } else {
      out[j++] = s.charCodeAt(i) & 0xff;
    }
  }
  return out.subarray(0, j);
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const type = m[1] || "application/octet-stream";
  try {
    if (m[2]) return new Blob([b64Bytes(m[3]) as BlobPart], { type });
    return new Blob([decodeURIComponent(m[3])], { type });
  } catch {
    return null;
  }
}
