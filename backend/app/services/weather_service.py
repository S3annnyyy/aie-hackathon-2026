from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

_NOMINATIM = "https://nominatim.openstreetmap.org/search"
_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
_UA = "aie-hackathon-2026/1.0 (interior-design-tool)"


@dataclass
class GeocodeResult:
    lat: float
    lon: float
    display_name: str


@dataclass
class SolarSample:
    time: str
    solar_azimuth: float
    solar_elevation: float


@dataclass
class EnvironmentData:
    lat: float
    lon: float
    wind_speed: float
    wind_direction: float
    solar_azimuth: float
    solar_elevation: float
    timestamp: str
    timezone: str
    utc_offset_seconds: int
    solar_samples: list[SolarSample]


async def geocode(query: str) -> list[GeocodeResult]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _NOMINATIM,
            params={"q": query, "format": "json", "limit": 5, "addressdetails": "0"},
            headers={"User-Agent": _UA},
        )
        resp.raise_for_status()
        data: list[dict] = resp.json()

    return [
        GeocodeResult(lat=float(r["lat"]), lon=float(r["lon"]), display_name=r["display_name"])
        for r in data
    ]


def _solar_position(lat_deg: float, lon_deg: float, utc_dt: datetime) -> tuple[float, float]:
    """Return (azimuth_deg, elevation_deg) using the NOAA simplified algorithm.

    Azimuth is 0=N, 90=E, 180=S, 270=W (meteorological convention).
    """
    lat = math.radians(lat_deg)

    # Julian date
    jd = (
        utc_dt.toordinal()
        + 1721424.5
        + (utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600) / 24
    )
    jc = (jd - 2451545.0) / 36525  # Julian century

    # Geometric mean longitude and anomaly of sun (degrees)
    geom_mean_lon = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    geom_mean_anom = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)

    # Equation of centre
    anom_r = math.radians(geom_mean_anom)
    eq_ctr = (
        math.sin(anom_r) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
        + math.sin(2 * anom_r) * (0.019993 - 0.000101 * jc)
        + math.sin(3 * anom_r) * 0.000289
    )

    sun_lon = geom_mean_lon + eq_ctr  # apparent longitude
    sun_lon_r = math.radians(sun_lon)

    # Obliquity of ecliptic
    obliq = math.radians(23.439 - 0.0000004 * jc * 36525)

    # Declination
    declin = math.asin(math.sin(obliq) * math.sin(sun_lon_r))

    # Equation of time (minutes)
    lon0_r = math.radians(geom_mean_lon)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    y = math.tan(obliq / 2) ** 2
    eq_time = 4 * math.degrees(
        y * math.sin(2 * lon0_r)
        - 2 * e * math.sin(anom_r)
        + 4 * e * y * math.sin(anom_r) * math.cos(2 * lon0_r)
        - 0.5 * y * y * math.sin(4 * lon0_r)
        - 1.25 * e * e * math.sin(2 * anom_r)
    )

    # True solar time (minutes)
    day_minutes = (utc_dt.hour * 60 + utc_dt.minute + utc_dt.second / 60)
    true_solar = day_minutes + eq_time + 4 * lon_deg  # lon offset: 4 min per degree

    # Hour angle
    hour_angle_deg = true_solar / 4 - 180
    ha = math.radians(hour_angle_deg)

    # Solar elevation
    cos_zenith = (
        math.sin(lat) * math.sin(declin)
        + math.cos(lat) * math.cos(declin) * math.cos(ha)
    )
    elevation = math.degrees(math.asin(cos_zenith))

    # Azimuth (from North, clockwise)
    cos_az = (math.sin(declin) - math.sin(math.radians(elevation)) * math.sin(lat)) / (
        math.cos(math.radians(elevation)) * math.cos(lat)
    )
    cos_az = max(-1.0, min(1.0, cos_az))
    az_raw = math.degrees(math.acos(cos_az))
    azimuth = az_raw if hour_angle_deg < 0 else 360 - az_raw

    return azimuth, elevation


async def get_environment(lat: float, lon: float) -> EnvironmentData:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _OPEN_METEO,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "wind_speed_10m,wind_direction_10m",
                "timezone": "auto",
                "forecast_days": 1,
            },
        )
        resp.raise_for_status()
        data: dict = resp.json()

    current = data["current"]
    timestamp: str = current["time"]  # e.g. "2024-01-15T14:00"
    timezone_name = str(data.get("timezone") or "local")
    utc_offset_seconds = int(data.get("utc_offset_seconds") or 0)

    local_now = datetime.fromisoformat(timestamp)
    utc_now = (local_now - timedelta(seconds=utc_offset_seconds)).replace(tzinfo=timezone.utc)
    solar_azimuth, solar_elevation = _solar_position(lat, lon, utc_now)

    solar_samples: list[SolarSample] = []
    for hour in range(5, 21):
        for minute in (0, 30):
            local_sample = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            utc_sample = (local_sample - timedelta(seconds=utc_offset_seconds)).replace(tzinfo=timezone.utc)
            sample_azimuth, sample_elevation = _solar_position(lat, lon, utc_sample)
            solar_samples.append(
                SolarSample(
                    time=local_sample.isoformat(timespec="minutes"),
                    solar_azimuth=round(sample_azimuth, 1),
                    solar_elevation=round(sample_elevation, 1),
                )
            )

    return EnvironmentData(
        lat=lat,
        lon=lon,
        wind_speed=float(current["wind_speed_10m"]),
        wind_direction=float(current["wind_direction_10m"]),
        solar_azimuth=round(solar_azimuth, 1),
        solar_elevation=round(solar_elevation, 1),
        timestamp=timestamp,
        timezone=timezone_name,
        utc_offset_seconds=utc_offset_seconds,
        solar_samples=solar_samples,
    )
