import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import engine, main, models


def test_single_selection_does_not_return_an_unrequested_ensemble():
    result = engine.forecast_series(range(100, 157), "2022-01-01", "month", 3, ["sr", "sn"])
    assert {m["key"] for m in result["models"]} == {"sr", "sn"}


def test_ensemble_selection_runs_its_members():
    result = engine.forecast_series(range(100, 157), "2022-01-01", "month", 3, ["ens"])
    assert "error" not in result, result
    assert [m["key"] for m in result["models"]] == ["ens"]
    assert len(result["models"][0]["forecast"]) == 3


def test_unknown_model_is_rejected():
    response = TestClient(main.app).post("/api/forecast", json={
        "models": ["typo"], "series": [{"id": "main", "start": "2022-01-01", "values": list(range(100, 157))}],
    })
    assert response.status_code == 422


def test_refresh_recomputes_and_selection_failure_preserves_the_reason(monkeypatch):
    original = next(m for m in models.MODELS if m["key"] == "sr")
    spec = dict(original)
    monkeypatch.setattr(engine, "MODELS", [spec])
    main._cache.clear()
    client = TestClient(main.app)
    body = {"models": ["sr"], "horizon": 3, "series": [
        {"id": "main", "start": "2022-01-01", "values": list(range(100, 157))}]}
    assert "error" not in client.post("/api/forecast", json=body).json()["results"]["main"]

    def unavailable(*_):
        raise models.ModelUnavailable("Service temporarily unavailable")

    spec["fn"] = unavailable
    result = client.post("/api/forecast", json={**body, "refresh": True}).json()["results"]["main"]
    assert "Service temporarily unavailable" in result["error"]
    assert result["models"][0]["key"] == "sr"
    assert "forecast" not in result["models"][0]


@pytest.mark.parametrize("bad", [False, True])
def test_timesfm_adapter_uses_remote_forecast_and_checks_shape(monkeypatch, bad):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert self.path == "/forecast"
            assert self.headers["Authorization"] == "Bearer test-token"
            assert payload["values"] == [100.0, 110.0, 120.0]
            forecast = [130, 140] if not bad else [130]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"forecast": forecast}).encode())

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("TIMESFM_URL", f"http://127.0.0.1:{server.server_port}")
    monkeypatch.setenv("TIMESFM_TOKEN", "test-token")
    try:
        spec = next((m for m in models.MODELS if m["key"] == "timesfm"), None)
        assert spec is not None, "TimesFM must be selectable in the model registry"
        fit = spec["fn"](np.array([100., 110., 120.]), None)
        if bad:
            with pytest.raises(models.ModelUnavailable):
                fit.forecast(2)
        else:
            assert fit.forecast(2).tolist() == [130., 140.]
    finally:
        server.shutdown()
        server.server_close()
