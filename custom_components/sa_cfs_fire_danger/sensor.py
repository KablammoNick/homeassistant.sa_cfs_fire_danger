"""Sensor platform for SA CFS Fire Danger."""
import logging
from datetime import timedelta, datetime, timezone
import xml.etree.ElementTree as ET
import aiohttp

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.entity import Entity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, CONF_DISTRICTS, XML_URL

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(hours=1)
MAX_FORECAST_DAYS = 5

def clean_district_key(district_name):
    """Helper function to create a consistent key from district names."""
    if not district_name:
        return None
    return district_name.lower().replace(' ', '_').replace('-', '_').replace('/', '')

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    """Set up the sensor platform."""
    
    coordinator = CFSDataUpdateCoordinator(hass)
    await coordinator.async_config_entry_first_refresh()

    # Correctly get district selections from options, falling back to initial data
    selected_districts_for_sensors = entry.options.get(
        CONF_DISTRICTS, entry.data.get(CONF_DISTRICTS, [])
    )
    
    sensors = []
    if coordinator.data:
        for area in coordinator.data.get("areas", []):
            district_key = clean_district_key(area.get("description"))
            if district_key in selected_districts_for_sensors:
                sensors.append(CFSDistrictSensor(coordinator, district_key))
        
        sensors.append(CFSSummarySensor(coordinator))

    async_add_entities(sensors, update_before_add=True)


class CFSDataUpdateCoordinator(DataUpdateCoordinator):
    """Class to manage fetching CFS data."""

    def __init__(self, hass):
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )

    async def _async_update_data(self):
        """Fetch data from the XML endpoint and parse it."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(XML_URL, timeout=15) as response:
                    response.raise_for_status()
                    xml_data = await response.text()
                    if xml_data.startswith('\ufeff'):
                        xml_data = xml_data[1:]
                    
                    root = ET.fromstring(xml_data)
                    
                    data = {"areas": [], "updated_time": None}
                    updated_element = root.find('updated')
                    if updated_element is not None and updated_element.text:
                        data["updated_time"] = updated_element.text

                    area_elements = root.findall('./forecast/area[@type="fire-district"]')
                    data["areas"] = area_elements
                        
                    return data
        except Exception as err:
            raise UpdateFailed(f"Error communicating with CFS server: {err}")


class CFSSummarySensor(Entity):
    """Representation of the comprehensive summary sensor."""

    def __init__(self, coordinator: CFSDataUpdateCoordinator):
        """Initialize the sensor."""
        self.coordinator = coordinator
        self._attr_name = "SA CFS Fire Danger"
        self._attr_unique_id = DOMAIN
        self._attr_icon = "mdi:fire-alert"

    @property
    def state(self):
        """Return the state of the sensor (last update time)."""
        if not self.coordinator.data or not self.coordinator.data.get("updated_time"):
            return "Unknown"
        
        try:
            dt_object = datetime.fromisoformat(self.coordinator.data["updated_time"])
            dt_local = dt_object.astimezone(None)
            return dt_local.strftime('%H:%M %d/%m/%Y')
        except (ValueError, TypeError):
            return "Parse Error"

    @property
    def extra_state_attributes(self):
        """Return the detailed attributes of the sensor."""
        if not self.coordinator.data or not self.coordinator.data.get("areas"):
            return {}

        attrs = {"district_count": len(self.coordinator.data.get("areas", []))}
        
        current_date_utc = datetime.now(timezone.utc).date()
        for i in range(1, MAX_FORECAST_DAYS + 1):
            target_date = current_date_utc + timedelta(days=i - 1)
            attrs[f"day_{i}_name"] = target_date.strftime('%A')
            attrs[f"day_{i}_date"] = target_date.strftime('%d/%m')

        for area in self.coordinator.data.get("areas", []):
            district_key = clean_district_key(area.get('description'))
            if not district_key:
                continue

            forecast_period = area.find('./forecast-period')
            if forecast_period is not None:
                danger_el = forecast_period.find("./text[@type='fire_danger']")
                fbi_el = forecast_period.find("./text[@type='fbi']")
                ban_el = forecast_period.find("./text[@type='fire_ban']")

                if danger_el is not None and fbi_el is not None and ban_el is not None:
                    attrs[f"{district_key}_rating"] = danger_el.text
                    attrs[f"{district_key}_fbi"] = fbi_el.text
                    attrs[f"{district_key}_fireban"] = "Yes" if ban_el.text.lower() == 'true' else "No"
        
        return attrs

    @property
    def available(self):
        """Return True if coordinator has data."""
        return self.coordinator.last_update_success and bool(self.coordinator.data)

    async def async_added_to_hass(self):
        """Listen for coordinator updates."""
        self.async_on_remove(
            self.coordinator.async_add_listener(self.async_write_ha_state)
        )


class CFSDistrictSensor(Entity):
    """Representation of a single CFS district sensor."""

    def __init__(self, coordinator: CFSDataUpdateCoordinator, district_key: str):
        """Initialize the sensor."""
        self.coordinator = coordinator
        self._district_key = district_key
        self._area_data = None 
        
        pretty_name = self._district_key.replace('_', ' ').title()
        self._attr_name = f"SA CFS {pretty_name}"
        self._attr_unique_id = f"{DOMAIN}_{self._district_key}"
        self._attr_icon = "mdi:map-marker-alert-outline"
        
    def _update_area_data(self):
        """Helper to find the latest area data from the coordinator."""
        self._area_data = None
        if self.coordinator.data and self.coordinator.data.get("areas"):
            for area in self.coordinator.data.get("areas", []):
                if clean_district_key(area.get("description")) == self._district_key:
                    self._area_data = area
                    self._attr_name = f"SA CFS {area.get('description', self._district_key)}"
                    break

    @property
    def state(self):
        """Return the state of the sensor (today's fire danger rating)."""
        self._update_area_data()
        if not self._area_data:
            return "Unknown"
            
        first_period = self._area_data.find('./forecast-period')
        if first_period is not None:
            danger_el = first_period.find("./text[@type='fire_danger']")
            if danger_el is not None and danger_el.text:
                return danger_el.text
        return "Not Available"

    @property
    def extra_state_attributes(self):
        """Return the forecast attributes for this specific district."""
        self._update_area_data()
        if not self._area_data:
            return {}

        attrs = {"district_name": self._area_data.get('description')}
        periods = self._area_data.findall('./forecast-period')
        
        last_processed_date = None
        day_count = 1
        for period in periods:
            if day_count > MAX_FORECAST_DAYS:
                break
            
            start_time_str = period.get('start-time-local')
            try:
                current_date = datetime.fromisoformat(start_time_str).date()
                if current_date == last_processed_date:
                    continue
                last_processed_date = current_date
            except (ValueError, TypeError):
                pass

            danger_el = period.find("./text[@type='fire_danger']")
            fbi_el = period.find("./text[@type='fbi']")
            ban_el = period.find("./text[@type='fire_ban']")

            if danger_el is not None and fbi_el is not None and ban_el is not None:
                day_key = f"day_{day_count}"
                attrs[f"{day_key}_rating"] = danger_el.text
                attrs[f"{day_key}_fbi"] = fbi_el.text
                attrs[f"{day_key}_fireban"] = "Yes" if ban_el.text.lower() == 'true' else "No"
                attrs[f"{day_key}_name"] = last_processed_date.strftime('%A')
                attrs[f"{day_key}_date"] = last_processed_date.strftime('%d/%m')
                day_count += 1
        return attrs

    @property
    def available(self):
        """Return True if coordinator has data."""
        return self.coordinator.last_update_success and bool(self.coordinator.data)

    async def async_added_to_hass(self):
        """Listen for coordinator updates."""
        self.async_on_remove(
            self.coordinator.async_add_listener(self.async_write_ha_state)
        )
