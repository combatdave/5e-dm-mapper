/* At-a-glance card for one area, shown on pin hover (mouse) or
 * long-press (touch): read-aloud opener, creatures, checks, treasure,
 * and what's nearby on the map — so the DM can scout what the party
 * might face soon without opening anything.
 */
import type { AreaDigest } from "./mhtml";

export function AreaCard({ num, name, digest, href, left, top, above, onOpenText, onOpenCreature, onClose }: {
  num: string;
  name?: string;
  digest?: AreaDigest;
  href?: string;
  left: number;
  top: number;
  above: boolean;
  onOpenText: () => void;
  onOpenCreature: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={"areacard" + (above ? " above" : "")}
      style={{ left, top }}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onPointerLeave={onClose}
    >
      <div className="ac-head">
        <b>{num}{name ? `. ${name}` : ""}</b>
        {href && <button className="ac-open" onClick={onOpenText}>open ↗</button>}
      </div>
      {digest?.readAloud && <p className="ac-read">{digest.readAloud}</p>}
      {digest?.creatures.length ? (
        <div className="ac-row">
          {digest.creatures.map(c => (
            <button key={c.href + c.name} className="ac-chip ac-creature"
              onClick={() => onOpenCreature(c.href)}>
              {c.count ? `${c.count}× ` : ""}{c.name}
            </button>
          ))}
        </div>
      ) : null}
      {digest?.dcs.length ? (
        <div className="ac-row">
          {digest.dcs.map(dc => <span key={dc} className="ac-chip ac-dc">{dc}</span>)}
        </div>
      ) : null}
      {digest?.traps && <p className="ac-hazard"><b>trap</b>{digest.traps.replace(/^traps?[.:]\s*/i, "")}</p>}
      {digest?.secrets && <p className="ac-hazard"><b>secret</b>{digest.secrets.replace(/^secret( doors?| passages?)?[.:]?\s*/i, "")}</p>}
      {!digest && <p className="ac-none">no saved text for this area{href ? " — tap the pin to open it" : ""}</p>}
    </div>
  );
}
