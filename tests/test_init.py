"""Tests for setting up the integration."""
import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.sa_cfs_fire_danger.const import CONF_DISTRICTS, DOMAIN, XML_URL

# 08:00 on 5 Oct in Adelaide (UTC+10:30) is still 4 Oct in UTC.
NOW = "2026-10-04T21:30:00+00:00"


@pytest.fixture
async def entry(hass: HomeAssistant, aioclient_mock, feed_xml, freezer: FrozenDateTimeFactory):
    freezer.move_to(NOW)
    aioclient_mock.get(XML_URL, text=feed_xml)
    entry = MockConfigEntry(domain=DOMAIN, data={CONF_DISTRICTS: ["flinders"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_district_entities(hass: HomeAssistant, entry):
    rating = hass.states.get("sensor.sa_cfs_flinders_fire_danger_rating")
    assert rating.state == "High"  # today in SA, not the first period or UTC date
    assert rating.attributes["level"] == 2
    assert rating.attributes["day_1_rating"] == "High"
    assert rating.attributes["day_1_fire_ban"] is True
    assert rating.attributes["day_2_rating"] == "Extreme"
    assert rating.attributes["day_3_rating"] == "No Rating"
    assert rating.attributes["day_4_rating"] is None
    assert [day["date"] for day in rating.attributes["forecast"]] == [
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
    ]

    assert hass.states.get("sensor.sa_cfs_flinders_fire_behaviour_index").state == "30"
    assert hass.states.get("binary_sensor.sa_cfs_flinders_total_fire_ban_today").state == "on"
    assert hass.states.get("binary_sensor.sa_cfs_flinders_total_fire_ban_tomorrow").state == "on"

    # Only selected districts get entities.
    assert hass.states.get("sensor.sa_cfs_mount_lofty_ranges_fire_danger_rating") is None


async def test_summary_sensor(hass: HomeAssistant, entry):
    issued = hass.states.get("sensor.sa_cfs_fire_danger_summary")
    assert issued.state == "2026-10-04T05:30:00+00:00"
    assert issued.attributes["day_1_name"] == "Monday"
    assert issued.attributes["day_1_date"] == "05/10"
    assert issued.attributes["districts"]["mount_lofty_ranges"] == {
        "name": "Mount Lofty Ranges",
        "rating": "Catastrophic",
        "level": 4,
        "fbi": 110,
        "fire_ban": True,
    }


async def test_options_change_reloads(hass: HomeAssistant, entry):
    hass.config_entries.async_update_entry(
        entry, options={CONF_DISTRICTS: ["mount_lofty_ranges"]}
    )
    await hass.async_block_till_done()

    assert hass.states.get("sensor.sa_cfs_mount_lofty_ranges_fire_danger_rating").state == "Catastrophic"
    assert er.async_get(hass).async_get("sensor.sa_cfs_flinders_fire_danger_rating") is None


async def test_old_entities_removed(hass: HomeAssistant, aioclient_mock, feed_xml):
    aioclient_mock.get(XML_URL, text=feed_xml)
    entry = MockConfigEntry(domain=DOMAIN, data={CONF_DISTRICTS: ["flinders"]})
    entry.add_to_hass(hass)
    ent_reg = er.async_get(hass)
    old = ent_reg.async_get_or_create(
        "sensor", DOMAIN, f"{DOMAIN}_flinders", config_entry=entry
    )
    old_issued = ent_reg.async_get_or_create(
        "sensor", DOMAIN, f"{DOMAIN}_issued", config_entry=entry
    )

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert ent_reg.async_get(old.entity_id) is None
    assert ent_reg.async_get(old_issued.entity_id) is None
    assert hass.states.get("sensor.sa_cfs_fire_danger_summary") is not None
