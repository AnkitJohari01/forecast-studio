"""Opt-in real forecasts, including an actual separate-service HTTP boundary."""
import importlib.util
import os
from pathlib import Path
import socket
from threading import Thread
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
import uvicorn

from app.main import app

pytestmark = pytest.mark.skipif(os.getenv("RUN_LIVE_MODEL_TESTS") != "1",
                               reason="Set RUN_LIVE_MODEL_TESTS=1 and install TimesFM service dependencies/weights")


@pytest.fixture(scope="module")
def live_api():
    path = Path(__file__).resolve().parents[2] / "timesfm-service" / "service.py"
    spec = importlib.util.spec_from_file_location("timesfm_service_live", path)
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(service.app, log_level="error", loop="asyncio"))
    thread = Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    old = {k: os.environ.get(k) for k in ["TIMESFM_URL", "TIMESFM_TOKEN"]}
    os.environ.update(TIMESFM_URL=f"http://127.0.0.1:{port}", TIMESFM_TOKEN="live-test-token")
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started, "TimesFM test service did not start"
        yield TestClient(app)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        sock.close()
        for key, value in old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@pytest.mark.parametrize("freq,n,horizon", [("month", 57, 12), ("week", 130, 13)])
@pytest.mark.parametrize("key", ["arima", "xgb", "prophet", "hw", "theta", "sr", "sn", "ens", "timesfm"])
def test_selected_model_returns_its_own_finite_forecast(live_api, freq, n, horizon, key):
    period = 12 if freq == "month" else 52
    values = [100 + 2*i + 10*np.sin(2*np.pi*i/period) for i in range(n)]
    response = live_api.post("/api/forecast", json={"freq": freq, "horizon": horizon,
        "models": [key], "refresh": True, "series": [{"id": "main", "start": "2022-01-03", "values": values}]})
    assert response.status_code == 200
    result = response.json()["results"]["main"]
    assert "error" not in result, result
    assert result["best"] == key
    assert [model["key"] for model in result["models"]] == [key]
    forecast = result["models"][0]["forecast"]
    assert len(forecast) == horizon
    assert np.isfinite(forecast).all()
