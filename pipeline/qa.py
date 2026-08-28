"""
Sanity-checks the pipeline's output before anyone looks at it.

    python pipeline/qa.py

Catches the failure modes that are invisible in the UI: a layer that is
silently all-zero, a species matcher that collapsed to one tree, a scoring
term that stopped discriminating, a grid that does not line up with its own
metadata.
"""

import json
import os
import sys
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OUT, REGIONS  # noqa: E402

PROBLEMS = []


def bad(msg):
    PROBLEMS.append(msg)
    print(f"    PROBLEM: {msg}")


def unq(arr, scale):
    return np.array([np.nan if v is None else v / scale for v in arr], dtype="float32")


def strict_load(path, rid):
    """
    Parse the way a browser does. Python accepts NaN and Infinity in JSON;
    JSON.parse does not, and a single NaN makes the whole file unloadable —
    which is exactly how every region silently stopped rendering once.
    """
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    try:
        return json.loads(raw, parse_constant=_reject)
    except ValueError as e:
        bad(f"{rid}: {os.path.basename(path)} is not valid JSON for a browser ({e})")
        return None


def _reject(v):
    raise ValueError(f"{v} is not valid JSON")


def check_region(rid, meta):
    rm = meta.get("regions", {}).get(rid, {})
    path = f"{OUT}/{rid}.json"
    if not os.path.exists(path):
        bad(f"{rid}: no grid file")
        return
    g = strict_load(path, rid)
    if g is None:
        return
    n = g["cols"] * g["rows"]
    print(f"  grid {g['cols']}x{g['rows']} = {n} cells @ {g['cellM']} m")

    for key in ("lst", "pop", "landuse", "built"):
        if len(g[key]) != n:
            bad(f"{rid}: '{key}' has {len(g[key])} values, expected {n}")

    lst = unq(g["lst"], 10)
    pop = unq(g["pop"], 10)
    print(f"  LST      {np.nanmin(lst):.1f}–{np.nanmax(lst):.1f} °C, "
          f"median {np.nanmedian(lst):.1f}, baseline {g['baselineC']}")
    if not (20 < np.nanmedian(lst) < 65):
        bad(f"{rid}: implausible median surface temperature")
    if np.nanmax(lst) - np.nanmin(lst) < 2:
        bad(f"{rid}: surface temperature has almost no spread")

    print(f"  people   median {np.nanmedian(pop):.0f}/ha, "
          f"max {np.nanmax(pop):.0f}/ha, total {np.nansum(pop):,.0f}")
    if np.nansum(pop) <= 0:
        bad(f"{rid}: population layer is empty — the 'people served' term is dead")

    for y in g["years"]:
        v = unq(g["ndvi"][str(y)], 100)
        if np.isfinite(v).mean() < 0.5:
            bad(f"{rid}: {y} NDVI is more than half empty")
    veg = {y: round(float(np.nanmean(unq(g["ndvi"][str(y)], 100) >= 0.30)) * 100, 1)
           for y in g["years"]}
    print(f"  veg %    {veg}")

    lu = Counter(g["landuse"])
    plantable = n - lu.get(0, 0)
    print(f"  plantable {plantable} cells ({100*plantable/n:.1f}%)")
    if plantable / n > 0.75:
        bad(f"{rid}: {100*plantable/n:.0f}% of cells marked plantable — the mask "
            "is not discriminating")
    if plantable == 0:
        bad(f"{rid}: nothing is plantable")

    spath = f"{OUT}/{rid}-sites.json"
    if not os.path.exists(spath):
        bad(f"{rid}: no sites file")
        return
    sdoc = strict_load(spath, rid)
    if sdoc is None:
        return
    sites = sdoc["features"]
    print(f"  sites    {len(sites)}")
    if not sites:
        bad(f"{rid}: no sites ranked")
        return

    props = [f["properties"] for f in sites]
    species = Counter(p["species"]["common"] for p in props)
    landuse = Counter(p["landuse"] for p in props)
    print(f"  land use {dict(landuse)}")
    print(f"  species  {dict(species)}")
    # Monoculture is a real urban-forestry failure mode: one pest sweep takes
    # out a whole avenue. The matcher carries an explicit diversity term, so
    # this is a hard check, not a note.
    div = rm.get("diversity") or {}
    top_share = div.get("topShare", 1.0)
    if len(species) < 3:
        bad(f"{rid}: only {len(species)} species across {len(sites)} sites")
    if top_share > 0.55:
        bad(f"{rid}: {div.get('topSpecies')} takes {top_share:.0%} of the "
            "ranking — monoculture risk")
    print(f"  diversity {len(species)} species, top {div.get('topSpecies')} "
          f"{top_share:.0%}, evenness {div.get('evenness')}")

    # Estimated benefits must be present and positive.
    for key in ("co2KgPerYear", "pm25KgPerYear", "carsEquivalent"):
        if not rm.get(key):
            bad(f"{rid}: missing estimated benefit '{key}'")

    served = [p["peopleServed"] for p in props]
    if max(served) == 0:
        bad(f"{rid}: every site serves 0 people")
    scores = [p["score"] for p in props]
    print(f"  score    {min(scores):.2f}–{max(scores):.2f}, "
          f"people served {min(served):,}–{max(served):,}")
    if max(scores) - min(scores) < 0.05:
        bad(f"{rid}: ranking has almost no spread — every site scores the same")

    # Sites must sit inside the analysed grid — which is the metric grid snapped
    # outward to whole cells, NOT the requested lat/lon box. Comparing against
    # the box flags edge cells that are a metre or two outside it purely because
    # UTM is not axis-aligned with lon/lat.
    c = g["cornersWgs84"]
    lons = [c["tl"][0], c["tr"][0], c["bl"][0], c["br"][0]]
    lats = [c["tl"][1], c["tr"][1], c["bl"][1], c["br"][1]]
    w, e = min(lons), max(lons)
    so, no = min(lats), max(lats)
    for f in sites:
        lon, lat = f["geometry"]["coordinates"]
        if not (w <= lon <= e and so <= lat <= no):
            bad(f"{rid}: site {f['properties']['id']} falls outside the analysed grid")
            break

    # Ranks must be a clean 1..N with no gaps or repeats.
    ranks = sorted(p["rank"] for p in props if p.get("rank") is not None)
    if ranks != list(range(1, len(sites) + 1)):
        bad(f"{rid}: ranks are not a contiguous 1..{len(sites)}")

    # And rank order must actually follow score order.
    by_rank = sorted(props, key=lambda p: p.get("rank", 0))
    if any(by_rank[i]["score"] < by_rank[i + 1]["score"] - 1e-9
           for i in range(len(by_rank) - 1)):
        bad(f"{rid}: rank order does not follow score order")

    if rm.get("heatGapC") is not None:
        print(f"  heat gap {rm['heatGapC']} °C, NDVI/LST r = {rm.get('ndviLstCorr')}")
        if rm["heatGapC"] <= 0:
            bad(f"{rid}: vegetated ground is not cooler than bare ground")


def main():
    mpath = f"{OUT}/meta.json"
    if not os.path.exists(mpath):
        print("No meta.json — run the pipeline first.")
        sys.exit(1)
    meta = json.load(open(mpath, encoding="utf-8"))
    print(f"pipeline run {meta['generated']}, weights {meta['weights']}\n")

    for rid in REGIONS:
        print(f"{REGIONS[rid]['name']} ({rid})")
        if rid not in meta.get("regions", {}):
            bad(f"{rid}: missing from meta.json")
        else:
            check_region(rid, meta)
        print()

    if PROBLEMS:
        print(f"{len(PROBLEMS)} PROBLEM(S):")
        for p in PROBLEMS:
            print(f"  - {p}")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
