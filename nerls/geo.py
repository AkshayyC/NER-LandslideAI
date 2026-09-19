"""Geodesy and grid helpers.

Spherical earth (R = 6371.0088 km), good to about 0.3 % over the few hundred
kilometres this system covers — far below the resolution of the generalised
terrain surface it operates on.
"""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

EARTH_RADIUS_KM = 6371.0088
#: Kilometres per degree of latitude (spherical).
KM_PER_DEG_LAT = float(np.pi * EARTH_RADIUS_KM / 180.0)


def km_per_deg_lon(latitude) -> np.ndarray:
    """Kilometres per degree of longitude at a given latitude."""
    return KM_PER_DEG_LAT * np.cos(np.radians(np.asarray(latitude, dtype=np.float64)))


def haversine_km(lat1, lon1, lat2, lon2) -> np.ndarray:
    """Great-circle distance in kilometres. Arguments broadcast."""
    lat1, lon1, lat2, lon2 = (
        np.radians(np.asarray(a, dtype=np.float64)) for a in (lat1, lon1, lat2, lon2)
    )
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def grid_axes(envelope: Sequence[float], res: float):
    """Cell-centre axes for an envelope ``(min_lat, max_lat, min_lon, max_lon)``."""
    min_lat, max_lat, min_lon, max_lon = envelope
    lat = np.arange(min_lat + res / 2.0, max_lat, res, dtype=np.float64)
    lon = np.arange(min_lon + res / 2.0, max_lon, res, dtype=np.float64)
    return lat, lon


def meshgrid(lat: np.ndarray, lon: np.ndarray):
    """Return ``(lat2d, lon2d)`` with shape ``(len(lat), len(lon))``."""
    return np.meshgrid(lat, lon, indexing="ij")


def point_in_polygons(
    lat2d: np.ndarray,
    lon2d: np.ndarray,
    polygons: Iterable[Sequence[Sequence[float]]],
) -> np.ndarray:
    """Even-odd ray casting against a list of vertex rings.

    Each ring is a sequence of ``(lat, lon)`` pairs; longitude is the x axis.
    The half-open comparison rule means shared vertices are not double counted.
    """
    inside = np.zeros(lat2d.shape, dtype=bool)
    y = np.asarray(lat2d, dtype=np.float64)
    x = np.asarray(lon2d, dtype=np.float64)

    for ring in polygons:
        verts = np.asarray(ring, dtype=np.float64)
        if verts.ndim != 2 or verts.shape[0] < 3:
            continue
        if not np.allclose(verts[0], verts[-1]):
            verts = np.vstack([verts, verts[0]])
        vx, vy = verts[:, 1], verts[:, 0]
        winding = np.zeros(lat2d.shape, dtype=bool)
        for i in range(len(vx) - 1):
            x1, y1 = vx[i], vy[i]
            x2, y2 = vx[i + 1], vy[i + 1]
            if y1 == y2:
                continue
            straddles = (y1 > y) != (y2 > y)
            if not np.any(straddles):
                continue
            x_cross = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            winding ^= straddles & (x < x_cross)
        inside |= winding
    return inside


def inverse_distance_weights(
    target_lat: np.ndarray,
    target_lon: np.ndarray,
    src_lat: np.ndarray,
    src_lon: np.ndarray,
    values: np.ndarray,
    neighbours: int = 14,
    power: float = 2.6,
    chunk: int = 3000,
) -> np.ndarray:
    """Inverse-distance interpolation of scattered control points.

    Only the ``neighbours`` nearest control points contribute to each target,
    which stops far-field points flattening the surface. Ties are broken by
    index so the result is reproducible across machines.
    """
    t_lat = np.asarray(target_lat, dtype=np.float64).ravel()
    t_lon = np.asarray(target_lon, dtype=np.float64).ravel()
    s_lat = np.asarray(src_lat, dtype=np.float64).ravel()
    s_lon = np.asarray(src_lon, dtype=np.float64).ravel()
    vals = np.asarray(values, dtype=np.float64).ravel()

    if not (len(s_lat) == len(s_lon) == len(vals)):
        raise ValueError("control point arrays must have equal length")
    if len(s_lat) == 0:
        raise ValueError("no control points supplied")
    if len(t_lat) != len(t_lon):
        raise ValueError("target arrays must have equal length")

    k = int(min(neighbours, len(s_lat)))
    out = np.empty(t_lat.shape, dtype=np.float64)

    for start in range(0, t_lat.size, chunk):
        stop = min(start + chunk, t_lat.size)
        d = haversine_km(
            t_lat[start:stop, None], t_lon[start:stop, None], s_lat[None, :], s_lon[None, :]
        )
        if k < d.shape[1]:
            idx = np.argpartition(d, k - 1, axis=1)[:, :k]
        else:
            idx = np.broadcast_to(np.arange(d.shape[1]), (d.shape[0], d.shape[1]))
        d_k = np.take_along_axis(d, idx, axis=1)
        v_k = vals[idx]

        exact = d_k < 1e-9
        w = 1.0 / np.power(np.maximum(d_k, 1e-6), power)
        est = (w * v_k).sum(axis=1) / np.maximum(w.sum(axis=1), 1e-12)

        if exact.any():
            first = exact.argmax(axis=1)
            exact_val = np.take_along_axis(v_k, first[:, None], axis=1).ravel()
            est = np.where(exact.any(axis=1), exact_val, est)

        out[start:stop] = est

    return out.reshape(np.shape(target_lat))


def percentile_rank(values: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Rank values within ``[0, 1]`` over the (optionally masked) population."""
    flat = np.asarray(values, dtype=np.float64).ravel()
    pool = flat if mask is None else flat[np.asarray(mask).ravel()]
    if pool.size == 0:
        return np.zeros_like(np.asarray(values, dtype=np.float64))
    order = np.sort(pool)
    ranks = np.searchsorted(order, flat, side="left")
    denom = max(order.size - 1, 1)
    return (ranks / denom).reshape(np.shape(values))


def _separable(values: np.ndarray, half_width: int, fn) -> np.ndarray:
    """Apply a separable window operator (box filter family) to a 2-D array."""
    width = half_width * 2 + 1
    rows = np.pad(values, ((0, 0), (half_width, half_width)), mode="edge")
    rows = fn(np.lib.stride_tricks.sliding_window_view(rows, width, axis=1), axis=2)
    cols = np.pad(rows, ((half_width, half_width), (0, 0)), mode="edge")
    return fn(np.lib.stride_tricks.sliding_window_view(cols, width, axis=0), axis=2)


def window_extent(values: np.ndarray, half_width: int) -> np.ndarray:
    """Local relief: window maximum minus window minimum. O(n) per cell."""
    hi = _separable(values, half_width, np.max)
    lo = _separable(values, half_width, np.min)
    return hi - lo


def window_std(values: np.ndarray, half_width: int) -> np.ndarray:
    """Local standard deviation inside a square window."""
    mean = _separable(values, half_width, np.mean)
    mean_sq = _separable(values * values, half_width, np.mean)
    return np.sqrt(np.maximum(mean_sq - mean * mean, 0.0))


def sample_grid(grid: np.ndarray, lat_axis: np.ndarray, lon_axis: np.ndarray, lat: float, lon: float):
    """Nearest-cell lookup. Returns ``(value, i, j)`` or ``(None, None, None)``."""
    if not (lat_axis[0] - 1e-9 <= lat <= lat_axis[-1] + 1e-9):
        return None, None, None
    if not (lon_axis[0] - 1e-9 <= lon <= lon_axis[-1] + 1e-9):
        return None, None, None
    i = int(np.clip(np.searchsorted(lat_axis, lat), 0, len(lat_axis) - 1))
    j = int(np.clip(np.searchsorted(lon_axis, lon), 0, len(lon_axis) - 1))
    return grid[i, j], i, j


def nearest_point_index(lat: float, lon: float, src_lat: np.ndarray, src_lon: np.ndarray) -> int:
    d = haversine_km(lat, lon, np.asarray(src_lat), np.asarray(src_lon))
    return int(np.argmin(d))


def distance_to_nearest_km(
    lat2d: np.ndarray,
    lon2d: np.ndarray,
    src_lat: np.ndarray,
    src_lon: np.ndarray,
    chunk: int = 2000,
) -> np.ndarray:
    """Distance from every grid cell to the nearest control point."""
    lat_flat = np.asarray(lat2d, dtype=np.float64).ravel()
    lon_flat = np.asarray(lon2d, dtype=np.float64).ravel()
    s_lat = np.asarray(src_lat, dtype=np.float64).ravel()
    s_lon = np.asarray(src_lon, dtype=np.float64).ravel()
    out = np.empty(lat_flat.size, dtype=np.float64)
    for start in range(0, lat_flat.size, chunk):
        stop = min(start + chunk, lat_flat.size)
        d = haversine_km(
            lat_flat[start:stop, None], lon_flat[start:stop, None], s_lat[None, :], s_lon[None, :]
        )
        out[start:stop] = d.min(axis=1)
    return out.reshape(np.shape(lat2d))


def cumulative_distance_km(lat: Iterable[float], lon: Iterable[float]) -> np.ndarray:
    """Along-path cumulative distance for a waypoint chain."""
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    if lat.size < 2:
        return np.zeros(lat.size)
    seg = haversine_km(lat[:-1], lon[:-1], lat[1:], lon[1:])
    return np.concatenate([[0.0], np.cumsum(seg)])


def densify(lat: Sequence[float], lon: Sequence[float], spacing_km: float = 2.0):
    """Insert points along a waypoint chain so a corridor can be sampled finely."""
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    if lat.size < 2:
        return lat, lon, np.zeros(lat.size)

    out_lat = [float(lat[0])]
    out_lon = [float(lon[0])]
    for i in range(lat.size - 1):
        leg = float(haversine_km(lat[i], lon[i], lat[i + 1], lon[i + 1]))
        steps = max(int(np.ceil(leg / spacing_km)), 1)
        for t in np.linspace(0.0, 1.0, steps + 1)[1:]:
            out_lat.append(float(lat[i] + (lat[i + 1] - lat[i]) * t))
            out_lon.append(float(lon[i] + (lon[i + 1] - lon[i]) * t))

    out_lat = np.asarray(out_lat)
    out_lon = np.asarray(out_lon)
    return out_lat, out_lon, cumulative_distance_km(out_lat, out_lon)
