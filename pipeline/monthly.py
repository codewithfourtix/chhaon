"""
Monthly NDVI composites for the recent window.

    python pipeline/monthly.py                  all regions
    python pipeline/monthly.py model-town       just one
    python pipeline/monthly.py --jobs 8         more concurrency

Why a third cadence
-------------------
The yearly layers answer "is 2025 different from 2017", and they are locked to one
spring window so that question means something. They cannot answer "what has the
canopy been doing lately": one reading a year is the coarsest possible sampling of
a signal that moves every month.

So the product carries two cadences, each where it makes sense:

    2017-2024   yearly, season-locked      for comparing one year with another
    2024-2026   monthly composites         for knowing what is happening now

They are never averaged together or drawn as one line. A spring-locked annual
reading and a September monthly reading are not points on the same series — the
whole reason the annual window exists is that they are not.

Monthly, not fortnightly, and that was measured rather than assumed. Over the last
24 months of Model Town, counting scenes under the cloud bar: 14 of 16 non-smog
months have at least three scenes, against 19 of 32 non-smog fortnights. A single
scene cannot be trusted — haze depresses NDVI, which is why the yearly layers are
composites at all — so a fortnightly series would be mostly single-scene readings,
reintroducing the artefact that made Model Town read 34% -> 23% -> 8% -> 47% on
near-identical dates.

What a monthly series is and is not
----------------------------------
It shows **the season**, and it should be read that way. Vegetation in Lahore moves
with the monsoon and the winter rain; a fall from June to September is the year
turning, not trees being cut. The comparison that means something is the same month
against the same month a year earlier, which is exactly what 24 months buys.

Months are reported even when they carry no raster:

  - **Nov-Feb** is smog season. Aerosol depresses NDVI across the whole scene, so a
    composite would be an artefact. Kept, labelled.
  - **Fewer than three usable scenes** is not a composite. July is often monsoon-
    blank. Kept, labelled, with the count.
  - **Under 92% coverage** is dropped like any other partial raster: a hole reads as
    "no trees" when it means "no data".

A gap the user cannot explain looks like a bug. A gap with a reason is a finding.

Output per region, in public/data/:
    <region>-ndvi-m-<YYYY-MM>.json   one composite, same shape as a year file
    <region>-monthly.json            the series summary, with every month's status
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from change import (  # noqa: E402
    classify_pass, months_back, new_period, smog_month, too_few_scenes,
)
from config import (  # noqa: E402
    MONTHLY_MAX_CLOUD, MONTHLY_MIN_COVERAGE, MONTHLY_MIN_SCENES, MONTHLY_MONTHS,
    OUT, REGIONS, SMOG_MONTHS, STAC_S2,
)
from cogs import ndvi_from  # noqa: E402
from run import (  # noqa: E402
    build_grid, cached_grid, log, post_json, resample_to_grid,
)
from split_years import write_period  # noqa: E402

# Matches recent.py: enough concurrency to stop wasting our own wall time, not
# enough to lean on a free public catalogue.
JOBS = 6


def month_bounds(period: str):
    """First and last day of 'YYYY-MM', as ISO strings."""
    y, m = int(period[:4]), int(period[5:7])
    first = date(y, m, 1)
    last = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
    return first.isoformat(), last.isoformat()


def find_month_scenes(bbox, period):
    """Scenes over this bbox inside one calendar month, under the cloud bar."""
    start, end = month_bounds(period)
    try:
        res = post_json(STAC_S2, {
            "collections": ["sentinel-2-l2a"],
            "bbox": list(bbox),
            # The end is exclusive of the next month's first day by using T00:00.
            "datetime": f"{start}T00:00:00Z/{end}T00:00:00Z",
            "query": {"eo:cloud_cover": {"lt": MONTHLY_MAX_CLOUD}},
            "limit": 60,
        })
    except Exception as e:  # noqa: BLE001
        log(f"  ! STAC search failed for {period}: {e}")
        return []
    items = res.get("features", [])
    # Least cloudy first: within a single month there is no day-of-year drift to
    # control for, so cloud is the right thing to prefer — unlike the yearly
    # layers, where holding the date steady matters more.
    items.sort(key=lambda i: i["properties"].get("eo:cloud_cover", 100))
    return items


def read_scene(item, bbox, grid, region_id):
    a = item["assets"]

    def go():
        arr, tr, crs = ndvi_from(a["red"]["href"], a["nir"]["href"], a["scl"]["href"], bbox)
        return resample_to_grid(arr, tr, crs, grid)

    # Shares the cache with recent.py: the same scene read for a monthly composite
    # and for change detection is the same array, and reading it twice would be
    # paying twice for it.
    return cached_grid(f"pass_{region_id}_{item['id']}", go)


def run_region(region_id):
    cfg = REGIONS[region_id]
    bbox = cfg["bbox"]
    log(f"=== {cfg['name']} — monthly composites ===")

    if not os.path.exists(f"{OUT}/{region_id}.json"):
        log(f"  ! {OUT}/{region_id}.json missing — run `python pipeline/run.py {region_id}` first")
        return None

    grid = build_grid(bbox)
    periods = months_back(datetime.now(timezone.utc).date(), MONTHLY_MONTHS)
    log(f"  {len(periods)} months: {periods[0]} to {periods[-1]}")

    records = []
    for period in periods:
        if int(period[5:7]) in SMOG_MONTHS:
            # Not searched at all: nothing usable can come of it.
            records.append(smog_month(new_period(period, 0)))
            continue

        items = find_month_scenes(bbox, period)
        record = new_period(period, len(items))
        if len(items) < MONTHLY_MIN_SCENES:
            records.append(too_few_scenes(record, len(items)))
            log(f"  {period} — {record['reason']}")
            continue

        # Read the least-cloudy few in parallel, then take the per-cell maximum.
        # Haze and cloud both depress NDVI, so the maximum is the clean reading —
        # the same treatment the yearly layers get, for the same reason.
        take = items[:MONTHLY_MIN_SCENES + 2]
        layers, used = [], []
        with ThreadPoolExecutor(max_workers=JOBS) as pool:
            futures = {pool.submit(read_scene, it, bbox, grid, region_id): it for it in take}
            for fut, it in futures.items():
                try:
                    layers.append(fut.result())
                    used.append(it)
                except Exception as e:  # noqa: BLE001
                    log(f"    {it['id'][:30]}: read failed ({type(e).__name__})")

        if len(layers) < MONTHLY_MIN_SCENES:
            records.append(too_few_scenes(record, len(layers)))
            log(f"  {period} — {record['reason']} (after read failures)")
            continue

        with np.errstate(all="ignore"):
            cells = np.nanmax(np.stack(layers), axis=0)

        record["scenes"] = len(layers)
        record["dates"] = sorted(i["properties"]["datetime"][:10] for i in used)
        classify_pass(record, cells, min_coverage=MONTHLY_MIN_COVERAGE)
        records.append(record)

        if not record["usable"]:
            log(f"  {period} — {record['reason']}")
            continue

        # Same on-disk shape as a yearly layer, so the client loads it through the
        # same path with only a different key.
        write_period(region_id, period, grid, [
            None if not np.isfinite(v) else int(round(v * 100)) for v in cells.ravel()
        ])
        log(f"  {period}  {record['scenes']} scenes  cover {record['coverage']:.0%}  "
            f"veg {record['vegPct']:.1f}%")

    usable = [r for r in records if r["usable"]]
    doc = {
        "region": region_id,
        "name": cfg["name"],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "months": MONTHLY_MONTHS,
        "minScenes": MONTHLY_MIN_SCENES,
        "minCoverage": MONTHLY_MIN_COVERAGE,
        "smogMonths": list(SMOG_MONTHS),
        "periods": records,
        "usableCount": len(usable),
        "latestUsable": usable[-1]["period"] if usable else None,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(f"{OUT}/{region_id}-monthly.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), allow_nan=False)

    log(f"  {len(usable)}/{len(records)} months usable — wrote {region_id}-monthly.json")
    return doc


def main():
    global JOBS
    args = sys.argv[1:]
    if "--jobs" in args:
        i = args.index("--jobs")
        JOBS = max(1, int(args[i + 1]))
        del args[i:i + 2]

    targets = args or list(REGIONS)
    wrote = 0
    for rid in targets:
        if run_region(rid):
            wrote += 1
    log(f"done — {wrote}/{len(targets)} region(s) updated")


if __name__ == "__main__":
    main()
