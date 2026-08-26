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
    "johar-town": {
        "name": "Johar Town",
        "bbox": (74.2500, 31.4500, 74.3050, 31.4980),
        "centre": (74.2775, 31.4740),
        "zoom": 13.2,
    },
    "iqbal-town": {
        "name": "Iqbal Town",
        "bbox": (74.2650, 31.4980, 74.3200, 31.5400),
        "centre": (74.2925, 31.5190),
        "zoom": 13.2,
    },
}

# How many ranked sites to publish per region, and how far apart they must sit.
# 40 read as thin over a whole neighbourhood; the ranking is a shortlist to
# survey, and a shortlist of forty for four square kilometres is too coarse to
# plan from. Separation stays wide enough that the list never returns the same
# block twice.
MAX_SITES = 120
MIN_SEPARATION_CELLS = 4  # 4 x 60 m = ~240 m

CANDIDATE_YEARS = list(range(2016, 2026))

# Leaf-on, pre-monsoon, consistently low cloud. Same window every year.
#
# Within the window we take the scene closest to NDVI_TARGET, NOT the least
# cloudy one. Picking by cloud alone let 2020 land on 2 April and 2021 on
# 3 March, and a month of phenological drift in spring changes NDVI more than
# a decade of tree loss does. Anchoring the day-of-year is what makes the
# year-to-year comparison mean anything.
NDVI_WINDOW = ("03-05", "04-25")
NDVI_TARGET = "04-01"
NDVI_MAX_CLOUD = 35
# How many scenes to composite per year. A single date cannot carry a
# multi-year claim here: Lahore's spring haze and its rainfall-driven green-up
# swung Model Town's vegetated fraction 34% -> 23% -> 8% -> 47% across
# 2017-2020 on nearly identical calendar dates. Haze and cloud both *depress*
# NDVI, so a per-pixel maximum-value composite over several scenes suppresses
# them. This is the standard treatment, and it is why the cloud threshold above
# can be relaxed: the compositing does the rejecting.
NDVI_COMPOSITE_SCENES = 3

# Pre-monsoon peak heat, consistently clear skies. Same window every year.
# Landsat overpasses Lahore mid-morning (~05:30 UTC / 10:30 local), so this is
# morning surface temperature, not peak afternoon heat. Stated in the UI.
LST_WINDOW = ("05-01", "06-30")
LST_TARGET = "06-01"
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
