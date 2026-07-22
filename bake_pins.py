#!/usr/bin/env python3
"""Bake exported pin placements into a map launcher HTML file.

    python3 bake_pins.py user_pins.json sunless-citadel.html

Takes the JSON exported from the app's edit mode ("⤓ export pins") and
rewrites the baked-in <a class="pin"> elements in the HTML to match.
Every existing baked pin is replaced by the JSON's contents, so the
export should be the complete set you want, not a delta.

Labels are room numbers ("12") or markers ("T24", "S9" — trap / secret
door, linked to that room's text). Coordinates are image pixels, as
exported. Links, room names and image size are read from the HTML
itself, so this works unchanged for future maps.
"""
import html
import json
import re
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip())
    json_path, html_path = sys.argv[1], sys.argv[2]

    pins = json.load(open(json_path, encoding="utf-8"))
    doc = open(html_path, encoding="utf-8").read()

    # link/name tables and image size live in the file
    m = re.search(r"window\.MAPDATA=(\{.*?\});</script>", doc)
    if not m:
        sys.exit("no window.MAPDATA found in " + html_path)
    data = json.loads(m.group(1))
    hrefs, names, fallback = data["hrefs"], data.get("names", {}), data.get("src", "#")

    world = re.search(r'(<div class="world">)(<img [^>]*>)(.*?)(</div>)', doc, re.S)
    if not world:
        sys.exit("no map world found in " + html_path)
    img_tag = world.group(2)
    img_w = int(re.search(r'width="(\d+)"', img_tag).group(1))
    img_h = int(re.search(r'height="(\d+)"', img_tag).group(1))
    old_count = len(re.findall(r'<a class="pin', world.group(3)))

    def label_parts(label):
        mk = re.match(r"^([TS])(\d+)$", label)
        return (mk.group(1), mk.group(2)) if mk else ("", label)

    def title_for(label):
        mark, num = label_parts(label)
        name = names.get(num, "")
        base = f"{num}. {name}" if name else num
        if not mark:
            return base
        return ("Trap" if mark == "T" else "Secret door") + " — " + base

    def sort_key(item):
        mark, num = label_parts(item[0])
        return (mark != "", int(num) if num.isdigit() else 0, mark)

    out, skipped = [], []
    for label, points in sorted(pins.items(), key=sort_key):
        mark, num = label_parts(label)
        if not num.isdigit():
            skipped.append(label)
            continue
        href = hrefs.get(num, fallback)
        cls = "pin mk" if mark else "pin"
        title = html.escape(title_for(label), quote=True)
        for x, y in points:
            if not (0 <= x <= img_w and 0 <= y <= img_h):
                skipped.append(f"{label}@{x},{y}")
                continue
            out.append(
                f'<a class="{cls}" href="{href}" target="_blank" rel="noopener"'
                f' title="{title}" style="left:{x / img_w * 100:.2f}%;top:{y / img_h * 100:.2f}%">{label}</a>'
            )

    doc = doc[: world.start(3)] + "".join(out) + doc[world.end(3):]
    open(html_path, "w", encoding="utf-8").write(doc)

    rooms = {label_parts(l)[1] for l in pins if not label_parts(l)[0]}
    marks = sum(len(v) for l, v in pins.items() if label_parts(l)[0])
    print(f"{html_path}: {old_count} baked pins -> {len(out)} "
          f"({len(rooms)} rooms, {marks} marker points)")
    if skipped:
        print("skipped (bad label or out of bounds):", ", ".join(skipped))


if __name__ == "__main__":
    main()
