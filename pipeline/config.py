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
# Regions near a Sentinel-2 tile edge can have a year whose nearest scenes only
# partly cover them. Compositing is done adaptively: keep adding the next
# nearest scene until coverage clears the bar, because a hole in the raster
# reads as "no trees here" when it means "no data here".
NDVI_MAX_COMPOSITE_SCENES = 8
NDVI_MIN_COVERAGE = 0.92

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
# --------------------------------------------------------------------------
# Species
# --------------------------------------------------------------------------
#
# `mature_crown_m` is typical mature crown diameter for an open-grown street or
# park tree in central Punjab. Everything downstream — CO2, particulate capture,
# the shade footprint — is derived from that one number rather than from a pile
# of per-species constants we cannot defend.
#
# `drought` is tolerance of dry, compacted, low-irrigation ground (0-1).
# `water` is affinity for moist or periodically waterlogged ground (0-1).
# The two are deliberately separate: Moringa is drought-hardy AND dislikes wet
# feet, whereas Jamun tolerates both reasonably.
SPECIES = [
    {
        "common": "Neem",
        "botanical": "Azadirachta indica",
        "landuse": ["roadside", "median"],
        "min_width_m": 3,
        "mature_crown_m": 10,
        "drought": 0.90,
        "water": 0.15,
        "because": "Narrow strip, high pollution load, low water once established",
    },
    {
        "common": "Amaltas",
        "botanical": "Cassia fistula",
        "landuse": ["median", "roadside"],
        "min_width_m": 4,
        "mature_crown_m": 8,
        "drought": 0.75,
        "water": 0.30,
        "because": "Compacted soil and restricted root volume; tolerates road dust",
    },
    {
        "common": "Arjun",
        "botanical": "Terminalia arjuna",
        "landuse": ["canal", "roadside"],
        "min_width_m": 5,
        "mature_crown_m": 15,
        "drought": 0.35,
        "water": 0.95,
        "because": "Low-lying and periodically waterlogged ground",
    },
    {
        "common": "Pipal",
        "botanical": "Ficus religiosa",
        "landuse": ["park"],
        "min_width_m": 20,
        "mature_crown_m": 22,
        "drought": 0.60,
        "water": 0.45,
        "because": "Open ground with clearance from buildings and pipes",
    },
    {
        "common": "Jamun",
        "botanical": "Syzygium cumini",
        "landuse": ["park", "vacant", "canal"],
        "min_width_m": 8,
        "mature_crown_m": 14,
        "drought": 0.45,
        "water": 0.70,
        "because": "Open plot, dense general-purpose shade, supports birds",
    },
    {
        "common": "Sheesham",
        "botanical": "Dalbergia sissoo",
        "landuse": ["vacant", "park", "roadside"],
        "min_width_m": 6,
        "mature_crown_m": 12,
        "drought": 0.70,
        "water": 0.40,
        "because": "Native to Punjab's alluvial soils, good height and shade",
    },
    {
        "common": "Moringa",
        "botanical": "Moringa oleifera",
        "landuse": ["roadside", "vacant"],
        "min_width_m": 2,
        "mature_crown_m": 6,
        "drought": 0.95,
        "water": 0.10,
        "because": "Very drought hardy with a small footprint for tight spots",
    },
]

# How much of the ranking any one species may take before the matcher starts
# actively steering away from it. Uniform avenue planting is a real urban
# forestry failure mode: one pest or disease sweep takes out the whole street.
MAX_SPECIES_SHARE = 0.40

# --------------------------------------------------------------------------
# Estimated benefits
# --------------------------------------------------------------------------
#
# ESTIMATES, NOT MEASUREMENTS. Both are single published coefficients applied
# to a species' mature crown area, rather than per-species field data we do not
# have for Lahore. Stating one coefficient openly is more defensible than seven
# invented ones.
#
# CO2: anchored on the widely used urban-forestry figure of roughly 22 kg CO2
# per year for an average mature urban tree with an ~8 m crown (~50 m2), giving
# ~0.44 kg per m2 of crown per year.
CO2_KG_PER_M2_CROWN_YEAR = 0.44
#
# PM2.5: urban canopy particulate removal is commonly reported in the range of
# ~1-2 g per m2 of canopy per year in heavily polluted cities. We take the
# conservative end.
PM25_G_PER_M2_CROWN_YEAR = 1.2
#
# For the car-equivalent rollup: an average passenger car emits roughly
# 4.6 tonnes CO2 per year.
CAR_CO2_KG_PER_YEAR = 4600
