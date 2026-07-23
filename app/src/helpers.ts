declare global {
  interface Window {
    /* present when hosted as a claude.ai artifact with the downloads
       capability granted; absent everywhere else */
    claude?: {
      downloads?: { save(req: { filename: string; data: string | Blob }): Promise<{ status: "saved" }> };
    };
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 12;

/* marker labels look like "T24" / "S9" (trap / secret door for that room) */
export const isMarkLabel = (lbl: string) => /^[TS]\d/.test(lbl);

/* localStorage, or an in-memory stand-in when it's blocked */
export const storage = (() => {
  try {
    const t = window.localStorage;
    t.getItem("");
    return t;
  } catch {
    const m: Record<string, string> = {};
    return {
      getItem: (k: string) => (k in m ? m[k] : null),
      setItem: (k: string, v: string) => { m[k] = String(v); },
      removeItem: (k: string) => { delete m[k]; },
    };
  }
})();

/* every area link opens in ONE shared tab (they all point at the
   same D&D Beyond page, just different anchors) so a session
   doesn't end in forty duplicate tabs */
export const TEXT_TAB = "dungeon-atlas-text";

export function openArea(href: string): void {
  let w: Window | null = null;
  try { w = window.open(href, TEXT_TAB); } catch { /* sandboxed iframe */ }
  if (w) { try { w.focus(); } catch { /* cross-origin */ } return; }
  /* window.open is blocked in sandboxed iframes (the hosted preview):
     a real anchor click still navigates — the host intercepts it */
  const a = document.createElement("a");
  a.href = href; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

/* save a generated file. Sandboxed iframes block <a download>, so the
   hosted preview goes through its downloads API (viewer-confirmed)
   when granted; everywhere else a plain blob download. Returns false
   when no download path exists — the caller should fall back to
   showing the text for copying. */
export async function saveFile(filename: string, text: string): Promise<boolean> {
  const dl = window.claude?.downloads;
  if (dl) {
    try { await dl.save({ filename, data: text }); return true; }
    catch (e) {
      const code = (e as { code?: string } | null)?.code;
      /* the viewer said no (or a prompt is already open): their call */
      return code === "declined" || code === "rate_limited";
    }
  }
  if (window.claude) return false;   // hosted preview without a download grant
  const a = document.createElement("a");
  const blob = new Blob([text], { type: "application/json" });
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

/* room label → hover title, e.g. "10. Honor Guard" / "Trap — 24. …" */
export function pinTitle(names: Record<string, string>, lbl: string): string {
  const mark = /^[TS]/.test(lbl) ? lbl[0] : "";
  const num = mark ? lbl.slice(1) : lbl;
  const name = names[num] || "";
  const base = name ? num + ". " + name : num;
  if (!mark) return base;
  return (mark === "T" ? "Trap" : "Secret door") + (num ? " — " + base : "");
}
