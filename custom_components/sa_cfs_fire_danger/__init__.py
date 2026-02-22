"""The SA CFS Fire Danger custom component."""
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.frontend import add_extra_js_url
# --- THIS IS THE NEW, REQUIRED IMPORT ---
from homeassistant.components.http import StaticPathConfig

from .const import DOMAIN

PLATFORMS = ["sensor"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SA CFS Fire Danger from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry

    # 1. Register the static path FIRST.
    # This maps the physical /www folder to the virtual /hacsfiles/sa_cfs_fire_danger/ URL.
    # This is required for BOTH the .js card and the .svg/.png images.
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=f"/hacsfiles/{DOMAIN}",
                path=hass.config.path(f"custom_components/{DOMAIN}/www"),
                cache_headers=False,
            )
        ]
    )

    # 2. Tell the frontend to load the card.
    # Now that the path above exists, the browser can actually find this file.
    add_extra_js_url(hass, f"/hacsfiles/{DOMAIN}/sa-cfs-fire-danger-card.js")

    # 3. Standard platform setup
    entry.async_on_unload(entry.add_update_listener(update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok

async def update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)