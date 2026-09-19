"""Model-level tests: the published numbers must follow from the stated maths.

They run against the shipped reference dataset, so they double as a regression
test on the data files.
"""

from __future__ import annotations

import numpy as np
import pytest

from nerls import config
from nerls.hazard import (
    Rescale,
    classify,
    contributions,
    fit_rescale,
    risk,
    threshold_for_class,
)
from nerls.service import get_service

HIGH_CUT = {label: cut for cut, label in config.CLASS_CUTS}["HIGH"]


@pytest.fixture(scope="module")
def service():
    return get_service()


def test_classify_bands_are_ascending():
    values = np.array([0.10, 0.50, 0.70, 0.90])
    assert list(classify(values)) == ["LOW", "MODERATE", "HIGH", "CRITICAL"]


def test_fit_rescale_maps_the_fit_points_onto_floor_and_ceiling():
    raw = np.linspace(0.0, 1.0, 1001)
    mask = np.ones_like(raw, dtype=bool)
    rescale = fit_rescale(raw, mask)
    assert rescale.apply(np.array([rescale.low]))[0] == pytest.approx(rescale.floor, abs=1e-9)
    assert rescale.apply(np.array([rescale.high]))[0] == pytest.approx(rescale.ceil, abs=1e-9)
    assert rescale.scale > 0
    assert set(rescale.as_dict()) == {
        "raw_fit_low",
        "raw_fit_high",
        "scale",
        "constant",
        "index_floor",
        "index_ceil",
    }


def test_contributions_sum_exactly_to_the_unclipped_index():
    rescale = Rescale(low=0.0, high=0.8, floor=0.04, ceil=0.96)
    factors = {"slope": 0.9, "relief": 0.4, "material": 0.6, "rain_load": 0.7, "historical": 0.2}
    rows, residual = contributions(factors, rescale, gate=0.75)
    total = sum(row["contribution"] for row in rows) + residual["constant"]
    assert total == pytest.approx(residual["unclipped_index"], abs=1e-4)
    assert residual["gate"] == pytest.approx(0.75)
    assert [row["factor"] for row in rows][:1] == ["slope"], "rows are ordered by contribution"
    assert sum(row["weight"] for row in rows) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize("susceptibility", [0.2, 0.45, 0.7, 0.9])
def test_threshold_inversion_is_the_exact_inverse_of_risk(susceptibility):
    reference = 180.0
    needed = threshold_for_class(susceptibility, reference, HIGH_CUT)
    if susceptibility >= HIGH_CUT:
        # Already in the band before a drop of rain falls; documented as 0 mm.
        assert float(needed) == 0.0
    else:
        achieved = risk(susceptibility, needed, reference)
        assert float(achieved) == pytest.approx(HIGH_CUT, abs=1e-5)


def test_risk_is_monotone_in_rainfall_and_bounded():
    reference = 150.0
    low = float(risk(0.55, 10.0, reference))
    high = float(risk(0.55, 300.0, reference))
    assert 0.0 <= low <= high <= 1.0
    assert high > low


def test_index_does_not_saturate(service):
    """A percentile-fixed index must leave the top of its range usable."""
    bundle = service.bundle
    index = np.asarray(bundle.get("susceptibility"), dtype=np.float64)[bundle.mask]
    assert index.max() < 0.9999, "index saturates against the ceiling"
    assert index.min() > 0.0
    assert index.max() - index.min() > 0.8, "index range collapsed"


def test_floodplain_is_gated_below_the_hills(service):
    """Alluvial ground must not inherit mountain susceptibility."""
    guwahati = service.point(26.14, 91.74)["susceptibility"]["index"]
    sohra = service.point(25.27, 91.73)["susceptibility"]["index"]
    gangtok = service.point(27.33, 88.61)["susceptibility"]["index"]
    assert guwahati < 0.30 < sohra < gangtok


def test_point_payload_is_internally_consistent(service):
    point = service.point(25.27, 91.73)
    attribution = point["attribution"]
    assert attribution["exact"] is True
    order = {"LOW": 0, "MODERATE": 1, "HIGH": 2, "CRITICAL": 3}
    classes = [point["risk"]["now"]["class"]] + [
        row["class"] for row in point["risk"]["horizons"].values()
    ]
    assert all(order[a] <= order[b] for a, b in zip(classes, classes[1:]))
    thresholds = point["thresholds"]
    for band in ("MODERATE", "HIGH", "CRITICAL"):
        row = thresholds[band]
        assert row["rainfall_72h_mm"] >= 0.0
        assert isinstance(row["reached_without_rain"], bool)
        assert isinstance(row["plausible"], bool)
