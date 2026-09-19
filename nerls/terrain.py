"""Terrain surface and its derivatives.

The surface is a generalised ~4.4 km elevation field interpolated from the
committed control points (summits, passes, towns, context points). It is a
*large-scale* surface: it reproduces the regional pattern (Himalayan front,
plateau scarp, fold-belt ridges, valley floors) but it smooths local relief, so
slope and relief are converted to regional ranks and used as an index. When a
real DEM is imported through :mod:`nerls.importers`, these arrays are replaced
by DEM-derived slope, relief and curvature and nothing else changes.
"""

from __future__ import annotations

import numpy as np

from . import config
from .geo import (
    KM_PER_DEG_LAT,
    distance_to_nearest_km,
    inverse_distance_weights,
    km_per_deg_lon,
    percentile_rank,
    window_extent,
    window_std,
)
from .reference import Reference


def build_elevation(ref: Reference, lat2d: np.ndarray, lon2d: np.ndarray) -> np.ndarray:
    """Interpolate the generalised elevation surface in metres."""
    return inverse_distance_weights(
        lat2d.ravel(),
        lon2d.ravel(),
        ref.anchor_lat,
        ref.anchor_lon,
        ref.anchor_elevation,
        neighbours=config.IDW_NEIGHBOURS,
        power=config.IDW_POWER,
    ).reshape(lat2d.shape)


def elevate_with_dem(elevation: np.ndarray, lat2d: np.ndarray, lon2d: np.ndarray, dem_sampler) -> np.ndarray:
    """Replace the generalised surface with values from an imported DEM.

    ``dem_sampler`` is a callable ``(lat2d, lon2d) -> metres`` supplied by the
    importer. Cells the DEM cannot fill (nodata, outside its extent) keep their
    generalised value, and the count of filled cells is reported in the
    provenance block by the caller.
    """
    sampled = np.asarray(dem_sampler(lat2d, lon2d), dtype=np.float64)
    if sampled.shape != elevation.shape:
        raise ValueError("DEM sampler returned an array of the wrong shape")
    ok = np.isfinite(sampled)
    return np.where(ok, sampled, elevation)


def _central_difference(values: np.ndarray, half_width: int, axis: int) -> np.ndarray:
    """Central difference over a ±half_width cell baseline.

    np.gradient uses a ±1 cell stencil, which on a generalised surface turns
    interpolation noise into apparent steepness. A wider baseline measures the
    regional gradient, which is what a 4.4 km model can honestly report.
    """
    if half_width <= 0:
        return np.gradient(values, axis=axis)
    n = values.shape[axis]
    up = np.clip(np.arange(n) + half_width, 0, n - 1)
    down = np.clip(np.arange(n) - half_width, 0, n - 1)
    span = (up - down).astype(np.float64)
    span[span == 0] = 1.0

    if axis == 0:
        return (values[up, :] - values[down, :]) / span[:, None]
    return (values[:, up] - values[:, down]) / span[None, :]


def surface_derivatives(elevation: np.ndarray, res_deg: float, lat_axis: np.ndarray):
    """Regional gradient (m/km), local relief (km) and roughness (m)."""
    # Spacing in metres differs by axis, so the two derivatives are computed
    # separately rather than with a single scalar spacing.
    baseline = config.SLOPE_BASELINE_CELLS
    dlat_m = res_deg * baseline * KM_PER_DEG_LAT * 1000.0
    dlon_m = res_deg * baseline * km_per_deg_lon(lat_axis)[:, None] * 1000.0

    dz_dlat = _central_difference(elevation, baseline, axis=0) / dlat_m
    dz_dlon = _central_difference(elevation, baseline, axis=1) / np.maximum(dlon_m, 1.0)

    gradient_m_per_km = np.sqrt(dz_dlat**2 + dz_dlon**2) * 1000.0
    relief_km = window_extent(elevation, config.RELIEF_WINDOW) / 1000.0
    roughness_m = window_std(elevation, config.RELIEF_WINDOW)
    return gradient_m_per_km, relief_km, roughness_m


def _inside_envelope(lat2d: np.ndarray, lon2d: np.ndarray, env: tuple[float, float, float, float]) -> np.ndarray:
    min_lat, max_lat, min_lon, max_lon = env
    return (lat2d >= min_lat) & (lat2d <= max_lat) & (lon2d >= min_lon) & (lon2d <= max_lon)


def belt_material_factor(ref: Reference, lat2d: np.ndarray, lon2d: np.ndarray):
    """Return ``(material_factor, belt_index)`` per cell.

    Overlapping belt envelopes are resolved by the precedence list in the
    reference data, so narrow valley floors are not absorbed by the broad
    fold-belt envelope. Cells outside every envelope keep a neutral factor and
    ``belt_index = -1``.
    """
    material = np.full(lat2d.shape, 0.55, dtype=np.float64)
    index = np.full(lat2d.shape, -1, dtype=np.int16)

    belt_by_id = {b.id: b for b in ref.belts}
    for position, belt_id in enumerate(ref.belt_precedence):
        belt = belt_by_id[belt_id]
        inside = np.zeros(lat2d.shape, dtype=bool)
        for env in belt.envelopes:
            inside |= _inside_envelope(lat2d, lon2d, env)
        material[inside] = belt.erodibility
        index[inside] = position

    return material, index


def elevation_band_factor(elevation_m: np.ndarray) -> np.ndarray:
    """Where shallow, rainfall-triggered landsliding is most credible.

    Low alluvial ground has almost no slope-driven failure potential, mid
    elevations are the classic landslide belt, and above the fade-out the
    regime shifts to rock/ice processes that this model does not describe.
    """
    start, full = config.ELEV_BAND_START, config.ELEV_BAND_FULL
    fade_start, fade_end = config.ELEV_BAND_FADE_START, config.ELEV_BAND_FADE_END

    rising = np.clip((elevation_m - start) / max(full - start, 1.0), 0.0, 1.0)
    fade = np.clip((fade_end - elevation_m) / max(fade_end - fade_start, 1.0), 0.0, 1.0)
    # Floor the rising limb so valley floors still carry a small non-zero term
    # (terrace edges and cut slopes do fail) rather than exactly zero.
    rising = 0.06 + 0.94 * rising
    return np.clip(rising * fade, 0.0, 1.0)


def build_terrain(
    ref: Reference,
    lat_axis: np.ndarray,
    lon_axis: np.ndarray,
    mask: np.ndarray,
    elevation_override: np.ndarray | None = None,
):
    """Assemble every terrain-derived array the hazard model needs.

    ``elevation_override`` replaces the generalised surface with an imported DEM
    (cells the DEM cannot fill keep the interpolated value). Every derivative is
    then recomputed from that elevation, so slope and relief come from the DEM.
    """
    lat2d, lon2d = np.meshgrid(lat_axis, lon_axis, indexing="ij")

    elevation = build_elevation(ref, lat2d, lon2d)
    if elevation_override is not None:
        override = np.asarray(elevation_override, dtype=np.float64)
        if override.shape != elevation.shape:
            raise ValueError(
                f"elevation override has shape {override.shape}, expected {elevation.shape}"
            )
        usable = np.isfinite(override)
        elevation = np.where(usable, override, elevation)
    slope_m_per_km, relief_km, roughness_m = surface_derivatives(
        elevation, config.GRID_RES, lat_axis
    )

    slope_index = percentile_rank(slope_m_per_km, mask)
    relief_index = percentile_rank(relief_km, mask)

    material, belt_index = belt_material_factor(ref, lat2d, lon2d)
    band = elevation_band_factor(elevation)

    control_lat = np.concatenate([ref.anchor_lat, ref.district_lat])
    control_lon = np.concatenate([ref.anchor_lon, ref.district_lon])
    support_km = distance_to_nearest_km(lat2d, lon2d, control_lat, control_lon)

    roughness_index = percentile_rank(roughness_m, mask)

    return {
        "lat2d": lat2d,
        "lon2d": lon2d,
        "elevation_m": elevation,
        "slope_m_per_km": slope_m_per_km,
        "relief_km": relief_km,
        "roughness_m": roughness_m,
        "slope_index": slope_index,
        "relief_index": relief_index,
        "roughness_index": roughness_index,
        "material": material,
        "belt_index": belt_index,
        "elevation_band": band,
        "support_km": support_km,
    }
