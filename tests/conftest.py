"""Shared test fixtures."""
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "fireDangerRating.xml"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable loading the custom integration in every test."""
    yield


@pytest.fixture
def feed_xml() -> str:
    """The sample CFS feed."""
    return FIXTURE.read_text()
