import asyncio
import xml.etree.ElementTree as ET

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_DISTRICTS, DOMAIN
from .coordinator import async_fetch_feed


async def get_all_districts(hass):
    """Fetch all available districts from the CFS XML feed, sorted by name."""
    feed = await async_fetch_feed(hass)
    all_districts = {key: district["name"] for key, district in feed["districts"].items()}
    return dict(sorted(all_districts.items(), key=lambda item: item[1]))


def _districts_schema(districts, default):
    return vol.Schema({
        vol.Optional(CONF_DISTRICTS, default=default): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[
                    {"value": key, "label": name} for key, name in districts.items()
                ],
                multiple=True,
                sort=False
            )
        )
    })


class CFSConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SA CFS Fire Danger."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            return self.async_create_entry(title="SA CFS Fire Danger", data=user_input)

        try:
            sorted_districts = await get_all_districts(self.hass)
        except (aiohttp.ClientError, asyncio.TimeoutError, ET.ParseError):
            return self.async_abort(reason="cannot_connect")

        if not sorted_districts:
            return self.async_abort(reason="no_districts_found")

        return self.async_show_form(
            step_id="user", data_schema=_districts_schema(sorted_districts, [])
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return OptionsFlowHandler()


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle an options flow to allow re-configuring."""

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        try:
            sorted_districts = await get_all_districts(self.hass)
        except (aiohttp.ClientError, asyncio.TimeoutError, ET.ParseError):
            return self.async_abort(reason="cannot_connect")

        current_districts = self.config_entry.options.get(
            CONF_DISTRICTS, self.config_entry.data.get(CONF_DISTRICTS, [])
        )

        return self.async_show_form(
            step_id="init", data_schema=_districts_schema(sorted_districts, current_districts)
        )
