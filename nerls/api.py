"""FastAPI application.

Design notes
------------
* The API and the built frontend are served from **one origin**, so the browser
  never makes a cross-origin request, and no CORS negotiation can fail.
* The grid is built once at startup and cached on disk. Endpoints then do
  array lookups and reductions, so response times are in the milliseconds.
* Every response that carries a computed value also carries the provenance of
  the inputs behind it (terrain source, rainfall mode, evidence counts).
* Errors are typed: 404 for coordinates outside the modelled region, 400 for
  malformed input, 503 only if the engine could not be built at all.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import MODEL_ID, __version__, config, narrative
from .service import GRID_FIELDS, Service, get_service

log = logging.getLogger("nerls.api")

STATE: dict[str, Service | None] = {"service": None, "error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the hazard grid before the first request is served."""
    try:
        STATE["service"] = get_service()
        meta = STATE["service"].meta()
        log.info(
            "grid ready: %s cells, built in %.2fs (%s)",
            meta["grid"]["cells_in_region"],
            meta["build_seconds"],
            meta["model_id"],
        )
    except Exception as exc:  # pragma: no cover - surfaced through /api/health
        STATE["error"] = f"{type(exc).__name__}: {exc}"
        log.exception("failed to build the hazard grid")
    yield
    STATE["service"] = None


app = FastAPI(
    title="NER-LandslideAI",
    version=__version__,
    description=(
        "Landslide hazard, exposure and rainfall-trigger engine for the eight states of "
        "North East India. Susceptibility is a relative index; rainfall thresholds are "
        "reported per location. Research prototype — not an operational warning system."
    ),
    lifespan=lifespan,
)

# Same-origin by default. The permissive CORS policy is here so that external
# research clients can consume the API; it is not needed by the bundled UI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def service_or_503() -> Service:
    service = STATE.get("service")
    if service is None:
        raise HTTPException(
            status_code=503,
            detail=STATE.get("error") or "hazard engine not initialised",
        )
    return service  # type: ignore[return-value]


def _check_coords(latitude: float, longitude: float) -> None:
    if not -90.0 <= latitude <= 90.0:
        raise HTTPException(status_code=400, detail="latitude must be between -90 and 90")
    if not -180.0 <= longitude <= 180.0:
        raise HTTPException(status_code=400, detail="longitude must be between -180 and 180")


# --------------------------------------------------------------------------
# System
# --------------------------------------------------------------------------


@app.get("/api/health", tags=["system"])
def health() -> dict:
    service = STATE.get("service")
    if service is None:
        return {
            "status": "degraded",
            "engine": "unavailable",
            "detail": STATE.get("error"),
            "model_id": MODEL_ID,
            "version": __version__,
        }
    meta = service.meta()
    rainfall = meta["rainfall_status"]
    return {
        "status": "operational",
        "engine": "ready",
        "model_id": MODEL_ID,
        "version": __version__,
        "grid_cells": meta["grid"]["cells_in_region"],
        "built_at": meta["built_at"],
        # The engine always works; the rainfall *mode* is what varies, and the
        # API never claims a live feed it has not actually reached.
        "rainfall_mode": rainfall["mode"],
        "rainfall_detail": rainfall["last_error"] or rainfall.get("last_success"),
        "retry_after_seconds": rainfall["retry_after_seconds"],
        "factor_count": len(meta["factors"]["weights"]),
        "immediate_actions": False,
        "disclaimer": "Research prototype. Not an operational early-warning service.",
    }


@app.get("/api/meta", tags=["system"])
def meta() -> dict:
    return service_or_503().meta()


@app.get("/api/methodology", tags=["system"])
def methodology() -> dict:
    return service_or_503().methodology()


@app.get("/api/outline", tags=["system"])
def outline() -> dict:
    """Generalised region polygons, for drawing the map without a tile server.

    The UI renders these instead of fetching raster tiles, so the deployment
    works on a network with no access to external map services.
    """
    service = service_or_503()
    return {
        "polygons": service.ref.outline,
        "caveat": "generalised outline, inflated by ~0.15-0.25 deg; not a legal boundary",
    }


@app.get("/api/stats", tags=["system"])
def stats() -> dict:
    return service_or_503().stats()


# --------------------------------------------------------------------------
# Location analysis
# --------------------------------------------------------------------------


@app.get("/api/point", tags=["analysis"])
def point(
    lat: float = Query(..., description="latitude in decimal degrees"),
    lon: float = Query(..., description="longitude in decimal degrees"),
    scenario: float | None = Query(
        None,
        gt=0.0,
        le=20.0,
        description="override the rainfall assumption as a multiple of the local monthly mean",
    ),
) -> dict:
    _check_coords(lat, lon)
    service = service_or_503()
    try:
        return service.point(lat, lon, scenario=scenario)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --------------------------------------------------------------------------
# Grid layers
# --------------------------------------------------------------------------


@app.get("/api/grid", tags=["grid"])
def grid(
    field: str = Query("risk", description=f"one of {sorted(GRID_FIELDS)}"),
) -> dict:
    service = service_or_503()
    try:
        payload = service.grid_field(field)
    except KeyError as exc:
        raise HTTPException(
            status_code=400, detail=f"unknown field '{field}'; expected one of {sorted(GRID_FIELDS)}"
        ) from exc
    payload["model_id"] = MODEL_ID
    payload["field_meaning"] = _field_meaning(service, field)
    return payload


@app.get("/api/grid/delta", tags=["grid"])
def grid_delta() -> dict:
    payload = service_or_503().grid_delta()
    payload["model_id"] = MODEL_ID
    return payload


def _field_meaning(service: Service, field: str) -> str:
    """Plain-language meaning of a grid layer, honest about the rainfall mode."""
    meta = service.meta()
    live = meta["rainfall_status"]["mode"] == "live"
    if field == "risk":
        if live:
            return "risk with the rainfall observed over the past 72 hours"
        return (
            "risk under normal rainfall for this month — no live feed is reachable from "
            "this deployment, so the trigger is the local climatological 72-hour mean"
        )
    if field == "risk_forward":
        if live:
            return "risk with observed rainfall plus the 72-hour forecast"
        return (
            f"risk under a {meta['scenario_multiplier']}x scenario on the local mean 72-hour "
            "rainfall — a planning view, not a forecast"
        )
    return GRID_FIELDS[field]


# --------------------------------------------------------------------------
# Districts, corridors, evidence
# --------------------------------------------------------------------------


@app.get("/api/districts", tags=["districts"])
def districts(state: str | None = Query(None, description="state name or code")) -> dict:
    rows = service_or_503().districts(state)
    return {"count": len(rows), "districts": rows}


@app.get("/api/districts/{state}/{district}", tags=["districts"])
def district_detail(state: str, district: str) -> dict:
    row = service_or_503().district_detail(state, district)
    if row is None:
        raise HTTPException(status_code=404, detail=f"district not found: {state}/{district}")
    return row


@app.get("/api/corridors", tags=["corridors"])
def corridors() -> dict:
    rows = service_or_503().corridors()
    return {"count": len(rows), "corridors": rows}


@app.get("/api/corridors/{corridor_id}", tags=["corridors"])
def corridor_detail(corridor_id: str) -> dict:
    row = service_or_503().corridor(corridor_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"corridor not found: {corridor_id}")
    return row


@app.get("/api/watchlist", tags=["analysis"])
def watchlist(
    limit: int = Query(25, ge=1, le=200),
    min_risk: float = Query(0.0, ge=0.0, le=1.0),
) -> dict:
    return service_or_503().watchlist(limit=limit, min_risk=min_risk)


@app.get("/api/events", tags=["evidence"])
def events(state: str | None = Query(None, description="state name or code")) -> dict:
    return service_or_503().events(state)


@app.get("/api/briefing", tags=["analysis"])
def briefing(scope: str = Query("region", pattern="^(region|district|point)$"), lat: float | None = None, lon: float | None = None) -> dict:
    service = service_or_503()
    payload: dict = {}
    if scope == "point":
        if lat is None or lon is None:
            raise HTTPException(status_code=400, detail="lat and lon are required for a point briefing")
        _check_coords(lat, lon)
        payload = service.point(lat, lon)
    return narrative.briefing(service, scope, payload)


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------


def _mount_frontend(app: FastAPI) -> bool:
    dist = Path(config.FRONTEND_DIST)
    index = dist / "index.html"
    if not index.exists():
        return False

    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str, request: Request):
        candidate = dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        return FileResponse(index)

    return True


FRONTEND_MOUNTED = _mount_frontend(app)

if not FRONTEND_MOUNTED:

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "name": "NER-LandslideAI",
            "version": __version__,
            "model_id": MODEL_ID,
            "status": "api-only",
            "frontend": "not built — run `npm run build` in frontend/, then restart",
            "docs": "/docs",
        }
