"""
Surface temperature for every year, so Heat and Risk follow the scrubber.

    python pipeline/heat_years.py               all regions
    python pipeline/heat_years.py model-town    just one
    python pipeline/heat_years.py --jobs 8      more concurrency

Why this exists
---------------
`run.py` reads one Landsat scene — the most recent usable one — and the Heat and
Risk views drew it whatever year was selected. Clicking 2017 in Heat changed
nothing, with no sign that it would not: the same "a control that does nothing"
bug the satellite photograph had.

Landsat 8 covers every year the canopy series does, so each year now gets its own
scene, chosen exactly the way run.py chooses one: inside the same May–June window,
nearest 1 June, under the same cloud bar. Same window every year is what makes one
year's map comparable with the next.

What one scene per year can and cannot say
------------------------------------------
Each year is **one morning** (~10:30 local, the Landsat overpass). Part of any
difference between two years is that morning's weather, so absolute °C are not
compared across years anywhere in the product. What is comparable is the pattern
*within* a year — which cells run hotter than that year's own shaded baseline —
and that is what Risk is built on: `riskValue()` scores heat as degrees above the
baseline measured in the same scene.

So each year carries its own baseline (the median temperature of well-vegetated
cells, NDVI ≥ 0.45, using *that year's* NDVI), computed exactly as run.py does.

Clouds
------
run.py's reader keeps every pixel, relying on the scene-wide cloud cover being
under 20%. For one latest scene that was checked by eye. For nine years it cannot
be: a single cloud over the region reads as a cool patch — a "shaded" block that
is really a cloud. So this masks Landsat's own per-pixel flags (QA_PIXEL: fill,
dilated cloud, cirrus, cloud, cloud shadow) and requires 90% of the grid to
survive, trying the next-nearest scene in the window otherwise.

A year with no usable scene is left out and said so, never filled from a
neighbouring year.

Output per region, in public/data/:
    <region>-lst-<year>.json   {region, year, cols, rows, lst (°C x10), baselineC, scene}
And in meta.json, per region:
    heatYears: {year: {scene, baselineC, medianC, coverage}}

The latest year's core-file `lst` is left alone when it is the same scene, so
first paint does not grow and the ranked sites, which were scored against it,
keep agreeing with the map.
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (  # noqa: E402
    LST_MAX_CLOUD, LST_TARGET, LST_WINDOW, OUT, REGIONS, STAC_MPC,
)
from cogs import read_window  # noqa: E402
from run import (  # noqa: E402
    _MPC_TOKEN, build_grid, cached_grid, find_scene, log, mpc_sign, resample_to_grid,
)

JOBS = 6

# Fraction of grid cells that must hold a clear reading for a year to be kept.
# Stricter than run.py's 0.6: a year the user compares against should not be
# missing a tenth of the neighbourhood.
LST_MIN_COVERAGE = 0.90

# Same rule as run.py: the temperature of well-vegetated cells.
SHADED_NDVI = 0.45

# QA_PIXEL bits (Landsat Collection 2): 0 fill, 1 dilated cloud, 2 cirrus,
# 3 cloud, 4 cloud shadow.
QA_BAD = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)

# How many scenes in the window to try, nearest 1 June first.
MAX_CANDIDATES = 4


def clear_lst(item, bbox):
    """Surface temperature in °C with Landsat's own cloud and shadow flags removed."""
    lwir = mpc_sign(item["assets"]["lwir11"]["href"])
    qa = mpc_sign(item["assets"]["qa_pixel"]["href"])
    dn, tr, crs, _ = read_window(lwir, bbox)
    q, qtr, _, _ = read_window(qa, bbox)
    if q.shape != dn.shape or tuple(qtr) != tuple(tr):
        raise ValueError("QA and thermal windows differ")
    dn = np.where(dn == 0, np.nan, dn)
    c = dn * 0.00341802 + 149.0 - 273.15
    c = np.where((c < -10) | (c > 75), np.nan, c)
    c = np.where((q.astype("uint16") & QA_BAD) != 0, np.nan, c)
    return c.astype("float32"), tr, crs


def read_year(item, bbox, grid, region_id):
    def go():
        arr, tr, crs = clear_lst(item, bbox)
        return resample_to_grid(arr, tr, crs, grid)

    name = f"lstqa_{region_id}_{item['id']}"
    try:
        return cached_grid(name, go)
    except Exception as e:  # noqa: BLE001
        if "403" not in str(e):
            raise
        _MPC_TOKEN["token"] = None  # expired SAS token: refresh once and retry
        return cached_grid(name, go)


def ndvi_for(region_id, year, core):
    """That year's NDVI as a flat float array, from the committed files."""
    raw = core["ndvi"].get(str(year))
    if raw is None:
        path = f"{OUT}/{region_id}-ndvi-{year}.json"
        if not os.path.exists(path):
            return None
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)["ndvi"]
    return np.array([np.nan if v is None else v / 100 for v in raw], dtype="float32")


def baseline_for(lst, ndvi):
    """Median temperature of shaded cells; run.py's fallback when too few exist."""
    finite = np.isfinite(lst)
    shaded = finite & np.isfinite(ndvi) & (ndvi >= SHADED_NDVI)
    if shaded.sum() > 20:
        return float(np.nanmedian(lst[shaded]))
    return float(np.nanpercentile(lst[finite], 10))


def scene_record(item):
    p = item["properties"]
    return {
        "id": item["id"],
        "datetime": p["datetime"][:16].replace("T", " ") + " UTC",
        "cloud": round(p.get("eo:cloud_cover", 0), 2),
    }


def one_year(region_id, year, bbox, grid):
    """The nearest-to-1-June scene in the window that is at least 90% clear."""
    items = find_scene("landsat-c2-l2", STAC_MPC, bbox, year, LST_WINDOW, LST_MAX_CLOUD,
                       {"platform": {"in": ["landsat-8", "landsat-9"]}},
                       target=LST_TARGET, limit=MAX_CANDIDATES) or []
    tried = []
    for item in items:
        try:
            cells = read_year(item, bbox, grid, region_id)
        except Exception as e:  # noqa: BLE001
            tried.append(f"{item['id'][17:25]} read failed ({type(e).__name__})")
            continue
        cover = float(np.isfinite(cells).mean())
        if cover >= LST_MIN_COVERAGE:
            return item, cells, cover, tried
        tried.append(f"{item['id'][17:25]} {cover:.0%} clear")
    return None, None, 0.0, tried


def run_region(region_id):
    cfg = REGIONS[region_id]
    bbox = cfg["bbox"]
    log(f"=== {cfg['name']} — surface temperature per year ===")

    core_path = f"{OUT}/{region_id}.json"
    if not os.path.exists(core_path):
        log(f"  ! {core_path} missing — run `python pipeline/run.py {region_id}` first")
        return None
    with open(core_path, encoding="utf-8") as f:
        core = json.load(f)

    grid = build_grid(bbox)
    if (grid["cols"], grid["rows"]) != (core["cols"], core["rows"]):
        raise SystemExit(f"{region_id}: grid shape changed — rerun run.py first")

    years = core["years"]
    with ThreadPoolExecutor(max_workers=JOBS) as pool:
        results = dict(zip(years, pool.map(
            lambda y: one_year(region_id, y, bbox, grid), years)))

    with open(f"{OUT}/meta.json", encoding="utf-8") as f:
        core_scene = json.load(f)["regions"].get(region_id, {}).get("lstScene", {})

    heat_years = {}
    for year in years:
        item, cells, cover, tried = results[year]
        if item is None:
            log(f"  {year}  no scene ≥{LST_MIN_COVERAGE:.0%} clear in "
                f"{LST_WINDOW[0]}–{LST_WINDOW[1]}  ({'; '.join(tried) or 'none found'})")
            continue
        ndvi = ndvi_for(region_id, year, core)
        if ndvi is None:
            log(f"  {year}  no NDVI for the baseline — skipped")
            continue
        flat = cells.ravel()
        baseline = baseline_for(flat, ndvi)
        rec = scene_record(item)
        heat_years[str(year)] = {
            "scene": rec,
            "baselineC": round(baseline, 1),
            "medianC": round(float(np.nanmedian(flat)), 1),
            "coverage": round(cover, 3),
        }
        # The latest year's core layer is this same scene: keep it inline and do
        # not duplicate it, so first paint is unchanged and the ranked sites,
        # scored against it, keep agreeing with the map.
        if year == years[-1] and rec["id"] == core_scene.get("id"):
            heat_years[str(year)]["inline"] = True
            heat_years[str(year)]["baselineC"] = core["baselineC"]
        else:
            with open(f"{OUT}/{region_id}-lst-{year}.json", "w", encoding="utf-8") as f:
                json.dump({
                    "region": region_id, "year": year,
                    "cols": core["cols"], "rows": core["rows"],
                    "lst": [None if not np.isfinite(v) else int(round(v * 10)) for v in flat],
                    "baselineC": round(baseline, 1),
                    "scene": rec,
                }, f, separators=(",", ":"), allow_nan=False)
        log(f"  {year}  {rec['datetime'][:10]}  {cover:.0%} clear  "
            f"median {heat_years[str(year)]['medianC']:.1f} °C  "
            f"baseline {heat_years[str(year)]['baselineC']:.1f} °C"
            + ("  (inline)" if heat_years[str(year)].get("inline") else ""))

    log(f"  {len(heat_years)}/{len(years)} years with a clear summer scene")
    return heat_years


def write_meta(region_id, heat_years):
    """Merged into meta.json per region, after every region, like run.py."""
    path = f"{OUT}/meta.json"
    with open(path, encoding="utf-8") as f:
        meta = json.load(f)
    meta["regions"][region_id]["heatYears"] = heat_years
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"), allow_nan=False)


def main():
    global JOBS
    args = sys.argv[1:]
    if "--jobs" in args:
        i = args.index("--jobs")
        JOBS = int(args[i + 1])
        del args[i:i + 2]
    for rid in args or list(REGIONS):
        hy = run_region(rid)
        if hy is not None:
            write_meta(rid, hy)


if __name__ == "__main__":
    main()
