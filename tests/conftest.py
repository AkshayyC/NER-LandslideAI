"""Shared fixtures.

The service builds the hazard grid once per session (about two seconds, then
served from the on-disk cache), and every API test shares the same client.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from nerls.api import app
from nerls.service import get_service


@pytest.fixture(scope="session")
def service():
    return get_service()


@pytest.fixture(scope="session")
def service_client():
    with TestClient(app) as client:
        yield client
