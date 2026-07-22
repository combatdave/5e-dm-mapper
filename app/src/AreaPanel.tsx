/* The reader: one area's actual text from the saved page, shown
 * in-app so the DM never scrolls the full D&D Beyond page hunting
 * for a room. Styled like the book; every link inside opens on
 * D&D Beyond in the shared tab. Creature chips up top jump straight
 * to stat blocks.
 */
import type { AreaDigest } from "./mhtml";
import { openArea, TEXT_TAB } from "./helpers";

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
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
    >
      <div className="ap-head">
        <b>{num}{name ? `. ${name}` : ""}</b>
        <div className="ap-actions">
          {href && (
            /* a real link — target names the shared tab, and the
               hosted preview's sandbox only lets real links out */
            <a className="ac-open" href={href} target={TEXT_TAB}>D&D Beyond ↗</a>
          )}
          <button className="ap-close" aria-label="close" onClick={onClose}>✕</button>
        </div>
      </div>
      {digest.creatures.length > 0 && (
        <div className="ap-creatures">
          {digest.creatures.map(c => (
            <button key={c.href + c.name} className="ac-chip ac-creature"
              onClick={() => openArea(c.href)}>
              {c.count ? `${c.count}× ` : ""}{c.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="ap-body"
        onClick={e => {
          const a = (e.target as Element).closest?.("a[href]");
          if (a) { e.preventDefault(); openArea(a.getAttribute("href")!); }
        }}
        dangerouslySetInnerHTML={{ __html: digest.html || "" }}
      />
    </div>
  );
}
