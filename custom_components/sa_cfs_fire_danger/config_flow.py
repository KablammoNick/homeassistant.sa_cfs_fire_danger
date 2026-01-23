import voluptuous as vol
import aiohttp
import xml.etree.ElementTree as ET

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import selector

from .const import DOMAIN, CONF_DISTRICTS, XML_URL

async def get_all_districts(hass):
    """Fetch all available districts from the CFS XML feed."""
    session = async_get_clientsession(hass)
    async with session.get(XML_URL, timeout=10) as response:
        response.raise_for_status()
        xml_data = await response.text()
        
        if xml_data.startswith('\ufeff'):
            xml_data = xml_data[1:]
        
        root = ET.fromstring(xml_data)
        area_elements = root.findall('./forecast/area[@type="fire-district"]')
        
        all_districts = {
            area.get('description').lower().replace(' ', '_').replace('-', '_').replace('/', ''): area.get('description')
            for area in area_elements if area.get('description')
        }
        
        return dict(sorted(all_districts.items(), key=lambda item: item[1]))

class CFSConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SA CFS Fire Danger."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if user_input is not None:
            return self.async_create_entry(title="SA CFS Fire Danger", data=user_input)

        try:
            sorted_districts = await get_all_districts(self.hass)
        except (aiohttp.ClientError, ET.ParseError):
            return self.async_abort(reason="cannot_connect")

        if not sorted_districts:
            return self.async_abort(reason="no_districts_found")

        schema = vol.Schema({
            vol.Optional(CONF_DISTRICTS, default=[]): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        {"value": key, "label": name} for key, name in sorted_districts.items()
                    ],
                    multiple=True,
                    sort=False
                )
            )
        })

        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return OptionsFlowHandler(config_entry)


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle an options flow to allow re-configuring."""

    def __init__(self, config_entry: config_entries.ConfigEntry):
        """Initialize options flow."""
        # This method is required to accept the config_entry argument.
        # We do nothing here and let the Home Assistant framework populate
        # the self.config_entry property for us to use in other methods.
        pass

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        try:
            sorted_districts = await get_all_districts(self.hass)
        except (aiohttp.ClientError, ET.ParseError):
            return self.async_abort(reason="cannot_connect")

        # The self.config_entry property is automatically available here
        current_districts = self.config_entry.options.get(
            CONF_DISTRICTS, self.config_entry.data.get(CONF_DISTRICTS, [])
        )

        schema = vol.Schema({
            vol.Optional(CONF_DISTRICTS, default=current_districts): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        {"value": key, "label": name} for key, name in sorted_districts.items()
                    ],
                    multiple=True,
                    sort=False
                )
            )
        })

        return self.async_show_form(step_id="init", data_schema=schema)