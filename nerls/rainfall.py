"""Rainfall: long-period climatology, live observation/forecast, and the
trigger intensity used by the hazard model.

Three modes exist and the API always states which one produced a number:

``climatology``
    No live feed. The trigger intensity is the cell's long-period mean 72-hour
    rainfall for the current calendar month. This supports "normal seasonal
    conditions" reporting and user-driven scenario analysis, and it is never
    described as a forecast.

``forecast``
    A live provider answered. The trigger intensity is observed 72-hour
    rainfall plus forecast rainfall over the requested horizon.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import numpy as np

from . import config
from .geo import inverse_distance_weights
from .reference import Reference

DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


# --------------------------------------------------------------------------
# Climatology
# --------------------------------------------------------------------------


def monthly_rainfall_grids(ref: Reference, lat2d: np.ndarray, lon2d: np.ndarray) -> np.ndarray:
    """Interpolate long-period mean rainfall for each month.

    Returns an array of shape ``(12, *lat2d.shape)`` in millimetres per month.
    The station annual total is split by its regime's monthly profile, then the
    twelve monthly fields are interpolated independently — so a cell inherits a
    smooth blend of neighbouring station regimes rather than one station's.
    """
    station_lat = np.asarray([s["lat"] for s in ref.rainfall_stations], dtype=np.float64)
    station_lon = np.asarray([s["lon"] for s in ref.rainfall_stations], dtype=np.float64)
    annual = np.asarray([float(s["annual_mm"]) for s in ref.rainfall_stations], dtype=np.float64)
    profiles = np.asarray(
        [ref.rainfall_profiles[s["profile"]] for s in ref.rainfall_stations], dtype=np.float64
    )

    grid = np.empty((12,) + lat2d.shape, dtype=np.float32)
    for month in range(12):
        values = annual * profiles[:, month]
        grid[month] = inverse_distance_weights(
            lat2d.ravel(),
            lon2d.ravel(),
            station_lat,
            station_lon,
            values,
            neighbours=6,
            power=2.4,
        ).reshape(lat2d.shape).astype(np.float32)
    return grid


def wet_window_mean(monthly_mm: np.ndarray, month: int, days: int) -> np.ndarray:
    """Mean rainfall total over ``days`` consecutive days in a month (mm)."""
    days_in = DAYS_IN_MONTH[month]
    return monthly_mm[month] * (min(days, days_in) / days_in)


def reference_intensity(monthly_mm: np.ndarray, month: int, ref: Reference) -> np.ndarray:
    """Cell-scale reference 72-hour intensity ``I_ref`` (mm).

    Derived from climatology — three times the mean 3-day rainfall of the
    wettest normal month — so it describes the local monsoon scale rather than
    a fitted geotechnical threshold. Replace it with calibrated thresholds via
    :mod:`nerls.calibration` once an inventory with dated events is available.
    """
    wet_days = int(ref.trigger_reference.get("wet_window_days", 3))
    multiplier = float(ref.trigger_reference.get("peak_month_multiplier", 3.0))
    monthly_means = np.stack(
        [wet_window_mean(monthly_mm, m, wet_days) for m in range(12)], axis=0
    )
    peak = monthly_means.max(axis=0)
    return (multiplier * peak).astype(np.float32)


def seasonal_context(month: int, ref: Reference) -> dict[str, Any]:
    """Which rainfall regime the current month sits in, and whether that regime
    is one in which rainfall-triggered slope failure is plausible."""
    windows = ref.trigger_reference.get("season_windows", {})
    label = "dry"
    for name, months in windows.items():
        if month in months:
            label = name
            break
    active = label in ("southwest_monsoon", "pre_monsoon", "retreat_cyclonic")
    return {
        "month": month,
        "regime": label,
        "trigger_season_active": bool(active),
        "note": (
            "Rainfall-triggered slope failure is plausible in this window."
            if active
            else "Outside the monsoon windows: rainfall-triggered failures are uncommon, "
            "but earthquake and GLOF triggers are season-independent."
        ),
    }


# --------------------------------------------------------------------------
# Live provider
# --------------------------------------------------------------------------


@dataclass
class LiveRainfall:
    """Result of a live rainfall lookup, including how it was obtained."""

    available: bool
    past_72h_mm: float | None
    forecast_24h_mm: float | None
    forecast_72h_mm: float | None
    source: str
    detail: str
    fetched_at: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "past_72h_mm": self.past_72h_mm,
            "forecast_24h_mm": self.forecast_24h_mm,
            "forecast_72h_mm": self.forecast_72h_mm,
            "source": self.source,
            "detail": self.detail,
            "fetched_at": self.fetched_at,
        }


class LiveRainfallProvider:
    """Open-Meteo client with a short-lived memory cache.

    A failure (no route, TLS blocked, provider error) is cached too, so a
    disconnected deployment does not pay a timeout on every request. The engine
    is designed to run entirely without this class.
    """

    def __init__(self, ttl: int | None = None, timeout: int | None = None) -> None:
        self.ttl = int(ttl or config.RAINFALL_CACHE_TTL)
        self.timeout = int(timeout or config.RAINFALL_TIMEOUT)
        self._cache: dict[tuple[float, float], tuple[float, LiveRainfall]] = {}
        self.enabled = config.LIVE_RAINFALL_ENABLED
        self.last_error: str | None = None
        self.last_success: float | None = None
        self._breaker_until = 0.0
        self.breaker_seconds = int(config.RAINFALL_RETRY_AFTER_FAILURE)

    def _fetch_point(self, lat: float, lon: float) -> LiveRainfall:
        key = (round(lat, 3), round(lon, 3))
        now = time.time()
        cached = self._cache.get(key)
        if cached and now - cached[0] < self.ttl:
            return cached[1]

        if self.enabled and now < self._breaker_until:
            # A previous attempt failed. Do not make every request pay the
            # timeout again: report the climatology fallback until the breaker
            # window expires.
            return LiveRainfall(
                False,
                None,
                None,
                None,
                "open-meteo",
                f"live feed unavailable, retrying in {int(self._breaker_until - now)}s "
                f"({self.last_error or 'no successful fetch'})",
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            )

        result = self._request(lat, lon)
        self._cache[key] = (now, result)
        return result

    def _request(self, lat: float, lon: float) -> LiveRainfall:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if not self.enabled:
            return LiveRainfall(
                False, None, None, None, "disabled", "live rainfall disabled by configuration", stamp
            )

        params = {
            "latitude": f"{lat:.3f}",
            "longitude": f"{lon:.3f}",
            "hourly": "precipitation",
            "past_days": "3",
            "forecast_days": "4",
            "timezone": "UTC",
        }
        url = f"{config.OPEN_METEO_URL}?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            self._breaker_until = time.time() + self.breaker_seconds
            return LiveRainfall(
                False,
                None,
                None,
                None,
                "open-meteo",
                f"live rainfall unavailable ({type(exc).__name__})",
                stamp,
            )

        return self._parse(payload, stamp)

    @staticmethod
    def _parse(payload: dict[str, Any], stamp: str) -> LiveRainfall:
        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        values = hourly.get("precipitation") or []
        if not times or len(times) != len(values):
            return LiveRainfall(
                False, None, None, None, "open-meteo", "provider returned no usable series", stamp
            )

        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        past = 0.0
        future_24 = 0.0
        future_72 = 0.0

        for t, v in zip(times, values):
            if v is None:
                continue
            try:
                when = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            hours = (when - now).total_seconds() / 3600.0
            value = float(v)
            if -72.0 <= hours < 0.0:
                past += value
            elif 0.0 <= hours <= 24.0:
                future_24 += value
                future_72 += value
            elif 24.0 < hours <= 72.0:
                future_72 += value

        return LiveRainfall(
            True,
            round(past, 1),
            round(future_24, 1),
            round(future_72, 1),
            "open-meteo",
            "observed (past 72 h, from reanalysis-blended hourly series) plus forecast",
            stamp,
        )

    def get(self, lat: float, lon: float) -> LiveRainfall:
        result = self._fetch_point(lat, lon)
        if result.available:
            self.last_success = time.time()
            self.last_error = None
            self._breaker_until = 0.0
        return result

    def mode(self) -> str:
        """``live`` only once a live response has actually arrived."""
        if not self.enabled:
            return "disabled"
        if self.last_success is not None and time.time() - self.last_success < self.ttl:
            return "live"
        return "climatology"

    def status(self) -> dict[str, Any]:
        now = time.time()
        return {
            "provider": "open-meteo",
            "endpoint": config.OPEN_METEO_URL,
            "enabled": bool(self.enabled),
            "mode": self.mode(),
            "cached_points": len(self._cache),
            "ttl_seconds": self.ttl,
            "last_error": self.last_error,
            "last_success": (
                datetime.fromtimestamp(self.last_success, timezone.utc).isoformat(timespec="seconds")
                if self.last_success
                else None
            ),
            "retry_after_seconds": max(0, int(self._breaker_until - now)),
        }
