"""Base entity for SA CFS fire districts."""
from __future__ import annotations

from datetime import timedelta

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import CFSDataUpdateCoordinator, sa_today
from .parser import forecast_for

MANUFACTURER = "SA Country Fire Service"


class CFSDistrictEntity(CoordinatorEntity[CFSDataUpdateCoordinator]):
    """An entity belonging to one fire ban district device."""

    _attr_has_entity_name = True

    def __init__(
        self, coordinator: CFSDataUpdateCoordinator, district_key: str, suffix: str
    ) -> None:
        super().__init__(coordinator)
        self._district_key = district_key
        self._attr_unique_id = f"{DOMAIN}_{district_key}_{suffix}"
        name = coordinator.data["districts"][district_key]["name"]
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, district_key)},
            name=f"SA CFS {name}",
            manufacturer=MANUFACTURER,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def district(self) -> dict | None:
        """Return this district's parsed data."""
        if not self.coordinator.data:
            return None
        return self.coordinator.data["districts"].get(self._district_key)

    @property
    def available(self) -> bool:
        return super().available and self.district is not None

    def forecast(self, day_offset: int = 0) -> dict:
        """Return the forecast for today + day_offset (SA local date)."""
        return forecast_for(self.district, sa_today() + timedelta(days=day_offset))
