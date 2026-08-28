"""
Checks on the pipeline's decision logic that need no network and no data.

    python pipeline/test_logic.py

These exist because the full run takes over an hour: a bug in the scoring or
the species matcher should surface in two seconds, not after the download.
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import NDVI_VEG_THRESHOLD, SPECIES, WEIGHTS  # noqa: E402
from run import diversity_report, match_species, species_benefits  # noqa: E402

BASELINE = 34.0


def score(lst, ndvi, pop_norm):
    """Mirrors run_region's scoring so the two can be compared by eye."""
    heat = np.clip((lst - BASELINE) / 8.0, 0, 1)
    canopy = np.clip((NDVI_VEG_THRESHOLD + 0.15 - ndvi) / 0.45, 0, 1)
    return (WEIGHTS["heat"] * heat
            + WEIGHTS["canopy"] * canopy
            + WEIGHTS["people"] * pop_norm)


def test_species_varies_by_context():
    """
    The whole reason species matching does not use climate: it has to give
    different answers for different sites. If this returns one tree for every
    context, the feature is decorative.
    """
    cases = [("roadside", 6, 0.10), ("median", 4, 0.10), ("canal", 20, 0.30),
             ("park", 40, 0.50), ("vacant", 20, 0.10), ("roadside", 2, 0.05)]
    picked = {match_species(c, w, n)["common"] for c, w, n in cases}
    assert len(picked) > 1, f"species matcher collapsed to {picked}"
    print(f"  species across {len(cases)} contexts: {sorted(picked)}")


def test_dry_narrow_roadside_gets_neem():
    """
    A sanity anchor on the forestry, not just the code. Neem is the workhorse
    for a dry, narrow, polluted Lahore verge. An earlier scoring bug rewarded
    whichever species needed the *least* room, which handed every such site to
    Moringa — a small, short-lived tree — and would have been worse advice than
    the monoculture it replaced.
    """
    assert match_species("roadside", 4, 0.08)["common"] == "Neem"
    assert match_species("canal", 18, 0.30)["common"] == "Arjun"
    assert match_species("park", 34, 0.50)["common"] == "Pipal"
    print("  dry verge -> Neem, canal -> Arjun, large park -> Pipal")


def test_diversity_breaks_monoculture():
    """
    120 near-identical roadside sites must not all get the same tree. Uniform
    avenue planting loses the whole street to a single pest or disease.
    """
    used = {}
    for i in range(120):
        sp = match_species("roadside", 4 + (i % 10), 0.06 + (i % 6) * 0.05, used, i)
        used[sp["common"]] = used.get(sp["common"], 0) + 1
    rep = diversity_report(used, 120)
    assert rep["count"] >= 3, f"only {rep['count']} species across 120 sites"
    assert rep["topShare"] <= 0.55, f"{rep['topSpecies']} takes {rep['topShare']:.0%}"
    print(f"  {rep['count']} species, top {rep['topSpecies']} {rep['topShare']:.0%}, "
          f"evenness {rep['evenness']}")


def test_benefits_scale_with_crown():
    """Benefits are one published coefficient x crown area — never per-species
    invented constants. So a bigger crown must always mean more of both."""
    from config import SPECIES as SP
    ordered = sorted(SP, key=lambda s: s["mature_crown_m"])
    co2 = [species_benefits(s)["co2KgPerYear"] for s in ordered]
    pm = [species_benefits(s)["pm25GPerYear"] for s in ordered]
    assert co2 == sorted(co2), "CO2 does not rise with crown size"
    assert pm == sorted(pm), "PM2.5 does not rise with crown size"
    print(f"  crown {ordered[0]['mature_crown_m']}m -> {co2[0]} kg CO2/yr, "
          f"{ordered[-1]['mature_crown_m']}m -> {co2[-1]} kg CO2/yr")


def test_species_table_is_coherent():
    for sp in SPECIES:
        assert sp["landuse"], f"{sp['common']} matches no land use"
        assert sp["min_width_m"] > 0
        assert sp["because"].strip()
    print(f"  {len(SPECIES)} species, each with land use, width and a reason")


def test_weights_sum_to_one():
    total = sum(WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9, f"weights sum to {total}"
    print(f"  weights {WEIGHTS} sum to 1")


def test_score_is_monotonic_in_each_term():
    assert score(44, 0.05, 1.0) > score(35, 0.60, 0.0)
    assert score(44, 0.6, 0) > score(35, 0.6, 0), "hotter must score higher"
    assert score(35, 0.05, 0) > score(35, 0.6, 0), "barer must score higher"
    assert score(35, 0.6, 1) > score(35, 0.6, 0), "more people must score higher"
    print("  each term moves the score in the right direction")


def test_quantisation_round_trips():
    """NDVI ships as an integer x100; the error must stay invisible."""
    vals = np.array([0.0, 0.2345, -0.4, 0.887, np.nan], dtype="float32")
    q = [None if not np.isfinite(v) else int(round(v * 100)) for v in vals]
    for a, b in zip(vals, [None if v is None else v / 100 for v in q]):
        if np.isfinite(a):
            assert abs(a - b) <= 0.005, (a, b)
    print("  ndvi x100 round-trips within 0.005")


def test_composite_rejects_haze():
    """
    A maximum-value composite must recover cells that one hazy scene lost.
    Haze depresses NDVI, so the max across scenes is the clean reading.
    """
    clean = np.array([[0.55, 0.42], [0.31, 0.60]], dtype="float32")
    hazy = np.array([[0.08, np.nan], [0.05, 0.09]], dtype="float32")
    with np.errstate(all="ignore"):
        comp = np.nanmax(np.stack([hazy, clean]), axis=0)
    assert np.allclose(comp, clean, equal_nan=True)
    # An all-NaN cell must stay NaN — a gap has to read as a gap.
    with np.errstate(all="ignore"):
        gap = np.nanmax(np.stack([
            np.array([[np.nan]], dtype="float32"),
            np.array([[np.nan]], dtype="float32"),
        ]), axis=0)
    assert np.isnan(gap[0, 0])
    print("  composite recovers hazy cells and preserves real gaps")


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_"):
            continue
        print(f"{name}:")
        try:
            fn()
        except AssertionError as e:
            failures += 1
            print(f"  FAILED: {e}")
    print("\nALL PASSED" if not failures else f"\n{failures} FAILED")
    sys.exit(1 if failures else 0)
