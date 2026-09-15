"""
Split committed region grids into a core file plus one file per NDVI year.

    python pipeline/split_years.py            all regions
    python pipeline/split_years.py model-town just one

Why this exists
---------------
`<region>.json` used to carry every year of NDVI. The app only ever draws one
year at a time, so on a first load that meant paying for eight years nobody had
asked for yet. Measured on DHA, the worst case:

    ndvi, all 9 years   105 KB gzip   73% of the payload
    population           19 KB
    surface temperature  12 KB
    land use + built      3 KB

So first paint was ~144 KB gzip to draw one 12 KB layer. On a 3G connection that
is the difference between a map that opens and a map that does not.

After the split the core file carries only the *latest* year inline — the one the
app defaults to and the one `riskFor()` needs for the risk band and the
"High risk" readout — and every earlier year becomes
`<region>-ndvi-<year>.json`, fetched when the scrubber first asks for it and
prefetched at idle so dragging stays smooth.

This script is stdlib-only on purpose: it re-shapes data that is already
committed, so it must run without rasterio, without network, and without
repeating an hour of COG reads. `run.py` writes the same layout directly, so a
full pipeline run and this script agree.

Idempotent: running it on already-split data is a no-op.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OUT, REGIONS  # noqa: E402


def year_path(region_id, year):
    """The filename the browser derives for a year. Keep in sync with load.ts."""
    return f"{OUT}/{region_id}-ndvi-{year}.json"


def write_year(region_id, year, grid, values):
    """One year of NDVI, with enough shape to detect a stale split."""
    with open(year_path(region_id, year), "w", encoding="utf-8") as f:
        json.dump(
            {
                "region": region_id,
                "year": int(year),
                "cols": grid["cols"],
                "rows": grid["rows"],
                "ndvi": values,
            },
            f,
            separators=(",", ":"),
            allow_nan=False,
        )


def split(region_id):
    path = f"{OUT}/{region_id}.json"
    if not os.path.exists(path):
        print(f"  {region_id}: no grid file, skipped")
        return

    with open(path, encoding="utf-8") as f:
        g = json.load(f)

    years = g["years"]
    latest = str(years[-1])
    inline = set(g["ndvi"])

    if inline == {latest}:
        print(f"  {region_id}: already split ({latest} inline, {len(years) - 1} on demand)")
        return

    before = os.path.getsize(path)
    moved = 0
    for y in years:
        key = str(y)
        if key == latest or key not in g["ndvi"]:
            continue
        write_year(region_id, key, g, g["ndvi"][key])
        moved += 1

    # The core keeps only the latest year. Years absent from `ndvi` are fetched
    # by convention from the per-year files, so no index field is needed — and
    # an old monolithic file still works untouched, because nothing is missing.
    g["ndvi"] = {latest: g["ndvi"][latest]}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(g, f, separators=(",", ":"), allow_nan=False)

    after = os.path.getsize(path)
    print(
        f"  {region_id}: core {before / 1024:.0f} KB -> {after / 1024:.0f} KB raw, "
        f"{moved} year files written"
    )


def main():
    targets = sys.argv[1:] or list(REGIONS)
    print("Splitting NDVI years out of the core grid files:")
    for rid in targets:
        split(rid)
    print("\nDone. The app fetches earlier years on demand and prefetches at idle.")


if __name__ == "__main__":
    main()
