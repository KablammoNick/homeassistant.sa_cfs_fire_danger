"""Binary sensor platform for SA CFS Fire Danger (total fire bans)."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import CFSDataUpdateCoordinator
from .entity import CFSDistrictEntity

FIRE_BAN_DAYS = {"today": 0, "tomorrow": 1}


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the binary sensor platform."""
    coordinator = entry.runtime_data.coordinator
    async_add_entities(
        CFSFireBanSensor(coordinator, key, day)
        for key in entry.runtime_data.districts
        for day in FIRE_BAN_DAYS
    )


class CFSFireBanSensor(CFSDistrictEntity, BinarySensorEntity):
    """Whether a total fire ban is declared for a district today or tomorrow."""

    def __init__(
        self, coordinator: CFSDataUpdateCoordinator, district_key: str, day: str
    ) -> None:
        super().__init__(coordinator, district_key, f"total_fire_ban_{day}")
        self._day_offset = FIRE_BAN_DAYS[day]
        self._attr_name = f"Total fire ban {day}"

    @property
    def is_on(self) -> bool | None:
        return self.forecast(self._day_offset)["fire_ban"]

    @property
    def icon(self) -> str:
        return "mdi:fire-alert" if self.is_on else "mdi:fire-off"
