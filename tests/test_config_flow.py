"""Tests for the config flow."""
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.sa_cfs_fire_danger.const import CONF_DISTRICTS, DOMAIN, XML_URL


async def test_user_flow(hass: HomeAssistant, aioclient_mock, feed_xml):
    aioclient_mock.get(XML_URL, text=feed_xml)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_DISTRICTS: ["flinders"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_DISTRICTS: ["flinders"]}


async def test_single_instance(hass: HomeAssistant):
    MockConfigEntry(domain=DOMAIN, data={CONF_DISTRICTS: []}).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] in ("already_configured", "single_instance_allowed")
