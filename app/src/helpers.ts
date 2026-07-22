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
export function openArea(href: string): void {
  const w = window.open(href, "sunless-citadel-text");
  if (w) { try { w.focus(); } catch { /* cross-origin */ } }
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

/* a friendly icon per creature type — badge on pins, chips in the reader */
const CREATURE_EMOJI: [RegExp, string][] = [
  [/rat/i, "🐀"], [/kobold|lizard/i, "🦎"], [/goblin|hobgoblin|bugbear/i, "👺"],
  [/skeleton/i, "💀"], [/zombie|ghoul|ghast|wight/i, "🧟"], [/snake|serpent/i, "🐍"],
  [/spider/i, "🕷️"], [/wolf/i, "🐺"], [/dragon|drake|wyrm/i, "🐉"],
  [/blight|twig|vine|shrub|plant|treant/i, "🌿"], [/bat/i, "🦇"], [/bear/i, "🐻"],
  [/boar/i, "🐗"], [/frog|toad/i, "🐸"], [/bandit|thug|assassin/i, "🗡️"],
  [/cultist|acolyte|priest|mage|druid/i, "🧙"], [/mephit|elemental|fire/i, "🔥"],
  [/giant|ogre|troll/i, "🗿"], [/ooze|jelly|pudding|cube/i, "🟢"],
  [/hyena|jackal|dog|mastiff/i, "🐕"], [/stirge|hawk|eagle|owl|raven/i, "🦅"],
];
export function creatureEmoji(name?: string): string {
  if (name) for (const [re, e] of CREATURE_EMOJI) if (re.test(name)) return e;
  return "☠️";
}
