/* Floating edit-mode chrome, rendered into <body> via portals:
 * action bar (bottom), number rail (right), nudge d-pad (bottom left)
 * and the export panel. Pointer events are stopped at each panel so
 * taps never fall through to the map.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export interface BarItem {
  text: string;
  onTap: () => void;
  cls?: string;
  keepOpen?: boolean;
}

export function EditBar({ items, onClose }: { items: BarItem[]; onClose: () => void }) {
  return createPortal(
    <div className="edbar" onPointerDown={stop} onPointerUp={stop}>
      {items.map((it, i) => (
        <button
          key={i}
          className={it.cls || undefined}
          onPointerUp={e => { e.stopPropagation(); it.onTap(); if (!it.keepOpen) onClose(); }}
        >
          {it.text}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* tap placement: an autofocused input — type "12" for a room pin,
   "t" / "s" for a trap / secret-door marker linked to the nearest
   room pin (or "t7" to target room 7 explicitly), Enter to place */
export function PlaceInput({ onCommit, onCancel }: {
  onCommit: (text: string) => boolean;   // false = not a valid label
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => { ref.current?.focus(); }, []);
  const commit = () => {
    if (!onCommit(ref.current?.value ?? "")) { setBad(true); ref.current?.select(); }
  };
  return createPortal(
    <div className="edbar edtype" onPointerDown={stop} onPointerUp={stop}>
      <input
        ref={ref}
        className={bad ? "bad" : undefined}
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        placeholder="room # · t · s"
        aria-label="room number, or t / s for a marker"
        onChange={() => setBad(false)}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") onCancel();
        }}
      />
      <button className="pri" aria-label="place pin"
        onPointerUp={e => { e.stopPropagation(); commit(); }}>✓</button>
      <button className="del" aria-label="cancel"
        onPointerUp={e => { e.stopPropagation(); onCancel(); }}>✖</button>
    </div>,
    document.body,
  );
}

/* d-pad for pixel-nudging a pin (press and hold repeats) */
export function NudgePad({ label, onNudge }: { label: string; onNudge: (dx: number, dy: number) => void }) {
  const timer = useRef<number | null>(null);
  const stopRepeat = () => { if (timer.current !== null) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stopRepeat, []);
  useEffect(() => {
    document.body.classList.add("haspad");
    return () => document.body.classList.remove("haspad");
  }, []);

  const arrow = (txt: string, dx: number, dy: number) => (
    <button
      onPointerDown={e => { e.stopPropagation(); onNudge(dx, dy); stopRepeat(); timer.current = window.setInterval(() => onNudge(dx, dy), 130); }}
      onPointerUp={e => { e.stopPropagation(); stopRepeat(); }}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      {txt}
    </button>
  );

  return createPortal(
    <div className="edpad" onPointerDown={stop} onPointerUp={stop}>
      <div />{arrow("▲", 0, -1)}<div />
      {arrow("◀", -1, 0)}<div className="c">{label}</div>{arrow("▶", 1, 0)}
      <div />{arrow("▼", 0, 1)}<div />
    </div>,
    document.body,
  );
}

/* export panel: pin JSON with copy / share / download, each with
   fallbacks (tablet browsers are picky about all three) */
export function ExportPanel({ json, onClose }: { json: string; onClose: () => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const dlRef = useRef<HTMLButtonElement>(null);

  const flash = (b: HTMLButtonElement | null, t: string, back: string) => {
    if (!b) return;
    b.textContent = t;
    setTimeout(() => { b.textContent = back; }, 1400);
  };

  const copy = () => {
    const b = copyRef.current;
    const manual = () => {
      try {
        const ta = taRef.current!;
        ta.focus(); ta.select();
        if (document.execCommand && document.execCommand("copy")) { flash(b, "copied ✓", "copy"); return; }
      } catch { /* fall through */ }
      flash(b, "select text above", "copy");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(() => flash(b, "copied ✓", "copy"), manual);
        return;
      }
    } catch { /* fall through */ }
    manual();
  };

  const share = () => {
    try { navigator.share({ title: "user_pins.json", text: json }); } catch { /* user cancelled */ }
  };

  const download = () => {
    const b = dlRef.current;
    try {
      const bl = new Blob([json], { type: "application/json" });
      const u = URL.createObjectURL(bl);
      const a = document.createElement("a");
      a.href = u; a.download = "user_pins.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(u); } catch { /* gone */ } }, 2000);
      flash(b, "sent ✓", "download");
      return;
    } catch { /* fall through */ }
    try {
      const a = document.createElement("a");
      a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json);
      a.download = "user_pins.json";
      document.body.appendChild(a); a.click(); a.remove();
      flash(b, "sent ✓", "download");
    } catch {
      flash(b, "use copy instead", "download");
    }
  };

  return createPortal(
    <div className="edexp" onPointerDown={stop} onPointerUp={stop}>
      <div>your pins</div>
      <textarea ref={taRef} readOnly value={json}
        onPointerUp={() => { try { taRef.current?.select(); } catch { /* ok */ } }} />
      <div className="row">
        <button ref={copyRef} onClick={e => { e.stopPropagation(); copy(); }}>copy</button>
        {typeof navigator.share === "function" && (
          <button onClick={e => { e.stopPropagation(); share(); }}>share</button>
        )}
        <button ref={dlRef} onClick={e => { e.stopPropagation(); download(); }}>download</button>
        <button onClick={e => { e.stopPropagation(); onClose(); }}>close</button>
      </div>
    </div>,
    document.body,
  );
}
