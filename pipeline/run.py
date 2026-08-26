"""
Chhaon pipeline — turns open satellite and map data into the files the app reads.

    python pipeline/run.py              all regions
    python pipeline/run.py model-town   one region

Everything is precomputed here and committed as static files. The app makes no
API calls at runtime, so nothing can time out during a demo.

Output per region, in public/data/:
    <region>.json   the analysis grid (NDVI per year, LST, population, land use)
    <region>-sites.json  the ranked planting sites, as GeoJSON points
    meta.json       which years exist, which scenes were used, resolutions
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import transform as shp_transform
import pyproj

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (  # noqa: E402
    CACHE, CANDIDATE_YEARS, LST_MAX_CLOUD, LST_WINDOW, MPC_SAS, NDVI_MAX_CLOUD,
    LST_TARGET, NDVI_COMPOSITE_SCENES, NDVI_TARGET, NDVI_VEG_THRESHOLD, NDVI_WINDOW,
    OUT, OVERPASS_MIRRORS,
    REGIONS, SPECIES, STAC_MPC,
    STAC_S2, WEIGHTS,
)
from cogs import lst_celsius_from, ndvi_from  # noqa: E402

CELL_M = 60  # analysis cell size; coarse enough to ship, fine enough to act on


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


# Overpass rejects urllib's default user-agent with HTTP 406, and it is simply
# good manners to identify a script hitting a volunteer-run API.
UA = "chhaon-pipeline/1.0 (Smart City Hackathon Lahore; +https://github.com/codewithfourtix/chhaon)"


def post_json(url, payload, timeout=120):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA},
    )
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def cached_grid(name, produce):
    """Cache a numpy grid. COG reads are the slow part; never repeat them."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + ".npy")
    if os.path.exists(path):
        return np.load(path)
    arr = produce()
    if arr is not None:
        np.save(path, arr)
    return arr


def cached(name, produce):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    value = produce()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f)
    return value


# --------------------------------------------------------------------------
# Scene search
# --------------------------------------------------------------------------

def find_scene(collection, stac, bbox, year, window, max_cloud, extra_query=None,
               target=None, limit=1):
    """
    The scene closest to `target` day-of-year inside this year's fixed window.

    Deliberately NOT the least-cloudy scene: cloud cover is already bounded by
    max_cloud, and holding the day-of-year steady is what makes one year
    comparable to the next.
    """
    start, end = window
    query = {"eo:cloud_cover": {"lt": max_cloud}}
    if extra_query:
        query.update(extra_query)
    try:
        res = post_json(stac, {
            "collections": [collection],
            "bbox": list(bbox),
            "datetime": f"{year}-{start}T00:00:00Z/{year}-{end}T23:59:59Z",
            "query": query,
            "limit": 40,
        })
    except (urllib.error.URLError, TimeoutError) as e:
        log(f"  ! STAC search failed for {year}: {e}")
        return [] if limit > 1 else None
    items = res.get("features", [])
    if not items:
        return [] if limit > 1 else None
    if target:
        from datetime import date
        tm, td = (int(x) for x in target.split("-"))
        anchor = date(year, tm, td)

        def distance(i):
            d = i["properties"]["datetime"][:10]
            got = date(*(int(x) for x in d.split("-")))
            return abs((got - anchor).days)

        items.sort(key=distance)
    else:
        items.sort(key=lambda i: i["properties"].get("eo:cloud_cover", 100))
    return items[:limit] if limit > 1 else items[0]


def mpc_sign(href):
    token = cached("mpc_token.json", lambda: json.load(urllib.request.urlopen(
        urllib.request.Request(MPC_SAS, headers={"User-Agent": UA}), timeout=60)))["token"]
    return href + ("&" if "?" in href else "?") + token


# --------------------------------------------------------------------------
# Grid
# --------------------------------------------------------------------------

def build_grid(bbox):
    """A metric grid over the region, in the local UTM zone."""
    utm = pyproj.CRS.from_epsg(32643)  # UTM 43N covers Lahore
    left, bottom, right, top = transform_bounds("EPSG:4326", utm, *bbox, densify_pts=21)
    cols = int(np.ceil((right - left) / CELL_M))
    rows = int(np.ceil((top - bottom) / CELL_M))
    transform = from_origin(left, top, CELL_M, CELL_M)
    return {"crs": utm, "transform": transform, "cols": cols, "rows": rows,
            "bounds_utm": (left, bottom, left + cols * CELL_M, top - rows * CELL_M)}


def resample_to_grid(arr, src_transform, src_crs, grid):
    """Average source pixels into our grid cells."""
    from rasterio.warp import Resampling, reproject
    out = np.full((grid["rows"], grid["cols"]), np.nan, dtype="float32")
    reproject(
        source=arr, destination=out,
        src_transform=src_transform, src_crs=src_crs,
        dst_transform=grid["transform"], dst_crs=grid["crs"],
        src_nodata=np.nan, dst_nodata=np.nan,
        resampling=Resampling.average,
    )
    return out


# --------------------------------------------------------------------------
# OpenStreetMap — what land can actually be planted
# --------------------------------------------------------------------------

# Split into two queries. Buildings across a whole neighbourhood are tens of
# thousands of polygons and regularly time Overpass out; asking for them
# separately means a building failure costs us only the building mask, not the
# land-use classification we actually rank on.
OVERPASS_BASE = """
[out:json][timeout:180];
(
  way["leisure"~"^(park|garden|recreation_ground|pitch)$"]({s},{w},{n},{e});
  way["landuse"~"^(grass|greenfield|brownfield|meadow|village_green|cemetery)$"]({s},{w},{n},{e});
  way["natural"="scrub"]({s},{w},{n},{e});
  way["waterway"~"^(canal|river|stream)$"]({s},{w},{n},{e});
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|trunk)$"]({s},{w},{n},{e});
);
out geom;
"""

OVERPASS_BUILDINGS = """
[out:json][timeout:180];
way["building"]({s},{w},{n},{e});
out geom;
"""

# Higher number wins when classes overlap in a cell.
CLASS_ID = {"none": 0, "roadside": 1, "vacant": 2, "canal": 3, "park": 4}
CLASS_NAME = {v: k for k, v in CLASS_ID.items()}


def overpass(query, bbox, label):
    def go():
        w, s, e, n = bbox
        q = query.format(w=w, s=s, e=e, n=n)
        data = urllib.parse.urlencode({"data": q}).encode()
        last = None
        for attempt in range(2):
            for mirror in OVERPASS_MIRRORS:
                try:
                    req = urllib.request.Request(
                        mirror, data=data, headers={"User-Agent": UA})
                    res = json.load(urllib.request.urlopen(req, timeout=300))
                    log(f"  OSM {label} via {urllib.parse.urlparse(mirror).netloc}: "
                        f"{len(res.get('elements', []))} elements")
                    return res
                except Exception as e:  # noqa: BLE001 — any mirror failure means try the next
                    last = e
                    log(f"  OSM {urllib.parse.urlparse(mirror).netloc} failed: "
                        f"{type(e).__name__} {e}")
            if attempt == 0:
                log("  all Overpass mirrors failed; waiting 30s before one more pass")
                time.sleep(30)
        raise RuntimeError(f"every Overpass mirror failed: {last}")
    return go


def fetch_osm(region_id, bbox):
    """Land-use classes are required; the building mask is best-effort."""
    base = cached(f"osm_base_{region_id}.json",
                  overpass(OVERPASS_BASE, bbox, "base"))
    try:
        buildings = cached(f"osm_bld_{region_id}.json",
                           overpass(OVERPASS_BUILDINGS, bbox, "buildings"))
    except Exception as e:  # noqa: BLE001
        log(f"  ! buildings unavailable ({e}) — continuing without the mask")
        buildings = {"elements": []}
    return base, buildings


def osm_layers(osm_pair, grid):
    """Burn OSM features onto the grid as land-use classes plus a building mask."""
    base, blds = osm_pair
    to_utm = pyproj.Transformer.from_crs("EPSG:4326", grid["crs"], always_xy=True).transform
    shape_out = (grid["rows"], grid["cols"])

    green, canal, roads, buildings = [], [], [], []
    for el in list(base.get("elements", [])) + list(blds.get("elements", [])):
        geom = el.get("geometry")
        if not geom or len(geom) < 2:
            continue
        pts = [(p["lon"], p["lat"]) for p in geom]
        tags = el.get("tags", {})
        try:
            if "building" in tags:
                if len(pts) >= 4:
                    buildings.append(shp_transform(to_utm, Polygon(pts)).buffer(0))
            elif "highway" in tags:
                # A plantable verge is roughly the first few metres beside the kerb.
                roads.append(shp_transform(to_utm, LineString(pts)).buffer(9))
            elif "waterway" in tags:
                canal.append(shp_transform(to_utm, LineString(pts)).buffer(25))
            elif len(pts) >= 4:
                green.append(shp_transform(to_utm, Polygon(pts)).buffer(0))
        except Exception:
            continue

    def burn(geoms, value):
        if not geoms:
            return np.zeros(shape_out, dtype="uint8")
        return rasterize(
            ((g, value) for g in geoms if not g.is_empty),
            out_shape=shape_out, transform=grid["transform"],
            fill=0, dtype="uint8", all_touched=True,
        )

    landuse = np.zeros(shape_out, dtype="uint8")
    for geoms, cls in (
        (roads, "roadside"), (green, "park"), (canal, "canal"),
    ):
        burned = burn(geoms, CLASS_ID[cls])
        landuse = np.maximum(landuse, burned)

    built = burn(buildings, 1).astype(bool)
    return landuse, built


# --------------------------------------------------------------------------
# Population
# --------------------------------------------------------------------------

def read_population(bbox, grid):
    """WorldPop 2020 constrained, 100 m, people per pixel -> people per hectare."""
    from config import WORLDPOP_PAK
    from cogs import read_window
    try:
        pop, tr, crs, nodata = read_window(WORLDPOP_PAK, bbox)
    except Exception as e:
        log(f"  ! population read failed: {e}")
        return None
    pop = np.where((pop < 0) | (pop == nodata), np.nan, pop)
    # WorldPop pixels are ~100 m = 1 ha, so people-per-pixel is already per hectare.
    return resample_to_grid(pop, tr, crs, grid)


# --------------------------------------------------------------------------
# Species matching — on site context, never on climate
# --------------------------------------------------------------------------

def match_species(landuse_name, width_m):
    """
    NASA POWER and Open-Meteo were the original plan here and they cannot work:
    their grids are ~50 km, so Model Town, Gulberg and DHA return byte-identical
    values and every site would get the same tree. Site context is what actually
    varies between one pin and the next.
    """
    for sp in SPECIES:
        if landuse_name in sp["landuse"] and width_m >= sp["min_width_m"]:
            return sp
    return SPECIES[0]


# --------------------------------------------------------------------------
# Per-region run
# --------------------------------------------------------------------------

def run_region(region_id):
    cfg = REGIONS[region_id]
    bbox = cfg["bbox"]
    log(f"=== {cfg['name']} ===")
    grid = build_grid(bbox)
    log(f"  grid {grid['cols']}x{grid['rows']} @ {CELL_M} m")

    # --- NDVI per year, fixed season window ---
    ndvi_by_year, ndvi_scenes = {}, {}
    for year in CANDIDATE_YEARS:
        picks = find_scene("sentinel-2-l2a", STAC_S2, bbox, year, NDVI_WINDOW,
                           NDVI_MAX_CLOUD, target=NDVI_TARGET,
                           limit=NDVI_COMPOSITE_SCENES)
        if not picks:
            log(f"  {year} NDVI: no usable scene in window — dropped")
            continue

        layers = []
        for it in picks:
            def read_one(it=it):
                a = it["assets"]
                arr, tr, crs = ndvi_from(
                    a["red"]["href"], a["nir"]["href"], a["scl"]["href"], bbox)
                return resample_to_grid(arr, tr, crs, grid)
            try:
                # Cached: COG reads are the slow part and must never be repeated.
                layers.append(cached_grid(f"ndvi_{region_id}_{year}_{it['id']}", read_one))
            except Exception as e:
                log(f"    {it['id'][:28]}: read failed ({e})")
        if not layers:
            log(f"  {year} NDVI: every scene failed to read — dropped")
            continue

        # Maximum-value composite. Cloud and haze both depress NDVI, so the
        # per-cell maximum across the window's scenes rejects both. All-NaN
        # cells stay NaN, which is what we want: a gap must read as a gap.
        with np.errstate(all="ignore"):
            cells = np.nanmax(np.stack(layers), axis=0)
        item = picks[0]

        good = np.isfinite(cells).mean()
        if good < 0.6:
            log(f"  {year} NDVI: only {good:.0%} of cells usable — dropped")
            continue
        ndvi_by_year[year] = cells
        ndvi_scenes[year] = {
            "id": item["id"],
            "date": item["properties"]["datetime"][:10],
            "cloud": round(item["properties"].get("eo:cloud_cover", 0), 2),
            "composited": len(layers),
            "dates": [i["properties"]["datetime"][:10] for i in picks[:len(layers)]],
        }
        log(f"  {year} NDVI: composite of {len(layers)} "
            f"({', '.join(ndvi_scenes[year]['dates'])}) "
            f"veg {100*np.nanmean(cells >= NDVI_VEG_THRESHOLD):.1f}%")

    if not ndvi_by_year:
        raise SystemExit(f"no usable NDVI for {region_id}")
    years = sorted(ndvi_by_year)

    # --- Surface temperature, most recent year with a usable scene ---
    lst_cells, lst_scene = None, None
    for year in reversed(CANDIDATE_YEARS):
        item = find_scene("landsat-c2-l2", STAC_MPC, bbox, year, LST_WINDOW, LST_MAX_CLOUD,
                          {"platform": {"in": ["landsat-8", "landsat-9"]}}, target=LST_TARGET)
        if not item:
            continue
        def read_lst_cells(item=item):
            arr, tr, crs = lst_celsius_from(mpc_sign(item["assets"]["lwir11"]["href"]), bbox)
            return resample_to_grid(arr, tr, crs, grid)

        try:
            cells = cached_grid(f"lst_{region_id}_{year}_{item['id']}", read_lst_cells)
        except Exception as e:
            log(f"  {year} LST: read failed ({e})")
            continue
        if np.isfinite(cells).mean() < 0.6:
            continue
        lst_cells = cells
        lst_scene = {
            "id": item["id"],
            "datetime": item["properties"]["datetime"][:16].replace("T", " ") + " UTC",
            "cloud": round(item["properties"].get("eo:cloud_cover", 0), 2),
        }
        log(f"  LST: {lst_scene['datetime']} median {np.nanmedian(cells):.1f} C")
        break
    if lst_cells is None:
        raise SystemExit(f"no usable LST for {region_id}")

    # --- Land use and buildings ---
    log("  fetching OpenStreetMap...")
    osm_pair = fetch_osm(region_id, bbox)
    landuse, built = osm_layers(osm_pair, grid)
    log(f"  plantable classes on {100*(landuse>0).mean():.1f}% of cells, "
        f"buildings on {100*built.mean():.1f}%")

    # --- Population ---
    log("  reading WorldPop...")
    pop = read_population(bbox, grid)
    if pop is None:
        pop = np.zeros_like(lst_cells)

    # --- Score ---
    latest, earliest = years[-1], years[0]
    ndvi_now = ndvi_by_year[latest]
    ndvi_then = ndvi_by_year[earliest]

    finite = np.isfinite(lst_cells)
    # Shaded baseline: the temperature of well-vegetated cells in this region.
    veg_mask = finite & (ndvi_now >= 0.45)
    baseline = float(np.nanmedian(lst_cells[veg_mask])) if veg_mask.sum() > 20 \
        else float(np.nanpercentile(lst_cells[finite], 10))

    heat_need = np.clip((lst_cells - baseline) / 8.0, 0, 1)
    canopy_absence = np.clip((NDVI_VEG_THRESHOLD + 0.15 - ndvi_now) / 0.45, 0, 1)
    pop_norm = np.clip(pop / max(np.nanpercentile(pop, 95), 1e-6), 0, 1)

    score = (WEIGHTS["heat"] * np.nan_to_num(heat_need)
             + WEIGHTS["canopy"] * np.nan_to_num(canopy_absence)
             + WEIGHTS["people"] * np.nan_to_num(pop_norm))

    plantable = (landuse > 0) & (~built) & finite & np.isfinite(ndvi_now)
    score = np.where(plantable, score, np.nan)

    # --- Sites: the best cells, spaced out so they do not clump ---
    sites = []
    order = np.argsort(np.where(np.isnan(score), -1, score).ravel())[::-1]
    taken = np.zeros_like(score, dtype=bool)
    to_wgs = pyproj.Transformer.from_crs(grid["crs"], "EPSG:4326", always_xy=True).transform
    for flat in order:
        if len(sites) >= 40:
            break
        r, c = divmod(int(flat), grid["cols"])
        if not plantable[r, c] or np.isnan(score[r, c]):
            continue
        if taken[max(0, r-2):r+3, max(0, c-2):c+3].any():
            continue
        taken[r, c] = True
        x, y = rasterio.transform.xy(grid["transform"], r, c)
        lon, lat = to_wgs(x, y)
        cls = CLASS_NAME[int(landuse[r, c])]
        width = {"roadside": 6, "canal": 20, "park": 40, "vacant": 20}.get(cls, 6)
        sp = match_species(cls, width)
        sites.append({
            "id": f"{region_id}-{r}-{c}",
            "lon": round(lon, 5), "lat": round(lat, 5),
            "score": round(float(score[r, c]), 3),
            "lstC": round(float(lst_cells[r, c]), 1),
            "baselineC": round(baseline, 1),
            "ndvi": round(float(ndvi_now[r, c]), 3),
            "peopleServed": int(round(float(np.nansum(
                pop[max(0, r-3):r+4, max(0, c-3):c+4])))),
            "areaM2": CELL_M * CELL_M,
            "landuse": cls,
            "terms": {
                "heat": round(float(heat_need[r, c]), 3),
                "canopy": round(float(canopy_absence[r, c]), 3),
                "people": round(float(pop_norm[r, c]), 3),
            },
            "species": {"common": sp["common"], "botanical": sp["botanical"],
                        "because": sp["because"]},
        })
    log(f"  {len(sites)} sites ranked")

    # --- Write ---
    os.makedirs(OUT, exist_ok=True)
    w, s, e, n = bbox
    q = lambda a, k: [None if not np.isfinite(v) else int(round(v * k))  # noqa: E731
                      for v in np.asarray(a).ravel()]

    # The analysis grid is metric (UTM). Rather than ship a projection library to
    # the browser, emit the grid's four corners in WGS84 and let the client
    # bilinearly interpolate cell corners. Over a few kilometres near the UTM
    # zone's central meridian the error is well under a metre.
    gl, gb, gr, gt = grid["bounds_utm"]
    corner = lambda x, y: [round(v, 6) for v in to_wgs(x, y)]  # noqa: E731
    grid_out = {
        "region": region_id, "name": cfg["name"],
        "bbox": [w, s, e, n],
        "cornersWgs84": {
            "tl": corner(gl, gt), "tr": corner(gr, gt),
            "bl": corner(gl, gb), "br": corner(gr, gb),
        },
        "boundsUtm": list(grid["bounds_utm"]), "utmEpsg": 32643,
        "cellM": CELL_M, "cols": grid["cols"], "rows": grid["rows"],
        "years": years,
        "ndvi": {str(y): q(ndvi_by_year[y], 100) for y in years},
        "lst": q(lst_cells, 10),
        "pop": q(pop, 10),
        "landuse": [int(v) for v in landuse.ravel()],
        "built": [int(v) for v in built.ravel()],
        "baselineC": round(baseline, 1),
    }
    with open(f"{OUT}/{region_id}.json", "w", encoding="utf-8") as f:
        json.dump(grid_out, f, separators=(",", ":"))

    with open(f"{OUT}/{region_id}-sites.json", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": [
            {"type": "Feature",
             "geometry": {"type": "Point", "coordinates": [s_["lon"], s_["lat"]]},
             "properties": {k: v for k, v in s_.items() if k not in ("lon", "lat")}}
            for s_ in sites]}, f, separators=(",", ":"))

    sz = os.path.getsize(f"{OUT}/{region_id}.json") / 1e6
    log(f"  wrote {region_id}.json ({sz:.1f} MB) and {region_id}-sites.json")

    return {
        "name": cfg["name"], "centre": list(cfg["centre"]), "zoom": cfg["zoom"],
        "years": years, "ndviScenes": ndvi_scenes, "lstScene": lst_scene,
        "baselineC": round(baseline, 1), "siteCount": len(sites),
    }


def main():
    targets = sys.argv[1:] or list(REGIONS)
    meta = {}
    for rid in targets:
        meta[rid] = run_region(rid)

    path = f"{OUT}/meta.json"
    existing = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = json.load(f).get("regions", {})
    existing.update(meta)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "generated": time.strftime("%Y-%m-%d"),
            "cellM": CELL_M,
            "weights": WEIGHTS,
            "ndviWindow": NDVI_WINDOW, "lstWindow": LST_WINDOW,
            "ndviVegThreshold": NDVI_VEG_THRESHOLD,
            "resolution": {"ndvi": "10 m / px", "lst": "100 m / px",
                           "pop": "100 m / px", "grid": f"{CELL_M} m / cell"},
            "regions": existing,
        }, f, indent=1)
    log(f"wrote {path}")


if __name__ == "__main__":
    main()
