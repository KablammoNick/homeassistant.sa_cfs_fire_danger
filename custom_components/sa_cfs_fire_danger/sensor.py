"""Sensor platform for SA CFS Fire Danger."""
from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, MAX_FORECAST_DAYS, RATINGS
from .coordinator import CFSDataUpdateCoordinator, sa_today
from .entity import MANUFACTURER, CFSDistrictEntity
from .parser import forecast_dates, forecast_for


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the sensor platform."""
    coordinator = entry.runtime_data.coordinator

    entities: list[SensorEntity] = [CFSIssuedSensor(coordinator)]
    for key in entry.runtime_data.districts:
        entities.append(CFSRatingSensor(coordinator, key))
        entities.append(CFSFireBehaviourIndexSensor(coordinator, key))

    async_add_entities(entities)


class CFSRatingSensor(CFSDistrictEntity, SensorEntity):
    """Today's fire danger rating for a district, with the 5 day forecast."""

    _attr_name = "Fire danger rating"
    _attr_icon = "mdi:fire-alert"
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = RATINGS
    _unrecorded_attributes = frozenset({"forecast"})

    def __init__(self, coordinator: CFSDataUpdateCoordinator, district_key: str) -> None:
        super().__init__(coordinator, district_key, "fire_danger_rating")

    @property
    def native_value(self) -> str | None:
        return self.forecast()["rating"]

    @property
    def extra_state_attributes(self) -> dict:
        district = self.district
        today = self.forecast()
        attrs = {
            "district_name": district["name"],
            "level": today["level"],
        }

        forecast = []
        for number, day in enumerate(forecast_dates(sa_today(), MAX_FORECAST_DAYS), 1):
            values = forecast_for(district, day)
            for field, value in values.items():
                attrs[f"day_{number}_{field}"] = value
            if day in district["days"]:
                forecast.append(
                    {"date": day.isoformat(), "day": day.strftime("%A"), **values}
                )

        attrs["forecast"] = forecast
        return attrs


class CFSFireBehaviourIndexSensor(CFSDistrictEntity, SensorEntity):
    """Today's fire behaviour index for a district."""

    _attr_name = "Fire behaviour index"
    _attr_icon = "mdi:gauge"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: CFSDataUpdateCoordinator, district_key: str) -> None:
        super().__init__(coordinator, district_key, "fire_behaviour_index")

    @property
    def native_value(self) -> int | None:
        return self.forecast()["fbi"]


class CFSIssuedSensor(CoordinatorEntity[CFSDataUpdateCoordinator], SensorEntity):
    """When the feed was issued, plus today's values for every district."""

    _attr_has_entity_name = True
    _attr_name = "Issued"
    _attr_icon = "mdi:fire-alert"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_unique_id = f"{DOMAIN}_issued"
    _unrecorded_attributes = frozenset({"districts"})

    def __init__(self, coordinator: CFSDataUpdateCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, DOMAIN)},
            name="SA CFS Fire Danger",
            manufacturer=MANUFACTURER,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> datetime | None:
        return self.coordinator.data["issued"] if self.coordinator.data else None

    @property
    def extra_state_attributes(self) -> dict:
        if not self.coordinator.data:
            return {}

        today = sa_today()
        districts = self.coordinator.data["districts"]
        attrs: dict = {"district_count": len(districts)}
        for number, day in enumerate(forecast_dates(today, MAX_FORECAST_DAYS), 1):
            attrs[f"day_{number}_name"] = day.strftime("%A")
            attrs[f"day_{number}_date"] = day.strftime("%d/%m")

        attrs["districts"] = {
            key: {"name": district["name"], **forecast_for(district, today)}
            for key, district in sorted(districts.items())
        }
        return attrs
