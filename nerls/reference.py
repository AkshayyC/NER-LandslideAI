"""Loader and validator for the committed reference dataset.

The reference dataset is plain JSON under ``nerls/data/``. It is the only
source of regional knowledge in the system, it carries its own provenance
block, and it is validated on load so that a bad hand edit fails loudly at
startup instead of silently degrading every hazard value.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from . import config

REFERENCE_FILES = {
    "states": "states.json",
    "districts": "districts.json",
    "terrain_anchors": "terrain_anchors.json",
    "rainfall": "rainfall_climatology.json",
    "geology": "geology_belts.json",
    "events": "events.json",
    "corridors": "corridors.json",
    "outline": "region_outline.json",
}


class ReferenceError(RuntimeError):
    """Raised when the committed reference data is missing or inconsistent."""


def _read(name: str) -> dict[str, Any]:
    path = config.DATA_DIR / REFERENCE_FILES[name]
    if not path.exists():
        raise ReferenceError(f"reference file missing: {path}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError as exc:  # pragma: no cover - guarded by tests
        raise ReferenceError(f"{path} is not valid JSON: {exc}") from exc


@dataclass(frozen=True)
class StateRecord:
    code: str
    name: str
    capital: str
    area_km2: float
    population_2011: int
    bbox: tuple[float, float, float, float]
    terrain_summary: str


@dataclass(frozen=True)
class DistrictRecord:
    state: str
    district: str
    hq: str
    lat: float
    lon: float
    elevation_m: float
    population: int
    population_apportioned: bool

    @property
    def key(self) -> str:
        return f"{self.state}|{self.district}"


@dataclass(frozen=True)
class AnchorPoint:
    name: str
    kind: str
    lat: float
    lon: float
    elevation_m: float


@dataclass(frozen=True)
class GeologyBelt:
    id: str
    name: str
    erodibility: float
    note: str
    envelopes: tuple[tuple[float, float, float, float], ...]


@dataclass(frozen=True)
class EventRecord:
    id: str
    date: str
    place: str
    district: str
    state: str
    trigger: str
    confidence: str
    summary: str
    magnitude_note: str
    lat: float
    lon: float
    weight: float


@dataclass(frozen=True)
class CorridorRecord:
    id: str
    name: str
    mode: str
    states: tuple[str, ...]
    criticality: int
    note: str
    waypoints: tuple[tuple[float, float, str], ...]


@dataclass
class Reference:
    """The whole reference dataset, validated and ready to use."""

    states: list[StateRecord] = field(default_factory=list)
    districts: list[DistrictRecord] = field(default_factory=list)
    anchors: list[AnchorPoint] = field(default_factory=list)
    belts: list[GeologyBelt] = field(default_factory=list)
    belt_precedence: list[str] = field(default_factory=list)
    events: list[EventRecord] = field(default_factory=list)
    corridors: list[CorridorRecord] = field(default_factory=list)
    outline: list[list[list[float]]] = field(default_factory=list)
    rainfall_profiles: dict[str, list[float]] = field(default_factory=dict)
    rainfall_stations: list[dict[str, Any]] = field(default_factory=list)
    trigger_reference: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, Any] = field(default_factory=dict)
    state_names: dict[str, str] = field(default_factory=dict)

    # -- convenience views -------------------------------------------------

    @property
    def district_lat(self) -> np.ndarray:
        return np.asarray([d.lat for d in self.districts], dtype=np.float64)

    @property
    def district_lon(self) -> np.ndarray:
        return np.asarray([d.lon for d in self.districts], dtype=np.float64)

    @property
    def anchor_lat(self) -> np.ndarray:
        return np.asarray([a.lat for a in self.anchors], dtype=np.float64)

    @property
    def anchor_lon(self) -> np.ndarray:
        return np.asarray([a.lon for a in self.anchors], dtype=np.float64)

    @property
    def anchor_elevation(self) -> np.ndarray:
        return np.asarray([a.elevation_m for a in self.anchors], dtype=np.float64)

    def district_index(self, state_code: str, district: str) -> int | None:
        for i, d in enumerate(self.districts):
            if d.state == state_code and d.district.lower() == district.lower():
                return i
        return None


def _validate(ref: Reference) -> Reference:
    if len(ref.states) != 8:
        raise ReferenceError(f"expected 8 NER states, found {len(ref.states)}")
    codes = {s.code for s in ref.states}
    if len(codes) != len(ref.states):
        raise ReferenceError("duplicate state codes in states.json")

    seen: set[str] = set()
    for d in ref.districts:
        if d.state not in codes:
            raise ReferenceError(f"district {d.district} references unknown state {d.state}")
        if d.key in seen:
            raise ReferenceError(f"duplicate district entry {d.key}")
        seen.add(d.key)
        if not (20.0 <= d.lat <= 30.5 and 87.0 <= d.lon <= 98.0):
            raise ReferenceError(f"district {d.key} lies outside the region envelope")

    if len(ref.anchors) < 50:
        raise ReferenceError("terrain anchor set is too small to interpolate a surface")

    weights = [len(p) for p in ref.rainfall_profiles.values()]
    if not weights or any(w != 12 for w in weights):
        raise ReferenceError("every rainfall profile must have 12 monthly weights")
    for name, profile in ref.rainfall_profiles.items():
        total = float(sum(profile))
        if abs(total - 1.0) > 1e-6:
            raise ReferenceError(f"rainfall profile {name} sums to {total}, expected 1.0")

    belt_ids = {b.id for b in ref.belts}
    unknown = [p for p in ref.belt_precedence if p not in belt_ids]
    if unknown:
        raise ReferenceError(f"belt precedence references unknown belts: {unknown}")
    if set(ref.belt_precedence) != belt_ids:
        raise ReferenceError("every belt must appear exactly once in the precedence list")

    for c in ref.corridors:
        if len(c.waypoints) < 2:
            raise ReferenceError(f"corridor {c.id} needs at least two waypoints")
        if c.criticality not in (1, 2, 3):
            raise ReferenceError(f"corridor {c.id} has an out-of-range criticality")

    if not ref.outline:
        raise ReferenceError("region outline is empty")
    return ref


@lru_cache(maxsize=1)
def load() -> Reference:
    """Load, validate and cache the reference dataset."""
    states_doc = _read("states")
    districts_doc = _read("districts")
    anchors_doc = _read("terrain_anchors")
    rainfall_doc = _read("rainfall")
    geology_doc = _read("geology")
    events_doc = _read("events")
    corridors_doc = _read("corridors")
    outline_doc = _read("outline")

    ref = Reference()
    ref.provenance = {
        "states": states_doc.get("provenance", {}),
        "districts": districts_doc.get("provenance", {}),
        "terrain": anchors_doc.get("provenance", {}),
        "rainfall": rainfall_doc.get("provenance", {}),
        "geology": geology_doc.get("provenance", {}),
        "events": events_doc.get("provenance", {}),
        "corridors": corridors_doc.get("provenance", {}),
        "outline": outline_doc.get("provenance", {}),
    }

    ref.states = [
        StateRecord(
            code=s["code"],
            name=s["name"],
            capital=s["capital"],
            area_km2=float(s["area_km2"]),
            population_2011=int(s["population_2011"]),
            bbox=tuple(float(v) for v in s["bbox"]),
            terrain_summary=s.get("terrain_summary", ""),
        )
        for s in states_doc["states"]
    ]
    ref.state_names = {s.code: s.name for s in ref.states}

    ref.districts = [
        DistrictRecord(
            state=d["state"],
            district=d["district"],
            hq=d["hq"],
            lat=float(d["lat"]),
            lon=float(d["lon"]),
            elevation_m=float(d["elevation_m"]),
            population=int(d["population"]),
            population_apportioned=bool(d.get("population_apportioned", False)),
        )
        for d in districts_doc["districts"]
    ]

    ref.anchors = [
        AnchorPoint(
            name=a["name"],
            kind=a["type"],
            lat=float(a["lat"]),
            lon=float(a["lon"]),
            elevation_m=float(a["elevation_m"]),
        )
        for a in anchors_doc["points"]
    ]
    # A regular grid has no settlement to interpolate from, so the district
    # headquarters elevations are folded in as additional town control points.
    for d in ref.districts:
        ref.anchors.append(
            AnchorPoint(
                name=f"{d.hq} ({d.district} HQ)",
                kind="town",
                lat=d.lat,
                lon=d.lon,
                elevation_m=d.elevation_m,
            )
        )

    ref.belts = [
        GeologyBelt(
            id=b["id"],
            name=b["name"],
            erodibility=float(b["erodibility"]),
            note=b.get("note", ""),
            envelopes=tuple(tuple(float(v) for v in env) for env in b["envelopes"]),
        )
        for b in geology_doc["belts"]
    ]
    ref.belt_precedence = list(geology_doc["precedence"])

    weights = events_doc.get("confidence_weight", {"documented": 1.0, "reported": 0.6})
    district_by_name = {(d.state, d.district.lower()): d for d in ref.districts}
    for e in events_doc["events"]:
        key = (e["state"], e["district"].lower())
        match = district_by_name.get(key)
        if match is None:
            raise ReferenceError(
                f"event {e['id']} references unknown district {e['state']}/{e['district']}"
            )
        ref.events.append(
            EventRecord(
                id=e["id"],
                date=e["date"],
                place=e["place"],
                district=match.district,
                state=e["state"],
                trigger=e["trigger"],
                confidence=e["confidence"],
                summary=e.get("summary", ""),
                magnitude_note=e.get("magnitude_note", ""),
                lat=match.lat,
                lon=match.lon,
                weight=float(weights.get(e["confidence"], 0.6)),
            )
        )

    ref.corridors = [
        CorridorRecord(
            id=c["id"],
            name=c["name"],
            mode=c["mode"],
            states=tuple(c["states"]),
            criticality=int(c["criticality"]),
            note=c.get("note", ""),
            waypoints=tuple((float(w[0]), float(w[1]), str(w[2])) for w in c["waypoints"]),
        )
        for c in corridors_doc["corridors"]
    ]

    ref.outline = [
        [[float(v[0]), float(v[1])] for v in poly["vertices"]]
        for poly in outline_doc["polygons"]
    ]

    ref.rainfall_profiles = {
        name: [float(w) for w in profile["weights"]]
        for name, profile in rainfall_doc["profiles"].items()
    }
    ref.rainfall_stations = list(rainfall_doc["stations"])
    ref.trigger_reference = dict(rainfall_doc["trigger_reference"])

    return _validate(ref)


def reset_cache() -> None:
    """Drop the cached reference (used by tests that patch the data files)."""
    load.cache_clear()
