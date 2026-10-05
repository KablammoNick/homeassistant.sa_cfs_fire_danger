"""Tests for the feed parser."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from custom_components.sa_cfs_fire_danger.parser import (
    district_key,
    forecast_for,
    parse_feed,
)

SA = ZoneInfo("Australia/Adelaide")


def test_parse_feed(feed_xml):
    feed = parse_feed("﻿" + feed_xml, SA)

    assert feed["issued"] == datetime(2026, 10, 4, 16, 0, tzinfo=SA)
    assert feed["issued"].utcoffset().total_seconds() == 10.5 * 3600
    assert set(feed["districts"]) == {"flinders", "mount_lofty_ranges"}

    flinders = feed["districts"]["flinders"]
    assert flinders["name"] == "Flinders"
    # Two periods for 5 Oct: the later one wins.
    assert flinders["days"][date(2026, 10, 5)] == {
        "rating": "High",
        "fbi": 30,
        "fire_ban": True,
    }
    assert sorted(flinders["days"]) == [
        date(2026, 10, 4),
        date(2026, 10, 5),
        date(2026, 10, 6),
        date(2026, 10, 7),
    ]

    # Ratings are normalised to the AFDRS spelling.
    mlr = feed["districts"]["mount_lofty_ranges"]
    assert mlr["days"][date(2026, 10, 5)]["rating"] == "Catastrophic"


def test_forecast_for_missing_day(feed_xml):
    feed = parse_feed(feed_xml, SA)
    assert forecast_for(feed["districts"]["flinders"], date(2026, 10, 9)) == {
        "rating": None,
        "level": None,
        "fbi": None,
        "fire_ban": None,
    }
    assert forecast_for(feed["districts"]["flinders"], date(2026, 10, 6))["level"] == 3


def test_district_key():
    assert district_key("North East Pastoral") == "north_east_pastoral"
    assert district_key(None) is None
