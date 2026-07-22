/* Room finder: one input that covers search, browse and jump.
 * Focus it and every room drops down as a scannable vertical list;
 * type a number or part of a name to filter; Enter takes the first
 * match. Picking a room flies the map to its pin, or opens the
 * reader when it has no pin yet. Rows are real links, so
 * ctrl/cmd-click still opens the room on D&D Beyond.
 */
import { useRef, useState } from "react";

export function RoomFinder({ rooms, names, hrefs, sourceUrl, pinned, onPick }: {
  rooms: string[];
  names: Record<string, string>;
  hrefs: Record<string, string>;
  sourceUrl?: string;
  pinned: Set<string>;
  onPick: (e: React.MouseEvent | null, num: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = q.trim().toLowerCase();
  const hits = rooms.filter(n =>
    !query ||
    (/^\d+$/.test(query) ? n.startsWith(query) : (names[n] || "").toLowerCase().includes(query)));

  const pick = (e: React.MouseEvent | null, num: string) => {
    onPick(e, num);
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0))
      return;   // modifier click: the link itself navigates, keep the list
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="finder">
      <input
        ref={inputRef}
        value={q}
        placeholder="find a room…"
        aria-label="find a room"
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Enter" && hits.length) pick(null, hits[0]);
          else if (e.key === "Escape") { setQ(""); setOpen(false); inputRef.current?.blur(); }
        }}
      />
      {open && (
        /* preventDefault keeps focus on the input so a row click
           lands before any blur */
        <div className="flist" onMouseDown={e => e.preventDefault()}>
          {hits.map(num => (
            <a key={num}
              href={hrefs[num] || sourceUrl || undefined}
              target="_blank" rel="noopener"
              data-pin={num}
              className={pinned.has(num) ? undefined : "nopin"}
              onClick={e => pick(e, num)}>
              <b>{num}</b><span>{names[num] || ""}</span>
            </a>
          ))}
          {!hits.length && <div className="fempty">no rooms match</div>}
        </div>
      )}
    </div>
  );
}
