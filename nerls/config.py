"""Static configuration: paths, grid definition, hazard weights and cut-offs.

Every number that influences a hazard value lives here or in the committed
reference data, so that a reviewer can see the whole model in one place.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

PACKAGE_DIR = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_DIR / "data"
REPO_ROOT = PACKAGE_DIR.parent

#: Cache for the assembled grid. Regenerated whenever the reference data or
#: the model constants change (the cache key covers both).
CACHE_DIR = Path(os.environ.get("NERLS_CACHE_DIR", REPO_ROOT / "data" / "cache"))

#: Directory a user drops an imported inventory / DEM into.
USER_DATA_DIR = Path(os.environ.get("NERLS_USER_DATA", REPO_ROOT / "data" / "user"))

#: Built frontend served by the API when present.
FRONTEND_DIST = Path(
    os.environ.get("NERLS_FRONTEND_DIST", REPO_ROOT / "frontend" / "dist")
)

#: Bump whenever the set of arrays a grid build produces changes, so that a
#: stale on-disk cache can never be served to a newer model.
CACHE_SCHEMA = 4

# --------------------------------------------------------------------------
# Grid
# --------------------------------------------------------------------------

#: Cell size in degrees. 0.04 deg is about 4.4 km north-south.
GRID_RES = float(os.environ.get("NERLS_GRID_RES", 0.04))

#: Grid envelope (min_lat, max_lat, min_lon, max_lon) covering all eight states
#: plus a margin so the interpolated surface has support at the edges.
GRID_ENVELOPE = (21.80, 29.60, 87.90, 97.60)

# --------------------------------------------------------------------------
# Terrain model
# --------------------------------------------------------------------------

#: Number of control points used by the inverse-distance interpolation.
IDW_NEIGHBOURS = 14

#: IDW exponent. Higher values make the surface follow individual control
#: points more closely (more local relief, more interpolation noise).
IDW_POWER = 2.6

#: Half-width of the moving window (in cells) for local relief / ruggedness.
#: At 0.04 deg, a half-width of 3 is a ~31 km window: wide enough to separate a
#: mountain belt from a valley floor rather than to resolve an individual slope.
RELIEF_WINDOW = 3

#: Half-width in cells of the central-difference stencil used for the regional
#: gradient. 2 cells is an ~18 km baseline.
SLOPE_BASELINE_CELLS = 2

#: Distance (km) at which terrain support is considered weakest.
SUPPORT_DISTANCE_KM = 60.0

#: Elevation band in which slope failure potential is highest (metres). Below
#: the lower bound the terrain is alluvial; above the upper bound freeze-thaw
#: and glacier processes dominate and shallow rainfall-triggered slides are
#: less frequent.
ELEV_BAND_START = 150.0
ELEV_BAND_FULL = 900.0
ELEV_BAND_FADE_START = 2800.0
ELEV_BAND_FADE_END = 4200.0

# --------------------------------------------------------------------------
# Susceptibility model
# --------------------------------------------------------------------------

#: Physical factor weights, summing to 1.0 (asserted in tests). The weighted
#: mean of these factors is multiplied by the elevation-band gate below.
FACTOR_WEIGHTS = {
    "slope": 0.30,
    "relief": 0.20,
    "material": 0.20,
    "rain_load": 0.18,
    "historical": 0.12,
}

FACTOR_LABELS = {
    "slope": "Regional steepness",
    "relief": "Regional relief",
    "material": "Geological erodibility",
    "rain_load": "Monsoon load",
    "historical": "Historical evidence",
}

FACTOR_ORDER = ("slope", "relief", "material", "rain_load", "historical")

#: The score is gated by where rainfall-triggered slope failure is physically
#: credible: ~0 in the alluvial plains, 1 through the landslide belt, falling
#: away again into permanent snow and ice. Without this gate a flood-plain cell
#: sitting 20 km from a mountain front inherits the front's steepness rank.
GATE_LABEL = "Terrain credibility (elevation band)"

#: Percentiles of the regional raw score that are mapped onto the index floor
#: and ceiling. The upper percentile is deliberately far up the tail: with a
#: 98th-percentile anchor the most hazardous cells all pile up at exactly 1.0
#: and become indistinguishable, while the closed-form rainfall inversion
#: degrades at S = 1. At the 99.9th percentile no cell reaches the ceiling.
#: The transform is affine, which keeps the factor contributions exactly
#: additive.
RESCALE_FIT_PERCENTILES = (2.0, 99.9)
INDEX_FLOOR = 0.04
INDEX_CEIL = 0.96

#: Ordinal severity cut-offs on the rescaled index. These are severity bands
#: for a relative index, NOT calibrated event probabilities.
CLASS_CUTS = ((0.80, "CRITICAL"), (0.60, "HIGH"), (0.40, "MODERATE"))
CLASS_LOW = "LOW"

# --------------------------------------------------------------------------
# Trigger model
# --------------------------------------------------------------------------

#: Multiplier on the climatological reference intensity at zero susceptibility.
THRESHOLD_AT_S0 = 1.35

#: Multiplier on the climatological reference intensity at full susceptibility.
THRESHOLD_AT_S1 = 0.50

#: Sharpness of the trigger response: R = 1 - (1 - S) ** (1 + GAMMA * tau).
TRIGGER_GAMMA = 1.20

#: Susceptibility is clamped below this value when inverting thresholds, so the
#: inversion stays finite on near-certain cells.
INVERSION_CLAMP = 0.98

#: Upper bound for a believable 72-hour rainfall total (mm). Thresholds above
#: this are reported as unreachable rather than as a number an operator might
#: mistake for an operational trigger.
PLAUSIBLE_72H_MM = 1200.0

#: Scenario multipliers offered when no live rainfall feed is configured.
SCENARIO_MULTIPLIERS = (1.0, 2.0, 3.0, 5.0)

#: How long a live rainfall response is reused before re-fetching (seconds).
RAINFALL_CACHE_TTL = 1800

#: Timeout for a live rainfall request (seconds).
RAINFALL_TIMEOUT = 12

#: After a failed live attempt, further attempts are suppressed for this long
#: (seconds). Without it a disconnected host pays the timeout once per point.
RAINFALL_RETRY_AFTER_FAILURE = 600

# --------------------------------------------------------------------------
# Uncertainty model
# --------------------------------------------------------------------------

UNCERTAINTY_MAX = 0.18
UNCERTAINTY_WEIGHTS = {"support": 0.5, "roughness": 0.3, "inventory": 0.2}

SUPPORT_GRADES = ((0.25, "A"), (0.45, "B"), (0.70, "C"))
SUPPORT_GRADE_WORST = "D"

# --------------------------------------------------------------------------
# Live rainfall provider (Open-Meteo). Disabled automatically when the network
# is not reachable; the engine then runs in seasonal-scenario mode.
# --------------------------------------------------------------------------

OPEN_METEO_URL = os.environ.get(
    "NERLS_RAINFALL_URL", "https://api.open-meteo.com/v1/forecast"
)
LIVE_RAINFALL_ENABLED = os.environ.get("NERLS_LIVE_RAINFALL", "auto").lower() != "off"

#: Optional OpenAI-compatible endpoint used for the narrative layer. No key is
#: bundled: without one the deterministic briefing template is used.
NARRATIVE_URL = os.environ.get(
    "NERLS_NARRATIVE_URL", "https://api.openai.com/v1/chat/completions"
)
NARRATIVE_MODEL = os.environ.get("NERLS_NARRATIVE_MODEL", "gpt-4o-mini")
NARRATIVE_KEY_ENV = "NERLS_NARRATIVE_KEY"
