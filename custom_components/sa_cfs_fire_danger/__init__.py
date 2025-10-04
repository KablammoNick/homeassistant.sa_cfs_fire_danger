"""The SA CFS Fire Danger custom component."""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN, CONF_REGIONS

PLATFORMS = ["sensor"]
_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SA CFS Fire Danger from a config entry and clean up orphaned entities."""
    hass.data.setdefault(DOMAIN, {})

    # Correctly get the current list of selected regions from options or initial data
    selected_regions = entry.options.get(CONF_REGIONS, entry.data.get(CONF_REGIONS, []))
    
    # Create a set of unique IDs that should exist.
    # The summary sensor (unique_id == DOMAIN) should always exist.
    desired_unique_ids = {f"{DOMAIN}_{key}" for key in selected_regions}
    desired_unique_ids.add(DOMAIN)

    # Get the entity registry
    entity_registry = er.async_get(hass)
    
    # Get all entities currently associated with this config entry
    existing_entities = er.async_entries_for_config_entry(
        entity_registry, entry.entry_id
    )

    # Find entities that are no longer in the desired list and remove them
    for entity in existing_entities:
        if entity.unique_id not in desired_unique_ids:
            _LOGGER.info(f"Removing orphaned entity: {entity.entity_id} ({entity.unique_id})")
            # --- START OF FIX ---
            # The correct method name is async_remove
            entity_registry.async_remove(entity.entity_id)
            # --- END OF FIX ---
    
    # Add an update listener that will reload the integration when options are updated
    entry.async_on_unload(entry.add_update_listener(update_listener))

    # Forward the setup to the sensor platform.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

async def update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)