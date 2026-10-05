"""Parse the CFS fire danger XML feed into plain Python data.

Kept free of Home Assistant imports so it can be unit tested on its own.
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, tzinfo

from .const import RATINGS

_LOGGER = logging.getLogger(__name__)

_RATING_LOOKUP = {rating.lower(): rating for rating in RATINGS}


def district_key(district_name: str | None) -> str | None:
    """Create a consistent key from a district name."""
    if not district_name:
        return None
    return district_name.lower().replace(" ", "_").replace("-", "_").replace("/", "")


def rating_level(rating: str | None) -> int | None:
    """Return the numeric level (0-4) for a rating."""
    return RATINGS.index(rating) if rating in RATINGS else None


def _text(period: ET.Element, text_type: str) -> str | None:
    element = period.find(f"./text[@type='{text_type}']")
    if element is None or element.text is None:
        return None
    return element.text.strip()


def _parse_rating(value: str | None) -> str | None:
    if value is None:
        return None
    rating = _RATING_LOOKUP.get(value.lower())
    if rating is None:
        _LOGGER.debug("Unrecognised fire danger rating %r", value)
    return rating


def _parse_fbi(value: str | None) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _parse_fire_ban(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.lower() == "true"


def _parse_datetime(value: str | None, default_tz: tzinfo) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=default_tz)
    return parsed


def parse_feed(xml_data: str, local_tz: tzinfo) -> dict:
    """Parse the feed.

    Returns {"issued": datetime | None, "districts": {key: {"name": str,
    "days": {date: {"rating", "fbi", "fire_ban"}}}}}.

    Forecast periods are keyed by their local date. When the feed holds more
    than one period for the same date, the one with the latest start time wins.
    """
    xml_data = xml_data.removeprefix("﻿")
    root = ET.fromstring(xml_data)

    issued = _parse_datetime(root.findtext("updated"), local_tz)

    districts: dict[str, dict] = {}
    for area in root.findall('./forecast/area[@type="fire-district"]'):
        name = area.get("description")
        key = district_key(name)
        if not key:
            continue

        days: dict[date, dict] = {}
        starts: dict[date, datetime] = {}
        for period in area.findall("./forecast-period"):
            start = _parse_datetime(period.get("start-time-local"), local_tz)
            if start is None:
                continue
            # start-time-local is already SA local time; use its date as written.
            day = start.date()
            if day in starts and start < starts[day]:
                continue
            starts[day] = start
            days[day] = {
                "rating": _parse_rating(_text(period, "fire_danger")),
                "fbi": _parse_fbi(_text(period, "fbi")),
                "fire_ban": _parse_fire_ban(_text(period, "fire_ban")),
            }

        districts[key] = {"name": name, "days": days}

    return {"issued": issued, "districts": districts}


def forecast_for(district: dict, day: date) -> dict:
    """Return the forecast for a date, with None values when the feed has none."""
    forecast = district["days"].get(day) or {}
    rating = forecast.get("rating")
    return {
        "rating": rating,
        "level": rating_level(rating),
        "fbi": forecast.get("fbi"),
        "fire_ban": forecast.get("fire_ban"),
    }


def forecast_dates(today: date, days: int) -> list[date]:
    """Return the dates for day 1 (today) to day N."""
    return [today + timedelta(days=offset) for offset in range(days)]
