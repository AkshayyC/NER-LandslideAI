"""Grid assembly, caching and the query surface used by the API.

The whole regional grid is built once (about 45,000 cells at 0.04 degrees),
cached on disk keyed by a fingerprint of the reference data plus the model
constants, and then every request is a lookup or a cheap reduction over numpy
arrays. No endpoint reads a file per request and no endpoint can fail because a
dataset is missing: if the reference data is intact, every number is available.
"""

from __future__ import annotations

import hashlib
import json
import platform
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from . import MODEL_ID, __version__, config
from . import hazard, importers, inventory, rainfall, reference as reference_module, terrain
from .geo import distance_to_nearest_km, grid_axes, haversine_km, meshgrid
from .reference import Reference

GRID_FIELDS = {
    "susceptibility": "Susceptibility index",
    "risk": "Risk with current rainfall",
    "risk_forward": "Risk with the forward rainfall assumption",
    "uncertainty": "Uncertainty half-width (sigma)",
    "elevation": "Generalised elevation (m)",
    "evidence": "Historical evidence field",
}


def _hash_bytes(*parts: bytes) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part)
    return digest.hexdigest()[:16]


def _fingerprint(ref: Reference, imported_paths: Iterable[Path], month: int) -> str:
    payload = {
        "model": MODEL_ID,
        "version": __version__,
        "cache_schema": config.CACHE_SCHEMA,
        "grid": {
            "res": config.GRID_RES,
            "envelope": config.GRID_ENVELOPE,
            "relief_window": config.RELIEF_WINDOW,
            "idw": [config.IDW_NEIGHBOURS, config.IDW_POWER],
        },
        "weights": config.FACTOR_WEIGHTS,
        "bands": [config.ELEV_BAND_START, config.ELEV_BAND_FULL, config.ELEV_BAND_FADE_START, config.ELEV_BAND_FADE_END],
        "trigger": [config.THRESHOLD_AT_S0, config.THRESHOLD_AT_S1, config.TRIGGER_GAMMA],
        "index": [config.INDEX_FLOOR, config.INDEX_CEIL],
        "uncertainty": [config.UNCERTAINTY_MAX, config.UNCERTAINTY_WEIGHTS],
        "month": month,
        "reference_files": {
            name: Path(config.DATA_DIR / filename).stat().st_mtime_ns
            for name, filename in reference_module.REFERENCE_FILES.items()
        },
        "imported": {
            str(p): p.stat().st_mtime_ns for p in imported_paths if p.exists()
        },
    }
    return _hash_bytes(json.dumps(payload, sort_keys=True).encode("utf-8"))


@dataclass
class GridBundle:
    """Every array the engine can answer a question from."""

    lat_axis: np.ndarray
    lon_axis: np.ndarray
    mask: np.ndarray
    arrays: dict[str, np.ndarray] = field(default_factory=dict)
    rescale: hazard.Rescale = field(default_factory=lambda: hazard.Rescale(0.0, 1.0, 0.04, 0.96))
    district_index: np.ndarray | None = None
    meta: dict[str, Any] = field(default_factory=dict)
    fingerprint: str = ""

    # -- convenience -------------------------------------------------------

    @property
    def shape(self) -> tuple[int, int]:
        return self.mask.shape

    def get(self, name: str) -> np.ndarray:
        try:
            return self.arrays[name]
        except KeyError as exc:  # pragma: no cover - guarded by callers
            raise KeyError(f"unknown grid layer '{name}'") from exc

    def masked_values(self, name: str) -> np.ndarray:
        """Flat values of one layer over the mask, in row-major order."""
        return self.get(name)[self.mask]

    # -- persistence -------------------------------------------------------

    def _cache_paths(self, fingerprint: str) -> tuple[Path, Path]:
        base = config.CACHE_DIR
        return base / f"grid-{fingerprint}.npz", base / f"grid-{fingerprint}.json"

    def save(self) -> None:
        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        npz_path, json_path = self._cache_paths(self.fingerprint)
        payload = dict(self.arrays)
        payload["mask"] = self.mask
        payload["rescale_meta"] = np.asarray(
            [self.rescale.low, self.rescale.high, self.rescale.floor, self.rescale.ceil]
        )
        if self.district_index is not None:
            payload["district_index"] = self.district_index
        np.savez_compressed(npz_path, **payload)
        json_path.write_text(json.dumps(self.meta, indent=2), encoding="utf-8")


def _load_cached(fingerprint: str, lat_axis: np.ndarray, lon_axis: np.ndarray) -> GridBundle | None:
    npz_path, json_path = GridBundle(lat_axis, lon_axis, np.zeros((1, 1), dtype=bool))._cache_paths(
        fingerprint
    )
    if not (npz_path.exists() and json_path.exists()):
        return None
    try:
        with np.load(npz_path, allow_pickle=False) as data:
            arrays = {name: data[name] for name in data.files}
        meta = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    mask = arrays.pop("mask").astype(bool)
    rescale_meta = arrays.pop("rescale_meta")
    district_index = arrays.pop("district_index", None)

    if mask.shape != (len(lat_axis), len(lon_axis)):
        return None

    return GridBundle(
        lat_axis=lat_axis,
        lon_axis=lon_axis,
        mask=mask,
        arrays={name: value for name, value in arrays.items()},
        rescale=hazard.Rescale(*[float(v) for v in rescale_meta]),
        district_index=district_index,
        meta=meta,
        fingerprint=fingerprint,
    )


# --------------------------------------------------------------------------
# Building
# --------------------------------------------------------------------------


def build_bundle(
    ref: Reference | None = None,
    extra_inventory: list[Path] | None = None,
    now: datetime | None = None,
    use_cache: bool = True,
) -> GridBundle:
    """Assemble the regional grid."""
    ref = ref or reference_module.load()
    imported_paths = list(extra_inventory or [])
    now = now or datetime.now(timezone.utc)
    month = now.month

    lat_axis, lon_axis = grid_axes(config.GRID_ENVELOPE, config.GRID_RES)
    fingerprint = _fingerprint(ref, imported_paths, month)

    if use_cache:
        cached = _load_cached(fingerprint, lat_axis, lon_axis)
        if cached is not None:
            return cached

    lat2d, lon2d = meshgrid(lat_axis, lon_axis)
    mask = _region_mask(ref, lat2d, lon2d)

    started = time.perf_counter()
    origin = {
        "reference_files": reference_module.REFERENCE_FILES,
        "compiled": True,
    }

    dem_sampler, dem_info = importers.load_registered_sampler()
    elevation_override = None
    if dem_sampler is not None:
        elevation_override = dem_sampler(lat2d, lon2d)
        origin["dem"] = dem_info

    terr = terrain.build_terrain(ref, lat_axis, lon_axis, mask, elevation_override=elevation_override)
    months = rainfall.monthly_rainfall_grids(ref, lat2d, lon2d)

    records = inventory.catalogue_records(ref)
    imported_records: list[inventory.InventoryRecord] = []
    imported_files: list[str] = []
    for path in imported_paths:
        path = Path(path)
        if path.exists():
            imported_records.extend(inventory.read_inventory_file(path))
            imported_files.append(path.name)
    records = inventory.combine(records, imported_records)

    evidence, density, evidence_distance = inventory.evidence_fields(records, lat2d, lon2d)

    annual_mm = months.sum(axis=0)
    rain_load = np.clip(annual_mm / 6000.0, 0.0, 1.0)

    gate = terr["elevation_band"].astype(np.float32)

    factors = {
        "slope": terr["slope_index"].astype(np.float32),
        "relief": terr["relief_index"].astype(np.float32),
        "material": terr["material"].astype(np.float32),
        "rain_load": rain_load.astype(np.float32),
        "historical": evidence.astype(np.float32),
    }

    # Weighted factor mean, gated by where a rainfall-triggered slide is
    # physically credible. The gate is affine in the contributions, so the
    # attribution stays exact.
    raw = hazard.raw_score(factors, gate=gate)
    rescale = hazard.fit_rescale(raw, mask)
    susceptibility = rescale.apply(raw).astype(np.float32)

    reference_intensity = rainfall.reference_intensity(months, month, ref)
    reference_intensity = np.where(mask, reference_intensity, np.nan).astype(np.float32)

    intensity_now = rainfall.wet_window_mean(
        months, month, int(ref.trigger_reference.get("wet_window_days", 3))
    ).astype(np.float32)

    scen_mult = config.SCENARIO_MULTIPLIERS[-2] if len(config.SCENARIO_MULTIPLIERS) >= 2 else 3.0
    intensity_forward = (intensity_now * float(scen_mult)).astype(np.float32)

    risk_now = hazard.risk(susceptibility, intensity_now, reference_intensity).astype(np.float32)
    risk_forward = hazard.risk(susceptibility, intensity_forward, reference_intensity).astype(np.float32)

    unc = hazard.uncertainty(
        terr["support_km"], terr["roughness_index"], evidence_distance, mask
    )

    district_index, district_distance = _assign_districts(ref, lat2d, lon2d)

    elapsed = time.perf_counter() - started

    arrays = {
        "elevation_m": terr["elevation_m"].astype(np.float32),
        "slope_m_per_km": terr["slope_m_per_km"].astype(np.float32),
        "slope_index": factors["slope"],
        "relief_km": terr["relief_km"].astype(np.float32),
        "relief_index": factors["relief"],
        "roughness_index": terr["roughness_index"].astype(np.float32),
        "material": factors["material"],
        "belt_index": terr["belt_index"],
        "elevation_band": gate,
        "gate": gate,
        "support_km": terr["support_km"].astype(np.float32),
        "rain_annual_mm": annual_mm.astype(np.float32),
        "rain_load": factors["rain_load"],
        "evidence": evidence,
        "evidence_density": density,
        "evidence_distance_km": evidence_distance,
        "raw_score": raw.astype(np.float32),
        "susceptibility": susceptibility,
        "reference_intensity_mm": reference_intensity,
        "intensity_now_mm": np.where(mask, intensity_now, np.nan).astype(np.float32),
        "intensity_forward_mm": np.where(mask, intensity_forward, np.nan).astype(np.float32),
        "risk_now": risk_now,
        "risk_forward": risk_forward,
        "risk_delta": (risk_forward - risk_now).astype(np.float32),
        "sigma": unc.sigma,
        "district_distance_km": district_distance.astype(np.float32),
    }
    for month_index in range(12):
        arrays[f"rain_month_{month_index:02d}"] = months[month_index]
    # Canonical factor layers, so a point lookup can never disagree with the
    # names the model itself uses.
    for name, values in factors.items():
        arrays[f"factor_{name}"] = values.astype(np.float32)

    meta = {
        "model_id": MODEL_ID,
        "package_version": __version__,
        "built_at": now.isoformat(timespec="seconds"),
        "build_seconds": round(elapsed, 3),
        "grid": {
            "resolution_deg": config.GRID_RES,
            "envelope": list(config.GRID_ENVELOPE),
            "rows": int(mask.shape[0]),
            "cols": int(mask.shape[1]),
            "cells_total": int(mask.size),
            "cells_in_region": int(mask.sum()),
            "cell_area_km2": round((config.GRID_RES * 110.574) ** 2, 2),
        },
        "rescale": rescale.as_dict(),
        "month": month,
        "season": rainfall.seasonal_context(month, ref),
        "scenario_multiplier": float(scen_mult),
        "factors": {
            "weights": config.FACTOR_WEIGHTS,
            "labels": config.FACTOR_LABELS,
            "gate": config.GATE_LABEL,
        },
        "evidence": inventory.summarise(records, ref),
        # Positions of every catalogue/imported record. Small (one row per
        # record) and enough to attribute records to districts without
        # re-reading the inventory on each request.
        "record_points": [[round(r.lat, 4), round(r.lon, 4)] for r in records],
        "imported_files": imported_files,
        "terrain_source": (
            f"imported DEM ({dem_info['path']})"
            if dem_info
            else "generalised compiled control points (not a DEM)"
        ),
        "dem_import": dem_info,
        "rainfall_source": "compiled station climatology",
        "python": platform.python_version(),
        "fingerprint": fingerprint,
    }

    bundle = GridBundle(
        lat_axis=lat_axis,
        lon_axis=lon_axis,
        mask=mask,
        arrays=arrays,
        rescale=rescale,
        district_index=district_index,
        meta=meta,
        fingerprint=fingerprint,
    )

    if use_cache:
        try:
            bundle.save()
        except OSError:
            pass  # a read-only checkout must still serve

    return bundle


#: Radius of the collar drawn around every district headquarters. The
#: generalised outline is a hand-traced polygon; the collar guarantees that a
#: district which exists in the gazetteer is never excluded by a tracing error,
#: and it keeps the sparse high-relief districts (Dibang Valley, Anjaw) whole.
DISTRICT_COLLAR_KM = 55.0


def _region_mask(ref: Reference, lat2d: np.ndarray, lon2d: np.ndarray) -> np.ndarray:
    from .geo import point_in_polygons

    polygon = point_in_polygons(lat2d, lon2d, ref.outline)
    collar = (
        distance_to_nearest_km(lat2d, lon2d, ref.district_lat, ref.district_lon)
        <= DISTRICT_COLLAR_KM
    )
    mask = polygon | collar
    if not mask.any():  # pragma: no cover - defensive
        mask = np.ones(lat2d.shape, dtype=bool)
    return mask


def _assign_districts(ref: Reference, lat2d: np.ndarray, lon2d: np.ndarray):
    """Nearest-headquarters assignment, with the distance to that headquarters.

    A Voronoi assignment over district headquarters is a coarse stand-in for
    real district boundaries — good enough for screening, and stated as such
    wherever it is displayed.
    """
    lat_flat = lat2d.ravel()
    lon_flat = lon2d.ravel()
    idx = np.empty(lat_flat.size, dtype=np.int16)
    dist = np.empty(lat_flat.size, dtype=np.float64)
    hq_lat = ref.district_lat
    hq_lon = ref.district_lon

    chunk = 2000
    for start in range(0, lat_flat.size, chunk):
        stop = min(start + chunk, lat_flat.size)
        d = haversine_km(
            lat_flat[start:stop, None], lon_flat[start:stop, None], hq_lat[None, :], hq_lon[None, :]
        )
        nearest = d.argmin(axis=1)
        idx[start:stop] = nearest.astype(np.int16)
        dist[start:stop] = d[np.arange(d.shape[0]), nearest]

    return idx.reshape(lat2d.shape), dist.reshape(lat2d.shape)


# --------------------------------------------------------------------------
# Service
# --------------------------------------------------------------------------


class Service:
    """Read-only query layer over a built bundle."""

    def __init__(self, bundle: GridBundle, ref: Reference | None = None) -> None:
        self.bundle = bundle
        self.ref = ref or reference_module.load()
        self.provider = rainfall.LiveRainfallProvider()
        self._live_cache: dict[str, Any] = {}
        self._records_by_district: dict[int, int] | None = None

    # -- metadata ----------------------------------------------------------

    def meta(self) -> dict[str, Any]:
        return {
            "name": "NER-LandslideAI",
            "version": __version__,
            "model_id": MODEL_ID,
            "grid": self.bundle.meta["grid"],
            "built_at": self.bundle.meta["built_at"],
            "build_seconds": self.bundle.meta["build_seconds"],
            "factors": self.bundle.meta["factors"],
            "rescale": {
                **self.bundle.meta["rescale"],
                "fit_percentiles": list(config.RESCALE_FIT_PERCENTILES),
            },
            "season": self.bundle.meta["season"],
            "scenario_multiplier": self.bundle.meta["scenario_multiplier"],
            "terrain_source": self.bundle.meta["terrain_source"],
            "rainfall_source": self.bundle.meta["rainfall_source"],
            "evidence": self.bundle.meta["evidence"],
            "imported_files": self.bundle.meta["imported_files"],
            "grid_fields": GRID_FIELDS,
            "class_cuts": {
                "MODERATE": 0.40,
                "HIGH": 0.60,
                "CRITICAL": 0.80,
                "note": "ordinal severity bands on a relative index, not event probabilities",
            },
            "rainfall_status": self.provider.status(),
        }

    # -- point analysis ----------------------------------------------------

    def point(self, lat: float, lon: float, scenario: float | None = None) -> dict[str, Any]:
        lat_axis, lon_axis = self.bundle.lat_axis, self.bundle.lon_axis
        if not (lat_axis[0] <= lat <= lat_axis[-1] and lon_axis[0] <= lon <= lon_axis[-1]):
            raise ValueError("coordinate lies outside the modelled region")
        i = int(np.clip(np.searchsorted(lat_axis, lat), 0, len(lat_axis) - 1))
        j = int(np.clip(np.searchsorted(lon_axis, lon), 0, len(lon_axis) - 1))

        inside = bool(self.bundle.mask[i, j])
        factors = {
            name: float(self.bundle.get(f"factor_{name}")[i, j])
            for name in config.FACTOR_ORDER
        }
        index = float(self.bundle.get("susceptibility")[i, j])
        sigma = float(self.bundle.get("sigma")[i, j])
        grade = str(hazard.uncertainty(
            self.bundle.get("support_km"),
            self.bundle.get("roughness_index"),
            self.bundle.get("evidence_distance_km"),
            self.bundle.mask,
        ).grade[i, j])

        live = self.provider.get(lat, lon)
        i_ref = float(self.bundle.get("reference_intensity_mm")[i, j])
        i_clim = float(self.bundle.get("intensity_now_mm")[i, j])

        if live.available:
            mode = "live"
            intensity_now = float(live.past_72h_mm or 0.0)
            horizons = {
                "+24h": intensity_now + float(live.forecast_24h_mm or 0.0),
                "+72h": intensity_now + float(live.forecast_72h_mm or 0.0),
            }
        else:
            mode = "climatology"
            intensity_now = i_clim
            horizons = {}

        if scenario is not None:
            intensity_now = intensity_now * float(scenario)

        result = hazard.evaluate_point(
            factors=factors,
            gate=float(self.bundle.get("gate")[i, j]),
            rescale=self.bundle.rescale,
            reference_intensity=i_ref,
            intensity_now=intensity_now,
            intensity_horizons=horizons,
            sigma=sigma,
            support_km=float(self.bundle.get("support_km")[i, j]),
            nearest_evidence_km=float(self.bundle.get("evidence_distance_km")[i, j]),
            grade=grade,
        )

        scenarios = []
        for multiplier in config.SCENARIO_MULTIPLIERS:
            value = i_clim * multiplier
            scenarios.append(
                {
                    "multiplier": multiplier,
                    "label": _scenario_label(multiplier),
                    "intensity_mm": round(value, 1),
                    "risk": round(float(hazard.risk(index, value, i_ref)), 4),
                    "class": str(hazard.classify(float(hazard.risk(index, value, i_ref)))),
                }
            )

        district = self.ref.districts[int(self.bundle.district_index[i, j])]

        return {
            "location": {
                "latitude": round(float(lat_axis[i]), 4),
                "longitude": round(float(lon_axis[j]), 4),
                "requested": {"latitude": lat, "longitude": lon},
                "cell": {"row": i, "col": j, "resolution_deg": config.GRID_RES},
                "in_region": inside,
                "district": {
                    "state": self.ref.state_names.get(district.state, district.state),
                    "state_code": district.state,
                    "district": district.district,
                    "hq": district.hq,
                    "population": district.population,
                    "distance_to_hq_km": round(float(self.bundle.get("district_distance_km")[i, j]), 1),
                    "assignment": "nearest district headquarters (Voronoi approximation)",
                },
            },
            "terrain": {
                "elevation_m": round(float(self.bundle.get("elevation_m")[i, j])),
                "slope_m_per_km": round(float(self.bundle.get("slope_m_per_km")[i, j]), 1),
                "slope_index": round(float(self.bundle.get("slope_index")[i, j]), 4),
                "relief_km": round(float(self.bundle.get("relief_km")[i, j]), 2),
                "relief_index": round(float(self.bundle.get("relief_index")[i, j]), 4),
                "geology_belt": self._belt_name(int(self.bundle.get("belt_index")[i, j])),
                "source": self.bundle.meta["terrain_source"],
            },
            "rainfall": {
                "mode": mode,
                "annual_mm": round(float(self.bundle.get("rain_annual_mm")[i, j])),
                "month_mean_mm": round(float(np.asarray(self.bundle.get(f"rain_month_{self.bundle.meta['month'] - 1:02d}"))[i, j])),
                "live": live.as_dict(),
            },
            **result,
            "scenarios": scenarios,
            "provenance": self._point_provenance(i, j),
        }

    def _belt_name(self, belt_index: int) -> str | None:
        if belt_index < 0 or belt_index >= len(self.ref.belt_precedence):
            return None
        belt_id = self.ref.belt_precedence[belt_index]
        for belt in self.ref.belts:
            if belt.id == belt_id:
                return belt.name
        return None

    def _point_provenance(self, i: int, j: int) -> dict[str, Any]:
        return {
            "terrain": self.bundle.meta["terrain_source"],
            "rainfall": (
                "open-meteo (live)"
                if self.provider.mode() == "live"
                else self.bundle.meta["rainfall_source"]
            ),
            "evidence": self.bundle.meta["evidence"],
            "records_nearby": int(self.bundle.get("evidence_density")[i, j]),
            "reference_dataset": {
                name: block.get("title")
                for name, block in _provenance_titles(self.ref).items()
            },
        }

    # -- grid --------------------------------------------------------------

    def grid_field(self, field_name: str) -> dict[str, Any]:
        if field_name not in GRID_FIELDS:
            raise KeyError(field_name)
        layer = {
            "susceptibility": "susceptibility",
            "risk": "risk_now",
            "risk_forward": "risk_forward",
            "uncertainty": "sigma",
            "elevation": "elevation_m",
            "evidence": "evidence",
        }[field_name]
        values = self.bundle.get(layer)
        return {
            "field": field_name,
            "label": GRID_FIELDS[field_name],
            "source_layer": layer,
            **self._grid_payload(values),
        }

    def grid_delta(self) -> dict[str, Any]:
        return {
            "field": "risk_delta",
            "label": "Change in risk under the forward rainfall assumption",
            **self._grid_payload(self.bundle.get("risk_delta")),
        }

    def _grid_payload(self, values: np.ndarray) -> dict[str, Any]:
        masked = np.where(self.bundle.mask, values, np.nan)
        finite = masked[np.isfinite(masked)]
        flat = masked.ravel()
        return {
            "rows": int(masked.shape[0]),
            "cols": int(masked.shape[1]),
            "lat0": float(self.bundle.lat_axis[0]),
            "lon0": float(self.bundle.lon_axis[0]),
            "dlat": config.GRID_RES,
            "dlon": config.GRID_RES,
            "values": [None if not np.isfinite(v) else round(float(v), 5) for v in flat],
            "stats": {
                "count": int(finite.size),
                "min": round(float(finite.min()), 4) if finite.size else None,
                "max": round(float(finite.max()), 4) if finite.size else None,
                "mean": round(float(finite.mean()), 4) if finite.size else None,
                "p90": round(float(np.percentile(finite, 90)), 4) if finite.size else None,
            },
        }

    def histogram(self, field_name: str = "risk") -> dict[str, int]:
        layer = {
            "susceptibility": "susceptibility",
            "risk": "risk_now",
            "risk_forward": "risk_forward",
        }.get(field_name)
        if layer is None:
            raise KeyError(field_name)
        values = self.bundle.masked_values(layer)
        labels = hazard.classify(values)
        out: dict[str, int] = {}
        for label in ["LOW", "MODERATE", "HIGH", "CRITICAL"]:
            out[label] = int(np.sum(labels == label))
        return out

    # -- districts ---------------------------------------------------------

    def records_by_district(self) -> dict[int, int]:
        """Count reference records assigned to each district.

        A record belongs to the district of the cell it falls in, so the
        district figures add up to the catalogue size instead of counting the
        same record once per neighbouring cell.
        """
        if self._records_by_district is None:
            lat_axis, lon_axis = self.bundle.lat_axis, self.bundle.lon_axis
            counts: dict[int, int] = {}
            for lat, lon in self.bundle.meta.get("record_points") or []:
                i = int(np.clip(np.searchsorted(lat_axis, lat), 0, len(lat_axis) - 1))
                j = int(np.clip(np.searchsorted(lon_axis, lon), 0, len(lon_axis) - 1))
                position = int(self.bundle.district_index[i, j])
                counts[position] = counts.get(position, 0) + 1
            self._records_by_district = counts
        return self._records_by_district

    def districts(self, state: str | None = None) -> list[dict[str, Any]]:
        index_grid = self.bundle.district_index
        inside = self.bundle.mask
        susceptibility = self.bundle.get("susceptibility")
        risk_now = self.bundle.get("risk_now")
        risk_forward = self.bundle.get("risk_forward")
        sigma = self.bundle.get("sigma")
        density = self.bundle.get("evidence_density")

        rows: list[dict[str, Any]] = []
        wanted = state.lower() if state else None
        record_counts = self.records_by_district()

        for position, district in enumerate(self.ref.districts):
            state_name = self.ref.state_names.get(district.state, district.state)
            if wanted and district.state.lower() != wanted and state_name.lower() != wanted:
                continue
            cell_mask = (index_grid == position) & inside
            count = int(cell_mask.sum())
            if count == 0:
                continue

            cell_area = float(self.bundle.meta["grid"]["cell_area_km2"])
            s_values = susceptibility[cell_mask]
            r_values = risk_now[cell_mask]
            f_values = risk_forward[cell_mask]

            high_share = float(np.mean(f_values >= 0.60))
            exposure = district.population * high_share

            rows.append(
                {
                    "state": state_name,
                    "state_code": district.state,
                    "district": district.district,
                    "hq": district.hq,
                    "population": district.population,
                    "population_apportioned": district.population_apportioned,
                    "area_km2_approx": round(count * cell_area, 1),
                    "cells": count,
                    "susceptibility": {
                        "mean": round(float(s_values.mean()), 4),
                        "max": round(float(s_values.max()), 4),
                        "class": str(hazard.classify(float(s_values.mean()))),
                    },
                    "risk_now": {
                        "mean": round(float(r_values.mean()), 4),
                        "max": round(float(r_values.max()), 4),
                        "class": str(hazard.classify(float(r_values.mean()))),
                    },
                    "risk_forward": {
                        "mean": round(float(f_values.mean()), 4),
                        "max": round(float(f_values.max()), 4),
                        "class": str(hazard.classify(float(f_values.mean()))),
                        "high_share": round(high_share, 4),
                    },
                    "uncertainty_sigma_mean": round(float(sigma[cell_mask].mean()), 4),
                    "records_in_district": int(record_counts.get(position, 0)),
                    "evidence_density_sum": round(float(density[cell_mask].sum()), 1),
                    "exposure_index": round(exposure, 1),
                    "exposure_note": "population x share of district cells in HIGH or above (screening metric)",
                }
            )

        rows.sort(key=lambda r: -r["risk_forward"]["mean"])
        return rows

    def district_detail(self, state: str, district: str) -> dict[str, Any] | None:
        for row in self.districts(state):
            if row["district"].lower() == district.lower():
                record = next(
                    d for d in self.ref.districts if d.state == row["state_code"] and d.district == row["district"]
                )
                row = dict(row)
                row["headquarters"] = {
                    "name": record.hq,
                    "latitude": record.lat,
                    "longitude": record.lon,
                    "elevation_m": record.elevation_m,
                }
                row["point_analysis"] = self.point(record.lat, record.lon)
                return row
        return None

    # -- corridors ---------------------------------------------------------

    def corridors(self) -> list[dict[str, Any]]:
        from .corridors import analyse_corridor

        out = []
        for corridor in self.ref.corridors:
            out.append(analyse_corridor(self, corridor))
        out.sort(key=lambda c: (-c["isolation_risk"], -c["summary"]["max_risk"]))
        return out

    def corridor(self, corridor_id: str) -> dict[str, Any] | None:
        from .corridors import analyse_corridor

        for corridor in self.ref.corridors:
            if corridor.id == corridor_id:
                return analyse_corridor(self, corridor, with_profile=True)
        return None

    # -- watchlist ---------------------------------------------------------

    def watchlist(self, limit: int = 25, min_risk: float = 0.0) -> dict[str, Any]:
        delta = self.bundle.get("risk_delta")
        forward = self.bundle.get("risk_forward")
        mask = self.bundle.mask & np.isfinite(delta) & (forward >= min_risk)
        if not mask.any():
            return {"mode": self.bundle.meta["season"], "cells": [], "count": 0}

        flat_idx = np.flatnonzero(mask.ravel())
        order = flat_idx[np.argsort(delta.ravel()[flat_idx])[::-1]][: int(limit)]

        cols = int(self.bundle.shape[1])
        cells = []
        for flat in order:
            i, j = divmod(int(flat), cols)  # row-major over (rows, cols)
            district = self.ref.districts[int(self.bundle.district_index[i, j])]
            cells.append(
                {
                    "latitude": round(float(self.bundle.lat_axis[i]), 4),
                    "longitude": round(float(self.bundle.lon_axis[j]), 4),
                    "state": self.ref.state_names.get(district.state, district.state),
                    "district": district.district,
                    "risk_now": round(float(self.bundle.get("risk_now")[i, j]), 4),
                    "risk_forward": round(float(forward[i, j]), 4),
                    "delta": round(float(delta[i, j]), 4),
                    "susceptibility": round(float(self.bundle.get("susceptibility")[i, j]), 4),
                    "sigma": round(float(self.bundle.get("sigma")[i, j]), 4),
                }
            )
        return {
            "mode": self.bundle.meta["season"],
            "scenario_multiplier": self.bundle.meta["scenario_multiplier"],
            "count": len(cells),
            "cells": cells,
        }

    # -- events and stats --------------------------------------------------

    def events(self, state: str | None = None) -> dict[str, Any]:
        wanted = state.lower() if state else None
        rows = []
        for event in self.ref.events:
            state_name = self.ref.state_names.get(event.state, event.state)
            if wanted and event.state.lower() != wanted and state_name.lower() != wanted:
                continue
            rows.append(
                {
                    "id": event.id,
                    "date": event.date,
                    "place": event.place,
                    "state": state_name,
                    "state_code": event.state,
                    "district": event.district,
                    "trigger": event.trigger,
                    "confidence": event.confidence,
                    "magnitude_note": event.magnitude_note,
                    "summary": event.summary,
                    "latitude": event.lat,
                    "longitude": event.lon,
                    "location_precision": "district reference point",
                }
            )
        rows.sort(key=lambda r: r["date"], reverse=True)
        return {"count": len(rows), "events": rows}

    def stats(self) -> dict[str, Any]:
        susceptibility = self.bundle.masked_values("susceptibility")
        risk_now = self.bundle.masked_values("risk_now")
        risk_forward = self.bundle.masked_values("risk_forward")
        sigma = self.bundle.masked_values("sigma")

        return {
            "region": {
                "states": [
                    {
                        "code": s.code,
                        "name": s.name,
                        "capital": s.capital,
                        "area_km2": s.area_km2,
                        "population_2011": s.population_2011,
                        "districts": sum(1 for d in self.ref.districts if d.state == s.code),
                    }
                    for s in self.ref.states
                ],
                "district_count": len(self.ref.districts),
                "cells": int(self.bundle.mask.sum()),
                "cell_area_km2": self.bundle.meta["grid"]["cell_area_km2"],
            },
            "susceptibility": {
                "mean": round(float(susceptibility.mean()), 4),
                "p90": round(float(np.percentile(susceptibility, 90)), 4),
                "class_counts": self.histogram("susceptibility"),
            },
            "risk_now": {
                "mean": round(float(risk_now.mean()), 4),
                "p90": round(float(np.percentile(risk_now, 90)), 4),
                "class_counts": self.histogram("risk"),
            },
            "risk_forward": {
                "mean": round(float(risk_forward.mean()), 4),
                "p90": round(float(np.percentile(risk_forward, 90)), 4),
                "class_counts": self.histogram("risk_forward"),
            },
            "uncertainty": {
                "mean_sigma": round(float(sigma.mean()), 4),
                "max_sigma": round(float(sigma.max()), 4),
            },
            "evidence": self.bundle.meta["evidence"],
            "season": self.bundle.meta["season"],
            "rainfall_mode": self.provider.mode(),
            "provenance": _provenance_titles(self.ref),
        }

    def methodology(self) -> dict[str, Any]:
        return {
            "model_id": MODEL_ID,
            "version": __version__,
            "factors": [
                {
                    "id": name,
                    "label": config.FACTOR_LABELS[name],
                    "weight": config.FACTOR_WEIGHTS[name],
                }
                for name in config.FACTOR_ORDER
            ],
            "index_transform": {
                "form": "index = clip(constant + scale * gate * sum(w_i * f_i), 0, 1)",
                "gate": "elevation-band credibility, 0 in the alluvial plains rising to 1 in the landslide belt and falling again above 2,800 m",
                "percentile_fixing": (
                    "the "
                    + " and ".join(f"{p:g}th" for p in config.RESCALE_FIT_PERCENTILES)
                    + " percentile of the regional raw score"
                ),
                "detail": self.bundle.meta["rescale"],
                "note": "affine, therefore the factor contributions remain exactly additive",
            },
            "trigger": {
                "definition": "tau = I / I_c(S), with I_c(S) = I_ref * (1.35 - 0.85 * S)",
                "risk_relation": "R = 1 - (1 - S) ** (1 + GAMMA * tau), GAMMA = 1.2",
                "inverse": "I* = tau* * I_c(S) with tau* = (ln(1 - R*) / ln(1 - S) - 1) / GAMMA",
                "reference_intensity": "3 x the mean 3-day rainfall of the wettest normal month, from station climatology",
                "scenario_multipliers": list(config.SCENARIO_MULTIPLIERS),
                "note": "I* is reported per cell as the rainfall margin to each severity class",
            },
            "severity_bands": {
                "LOW": "< 0.40",
                "MODERATE": "0.40 - 0.60",
                "HIGH": "0.60 - 0.80",
                "CRITICAL": ">= 0.80",
                "caveat": "ordinal bands on a relative index; these are not calibrated event probabilities",
            },
            "uncertainty": {
                "components": config.UNCERTAINTY_WEIGHTS,
                "maximum_sigma": config.UNCERTAINTY_MAX,
                "grades": hazard.GRADE_MEANING,
                "basis": "heuristic stated band, not a statistical confidence interval",
            },
            "provenance": _provenance_titles(self.ref),
            "limitations": [
                "The terrain surface is interpolated from compiled control points; it is not a DEM.",
                "Susceptibility is a relative index until an inventory with dated events is imported and calibrated.",
                "Slope failure is modelled as rainfall-triggered; earthquake and GLOF triggers appear only as historical evidence.",
                "District aggregation uses nearest-headquarters assignment, not surveyed boundaries.",
                "Not an operational early-warning system.",
            ],
        }


def _scenario_label(multiplier: float) -> str:
    if multiplier <= 1.0:
        return "normal seasonal"
    if multiplier <= 2.0:
        return "wet spell"
    if multiplier <= 3.0:
        return "heavy spell"
    return "extreme event"


def _provenance_titles(ref: Reference) -> dict[str, Any]:
    return {
        name: {
            "title": block.get("title", name),
            "kind": block.get("kind", "compiled_reference"),
            "accuracy": block.get("accuracy", ""),
        }
        for name, block in ref.provenance.items()
    }


# --------------------------------------------------------------------------
# Module-level convenience
# --------------------------------------------------------------------------

_SERVICE: Service | None = None


def get_service(refresh: bool = False) -> Service:
    """Return the process-wide service, building the grid on first use."""
    global _SERVICE
    if _SERVICE is None or refresh:
        extra = sorted(config.USER_DATA_DIR.glob("*.csv")) if config.USER_DATA_DIR.exists() else []
        bundle = build_bundle(extra_inventory=extra)
        _SERVICE = Service(bundle)
    return _SERVICE
