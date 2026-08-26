"""
Chhaon pipeline configuration.

The season windows below are the most important decision in this whole file.

NDVI in Lahore varies more between March and October of the *same year* than it
does between 2017 and 2025. If we composited whichever low-cloud scene we
happened to find each year, we would be measuring monsoon timing and calling it
tree loss. So every year is sampled from the same fixed window, and a year with
no usable scene inside its window is **dropped**, never substituted with a
different season.
"""

REGIONS = {
    "model-town": {
        "name": "Model Town",
        # west, south, east, north
        "bbox": (74.3000, 31.4650, 74.3450, 31.5000),
        "centre": (74.3239, 31.4805),
        "zoom": 13.4,
    },
    "gulberg": {
        "name": "Gulberg",
        "bbox": (74.3300, 31.4950, 74.3750, 31.5350),
        "centre": (74.3520, 31.5150),
        "zoom": 13.4,
    },
    "dha": {
        "name": "DHA",
        "bbox": (74.3750, 31.4450, 74.4550, 31.5000),
        "centre": (74.4150, 31.4725),
        "zoom": 12.9,
    },
}

CANDIDATE_YEARS = list(range(2016, 2026))

# Leaf-on, pre-monsoon, consistently low cloud. Same window every year.
NDVI_WINDOW = ("03-01", "04-30")
NDVI_MAX_CLOUD = 20

# Pre-monsoon peak heat, consistently clear skies. Same window every year.
# Landsat overpasses Lahore mid-morning (~05:30 UTC / 10:30 local), so this is
# morning surface temperature, not peak afternoon heat. Stated in the UI.
LST_WINDOW = ("05-01", "06-30")
LST_MAX_CLOUD = 20

# NDVI at or above this is treated as vegetated. 0.3 is the conventional
# threshold separating sparse/bare ground from real vegetation.
NDVI_VEG_THRESHOLD = 0.30

STAC_S2 = "https://earth-search.aws.element84.com/v1/search"
STAC_MPC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
MPC_SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2"
# The main Overpass instance is frequently overloaded (504). Mirrors are tried
# in order; all of them serve the same OSM data.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

# WorldPop constrained 2020, Pakistan, 100 m.
WORLDPOP_PAK = (
    "https://data.worldpop.org/GIS/Population/"
    "Global_2000_2020_Constrained/2020/BSGM/PAK/pak_ppp_2020_constrained.tif"
)

CACHE = "pipeline/.cache"
OUT = "public/data"

# Scoring weights. Shown openly in the UI — a hidden score is a score nobody
# trusts. They must sum to 1.
WEIGHTS = {"heat": 0.45, "canopy": 0.30, "people": 0.25}

# Everything a tree needs from us, and what each species tolerates.
# Grounded in Punjab Forest Department and University of Agriculture Faisalabad
# guidance for central Punjab urban forestry.
SPECIES = [
    {
        "common": "Neem",
        "botanical": "Azadirachta indica",
        "landuse": ["roadside", "median"],
        "min_width_m": 3,
        "because": "Narrow strip, high pollution load, low water once established",
    },
    {
        "common": "Amaltas",
        "botanical": "Cassia fistula",
        "landuse": ["median", "roadside"],
        "min_width_m": 4,
        "because": "Compacted soil and restricted root volume; tolerates road dust",
    },
    {
        "common": "Arjun",
        "botanical": "Terminalia arjuna",
        "landuse": ["canal"],
        "min_width_m": 5,
        "because": "Low-lying and periodically waterlogged ground",
    },
    {
        "common": "Pipal",
        "botanical": "Ficus religiosa",
        "landuse": ["park"],
        "min_width_m": 20,
        "because": "Open ground with clearance from buildings and pipes",
    },
    {
        "common": "Jamun",
        "botanical": "Syzygium cumini",
        "landuse": ["park", "vacant"],
        "min_width_m": 8,
        "because": "Open plot, dense general-purpose shade, supports birds",
    },
    {
        "common": "Sheesham",
        "botanical": "Dalbergia sissoo",
        "landuse": ["vacant", "park"],
        "min_width_m": 6,
        "because": "Native to Punjab's alluvial soils, good height and shade",
    },
    {
        "common": "Moringa",
        "botanical": "Moringa oleifera",
        "landuse": ["roadside", "vacant"],
        "min_width_m": 2,
        "because": "Very drought hardy with a small footprint for tight spots",
    },
]
