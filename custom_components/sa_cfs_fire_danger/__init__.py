"""The SA CFS Fire Danger custom component."""
from __future__ import annotations

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.typing import ConfigType

from .const import CONF_DISTRICTS, DOMAIN
from .coordinator import CFSDataUpdateCoordinator, CFSRuntimeData

PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR]
STATIC_URL = f"/hacsfiles/{DOMAIN}"

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Unique ID suffixes created for each selected district.
DISTRICT_ENTITY_SUFFIXES = (
    "fire_danger_rating",
    "fire_behaviour_index",
    "total_fire_ban_today",
    "total_fire_ban_tomorrow",
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the card and images once, so reloading an entry doesn't re-register them."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=STATIC_URL,
                path=hass.config.path(f"custom_components/{DOMAIN}/www"),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, f"{STATIC_URL}/sa-cfs-fire-danger-card.js")
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SA CFS Fire Danger from a config entry."""
    coordinator = CFSDataUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    selected = entry.options.get(CONF_DISTRICTS, entry.data.get(CONF_DISTRICTS, []))
    districts = [key for key in selected if key in coordinator.data["districts"]]
    entry.runtime_data = CFSRuntimeData(coordinator, districts)

    _remove_stale_entries(hass, entry, selected)

    entry.async_on_unload(entry.add_update_listener(update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


def _remove_stale_entries(
    hass: HomeAssistant, entry: ConfigEntry, selected: list[str]
) -> None:
    """Remove entities and devices for deselected districts and old (pre-0.2) sensors."""
    expected_ids = {f"{DOMAIN}_summary"} | {
        f"{DOMAIN}_{key}_{suffix}" for key in selected for suffix in DISTRICT_ENTITY_SUFFIXES
    }
    ent_reg = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
        if entity.unique_id not in expected_ids:
            ent_reg.async_remove(entity.entity_id)

    expected_devices = {DOMAIN, *selected}
    dev_reg = dr.async_get(hass)
    for device in dr.async_entries_for_config_entry(dev_reg, entry.entry_id):
        if not any(
            domain == DOMAIN and key in expected_devices
            for domain, key in device.identifiers
        ):
            dev_reg.async_update_device(device.id, remove_config_entry_id=entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)
