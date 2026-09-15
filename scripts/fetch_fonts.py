"""
Vendor the four fonts into public/fonts/, so the app makes no third-party request.

    python scripts/fetch_fonts.py

Why
---
`.claude/skills/map-performance/SKILL.md` requires **zero third-party runtime
requests** for demo day: venue wifi is worse than you think, and a blocked or
slow fonts.gstatic.com is a first-paint dependency on somebody else's CDN. The
old `index.html` said "self-hosted as woff2 in public/fonts before the demo" and
never was.

Measured before: 5 requests to fonts.gstatic.com totalling ~395 KB, of which
**233 KB was Noto Nastaliq Urdu** — for one word.

The Urdu subset
---------------
Nastaliq is only ever used for the wordmark, چھاؤں, in three places (the rail, the
mobile header and the overture). Nothing else in the app sets `--font-urdu`: the
Urdu query examples render in the body face, and typed Urdu falls back to a system
face, which was already true.

So the Urdu face is requested from Google with `text=` and comes back subsetted to
those glyphs and the layout rules they need. Nastaliq is a joining script and its
contextual forms matter, so this is the one place where subsetting could visibly
break something. `scripts/features.mjs` measures the rendered wordmark in a real
browser and fails if it collapses or falls back to a system face.

**If you add any other Urdu text with `class="t-urdu"`, add it to URDU_TEXT and
re-run this.** Glyphs that are not in the subset will silently fall back to a
system face and look wrong next to the wordmark.

The Latin faces keep the `latin` and `latin-ext` subsets Google would have served
anyway, so no character that rendered before stops rendering.
"""

import os
import re
import sys
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
API = "https://fonts.googleapis.com/css2"
OUT = "public/fonts"

# Every string the app renders in Noto Nastaliq Urdu. See the module docstring.
URDU_TEXT = "چھاؤں"

# Subsets to keep for the Latin faces. Exactly what Google's own CSS would have
# offered the browser, so nothing that rendered before stops rendering.
KEEP = {"latin", "latin-ext"}

# (query, local basename, is_urdu)
REQUESTS = [
    # Variable on both axes: the design system uses Archivo Expanded via
    # font-stretch: 112%–125%, which needs the wdth axis present.
    ("family=Archivo:wdth,wght@62..125,400..700", "archivo", False),
    ("family=IBM+Plex+Sans:wght@400;500;600", "ibm-plex-sans", False),
    ("family=IBM+Plex+Mono:wght@400;500", "ibm-plex-mono", False),
]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def google_css(query: str) -> str:
    return get(f"{API}?{query}&display=swap").decode("utf-8")


def urdu_css() -> str:
    # Percent-encoded here rather than on a shell command line: passing the Urdu
    # literal through a Windows shell mangled it to "?" and Google cheerfully
    # returned a subset containing exactly one glyph, the question mark.
    q = urllib.parse.urlencode(
        {
            "family": "Noto Nastaliq Urdu:wght@400;600",
            "text": URDU_TEXT,
            "display": "swap",
        }
    )
    return get(f"{API}?{q}").decode("utf-8")


BLOCK = re.compile(
    r"(?:/\*\s*(?P<subset>[\w-]+)\s*\*/\s*)?@font-face\s*\{(?P<body>[^}]*)\}",
    re.S,
)


def field(body: str, name: str):
    m = re.search(rf"{name}:\s*([^;]+);", body)
    return m.group(1).strip() if m else None


def rewrite(css: str, basename: str, urdu: bool, seen: dict) -> list[str]:
    """
    Download each face and return local @font-face rules.

    `seen` maps a remote URL to the local filename already written for it. A
    subsetted request returns one @font-face per weight all pointing at the *same*
    variable file, so keying on the URL stores those bytes once and lets both
    rules reference it — otherwise the Urdu face landed twice under two names.
    """
    out = []
    for m in BLOCK.finditer(css):
        body = m.group("body")
        subset = m.group("subset") or ("subset" if urdu else "latin")
        if not urdu and subset not in KEEP:
            continue

        src = field(body, "src")
        url = re.search(r"url\(([^)]+)\)", src or "").group(1)
        weight = (field(body, "font-weight") or "400").replace(" ", "-")
        stretch = field(body, "font-stretch")
        urange = field(body, "unicode-range")

        if url in seen:
            local = seen[url]
        else:
            local = f"{basename}-{weight}-{subset}.woff2"
            data = get(url)
            with open(os.path.join(OUT, local), "wb") as f:
                f.write(data)
            print(f"  {local:46} {len(data) / 1024:7.1f} KB")
            seen[url] = local

        rule = [
            "@font-face {",
            f"  font-family: {field(body, 'font-family')};",
            f"  font-style: {field(body, 'font-style') or 'normal'};",
            f"  font-weight: {weight.replace('-', ' ')};",
        ]
        if stretch:
            rule.append(f"  font-stretch: {stretch};")
        # swap, so text is readable immediately and the wordmark simply restyles
        # when the face lands. Never `block` — that is a blank header on 3G.
        rule.append("  font-display: swap;")
        rule.append(f"  src: url('{local}') format('woff2');")
        if urange:
            rule.append(f"  unicode-range: {urange};")
        rule.append("}")
        out.append("\n".join(rule))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    header = "\n".join([
        "/* Generated by scripts/fetch_fonts.py — do not edit by hand.",
        " *",
        " * Self-hosted so the app makes zero third-party runtime requests, which",
        " * map-performance requires for demo day. Noto Nastaliq Urdu is subsetted",
        ' * to the wordmark only; if you add Urdu text with class="t-urdu", extend',
        " * URDU_TEXT in that script and re-run it. */",
    ])
    rules = [header]

    seen: dict = {}
    for query, basename, urdu in REQUESTS:
        print(f"{basename}:")
        rules += rewrite(google_css(query), basename, urdu, seen)

    print("noto-nastaliq-urdu (subsetted to the wordmark):")
    rules += rewrite(urdu_css(), "noto-nastaliq-urdu", True, seen)

    css_path = os.path.join(OUT, "fonts.css")
    with open(css_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(rules) + "\n")

    total = sum(
        os.path.getsize(os.path.join(OUT, n))
        for n in os.listdir(OUT)
        if n.endswith(".woff2")
    )
    print(f"\nwrote {css_path}")
    print(f"{len([n for n in os.listdir(OUT) if n.endswith('.woff2')])} files, "
          f"{total / 1024:.0f} KB total")
    if not URDU_TEXT:
        sys.exit("URDU_TEXT is empty — the wordmark would have no glyphs")


if __name__ == "__main__":
    main()
