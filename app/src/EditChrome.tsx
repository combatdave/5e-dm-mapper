/* Floating edit-mode chrome, rendered into <body> via portals:
 * action bar (bottom), typed placement input and nudge d-pad.
 * Pointer events are stopped at each panel so taps never fall
 * through to the map.
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

