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

    # NDVI years live in two places since the payload split: the latest year is
    # inline in the core file, earlier years are separate files the app fetches
    # on demand. A year the metadata promises but that resolves to nothing is a
    # dead scrubber tick, and it would be invisible in the UI — the layer would
    # simply keep showing the previous year — so it is checked here.
    ndvi = {}
    for y in g["years"]:
        key = str(y)
        if key in g["ndvi"]:
            ndvi[y] = g["ndvi"][key]
            continue
        ypath = f"{OUT}/{rid}-ndvi-{y}.json"
        if not os.path.exists(ypath):
            bad(f"{rid}: year {y} is listed in 'years' but neither inline nor at "
                f"{os.path.basename(ypath)} — run `python pipeline/split_years.py`")
            continue
        ydoc = strict_load(ypath, rid)
        if ydoc is None:
            continue
        if ydoc.get("cols") != g["cols"] or ydoc.get("rows") != g["rows"]:
            bad(f"{rid}: {os.path.basename(ypath)} is {ydoc.get('cols')}x"
                f"{ydoc.get('rows')}, but the grid is {g['cols']}x{g['rows']} — "
                "stale split, regenerate it")
            continue
        if len(ydoc["ndvi"]) != n:
            bad(f"{rid}: {os.path.basename(ypath)} has {len(ydoc['ndvi'])} values, "
                f"expected {n}")
            continue
        ndvi[y] = ydoc["ndvi"]

    latest = g["years"][-1]
    if str(latest) not in g["ndvi"]:
        bad(f"{rid}: the latest year ({latest}) must stay inline in the core file — "
            "the risk layer and the default view both need it on first paint")

    for y, vals in ndvi.items():
        if np.isfinite(unq(vals, 100)).mean() < 0.5:
            bad(f"{rid}: {y} NDVI is more than half empty")
    veg = {y: round(float(np.nanmean(unq(vals, 100) >= 0.30)) * 100, 1)
           for y, vals in sorted(ndvi.items())}
    print(f"  veg %    {veg}")
    print(f"  ndvi     {len(ndvi)}/{len(g['years'])} years resolved "
          f"({latest} inline, {len(ndvi) - 1} on demand)")

    # --- monthly composites, if the stage has been run ---
    mpath = f"{OUT}/{rid}-monthly.json"
    if os.path.exists(mpath):
        mdoc = strict_load(mpath, rid)
        if mdoc is not None:
            usable = [p for p in mdoc["periods"] if p["usable"]]
            unusable = [p for p in mdoc["periods"] if not p["usable"]]
            print(f"  monthly  {len(usable)}/{len(mdoc['periods'])} months usable, "
                  f"{mdoc['latestUsable']} latest")

            # Every usable month must have a raster behind it. A month on the
            # scrubber with no file is a dead tick, and the layer would silently
            # keep showing the previous one.
            for p_ in usable:
                ypath = f"{OUT}/{rid}-ndvi-m-{p_['period']}.json"
                if not os.path.exists(ypath):
                    bad(f"{rid}: month {p_['period']} is usable but "
                        f"{os.path.basename(ypath)} is missing")
                    continue
                ydoc = strict_load(ypath, rid)
                if ydoc is None:
                    continue
                if len(ydoc["ndvi"]) != n:
                    bad(f"{rid}: {os.path.basename(ypath)} has {len(ydoc['ndvi'])} "
                        f"values, expected {n}")

            # And every unusable one must say why — a blank reads as a bug.
            for p_ in unusable:
                if not p_.get("reason"):
                    bad(f"{rid}: month {p_['period']} is unusable with no reason given")

            # A month is a composite; below the scene floor it is one reading with
            # a haze artefact, which is the thing compositing exists to prevent.
            thin = [p_ for p_ in usable if p_["scenes"] < mdoc["minScenes"]]
            if thin:
                bad(f"{rid}: {len(thin)} usable month(s) composited from fewer than "
                    f"{mdoc['minScenes']} scenes: {[p_['period'] for p_ in thin]}")

            veg = [p_["vegPct"] for p_ in usable if p_["vegPct"] is not None]
            if veg:
                print(f"  monthly veg {min(veg):.1f}–{max(veg):.1f}%")
                # The monthly series exists to show the season. If it were flat,
                # either the compositing or the window is wrong.
                if max(veg) - min(veg) < 2:
                    bad(f"{rid}: monthly vegetated share barely moves across the "
                        "year — the series is not measuring the season")

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


def check_heat_years(meta):
    """
    Per-year surface temperature: every year the canopy has, in its own summer
    window, the right shape, and never borrowed from another year.
    """
    print("Heat per year (Landsat, one clear summer scene each)")
    for rid in REGIONS:
        rm = meta.get("regions", {}).get(rid, {})
        hy = rm.get("heatYears")
        if hy is None:
            print(f"  {rid:12} not built — Heat and Risk show the latest year only")
            continue
        g = strict_load(f"{OUT}/{rid}.json", rid)
        if g is None:
            continue
        years = [str(y) for y in rm.get("years", [])]
        missing = [y for y in years if y not in hy]
        seen = set()
        for y, v in hy.items():
            scene_day = v["scene"]["datetime"][:10]
            # The scene must be from the year it is shown under, in the window.
            if scene_day[:4] != y or not ("05-01" <= scene_day[5:] <= "06-30"):
                bad(f"{rid}: {y} heat is from {scene_day}, outside {y}'s May-June window")
            if v["scene"]["id"] in seen:
                bad(f"{rid}: scene {v['scene']['id']} is used for two years")
            seen.add(v["scene"]["id"])
            if v["coverage"] < 0.9:
                bad(f"{rid}: {y} heat covers only {v['coverage']:.0%} of the grid")
            if v.get("inline"):
                if v["scene"]["id"] != rm.get("lstScene", {}).get("id"):
                    bad(f"{rid}: {y} claims the inline layer but is a different scene")
                continue
            path = f"{OUT}/{rid}-lst-{y}.json"
            if not os.path.exists(path):
                bad(f"{rid}: {y} heat listed in meta but {os.path.basename(path)} is missing")
                continue
            doc = strict_load(path, rid)
            if doc is None:
                continue
            if (doc["cols"], doc["rows"]) != (g["cols"], g["rows"]) or                     len(doc["lst"]) != g["cols"] * g["rows"]:
                bad(f"{rid}: {os.path.basename(path)} does not match the grid shape")
            if abs(doc["baselineC"] - v["baselineC"]) > 0.05:
                bad(f"{rid}: {y} baseline differs between meta and its file")
        print(f"  {rid:12} {len(hy)}/{len(years)} years"
              + (f", none for {missing} (shown as a gap)" if missing else ""))
    print()


def check_imagery(meta):
    """
    The historical basemap, checked against the rule that makes it honest: a year
    is never shown a photograph taken after it.
    """
    path = f"{OUT}/imagery.json"
    if not os.path.exists(path):
        print("imagery   not built — the satellite basemap stays the live mosaic")
        print()
        return
    doc = strict_load(path, "imagery")
    if doc is None:
        return
    print("Imagery (Esri Wayback, by capture date)")
    for rid, r in doc.get("regions", {}).items():
        dates = {c["captured"] for c in r["captures"]}
        years = meta.get("regions", {}).get(rid, {}).get("years", [])
        missing = [y for y in years if str(y) not in r["byYear"]]
        if missing:
            bad(f"{rid}: years {missing} have no imagery chosen")
        for y, v in r["byYear"].items():
            if v["capture"] not in dates:
                bad(f"{rid}: {y} points at {v['capture']}, which is not a known capture")
            # The rule that matters: never a future photograph under a past year.
            if v["capture"][:4] > y:
                bad(f"{rid}: {y} is shown a photograph from {v['capture']} — later "
                    "than the year it is under")
            if v["sameYear"] != (v["capture"][:4] == y):
                bad(f"{rid}: {y} claims sameYear={v['sameYear']} for a "
                    f"{v['capture']} photograph")
        for m, v in r.get("byMonth", {}).items():
            if v["capture"][:7] > m:
                bad(f"{rid}: {m} is shown a photograph from {v['capture']} — after "
                    "that month")
        same = sum(1 for v in r["byYear"].values() if v["sameYear"])
        print(f"  {rid:12} {len(r['captures'])} captures, {same}/{len(r['byYear'])} years "
              "with a same-year photograph")
    print()


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

    check_heat_years(meta)
    check_imagery(meta)

    if PROBLEMS:
        print(f"{len(PROBLEMS)} PROBLEM(S):")
        for p in PROBLEMS:
            print(f"  - {p}")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
