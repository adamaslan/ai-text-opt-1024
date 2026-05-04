"""
pytest configuration for the ai-text-opt-1024 test suite.

Markers:
  e2e   — requires a live ChromaDB collection (populated by ingest.py)
  cloud — additionally requires CHROMA_MODE=cloud + cloud credentials
"""

import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "e2e: requires a populated ChromaDB collection")
    config.addinivalue_line("markers", "cloud: requires CHROMA_MODE=cloud and cloud credentials")
