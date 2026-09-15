"""
Change detection, as pure array logic.

Separated from `recent.py` so it can be tested with numpy alone. `recent.py`
imports rasterio, pyproj and shapely to read COGs, which means a bug in the
clustering rules could only be found by a run that needs the network and takes
minutes. These are the rules that decide whether the product accuses someone of
felling trees, so they get to be checked in two seconds instead.

Nothing here touches the network, the filesystem, or a coordinate system.
"""

import numpy as np

from config import (
    NDVI_VEG_THRESHOLD, RECENT_DROP_NDVI, RECENT_MIN_COVERAGE,
    RECENT_MIN_EVENT_CELLS, RECENT_SCENE_HAZE_RATIO, RECENT_SEVERE_CELLS,
    RECENT_WAS_VEGETATED, SMOG_MONTHS,
)


def in_smog_season(iso_date: str) -> bool:
    """
    Nov-Feb, when Lahore's aerosol depresses NDVI across the whole scene.

    A smog-season pass would show canopy loss everywhere at once and recovery
    everywhere in March. Both are artefacts of the air, not the ground.
    """
    return int(iso_date[5:7]) in SMOG_MONTHS


def new_pass(scene_id: str, iso_date: str, cloud: float) -> dict:
    """
    The record for one overpass, before anything is known about what it shows.

    Starts unusable. A pass earns `usable` by clearing the checks in
    `classify_pass`, rather than being assumed good until something rejects it —
    a pass wrongly marked usable feeds the change detector and produces events,
    which is the failure that matters here.
    """
    return {
        "id": scene_id,
        "date": iso_date,
        "cloud": cloud,
        "usable": False,
        "reason": None,
        "coverage": None,
        "vegPct": None,
        "meanNdvi": None,
    }


def classify_pass(record: dict, cells, min_coverage=RECENT_MIN_COVERAGE) -> dict:
    """
    Decide whether one pass can be compared against another, and summarise it.

    Pure so it can be tested without a network or a COG: `recent.py` owns the
    reading, this owns the judgement. Mutates and returns `record`.

    `cells` is the NDVI grid for this pass, NaN where nothing was seen. Coverage
    is the share of the region actually visible — below the floor there is not
    enough ground to compare, and a partial pass would otherwise contribute
    "loss" wherever it simply could not see.
    """
    finite = np.isfinite(cells)
    coverage = float(finite.mean())
    record["coverage"] = round(coverage, 3)

    if coverage < min_coverage:
        record["reason"] = f"only {coverage:.0%} of the area visible"
        return record

    record["usable"] = True
    record["reason"] = None
    # nanmean over an all-NaN row would warn and return NaN; coverage has already
    # guaranteed there is something here.
    record["vegPct"] = round(float(np.nanmean(cells >= NDVI_VEG_THRESHOLD)) * 100, 1)
    record["meanNdvi"] = round(float(np.nanmean(cells)), 3)
    return record


def smog_skip(record: dict) -> dict:
    """Mark a pass unusable for smog season, keeping it in the record."""
    record["usable"] = False
    record["reason"] = "smog season (Nov-Feb): aerosol depresses NDVI scene-wide"
    return record


def read_failed(record: dict, err: BaseException) -> dict:
    """A pass we could not read is unusable, and says which way it failed."""
    record["usable"] = False
    record["reason"] = f"read failed: {type(err).__name__}"
    return record


def loss_mask(before, after, drop=RECENT_DROP_NDVI, was_veg=RECENT_WAS_VEGETATED):
    """
    Cells that were genuinely vegetated and abruptly are not.

    Both conditions matter. Requiring the drop alone would flag a parking lot
    going from 0.10 to 0.02 — noise on bare ground — as canopy loss. Requiring
    prior vegetation is what makes the claim about trees.

    NaN on either side yields False: a cell we could not see is not a cell that
    changed.
    """
    d = before - after
    return np.isfinite(d) & (d >= drop) & (before >= was_veg)


def label_components(mask):
    """
    Contiguous True regions of a 2-D boolean mask, 4-connected.

    Returns a list of lists of (row, col). Written out rather than pulling in
    scipy.ndimage: the pipeline's dependency list is four packages and a flood
    fill is fifteen lines.

    4-connected rather than 8-connected on purpose — diagonal-only contact is a
    weak basis for calling two cells the same event.
    """
    mask = np.asarray(mask, dtype=bool)
    rows, cols = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for r0 in range(rows):
        for c0 in range(cols):
            if not mask[r0, c0] or seen[r0, c0]:
                continue
            stack = [(r0, c0)]
            seen[r0, c0] = True
            group = []
            while stack:
                r, c = stack.pop()
                group.append((r, c))
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and mask[nr, nc] and not seen[nr, nc]:
                        seen[nr, nc] = True
                        stack.append((nr, nc))
            out.append(group)
    return out


def cluster_losses(before, after, min_cells=RECENT_MIN_EVENT_CELLS,
                   severe_cells=RECENT_SEVERE_CELLS, cell_m=60):
    """
    Loss clusters big enough to be worth reporting, largest first.

    Clusters below `min_cells` are dropped: one 60 m cell over the threshold is
    inside what sensor noise, a building shadow or a mown lawn can produce. Three
    contiguous cells is about 1.1 ha, which is a change somebody can stand in.

    Each entry carries the centroid cell so the caller — which owns the grid
    transform — can turn it into a coordinate.
    """
    mask = loss_mask(before, after)
    events = []
    for group in label_components(mask):
        if len(group) < min_cells:
            continue
        rs = [r for r, _ in group]
        cs = [c for _, c in group]
        b = float(np.nanmean([before[r, c] for r, c in group]))
        a = float(np.nanmean([after[r, c] for r, c in group]))
        events.append({
            "row": int(round(sum(rs) / len(rs))),
            "col": int(round(sum(cs) / len(cs))),
            "cells": len(group),
            "areaM2": len(group) * cell_m * cell_m,
            "beforeNdvi": round(b, 3),
            "afterNdvi": round(a, 3),
            "dropNdvi": round(b - a, 3),
            "severity": "severe" if len(group) >= severe_cells else "notable",
        })
    # Read top-down by someone deciding what to go and look at.
    events.sort(key=lambda e: (-e["cells"], -e["dropNdvi"]))
    return events


def reject_hazy_scenes(passes: list, ratio=RECENT_SCENE_HAZE_RATIO) -> list:
    """
    Mark as unusable any pass whose whole scene reads far less green than its
    neighbours. Returns the records it rejected.

    This exists because a coverage floor is not enough. Sentinel-2's scene
    classification masks opaque cloud, but thin haze passes the mask and still
    depresses NDVI across the entire scene — so a pass can be 100% "visible" and
    still be unusable. Compared against the earlier record, such a pass turns a
    whole neighbourhood into canopy loss.

    The test is physical, not statistical: a neighbourhood cannot lose a third of
    its vegetation in five days. Real felling is local — it moves a handful of
    cells — so nothing this rejects is an event we wanted.

    Needs at least three usable passes to have a median worth comparing against;
    with fewer it does nothing rather than guessing.
    """
    usable = [p for p in passes if p.get("usable") and p.get("vegPct") is not None]
    if len(usable) < 3:
        return []

    median = float(np.median([p["vegPct"] for p in usable]))
    if median <= 0:
        return []

    floor = median * ratio
    rejected = []
    for p in usable:
        if p["vegPct"] < floor:
            p["usable"] = False
            p["reason"] = (
                f"scene-wide vegetation collapse ({p['vegPct']:.1f}% against a "
                f"{median:.1f}% recent median) — haze, not ground change"
            )
            # The figures stay on the record: they are what the rejection is based
            # on, and hiding them would make the reason unverifiable.
            rejected.append(p)
    return rejected


def event_record(cluster: dict, region_id: str, lon: float, lat: float,
                 before_date: str, after_date: str) -> dict:
    """
    One detected loss, in exactly the shape the client reads.

    Separated from `recent.py` so the published contract is testable without
    rasterio: the caller does the one thing that needs a projection — turning the
    centroid cell into a coordinate — and everything else about the record is
    decided here. Keep in sync with `LossEvent` in src/data/recent.ts.
    """
    return {
        "id": f"{region_id}-ev-{after_date}-{cluster['row']}-{cluster['col']}",
        "lon": round(lon, 5),
        "lat": round(lat, 5),
        "cells": cluster["cells"],
        "areaM2": cluster["areaM2"],
        "beforeNdvi": cluster["beforeNdvi"],
        "afterNdvi": cluster["afterNdvi"],
        "dropNdvi": cluster["dropNdvi"],
        "beforeDate": before_date,
        "afterDate": after_date,
        "severity": cluster["severity"],
    }


def baseline_before(grids, keep=None):
    """
    What the ground has recently been known to be: the per-cell maximum across the
    most recent `keep` earlier usable passes, oldest-first input.

    A maximum rather than the single previous pass, because one earlier pass can be
    hazy in a corner, which would read as that corner having recovered and then
    been cleared. A maximum is one-sided in the safe direction — it can miss a real
    loss but cannot manufacture one, and for an accusation that is the correct way
    to be wrong.

    Bounded rather than every pass in the window, because that turned out to build
    a seasonal envelope: the maximum over four months is each cell at its greenest
    all summer, so a cell merely at its September low against a June peak read as
    loss. Found by running it — it produced a single 371 ha "event".
    """
    grids = list(grids)
    if keep is not None:
        grids = grids[-keep:]
    with np.errstate(all="ignore"):
        return np.nanmax(np.stack(grids), axis=0)
