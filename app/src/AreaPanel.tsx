/* The reader: one area's actual text from the saved page, shown
 * in-app so the DM never scrolls the full D&D Beyond page hunting
 * for a room. Styled like the book; every link inside opens on
 * D&D Beyond in the shared tab. Creature chips up top jump straight
 * to stat blocks.
 */
import type { AreaDigest } from "./mhtml";
import { creatureEmoji, openArea } from "./helpers";

export function AreaPanel({ num, name, digest, href, onClose }: {
  num: string;
  name?: string;
  digest: AreaDigest;
  href?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="areapanel"
      onClick={e => {
        const a = (e.target as Element).closest?.("a[href]");
        if (a) { e.preventDefault(); openArea(a.getAttribute("href")!); }
      }}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
    >
      <div className="ap-head">
        <b>{num}{name ? `. ${name}` : ""}</b>
        <div className="ap-actions">
          {href && (
            <button className="ac-open" onClick={() => openArea(href)}>D&D Beyond ↗</button>
          )}
          <button className="ap-close" aria-label="close" onClick={onClose}>✕</button>
        </div>
      </div>
      {digest.creatures.length > 0 && (
        <div className="ap-creatures">
          {digest.creatures.map(c => (
            <button key={c.href + c.name} className="ac-chip ac-creature"
              onClick={() => openArea(c.href)}>
              {creatureEmoji(c.name)} {c.count ? `${c.count}× ` : ""}{c.name}
            </button>
          ))}
        </div>
      )}
      <div className="ap-body" dangerouslySetInnerHTML={{ __html: digest.html || "" }} />
    </div>
  );
}
