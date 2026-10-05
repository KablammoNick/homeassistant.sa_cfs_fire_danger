"""Data update coordinator for SA CFS Fire Danger."""
from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, timedelta

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SA_TIMEZONE, XML_URL
from .parser import parse_feed

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(hours=1)


async def async_fetch_feed(hass: HomeAssistant) -> dict:
    """Fetch and parse the CFS XML feed."""
    session = async_get_clientsession(hass)
    async with session.get(XML_URL, timeout=aiohttp.ClientTimeout(total=15)) as response:
        response.raise_for_status()
        xml_data = await response.text()
    return parse_feed(xml_data, dt_util.get_time_zone(SA_TIMEZONE))


def sa_today() -> date:
    """Return today's date in South Australia."""
    return dt_util.now(dt_util.get_time_zone(SA_TIMEZONE)).date()


@dataclass
class CFSRuntimeData:
    """Stored on the config entry as runtime_data."""

    coordinator: CFSDataUpdateCoordinator
    districts: list[str]


class CFSDataUpdateCoordinator(DataUpdateCoordinator[dict]):
    """Fetch the CFS feed once for all entities."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )

    async def _async_update_data(self) -> dict:
        try:
            return await async_fetch_feed(self.hass)
        except (aiohttp.ClientError, asyncio.TimeoutError, ET.ParseError) as err:
            raise UpdateFailed(f"Error fetching CFS fire danger data: {err}") from err
