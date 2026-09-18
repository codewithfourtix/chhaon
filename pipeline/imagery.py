"""
Historical satellite imagery, matched to each year by its real capture date.

    python pipeline/imagery.py              all regions
    python pipeline/imagery.py model-town   just one

Why this exists
---------------
The year scrubber changed the measured canopy layer but not the photograph under
it: the satellite basemap is Esri's single current mosaic, so clicking 2017 still
showed today's ground. That reads as a scrubber that does nothing.

Esri keeps every past release of that imagery as "Wayback", and each release is a
real historical photograph at sub-metre resolution. But a **release date is not a
capture date**. The Wayback release of 2019-09-18 shows Model Town as it was
photographed on 2017-02-10; labelling it "2019" would show two-year-old ground as
current, which is exactly the kind of quiet mislabelling this product exists to
refuse.

Each release publishes a metadata layer giving the source date of every patch of
imagery in it. So this stage asks each release what it actually shows over each
region, and chooses per year by capture date:

  - a capture **inside** that year, nearest the spring window the yearly NDVI is
    locked to — so the photograph matches the season of the measurement over it;
  - otherwise the most recent capture **before** that year, labelled as such.
    Never a later one: showing 2020 ground for 2018 would put a future photograph
    under a past measurement.

Everything is resolved here and written to public/data/imagery.json, so the app
makes no metadata calls at runtime. Only the tiles themselves are fetched live, as
the current basemap's already are.

Mosaics are not uniform — a region can straddle two capture strips — so each
chosen release is sampled at five points and the file says how much of the region
the stated date actually covers.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import MONTHLY_MONTHS, NDVI_TARGET, OUT, REGIONS  # noqa: E402

WAYBACK_CONFIG = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json"
UA = "chhaon-pipeline/1.0 (Smart City Hackathon Lahore; +https://github.com/codewithfourtix/chhaon)"

# The yearly record starts in 2017; a release from before 2016 cannot matter.
EARLIEST_RELEASE = "2016-01-01"
JOBS = 6


def get_json(url, retries=2):
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 — any failure means retry, then give up
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def releases():
    """Every Wayback release since EARLIEST_RELEASE, oldest first."""
    cfg = get_json(WAYBACK_CONFIG)
    out = []
    for num, v in cfg.items():
        # itemTitle is "World Imagery (Wayback 2019-09-18)".
        rdate = v["itemTitle"].rsplit(" ", 1)[-1].rstrip(")")
        if rdate >= EARLIEST_RELEASE:
            out.append({"release": int(num), "releaseDate": rdate, "meta": v["metadataLayerUrl"]})
    return sorted(out, key=lambda r: r["releaseDate"])


def capture_at(meta_url, lon, lat):
    """
    What one release actually shows at a point: the finest-resolution source it
    has there, with its real capture date. None if the release has nothing.
    """
    q = urllib.parse.urlencode({
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "sr": 4326,
        "layers": "all",
        "tolerance": 0,
        "mapExtent": f"{lon - .01},{lat - .01},{lon + .01},{lat + .01}",
        "imageDisplay": "400,400,96",
        "returnGeometry": "false",
        "f": "json",
    })
    res = get_json(f"{meta_url}/identify?{q}").get("results", [])
    hits = [x["attributes"] for x in res if x.get("attributes", {}).get("SRC_DATE")]
    if not hits:
        return None
    # The finest source is what a viewer sees once zoomed in, which is where the
    # date matters.
    best = min(hits, key=lambda a: float(a.get("SRC_RES") or 99))
    d = str(best["SRC_DATE"])
    return {
        "captured": f"{d[:4]}-{d[4:6]}-{d[6:8]}",
        "source": best.get("SRC_DESC") or "unknown",
        "resM": round(float(best.get("SRC_RES") or 0), 2),
    }


def sample_points(bbox):
    """The centre and the four quadrant centres of a region."""
    w, s, e, n = bbox
    cx, cy = (w + e) / 2, (s + n) / 2
    qx, qy = (e - w) / 4, (n - s) / 4
    return [(cx, cy), (cx - qx, cy - qy), (cx + qx, cy - qy),
            (cx - qx, cy + qy), (cx + qx, cy + qy)]


def spring_anchor(year):
    """The day the yearly NDVI window is centred on, in a given year."""
    m, d = (int(x) for x in NDVI_TARGET.split("-"))
    return date(year, m, d)


def pick(captures, year, anchor):
    """
    The capture to show for one period, and whether it is from inside it.

    Inside the period and nearest the anchor wins. Otherwise the most recent
    capture before the period starts — never a later one, which would put a future
    photograph under a past measurement.
    """
    inside = [c for c in captures if c["captured"][:4] == str(year)]
    if inside:
        best = min(inside, key=lambda c: abs((date.fromisoformat(c["captured"]) - anchor).days))
        return best, True
    before = [c for c in captures if c["captured"] < f"{year}-01-01"]
    if before:
        return max(before, key=lambda c: c["captured"]), False
    # Nothing earlier exists at all: show the oldest we have and say so.
    return min(captures, key=lambda c: c["captured"]), False


def pick_month(captures, period):
    """For a calendar month: the latest capture on or before its last day."""
    y, m = int(period[:4]), int(period[5:7])
    end = date(y + (m == 12), 1 if m == 12 else m + 1, 1).isoformat()
    upto = [c for c in captures if c["captured"] < end]
    if not upto:
        return min(captures, key=lambda c: c["captured"]), False
    best = max(upto, key=lambda c: c["captured"])
    return best, best["captured"][:7] == period


def run_region(region_id, rels, years, months):
    cfg = REGIONS[region_id]
    lon, lat = cfg["centre"]
    print(f"=== {cfg['name']} ===", flush=True)

    # What every release shows at the centre. The centre decides which capture a
    # release "is"; uniformity across the region is checked afterwards.
    def at_centre(r):
        try:
            return r, capture_at(r["meta"], lon, lat)
        except Exception as e:  # noqa: BLE001
            print(f"  release {r['release']}: {type(e).__name__}", flush=True)
            return r, None

    with ThreadPoolExecutor(max_workers=JOBS) as pool:
        seen = list(pool.map(at_centre, rels))

    # One entry per distinct photograph, keyed by capture date and sensor. Many
    # releases re-publish the same capture; the first release carrying it is kept,
    # since its tiles are identical to every later one's.
    captures = {}
    for r, c in seen:
        if not c:
            continue
        key = (c["captured"], c["source"])
        if key not in captures:
            captures[key] = {**c, "release": r["release"], "releaseDate": r["releaseDate"]}
    caps = sorted(captures.values(), key=lambda c: c["captured"])
    if not caps:
        print("  ! no imagery metadata found", flush=True)
        return None
    print(f"  {len(caps)} distinct captures: {', '.join(c['captured'] for c in caps)}", flush=True)

    # How much of the region does each chosen capture actually cover?
    points = sample_points(cfg["bbox"])

    def coverage(cap):
        rel = next(r for r in rels if r["release"] == cap["release"])
        dates = []
        for px, py in points:
            try:
                got = capture_at(rel["meta"], px, py)
                dates.append(got["captured"] if got else None)
            except Exception:  # noqa: BLE001
                dates.append(None)
        same = sum(1 for d in dates if d == cap["captured"])
        others = sorted({d for d in dates if d and d != cap["captured"]})
        return {**cap, "samples": len(points), "matching": same, "otherDates": others}

    with ThreadPoolExecutor(max_workers=JOBS) as pool:
        caps = list(pool.map(coverage, caps))

    by_year = {}
    for y in years:
        c, same = pick(caps, y, spring_anchor(y))
        by_year[str(y)] = {"capture": c["captured"], "sameYear": same}
    by_month = {}
    for p in months:
        c, same = pick_month(caps, p)
        by_month[p] = {"capture": c["captured"], "samePeriod": same}

    for y, v in by_year.items():
        tag = "" if v["sameYear"] else "  (nearest earlier)"
        print(f"  {y} -> {v['capture']}{tag}", flush=True)

    return {"captures": caps, "byYear": by_year, "byMonth": by_month}


def main():
    targets = sys.argv[1:] or list(REGIONS)

    meta_path = f"{OUT}/meta.json"
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    rels = releases()
    print(f"{len(rels)} Wayback releases since {EARLIEST_RELEASE}\n", flush=True)

    out_path = f"{OUT}/imagery.json"
    existing = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            existing = json.load(f).get("regions", {})

    for rid in targets:
        years = meta["regions"].get(rid, {}).get("years", [])
        months = []
        mpath = f"{OUT}/{rid}-monthly.json"
        if os.path.exists(mpath):
            with open(mpath, encoding="utf-8") as f:
                months = [p["period"] for p in json.load(f)["periods"]]
        result = run_region(rid, rels, years, months)
        if result:
            existing[rid] = result

        # Written after every region, like meta.json: a run that dies partway still
        # leaves the app with what finished.
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({
                "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": "Esri World Imagery Wayback",
                "tileUrl": "https://wayback.maptiles.arcgis.com/arcgis/rest/services/"
                           "World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/"
                           "{release}/{z}/{y}/{x}",
                "anchor": NDVI_TARGET,
                "monthsWindow": MONTHLY_MONTHS,
                "regions": existing,
            }, f, indent=1, allow_nan=False)
        print("", flush=True)

    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
