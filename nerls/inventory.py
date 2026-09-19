"""Historical evidence: the committed event catalogue plus any imported inventory.

Two quantities come out of this module:

``evidence``
    A bounded ``[0, 1]`` field: the strongest single piece of historical
    evidence within the kernel bandwidth of a cell. Used as a hazard factor.
    Bounded by construction, so importing a thousand-polygon inventory does not
    rescale the model — it simply fills the field in.

``density``
    A weighted count of evidence per cell, used for reporting ("n records
    within 25 km"), never as a model input.

Every record carries a source tag, so a served value can always be traced back
to the catalogue entry or the imported file it came from.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from .geo import haversine_km
from .reference import Reference

#: Kernel bandwidth in kilometres for the evidence field.
EVIDENCE_BANDWIDTH_KM = 20.0
#: Radius used when reporting record counts.
REPORT_RADIUS_KM = 25.0

REQUIRED_COLUMNS = ("latitude", "longitude")


class InventoryError(RuntimeError):
    """Raised when an imported inventory file cannot be used."""


@dataclass(frozen=True)
class InventoryRecord:
    lat: float
    lon: float
    weight: float
    source: str
    event_date: str | None = None
    state: str | None = None
    district: str | None = None
    label: str | None = None


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def catalogue_records(ref: Reference) -> list[InventoryRecord]:
    """Committed reference events as inventory records."""
    return [
        InventoryRecord(
            lat=e.lat,
            lon=e.lon,
            weight=e.weight,
            source=f"reference catalogue ({e.confidence})",
            event_date=e.date,
            state=ref.state_names.get(e.state, e.state),
            district=e.district,
            label=e.place,
        )
        for e in ref.events
    ]


def read_inventory_file(path: str | Path) -> list[InventoryRecord]:
    """Read a landslide inventory from CSV.

    Column names are matched case-insensitively against the common aliases used
    by GSI-style and institutional inventories, so an unedited export usually
    loads as-is. Latitude and longitude are mandatory; everything else is
    optional and simply enriches the report.
    """
    path = Path(path)
    if not path.exists():
        raise InventoryError(f"inventory file not found: {path}")

    alias = {
        "latitude": {"latitude", "lat", "y", "ycoord", "y_coord"},
        "longitude": {"longitude", "lon", "long", "x", "xcoord", "x_coord"},
        "event_date": {"date", "event_date", "date_of_occurrence", "occurrence_date", "year"},
        "state": {"state", "state_name", "state_ut"},
        "district": {"district", "district_name", "block"},
        "label": {"slide_name", "location", "place", "village", "name", "nh_sh_location"},
        "weight": {"weight", "confidence_weight", "reliability"},
    }

    records: list[InventoryRecord] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise InventoryError(f"{path} has no header row")

        lookup: dict[str, str] = {}
        for column in reader.fieldnames:
            if column is None:
                continue
            normalised = column.strip().lower().replace(" ", "_")
            for canonical, names in alias.items():
                if normalised in names:
                    lookup.setdefault(canonical, column)

        missing = [c for c in REQUIRED_COLUMNS if c not in lookup]
        if missing:
            raise InventoryError(
                f"{path} is missing required column(s) {missing}; "
                f"found {reader.fieldnames}"
            )

        for row in reader:
            lat = _coerce_float(row.get(lookup["latitude"]))
            lon = _coerce_float(row.get(lookup["longitude"]))
            if lat is None or lon is None:
                continue
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                continue
            weight = _coerce_float(row.get(lookup["weight"])) if "weight" in lookup else None
            records.append(
                InventoryRecord(
                    lat=lat,
                    lon=lon,
                    weight=float(weight) if weight is not None else 1.0,
                    source=path.name,
                    event_date=(row.get(lookup["event_date"]) or None) if "event_date" in lookup else None,
                    state=(row.get(lookup["state"]) or None) if "state" in lookup else None,
                    district=(row.get(lookup["district"]) or None) if "district" in lookup else None,
                    label=(row.get(lookup["label"]) or None) if "label" in lookup else None,
                )
            )

    if not records:
        raise InventoryError(f"{path} contained no usable coordinate rows")
    return records


def combine(*groups: Iterable[InventoryRecord]) -> list[InventoryRecord]:
    """Merge record groups, keeping duplicates (different sources are distinct
    evidence, and the evidence field is a maximum, so duplication is harmless)."""
    merged: list[InventoryRecord] = []
    for group in groups:
        merged.extend(group)
    return merged


def _kernel(dist_km: np.ndarray) -> np.ndarray:
    return np.exp(-np.square(dist_km / EVIDENCE_BANDWIDTH_KM))


def evidence_fields(
    records: list[InventoryRecord],
    lat2d: np.ndarray,
    lon2d: np.ndarray,
    chunk: int = 1500,
):
    """Return ``(evidence, density, distance_km)`` grids.

    ``evidence`` is the maximum weighted kernel response over all records;
    ``density`` is the weighted count of records inside the report radius;
    ``distance_km`` is the distance to the nearest record (``inf`` if none).
    """
    shape = lat2d.shape
    n_cells = lat2d.size
    lat_flat = lat2d.ravel()
    lon_flat = lon2d.ravel()

    if not records:
        empty = np.zeros(shape, dtype=np.float32)
        return empty, empty.copy(), np.full(shape, np.inf, dtype=np.float32)

    rec_lat = np.asarray([r.lat for r in records], dtype=np.float64)
    rec_lon = np.asarray([r.lon for r in records], dtype=np.float64)
    rec_w = np.asarray([r.weight for r in records], dtype=np.float64)

    evidence = np.zeros(n_cells, dtype=np.float64)
    density = np.zeros(n_cells, dtype=np.float64)
    nearest = np.full(n_cells, np.inf, dtype=np.float64)

    for start in range(0, n_cells, chunk):
        stop = min(start + chunk, n_cells)
        d = haversine_km(
            lat_flat[start:stop, None], lon_flat[start:stop, None], rec_lat[None, :], rec_lon[None, :]
        )
        response = _kernel(d) * rec_w[None, :]
        evidence[start:stop] = response.max(axis=1)
        density[start:stop] = (d <= REPORT_RADIUS_KM).sum(axis=1)
        nearest[start:stop] = d.min(axis=1)

    return (
        evidence.reshape(shape).astype(np.float32),
        density.reshape(shape).astype(np.float32),
        nearest.reshape(shape).astype(np.float32),
    )


def summarise(records: list[InventoryRecord], ref: Reference) -> dict[str, Any]:
    """Aggregate an inventory for reporting."""
    by_state: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_trigger: dict[str, int] = {}
    for record in records:
        state = record.state or "unattributed"
        by_state[state] = by_state.get(state, 0) + 1
        by_source[record.source] = by_source.get(record.source, 0) + 1

    for event in ref.events:
        key = event.trigger
        by_trigger[key] = by_trigger.get(key, 0) + 1

    return {
        "total_records": len(records),
        "by_state": dict(sorted(by_state.items(), key=lambda kv: -kv[1])),
        "by_source": by_source,
        "catalogue_by_trigger": by_trigger,
        "evidence_bandwidth_km": EVIDENCE_BANDWIDTH_KM,
        "report_radius_km": REPORT_RADIUS_KM,
    }
