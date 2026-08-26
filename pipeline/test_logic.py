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
from run import match_species  # noqa: E402

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
    cases = [("roadside", 6), ("median", 4), ("canal", 20),
             ("park", 40), ("vacant", 20), ("roadside", 2)]
    picked = {match_species(c, w)["common"] for c, w in cases}
    assert len(picked) > 1, f"species matcher collapsed to {picked}"
    print(f"  species across {len(cases)} contexts: {sorted(picked)}")


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
