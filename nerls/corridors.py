"""Corridor exposure analysis.

A landslide matters operationally when it closes a road that has no
alternative. This module samples the hazard field along each lifeline corridor,
finds the worst segment, and combines it with the corridor's criticality into a
single isolation-risk score.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from . import hazard
from .geo import densify, haversine_km
from .reference import CorridorRecord

#: Length of the worst-segment window used when reporting where a corridor is
#: most at risk (kilometres).
WORST_SEGMENT_KM = 8.0


def _sample_field(service, lat: np.ndarray, lon: np.ndarray, layer: str) -> np.ndarray:
    """Nearest-cell sampling of a grid layer along a path."""
    lat_axis, lon_axis = service.bundle.lat_axis, service.bundle.lon_axis
    i = np.clip(np.searchsorted(lat_axis, lat), 0, len(lat_axis) - 1)
    j = np.clip(np.searchsorted(lon_axis, lon), 0, len(lon_axis) - 1)
    grid = service.bundle.get(layer)
    values = grid[i, j].astype(float)
    inside = service.bundle.mask[i, j]
    values[~inside] = np.nan
    return values


def analyse_corridor(service, corridor: CorridorRecord, with_profile: bool = False) -> dict[str, Any]:
    wp_lat = np.asarray([w[0] for w in corridor.waypoints], dtype=np.float64)
    wp_lon = np.asarray([w[1] for w in corridor.waypoints], dtype=np.float64)

    lat, lon, distance = densify(wp_lat, wp_lon, spacing_km=2.0)
    risk_forward = _sample_field(service, lat, lon, "risk_forward")
    risk_now = _sample_field(service, lat, lon, "risk_now")
    susceptibility = _sample_field(service, lat, lon, "susceptibility")
    sigma = _sample_field(service, lat, lon, "sigma")

    finite = np.isfinite(risk_forward)
    total_km = float(distance[-1]) if distance.size else 0.0

    if finite.any():
        step_km = np.gradient(distance)
        high = (risk_forward >= 0.60) & finite
        critical = (risk_forward >= 0.80) & finite
        max_index = int(np.nanargmax(risk_forward))
        worst_position = (float(lat[max_index]), float(lon[max_index]))
        worst_risk = float(risk_forward[max_index])

        window = distance <= (distance[max_index] + WORST_SEGMENT_KM)
        window &= distance >= (distance[max_index] - WORST_SEGMENT_KM)
        segment_km = float(np.sum(step_km[window & finite]))
    else:
        high = np.zeros_like(risk_forward, dtype=bool)
        critical = high.copy()
        worst_position = (float(wp_lat[0]), float(wp_lon[0]))
        worst_risk = 0.0
        segment_km = 0.0

    criticality_weight = corridor.criticality / 3.0
    isolation_risk = criticality_weight * (worst_risk if finite.any() else 0.0)

    district = None
    grade = None
    if finite.any() and service.bundle.district_index is not None:
        lat_axis, lon_axis = service.bundle.lat_axis, service.bundle.lon_axis
        i = int(np.clip(np.searchsorted(lat_axis, worst_position[0]), 0, len(lat_axis) - 1))
        j = int(np.clip(np.searchsorted(lon_axis, worst_position[1]), 0, len(lon_axis) - 1))
        record = service.ref.districts[int(service.bundle.district_index[i, j])]
        district = {
            "district": record.district,
            "state": service.ref.state_names.get(record.state, record.state),
            "distance_to_hq_km": round(float(service.bundle.get("district_distance_km")[i, j]), 1),
        }
        grade = str(
            hazard.uncertainty(
                service.bundle.get("support_km"),
                service.bundle.get("roughness_index"),
                service.bundle.get("evidence_distance_km"),
                service.bundle.mask,
            ).grade[i, j]
        )

    payload: dict[str, Any] = {
        "id": corridor.id,
        "name": corridor.name,
        "mode": corridor.mode,
        "states": [
            service.ref.state_names.get(code, code) for code in corridor.states
        ],
        "criticality": corridor.criticality,
        "criticality_note": corridor.note,
        "length_km": round(total_km, 1),
        "waypoints": [
            {"latitude": w[0], "longitude": w[1], "name": w[2]} for w in corridor.waypoints
        ],
        "summary": {
            "max_risk": round(float(np.nanmax(risk_forward)), 4) if finite.any() else None,
            "mean_risk": round(float(np.nanmean(risk_forward)), 4) if finite.any() else None,
            "max_susceptibility": round(float(np.nanmax(susceptibility)), 4) if finite.any() else None,
            "km_in_high_or_above": round(float(np.sum(step_km[high])), 1) if finite.any() else 0.0,
            "km_in_critical": round(float(np.sum(step_km[critical])), 1) if finite.any() else 0.0,
            "share_high_or_above": round(float(np.sum(step_km[high]) / max(np.sum(step_km[finite]), 1e-6)), 4)
            if finite.any()
            else 0.0,
        },
        "worst_segment": {
            "latitude": round(worst_position[0], 4),
            "longitude": round(worst_position[1], 4),
            "risk": round(worst_risk, 4),
            "class": str(hazard.classify(worst_risk)),
            "window_km": WORST_SEGMENT_KM,
            "window_length_km": round(segment_km, 1),
            "district": district,
            "uncertainty_grade": grade,
        },
        "isolation_risk": round(float(isolation_risk), 4),
        "isolation_note": (
            "criticality weight (1-3 scaled to 0-1) multiplied by the highest forward risk on the corridor"
        ),
        "grid_cell_resolution_km": round(service.bundle.meta["grid"]["cell_area_km2"] ** 0.5, 1),
    }

    if with_profile:
        step = max(len(lat) // 120, 1)
        payload["profile"] = [
            {
                "distance_km": round(float(distance[k]), 1),
                "latitude": round(float(lat[k]), 4),
                "longitude": round(float(lon[k]), 4),
                "risk": None if not np.isfinite(risk_forward[k]) else round(float(risk_forward[k]), 4),
                "susceptibility": None if not np.isfinite(susceptibility[k]) else round(float(susceptibility[k]), 4),
                "sigma": None if not np.isfinite(sigma[k]) else round(float(sigma[k]), 4),
                "passed": round(float(risk_now[k]), 4) if np.isfinite(risk_now[k]) else None,
            }
            for k in range(0, len(lat), step)
        ]

    return payload
