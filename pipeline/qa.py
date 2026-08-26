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


def check_region(rid, meta):
    path = f"{OUT}/{rid}.json"
    if not os.path.exists(path):
        bad(f"{rid}: no grid file")
        return
    g = json.load(open(path, encoding="utf-8"))
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
    sites = json.load(open(spath, encoding="utf-8"))["features"]
    print(f"  sites    {len(sites)}")
    if not sites:
        bad(f"{rid}: no sites ranked")
        return

    props = [f["properties"] for f in sites]
    species = Counter(p["species"]["common"] for p in props)
    landuse = Counter(p["landuse"] for p in props)
    print(f"  land use {dict(landuse)}")
    print(f"  species  {dict(species)}")
    if len(species) == 1:
        bad(f"{rid}: every site got the same species ({list(species)[0]}) — "
            "the matcher is not discriminating")

    served = [p["peopleServed"] for p in props]
    if max(served) == 0:
        bad(f"{rid}: every site serves 0 people")
    scores = [p["score"] for p in props]
    print(f"  score    {min(scores):.2f}–{max(scores):.2f}, "
          f"people served {min(served):,}–{max(served):,}")
    if max(scores) - min(scores) < 0.05:
        bad(f"{rid}: ranking has almost no spread — every site scores the same")

    # Sites must sit inside the region they belong to.
    w, s, e, nn = g["bbox"]
    for f in sites:
        lon, lat = f["geometry"]["coordinates"]
        if not (w <= lon <= e and s <= lat <= nn):
            bad(f"{rid}: site {f['properties']['id']} falls outside the region")
            break

    rm = meta.get("regions", {}).get(rid, {})
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
