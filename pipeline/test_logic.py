"""
Checks on the pipeline's decision logic that need no network and no data.

    python pipeline/test_logic.py

These exist because the full run takes over an hour: a bug in the scoring, the
species matcher or the change-detection rules should surface in two seconds, not
after the download.

`run.py` is imported lazily, inside the tests that need it, because importing it
pulls in rasterio, pyproj and shapely. Those are only needed to read COGs, and
requiring the whole geospatial stack to check whether Neem beats Moringa on a dry
verge is what turns a two-second check into one nobody runs. The change-detection
rules in `change.py` need numpy alone for the same reason.
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import NDVI_VEG_THRESHOLD, SPECIES, WEIGHTS  # noqa: E402


def _run():
    """run.py's pure helpers, imported on demand — see the module docstring."""
    from run import diversity_report, match_species, species_benefits
    return diversity_report, match_species, species_benefits

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
    _, match_species, _ = _run()
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
    _, match_species, _ = _run()
    assert match_species("roadside", 4, 0.08)["common"] == "Neem"
    assert match_species("canal", 18, 0.30)["common"] == "Arjun"
    assert match_species("park", 34, 0.50)["common"] == "Pipal"
    print("  dry verge -> Neem, canal -> Arjun, large park -> Pipal")


def test_diversity_breaks_monoculture():
    """
    120 near-identical roadside sites must not all get the same tree. Uniform
    avenue planting loses the whole street to a single pest or disease.
    """
    diversity_report, match_species, _ = _run()
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
    _, _, species_benefits = _run()
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


def test_smog_season_is_excluded():
    """
    Nov-Feb passes must never drive change detection. Aerosol depresses NDVI
    across the whole scene, so a December pass shows loss everywhere and March
    shows recovery everywhere — both artefacts of the air, not the ground.
    """
    from change import in_smog_season
    for d in ("2025-11-14", "2025-12-30", "2026-01-08", "2026-02-27"):
        assert in_smog_season(d), d
    for d in ("2025-03-01", "2025-06-15", "2025-10-31"):
        assert not in_smog_season(d), d
    print("  Nov-Feb excluded, Mar-Oct kept")


def test_loss_needs_prior_vegetation():
    """
    A drop on ground that was never vegetated is not canopy loss. Without this,
    a parking lot going 0.10 -> 0.02 would be reported as trees coming down.
    """
    from change import loss_mask
    before = np.array([[0.60, 0.10]], dtype="float32")
    after = np.array([[0.20, 0.02]], dtype="float32")
    m = loss_mask(before, after)
    assert m[0, 0], "a vegetated cell that lost its signal must be flagged"
    assert not m[0, 1], "bare ground getting barer must not be flagged"
    print("  0.60->0.20 flagged, 0.10->0.02 ignored")


def test_unseen_cells_are_not_changes():
    """A cell we could not see is not a cell that changed."""
    from change import loss_mask
    before = np.array([[np.nan, 0.70]], dtype="float32")
    after = np.array([[0.10, np.nan]], dtype="float32")
    assert not loss_mask(before, after).any()
    print("  NaN on either side is never a change")


def test_single_cells_are_dropped():
    """
    One 60 m cell over the threshold is inside what noise, a shadow or a mown
    lawn can do. Three contiguous cells is about 1.1 ha — a real change.
    """
    from change import cluster_losses
    before = np.full((6, 6), 0.65, dtype="float32")
    after = before.copy()
    after[0, 0] = 0.05                 # lone cell, must be ignored
    after[3, 1:4] = 0.05               # three in a row, must be reported
    events = cluster_losses(before, after)
    assert len(events) == 1, f"expected one event, got {len(events)}"
    assert events[0]["cells"] == 3
    print(f"  lone cell ignored, 3-cell cluster reported "
          f"({events[0]['areaM2'] / 10_000:.2f} ha)")


def test_events_are_largest_first():
    """The list is read top-down by someone deciding what to go and look at."""
    from change import cluster_losses
    before = np.full((10, 10), 0.70, dtype="float32")
    after = before.copy()
    after[1, 1:4] = 0.05               # 3 cells
    after[5:9, 5:8] = 0.05             # 12 cells
    events = cluster_losses(before, after)
    assert len(events) == 2
    assert events[0]["cells"] > events[1]["cells"], "biggest event must come first"
    assert events[0]["severity"] == "severe"
    assert events[1]["severity"] == "notable"
    print(f"  {events[0]['cells']} cells (severe) before "
          f"{events[1]['cells']} cells (notable)")


def test_baseline_is_one_sided():
    """
    The 'before' reading is the per-cell maximum across earlier passes, so haze
    in one pass cannot manufacture a loss. It may miss a real event; for an
    accusation that is the correct way to be wrong.
    """
    from change import baseline_before, cluster_losses
    clear = np.full((4, 4), 0.70, dtype="float32")
    hazy = np.full((4, 4), 0.20, dtype="float32")   # same ground, bad air
    after = np.full((4, 4), 0.66, dtype="float32")  # essentially unchanged

    base = baseline_before([hazy, clear])
    assert np.allclose(base, clear), "the maximum must recover the clear reading"
    assert not cluster_losses(base, after), "an unchanged scene must raise nothing"

    # And taking the hazy pass alone would have invented a recovery, then a loss.
    assert cluster_losses(clear, hazy), "sanity: a real collapse is still detected"
    print("  haze cannot manufacture a loss; a real collapse still registers")


def test_hazy_scene_is_rejected_even_at_full_coverage():
    """
    The bug a real run found. On 2026-09-13 a Sentinel-2 pass over Model Town
    cleared the coverage floor and still reported the region as 2.3% vegetated,
    against ~40% on every neighbouring pass. Thin haze passes the cloud mask and
    depresses NDVI scene-wide, so comparing it against the earlier record turned a
    quarter of the neighbourhood into one 371 ha "canopy loss" event.

    Coverage cannot catch this: the pass was *visible*, it was just wrong. The
    guard is physical — a neighbourhood cannot lose a third of its vegetation in
    five days.
    """
    from change import new_pass, reject_hazy_scenes
    passes = []
    for date, veg in [("2026-08-16", 45.0), ("2026-08-29", 37.9), ("2026-09-05", 49.9),
                      ("2026-09-08", 51.3), ("2026-09-13", 2.3)]:
        p = new_pass(f"S2_{date}", date, 5.0)
        p.update(usable=True, coverage=1.0, vegPct=veg, meanNdvi=veg / 100)
        passes.append(p)

    rejected = reject_hazy_scenes(passes)
    assert len(rejected) == 1, [r["date"] for r in rejected]
    assert rejected[0]["date"] == "2026-09-13"
    assert "haze" in rejected[0]["reason"]
    # The figures stay on the record: they are the evidence for the rejection.
    assert rejected[0]["vegPct"] == 2.3
    # And nothing plausible was taken with it.
    assert [p["date"] for p in passes if p["usable"]] == [
        "2026-08-16", "2026-08-29", "2026-09-05", "2026-09-08"]
    print(f"  2.3% vs a 40%-ish median -> rejected; the other four kept")


def test_normal_seasonal_variation_survives():
    """
    The haze guard must not eat real seasonal change. Model Town's vegetated share
    genuinely swings 24-49% across years, and a 120-day window spans pre-monsoon
    to green-up, so a pass at the low end of that is data, not an artefact.
    """
    from change import new_pass, reject_hazy_scenes
    passes = []
    for date, veg in [("2026-05-18", 36.4), ("2026-06-10", 27.1), ("2026-07-10", 41.0),
                      ("2026-08-29", 37.9), ("2026-09-08", 51.3)]:
        p = new_pass(f"S2_{date}", date, 2.0)
        p.update(usable=True, coverage=1.0, vegPct=veg, meanNdvi=veg / 100)
        passes.append(p)
    assert reject_hazy_scenes(passes) == [], "seasonal lows must not be called haze"
    print("  27.1% against a 37.9% median is kept — that is a season, not haze")


def test_haze_guard_needs_enough_passes_to_judge():
    """With one or two passes there is no median worth comparing against, so it
    does nothing rather than guessing which of two readings is the liar."""
    from change import new_pass, reject_hazy_scenes
    def mk(date, veg):
        p = new_pass(f"S2_{date}", date, 1.0)
        p.update(usable=True, coverage=1.0, vegPct=veg, meanNdvi=veg / 100)
        return p
    assert reject_hazy_scenes([mk("2026-09-08", 40.0), mk("2026-09-13", 2.0)]) == []
    print("  two passes -> no judgement made")


def test_baseline_is_bounded_to_recent_passes():
    """
    The other bug the real run found. Taking the maximum over every pass in a
    120-day window builds a seasonal envelope — each cell at its greenest all
    summer — so a cell merely at its September low against a June peak read as
    loss. Bounded to the last few passes, "before" means what the ground was
    recently like.
    """
    from change import baseline_before, cluster_losses
    june = np.full((8, 8), 0.75, dtype="float32")     # peak green
    august = np.full((8, 8), 0.45, dtype="float32")   # settled lower
    september = np.full((8, 8), 0.44, dtype="float32")  # essentially unchanged

    # Unbounded: the June peak becomes the reference and the whole scene "drops".
    wide = baseline_before([june, august, august])
    assert cluster_losses(wide, september), "the unbounded envelope should flag loss"

    # Bounded to the two most recent: nothing has actually changed.
    narrow = baseline_before([june, august, august], keep=2)
    assert not cluster_losses(narrow, september), "a bounded baseline must not flag it"
    print("  June peak excluded by keep=2, so a steady September is not 'loss'")


def test_a_pass_must_earn_being_usable():
    """
    A pass starts unusable and has to clear the coverage floor. Getting this
    backwards is the failure that matters: a pass wrongly marked usable feeds the
    change detector, and "loss" appears wherever it simply could not see.
    """
    from change import classify_pass, new_pass
    rec = new_pass("S2X_test", "2026-07-10", 4.2)
    assert rec["usable"] is False, "a pass must not start out usable"
    assert rec["coverage"] is None and rec["vegPct"] is None

    good = np.full((10, 10), 0.42, dtype="float32")
    classify_pass(rec, good)
    assert rec["usable"] is True
    assert rec["coverage"] == 1.0
    assert rec["vegPct"] == 100.0, rec["vegPct"]
    assert abs(rec["meanNdvi"] - 0.42) < 0.001
    print(f"  full coverage -> usable, veg {rec['vegPct']}%, mean {rec['meanNdvi']}")


def test_partly_visible_pass_is_rejected_with_a_reason():
    """
    Below the coverage floor a pass cannot be compared. The reason has to be
    human-readable, because the UI shows it rather than hiding the gap.
    """
    from change import classify_pass, new_pass
    from config import RECENT_MIN_COVERAGE
    cells = np.full((10, 10), np.nan, dtype="float32")
    cells[:3, :] = 0.5                      # 30% visible, under the floor
    rec = classify_pass(new_pass("S2X", "2026-07-10", 1.0), cells)
    assert rec["usable"] is False
    assert "visible" in (rec["reason"] or ""), rec["reason"]
    assert rec["coverage"] == 0.3
    assert rec["vegPct"] is None, "an unusable pass must not publish a figure"
    print(f"  {rec['coverage']:.0%} visible (floor {RECENT_MIN_COVERAGE:.0%}) "
          f"-> rejected: {rec['reason']}")


def test_smog_and_read_failures_stay_in_the_record():
    """
    Unusable passes are kept and labelled, never dropped. An unexplained gap in
    the pass strip looks like a bug, and "we could not see the ground" is itself
    the finding during smog season.
    """
    from change import new_pass, read_failed, smog_skip
    smog = smog_skip(new_pass("S2X", "2026-01-12", 8.0))
    assert smog["usable"] is False and "smog" in smog["reason"]

    failed = read_failed(new_pass("S2Y", "2026-07-10", 2.0), TimeoutError("slow"))
    assert failed["usable"] is False and "TimeoutError" in failed["reason"]
    print(f"  kept and labelled: {smog['reason'][:34]}... / {failed['reason']}")


def test_recent_output_is_valid_browser_json():
    """
    The whole app once failed to load because Python wrote NaN into JSON and
    JSON.parse rejects it. Every figure this stage publishes goes through round()
    on a float, so the guard belongs here too, not only on the grid writer.
    """
    import json
    from change import classify_pass, cluster_losses, new_pass

    # A grid with real gaps, which is the case that produces NaN if unguarded.
    cells = np.full((8, 8), 0.55, dtype="float32")
    cells[0, :] = np.nan
    rec = classify_pass(new_pass("S2X", "2026-08-29", 3.0), cells)

    after = cells.copy()
    after[4:7, 2:5] = 0.05
    # event_record() is the shape the client actually reads; recent.py only adds
    # the projection, which is the one part that needs rasterio.
    from change import event_record
    events = [
        event_record(c, "model-town", 74.3239, 31.4805, "2026-08-29", "2026-09-08")
        for c in cluster_losses(cells, after)
    ]
    doc = {
        "region": "model-town",
        "passes": [rec, new_pass("S2Y", "2026-09-08", 0.0)],
        "events": events,
        "latestUsable": rec["date"],
    }
    # allow_nan=False is exactly what a browser's JSON.parse enforces.
    text = json.dumps(doc, allow_nan=False)
    assert "NaN" not in text and "Infinity" not in text
    reparsed = json.loads(text)
    assert reparsed["events"], "the fixture should produce at least one event"
    # Keys the client reads must all be present — see src/data/recent.ts.
    for key in ("id", "cells", "areaM2", "beforeNdvi", "afterNdvi", "dropNdvi", "severity"):
        assert key in reparsed["events"][0], key
    print(f"  {len(text)} bytes of strict JSON, {len(reparsed['events'])} event(s), "
          "every client-side key present")


def test_diagonal_contact_is_not_one_event():
    """4-connected: diagonal-only contact is a weak basis for one event."""
    from change import label_components
    mask = np.array([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ], dtype=bool)
    assert len(label_components(mask)) == 3
    print("  three diagonal cells stay three components")


if __name__ == "__main__":
    failures = 0
    skipped = []
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_"):
            continue
        print(f"{name}:")
        try:
            fn()
        except AssertionError as e:
            failures += 1
            print(f"  FAILED: {e}")
        except ModuleNotFoundError as e:
            # rasterio and friends are only needed to read COGs. Missing them
            # must not stop the checks that need numpy alone from reporting —
            # otherwise one absent optional dependency hides every result after
            # it, which is how a real failure goes unnoticed.
            skipped.append(f"{name} (needs {e.name})")
            print(f"  SKIPPED — {e.name} is not installed")

    if skipped:
        print(f"\n{len(skipped)} skipped for missing optional dependencies:")
        for s in skipped:
            print(f"  - {s}")
        print("  install them with: pip install rasterio pyproj shapely")

    print("\nALL PASSED" if not failures else f"\n{failures} FAILED")
    sys.exit(1 if failures else 0)
