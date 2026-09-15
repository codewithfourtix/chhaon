"""
Recent Sentinel-2 passes, and the sudden canopy loss they reveal.

    python pipeline/recent.py              all regions
    python pipeline/recent.py model-town   just one

Run this on a schedule. `run.py` builds the decade-long yearly record and is slow
and rarely needed; this is the fast, frequent half — it reuses the grid `run.py`
already wrote and only reads the passes it has not seen.

Why this is separate from the yearly composites
-----------------------------------------------
The yearly layers are locked to one spring window so that 2017 and 2025 are
comparable. That is the right design for a trend and the wrong one for news: if a
stand of trees comes down in July, the next comparable observation is nine months
away.

Sentinel-2's two satellites revisit every ~5 days, so the observations already
exist. This stage treats them as what they are — individual observations, each
dated, each with its own cloud and coverage — and looks for cells that were
vegetated and abruptly are not.

The two analyses are never mixed. A single pass cannot carry a multi-year claim,
and a yearly composite cannot date an event.

What it will not claim
----------------------
  - **It does not say why.** A drop is a drop: felling, fire, harvest, a drained
    field, construction clearance and a mown lawn all look alike from orbit. The
    output says what changed and when, and the citizen-report log is where a
    cause comes from.
  - **Smog-season passes are marked unusable, not deleted.** From November to
    February aerosol depresses NDVI across the whole scene, so those passes would
    show loss everywhere at once and recovery everywhere in March. Both are
    artefacts. They stay in the record, labelled, because an unexplained gap
    looks like a bug and because "we cannot see the ground in December" is itself
    worth knowing.
  - **Single cells are dropped.** One 60 m cell over the threshold is inside what
    noise, a shadow or a cut lawn can do.

Output: public/data/<region>-recent.json
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from change import (  # noqa: E402
    baseline_before, classify_pass, cluster_losses, event_record, in_smog_season,
    new_pass, read_failed, reject_hazy_scenes, smog_skip,
)
from config import (  # noqa: E402
    OUT, RECENT_BASELINE_PASSES, RECENT_DAYS, RECENT_DROP_NDVI, RECENT_MAX_CLOUD,
    RECENT_MIN_COVERAGE, RECENT_MIN_EVENT_CELLS, RECENT_SCENE_HAZE_RATIO,
    RECENT_WAS_VEGETATED, REGIONS, SMOG_MONTHS, STAC_S2,
)
from cogs import ndvi_from  # noqa: E402
from run import (  # noqa: E402
    CELL_M, build_grid, cached_grid, log, post_json, resample_to_grid,
)

import pyproj  # noqa: E402
import rasterio  # noqa: E402


def find_recent_passes(bbox, days):
    """Every Sentinel-2 scene over this bbox in the trailing window, newest first."""
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)
    try:
        res = post_json(STAC_S2, {
            "collections": ["sentinel-2-l2a"],
            "bbox": list(bbox),
            "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
            "query": {"eo:cloud_cover": {"lt": RECENT_MAX_CLOUD}},
            "limit": 100,
        })
    except Exception as e:  # noqa: BLE001
        log(f"  ! STAC search failed: {e}")
        return []
    items = res.get("features", [])
    items.sort(key=lambda i: i["properties"]["datetime"], reverse=True)
    return items


def read_pass(item, bbox, grid, region_id):
    a = item["assets"]
    def go():
        arr, tr, crs = ndvi_from(a["red"]["href"], a["nir"]["href"], a["scl"]["href"], bbox)
        return resample_to_grid(arr, tr, crs, grid)
    # Cached like every other COG read: this script is meant to run often, and
    # re-reading a pass it has already seen would make that pointless.
    return cached_grid(f"pass_{region_id}_{item['id']}", go)


def detect_events(before, after, grid, region_id, before_date, after_date, to_wgs):
    """
    Place the clusters found by change.cluster_losses() on the ground.

    The only thing this adds is the projection: the record's shape is decided by
    change.event_record(), so the contract the client reads can be checked without
    rasterio installed.
    """
    events = []
    for e in cluster_losses(before, after, cell_m=CELL_M):
        x, y = rasterio.transform.xy(grid["transform"], e["row"], e["col"])
        lon, lat = to_wgs(x, y)
        events.append(event_record(e, region_id, lon, lat, before_date, after_date))
    return events


def run_region(region_id):
    cfg = REGIONS[region_id]
    bbox = cfg["bbox"]
    log(f"=== {cfg['name']} — recent passes ===")

    grid_path = f"{OUT}/{region_id}.json"
    if not os.path.exists(grid_path):
        log(f"  ! {grid_path} missing — run `python pipeline/run.py {region_id}` first")
        return None

    grid = build_grid(bbox)
    to_wgs = pyproj.Transformer.from_crs(grid["crs"], "EPSG:4326", always_xy=True).transform

    items = find_recent_passes(bbox, RECENT_DAYS)
    if not items:
        log("  no scenes returned for the window")
        return None
    log(f"  {len(items)} scene(s) in the last {RECENT_DAYS} days")

    passes = []
    usable = []  # (iso_date, grid) oldest-first, only usable ones

    # Every judgement below lives in change.py, which needs numpy alone, so the
    # rules that decide whether a pass may drive change detection are checked by
    # test_logic.py in two seconds instead of only by a run that needs the network.
    for item in items:
        iso = item["properties"]["datetime"][:10]
        record = new_pass(item["id"], iso, round(item["properties"].get("eo:cloud_cover", 0), 1))

        if in_smog_season(iso):
            # Not read at all — the aerosol makes the values meaningless, and a
            # COG read we will never use is a minute of somebody's bandwidth.
            passes.append(smog_skip(record))
            continue

        try:
            cells = read_pass(item, bbox, grid, region_id)
        except Exception as e:  # noqa: BLE001
            passes.append(read_failed(record, e))
            continue

        classify_pass(record, cells)
        passes.append(record)
        if not record["usable"]:
            log(f"  {iso} skipped — {record['reason']}")
            continue

        # Kept even if the haze check below rejects it, so the record and the
        # grid never fall out of step.
        usable.append((record, cells))
        log(f"  {iso} cloud {record['cloud']:>4}%  cover {record['coverage']:.0%}  "
            f"veg {record['vegPct']:.1f}%")

    # A pass can clear the coverage floor and still be unusable: thin haze passes
    # Sentinel-2's cloud mask and depresses NDVI across the whole scene. Needs the
    # full set to compare against, so it runs after the loop rather than inside it.
    for rejected in reject_hazy_scenes(passes):
        log(f"  {rejected['date']} rejected — {rejected['reason']}")
    usable = [(r, g) for r, g in usable if r["usable"]]

    # Oldest first, so "before" and "after" mean what they say.
    usable.reverse()

    events = []
    if len(usable) < 2:
        log(f"  only {len(usable)} usable pass(es) — need two to compare, no events")
    else:
        after_date, after = usable[-1][0]["date"], usable[-1][1]
        # Bounded to the most recent passes: the maximum over a whole 120-day
        # window is a seasonal envelope, and every cell at its September low
        # against a June peak read as loss.
        baseline = usable[:-1][-RECENT_BASELINE_PASSES:]
        before = baseline_before((g for _, g in baseline), keep=RECENT_BASELINE_PASSES)
        before_date = baseline[0][0]["date"]
        events = detect_events(
            before, after, grid, region_id, before_date, after_date, to_wgs
        )
        log(f"  {len(events)} event(s) between {before_date} and {after_date}"
            + (f" — largest {events[0]['areaM2'] / 10_000:.1f} ha" if events else ""))

    doc = {
        "region": region_id,
        "name": cfg["name"],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "windowDays": RECENT_DAYS,
        "thresholds": {
            "dropNdvi": RECENT_DROP_NDVI,
            "wasVegetated": RECENT_WAS_VEGETATED,
            "minCells": RECENT_MIN_EVENT_CELLS,
            "minCoverage": RECENT_MIN_COVERAGE,
            "baselinePasses": RECENT_BASELINE_PASSES,
            "sceneHazeRatio": RECENT_SCENE_HAZE_RATIO,
        },
        "smogMonths": list(SMOG_MONTHS),
        "passes": passes,
        "latestUsable": usable[-1][0]["date"] if usable else None,
        "usableCount": len(usable),
        "events": events,
    }

    os.makedirs(OUT, exist_ok=True)
    with open(f"{OUT}/{region_id}-recent.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), allow_nan=False)
    log(f"  wrote {region_id}-recent.json")
    return doc


def main():
    targets = sys.argv[1:] or list(REGIONS)
    wrote = 0
    for rid in targets:
        if run_region(rid):
            wrote += 1
    log(f"done — {wrote}/{len(targets)} region(s) updated")


if __name__ == "__main__":
    main()
