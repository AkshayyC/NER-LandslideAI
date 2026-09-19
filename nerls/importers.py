"""Adapters that replace the committed reference data with the real thing.

Two imports are supported, both optional:

``DEM``
    A GeoTIFF elevation raster (Copernicus GLO-30/90, SRTM, ALOS). Requires
    ``rasterio``. When registered, every terrain derivative — slope, relief,
    roughness — is recomputed from the DEM instead of the generalised surface,
    and the provenance block says so.

``inventory``
    A CSV of mapped landslides (handled in :mod:`nerls.inventory`). Any CSV
    dropped into the user-data directory is loaded automatically at build time.

Neither import changes the model: the factors, the trigger relation and the
threshold inversion are identical. Only the inputs change, which is the point —
the engine is testable against real data without touching the API.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np

from . import config

DEM_REGISTRY = config.USER_DATA_DIR / "dem.json"


class ImportError_(RuntimeError):
    """Raised when a registered import cannot be used."""


def rasterio_available() -> bool:
    try:
        import rasterio  # noqa: F401
    except Exception:
        return False
    return True


def _read_dem(path: Path, band: int = 1) -> tuple[np.ndarray, tuple[float, float, float, float]]:
    """Read a DEM into memory along with its (west, north, xres, yres) georeferencing."""
    try:
        import rasterio
    except Exception as exc:  # pragma: no cover - depends on the environment
        raise ImportError_(
            "rasterio is required to import a DEM; install it with `pip install rasterio`"
        ) from exc

    with rasterio.open(path) as dataset:
        data = dataset.read(band).astype(np.float32)
        transform = dataset.transform
        nodata = dataset.nodata
    if nodata is not None:
        data[data == nodata] = np.nan
    return data, (transform.c, transform.f, transform.a, transform.e)


def make_sampler(path: str | Path, band: int = 1) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """Return a ``(lat2d, lon2d) -> metres`` sampler reading from a DEM."""
    data, (west, north, xres, yres) = _read_dem(Path(path), band=band)

    def sampler(lat2d: np.ndarray, lon2d: np.ndarray) -> np.ndarray:
        cols = np.rint((np.asarray(lon2d) - west) / xres).astype(np.int64)
        rows = np.rint((np.asarray(lat2d) - north) / yres).astype(np.int64)
        valid = (
            (rows >= 0)
            & (rows < data.shape[0])
            & (cols >= 0)
            & (cols < data.shape[1])
        )
        out = np.full(np.shape(lat2d), np.nan, dtype=np.float32)
        out[valid] = data[rows[valid], cols[valid]]
        return out

    return sampler


def register_dem(path: str | Path, band: int = 1, notes: str = "") -> dict:
    """Register a DEM for use by the next grid build."""
    path = Path(path).expanduser().resolve()
    if not path.exists():
        raise ImportError_(f"DEM not found: {path}")
    if not rasterio_available():
        raise ImportError_(
            "rasterio is not installed, so the DEM cannot be registered. "
            "Install it with `pip install rasterio`."
        )
    config.USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"path": str(path), "band": band, "notes": notes}
    DEM_REGISTRY.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def clear_dem() -> None:
    DEM_REGISTRY.unlink(missing_ok=True)


def registered_dem() -> dict | None:
    if not DEM_REGISTRY.exists():
        return None
    try:
        return json.loads(DEM_REGISTRY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def load_registered_sampler():
    """Return ``(sampler, info)`` for a registered DEM, or ``(None, None)``."""
    info = registered_dem()
    if not info:
        return None, None
    path = Path(info["path"])
    if not path.exists() or not rasterio_available():
        return None, None
    return make_sampler(path, band=int(info.get("band", 1))), info
