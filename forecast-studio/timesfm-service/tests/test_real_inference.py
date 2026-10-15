"""Opt-in check that downloads/loads the actual checkpoint (about 1 GB)."""
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

import service


@pytest.mark.skipif(os.getenv("TIMESFM_RUN_REAL_TESTS") != "1", reason="Set TIMESFM_RUN_REAL_TESTS=1 to load real model weights")
def test_real_forecasts_do_not_require_a_native_compiler(monkeypatch):
    import torch

    def no_compiler(*_, **__):
        raise RuntimeError("Native compiler is unavailable")

    monkeypatch.setattr(torch, "compile", no_compiler)
    monkeypatch.setenv("TIMESFM_TOKEN", "real-test-token")
    client = TestClient(service.app)
    try:
        for n, horizon in [(4, 2), (57, 24), (156, 52)]:
            response = client.post("/forecast", headers={"Authorization": "Bearer real-test-token"},
                                   json={"values": [100 + 2*i + 10*np.sin(i) for i in range(n)], "horizon": horizon})
            assert response.status_code == 200, response.text
            result = response.json()["forecast"]
            assert len(result) == horizon
            assert np.isfinite(result).all()
    finally:
        service.get_model.cache_clear()
