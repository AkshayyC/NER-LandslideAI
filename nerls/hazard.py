"""The hazard model.

Susceptibility
--------------
Six physical factors, each normalised to ``[0, 1]``:

===============  ======================================================
factor           meaning
===============  ======================================================
slope            regional rank of surface steepness
relief           regional rank of local relief inside ~22 km
material         erodibility of the geological belt
rain_load        long-period monsoon load, annual rainfall / 6000 mm
historical       historical evidence field (kernel over known failures)
elevation_band   credibility of shallow rainfall-triggered failure by altitude
===============  ======================================================

The raw score is the weighted mean ``raw = sum(w_i * f_i)``. It is then mapped
onto ``[0.04, 0.96]`` with an **affine** transform fixed by the 2nd and 98th
percentile of the regional distribution. Affine matters: it keeps the factor
contributions exactly additive, so the attribution shown in the UI is not an
approximation of the model, it *is* the model rearranged.

Dynamic risk
------------
Rainfall acts as a multiplier on susceptibility through a trigger ratio

    tau = I / I_c(S),     I_c(S) = I_ref * (1.35 - 0.85 * S)

where ``I`` is the 72-hour rainfall accumulation and ``I_ref`` is the local
climatological reference intensity. Risk is

    R = 1 - (1 - S) ** (1 + GAMMA * tau)

so ``R = S`` when no rain is falling, risk rises monotonically with rainfall,
and ``R -> 1`` as rainfall becomes extreme. The relation is invertible in
closed form, which is what makes the rainfall-threshold margin possible:

    tau* = ( ln(1 - R_target) / ln(1 - S) - 1 ) / GAMMA
    I*   = tau* * I_c(S)

For a cell whose terrain index already lies inside the target band the inverse
is zero: the response marks those rows ``reached_without_rain`` rather than
reporting a bare ``0.0 mm``.

``I*`` is the 72-hour rainfall this specific cell needs in order to reach a
given severity class — the "how much rain would it take" number that turns a
static susceptibility map into an operational margin.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np

from . import config


# --------------------------------------------------------------------------
# Small numeric helpers
# --------------------------------------------------------------------------


def classify(value: float | np.ndarray):
    """Map an index or risk value onto the ordinal severity scale."""
    arr = np.asarray(value, dtype=np.float64)
    out = np.full(arr.shape, config.CLASS_LOW, dtype=object)
    # Ascending order matters: each band must be able to overwrite the one
    # below it, otherwise MODERATE erases CRITICAL.
    for cut, label in sorted(config.CLASS_CUTS, key=lambda item: item[0]):
        out = np.where(arr >= cut, label, out)
    if arr.ndim == 0:
        return str(out)
    return out


def clamp01(values):
    return np.clip(values, 0.0, 1.0)


# --------------------------------------------------------------------------
# Susceptibility
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Rescale:
    """Affine map from the raw weighted score to the reported index."""

    low: float
    high: float
    floor: float
    ceil: float

    @property
    def scale(self) -> float:
        span = self.high - self.low
        return (self.ceil - self.floor) / span if span > 1e-9 else 1.0

    @property
    def constant(self) -> float:
        return self.floor - self.low * self.scale

    def apply(self, raw: np.ndarray) -> np.ndarray:
        return clamp01(self.constant + raw * self.scale)

    def as_dict(self) -> dict[str, float]:
        return {
            # Named by role, not by percentile: the fit points live in
            # config.RESCALE_FIT_PERCENTILES and are reported alongside.
            "raw_fit_low": round(self.low, 6),
            "raw_fit_high": round(self.high, 6),
            "scale": round(self.scale, 6),
            "constant": round(self.constant, 6),
            "index_floor": self.floor,
            "index_ceil": self.ceil,
        }


def fit_rescale(raw: np.ndarray, mask: np.ndarray) -> Rescale:
    """Percentile-fixed affine rescale of the raw score.

    The fit points are :data:`config.RESCALE_FIT_PERCENTILES`. Fitting the top
    of the distribution keeps the most hazardous cells apart from each other
    instead of clamping them all to the ceiling.
    """
    pool = np.asarray(raw, dtype=np.float64)[np.asarray(mask, dtype=bool)]
    if pool.size == 0:
        return Rescale(0.0, 1.0, config.INDEX_FLOOR, config.INDEX_CEIL)
    low, high = np.percentile(pool, list(config.RESCALE_FIT_PERCENTILES))
    if high - low < 1e-6:
        high = low + 1e-6
    return Rescale(float(low), float(high), config.INDEX_FLOOR, config.INDEX_CEIL)


def raw_score(factors: Mapping[str, np.ndarray], gate=None) -> np.ndarray:
    """Terrain-credibility gate applied to the weighted mean of the factors."""
    total = None
    for name, weight in config.FACTOR_WEIGHTS.items():
        term = weight * np.asarray(factors[name], dtype=np.float64)
        total = term if total is None else total + term
    if total is None:  # pragma: no cover - weights are never empty
        raise ValueError("no factors supplied")
    if gate is not None:
        total = total * np.asarray(gate, dtype=np.float64)
    return total


def contributions(factors: Mapping[str, float], rescale: Rescale, gate: float = 1.0) -> tuple[list[dict[str, float]], dict[str, float]]:
    """Exact additive decomposition of the reported index.

    Each factor's contribution is ``scale * gate * weight * value`` in index
    units. The contributions plus the constant sum to the unclipped index, so
    the attribution displayed in the UI is the model rearranged, not an
    approximation of it. ``clipped`` reports the amount lost to the [0, 1]
    clamp, which is non-zero only for cells beyond the 98th percentile.
    """
    scale = rescale.scale
    rows: list[dict[str, float]] = []
    total = 0.0
    gate = float(gate)
    for name in config.FACTOR_ORDER:
        weight = config.FACTOR_WEIGHTS[name]
        value = float(factors[name])
        amount = weight * value * scale * gate
        total += amount
        rows.append(
            {
                "factor": name,
                "label": config.FACTOR_LABELS[name],
                "value": round(value, 4),
                "weight": weight,
                "contribution": round(amount, 5),
                "contribution_pct": 0.0,  # filled below, share of the index
            }
        )
    constant = rescale.constant
    unclipped = total + constant
    clipped = unclipped - float(np.clip(unclipped, 0.0, 1.0))

    denominator = float(np.clip(unclipped, 0.0, 1.0)) or 1.0
    for row in rows:
        row["contribution_pct"] = round(100.0 * row["contribution"] / denominator, 2)

    rows.sort(key=lambda r: -r["contribution"])
    return rows, {
        "constant": round(constant, 5),
        "gate": round(gate, 5),
        "gate_label": config.GATE_LABEL,
        "unclipped_index": round(unclipped, 5),
        "clipped": round(clipped, 6),
    }


# --------------------------------------------------------------------------
# Trigger and risk
# --------------------------------------------------------------------------


def threshold_intensity(susceptibility, reference_intensity):
    """``I_c(S)``: the 72-hour intensity that counts as a full trigger (mm)."""
    s = np.asarray(susceptibility, dtype=np.float64)
    i_ref = np.asarray(reference_intensity, dtype=np.float64)
    factor = config.THRESHOLD_AT_S0 - (config.THRESHOLD_AT_S0 - config.THRESHOLD_AT_S1) * s
    return np.maximum(factor, 1e-6) * np.maximum(i_ref, 1e-6)


def trigger_ratio(intensity, susceptibility, reference_intensity):
    return np.asarray(intensity, dtype=np.float64) / threshold_intensity(
        susceptibility, reference_intensity
    )


def risk(susceptibility, intensity, reference_intensity):
    """Dynamic risk ``R`` in ``[0, 1]``.

    The working value of susceptibility is capped at
    :data:`config.INVERSION_CLAMP`. Without that cap a cell at S = 1 is pinned
    to R = 1 for every rainfall amount, so the forward scenario would carry no
    information exactly where it matters most.
    """
    s = np.clip(np.asarray(susceptibility, dtype=np.float64), 0.0, config.INVERSION_CLAMP)
    tau = trigger_ratio(intensity, s, reference_intensity)
    exponent = 1.0 + config.TRIGGER_GAMMA * np.maximum(tau, 0.0)
    return clamp01(1.0 - np.power(np.maximum(1.0 - s, 1e-9), exponent))


def threshold_for_class(susceptibility, reference_intensity, target_risk: float):
    """72-hour rainfall (mm) needed for this cell to reach ``target_risk``.

    Exact inverse of :func:`risk`. Cells already at or above the target under
    zero rainfall return ``0.0``, which the API reports as "already exceeded".
    """
    s = np.clip(np.asarray(susceptibility, dtype=np.float64), 0.0, config.INVERSION_CLAMP)
    i_c = threshold_intensity(s, reference_intensity)

    numerator = np.log(np.maximum(1.0 - target_risk, 1e-9))
    denominator = np.log(np.maximum(1.0 - s, 1e-9))
    exponent = numerator / denominator
    tau = (exponent - 1.0) / config.TRIGGER_GAMMA
    return np.maximum(tau, 0.0) * i_c


def class_thresholds(susceptibility, reference_intensity) -> dict[str, np.ndarray]:
    """Rainfall needed to reach each severity band."""
    targets = {label: cut for cut, label in config.CLASS_CUTS}
    out = {label: threshold_for_class(susceptibility, reference_intensity, cut) for label, cut in targets.items()}
    # Reported in ascending order of severity.
    ordered = {"MODERATE": out["MODERATE"], "HIGH": out["HIGH"], "CRITICAL": out["CRITICAL"]}
    return ordered


# --------------------------------------------------------------------------
# Uncertainty
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Uncertainty:
    sigma: np.ndarray
    grade: np.ndarray
    components: dict[str, np.ndarray]

    def as_dict(self, index: tuple[int, int] | None = None) -> dict:
        if index is None:
            return {"sigma": self.sigma, "grade": self.grade}
        i, j = index
        return {
            "sigma": round(float(self.sigma[i, j]), 4),
            "grade": str(self.grade[i, j]),
            "components": {
                name: round(float(values[i, j]), 4) for name, values in self.components.items()
            },
        }


def uncertainty(
    support_km: np.ndarray,
    roughness_index: np.ndarray,
    distance_to_evidence_km: np.ndarray,
    mask: np.ndarray,
) -> Uncertainty:
    """Heuristic uncertainty on the reported risk.

    Three contributions, each normalised to ``[0, 1]``:

    * ``support``   — distance to the nearest terrain control point, saturating
      at :data:`config.SUPPORT_DISTANCE_KM`;
    * ``roughness`` — regional rank of local terrain variability, a proxy for
      how much the real terrain can differ from the generalised surface;
    * ``inventory`` — distance to the nearest known failure, saturating at
      100 km; where nothing has ever been recorded, the historical term of the
      model is extrapolation.

    This is a stated-band heuristic, not a statistical confidence interval, and
    is labelled as such everywhere it is displayed.
    """
    support = np.clip(np.asarray(support_km, dtype=np.float64) / config.SUPPORT_DISTANCE_KM, 0.0, 1.0)
    rough = np.clip(np.asarray(roughness_index, dtype=np.float64), 0.0, 1.0)
    gap = np.asarray(distance_to_evidence_km, dtype=np.float64)
    inventory_gap = np.clip(np.where(np.isfinite(gap), gap, 400.0) / 100.0, 0.0, 1.0)

    weights = config.UNCERTAINTY_WEIGHTS
    combined = (
        weights["support"] * support
        + weights["roughness"] * rough
        + weights["inventory"] * inventory_gap
    )
    sigma = config.UNCERTAINTY_MAX * np.clip(combined, 0.0, 1.0)

    grade = np.full(np.asarray(support).shape, config.SUPPORT_GRADE_WORST, dtype=object)
    for cut, label in config.SUPPORT_GRADES:
        grade = np.where(support <= cut, label, grade)

    sigma = np.where(mask, sigma, 0.0)
    return Uncertainty(
        sigma=sigma.astype(np.float32),
        grade=grade,
        components={"support": support, "roughness": rough, "inventory_gap": inventory_gap},
    )


GRADE_MEANING = {
    "A": "Terrain control within 15 km and dense evidence nearby.",
    "B": "Terrain control within about 27 km.",
    "C": "Terrain control within about 42 km; treat local detail with care.",
    "D": "No terrain control within 60 km; the surface here is interpolation.",
}


# --------------------------------------------------------------------------
# One-stop evaluation for a single location
# --------------------------------------------------------------------------


def evaluate_point(
    *,
    factors: Mapping[str, float],
    gate: float,
    rescale: Rescale,
    reference_intensity: float,
    intensity_now: float,
    intensity_horizons: Mapping[str, float],
    sigma: float,
    support_km: float,
    nearest_evidence_km: float | None,
    grade: str,
) -> dict:
    """Evaluate susceptibility, risk and thresholds for one location.

    Shared by the API and the tests so that the served numbers and the tested
    numbers can never drift apart.
    """
    raw = raw_score({k: np.array(v) for k, v in factors.items()}, gate=gate)
    index = float(rescale.apply(np.asarray(raw)))

    rows, residual = contributions(factors, rescale, gate=gate)

    ic = float(threshold_intensity(index, reference_intensity))
    tau = float(trigger_ratio(intensity_now, index, reference_intensity))
    risk_now = float(risk(index, intensity_now, reference_intensity))

    horizons = {
        name: {
            "intensity_mm": round(float(value), 1),
            "risk": round(float(risk(index, value, reference_intensity)), 4),
            "class": classify(float(risk(index, value, reference_intensity))),
            "tau": round(float(trigger_ratio(value, index, reference_intensity)), 3),
        }
        for name, value in intensity_horizons.items()
    }

    thresholds = {}
    baseline = classify(index)
    for label, value in class_thresholds(index, reference_intensity).items():
        needed = float(value)
        thresholds[label] = {
            "rainfall_72h_mm": round(needed, 1),
            "margin_mm": round(needed - float(intensity_now), 1),
            "exceeded": bool(needed <= float(intensity_now) + 1e-9),
            # A slope whose terrain index already sits in the band needs no
            # extra rain at all. Saying "0 mm" would read like a data error, so
            # the response states the reason.
            "reached_without_rain": bool(needed <= 1e-9),
            # A threshold far beyond anything the atmosphere delivers over
            # 72 hours is not an operational trigger; say so explicitly.
            "plausible": bool(needed <= config.PLAUSIBLE_72H_MM),
        }
    thresholds["baseline_class"] = baseline

    return {
        "susceptibility": {
            "raw_score": round(float(raw), 5),
            "index": round(index, 4),
            "class": classify(index),
        },
        "attribution": {
            "factors": rows,
            "residual": residual,
            "exact": abs(residual["clipped"]) < 1e-9,
        },
        "trigger": {
            "reference_intensity_mm": round(float(reference_intensity), 1),
            "threshold_intensity_mm": round(ic, 1),
            "intensity_now_mm": round(float(intensity_now), 1),
            "tau": round(tau, 3),
            "rainfall_ratio_of_threshold": round(tau, 3),
        },
        "risk": {
            "now": {
                "value": round(risk_now, 4),
                "class": classify(risk_now),
            },
            "horizons": horizons,
        },
        "thresholds": thresholds,
        "uncertainty": {
            "sigma": round(float(sigma), 4),
            "band_now": [
                round(max(risk_now - float(sigma), 0.0), 4),
                round(min(risk_now + float(sigma), 1.0), 4),
            ],
            "band_class_possible": [
                classify(max(risk_now - float(sigma), 0.0)),
                classify(min(risk_now + float(sigma), 1.0)),
            ],
            "grade": grade,
            "grade_meaning": GRADE_MEANING.get(grade, ""),
            "support_km": round(float(support_km), 1),
            "nearest_evidence_km": (
                round(float(nearest_evidence_km), 1)
                if nearest_evidence_km is not None and np.isfinite(nearest_evidence_km)
                else None
            ),
            "basis": "stated-band heuristic (terrain support, terrain variability, evidence density)",
        },
    }
