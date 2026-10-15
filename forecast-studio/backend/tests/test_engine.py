import os
import numpy as np
from fastapi.testclient import TestClient

from app.engine import forecast_series
from app.main import app

SEASON = [0.92, 0.95, 1.12, 0.97, 0.98, 0.94, 0.86, 0.88, 1.02, 1.18, 1.16, 1.02]


def monthly(n=57, seed=3):
    rng = np.random.default_rng(seed)
    return [4.6e7 * 1.11 ** (i / 12) * SEASON[i % 12] * (1 + rng.normal(0, 0.03)) for i in range(n)]


def test_all_models_run_monthly():
    r = forecast_series(monthly(), "2022-01-01", "month", 24)
    keys = {m["key"] for m in r["models"] if "na" not in m}
    assert {"arima", "xgb", "prophet", "hw", "theta", "sr", "sn", "ens"} <= keys
    for m in r["models"]:
        if m["key"] == "timesfm" and not os.getenv("TIMESFM_URL"):
            assert "not configured" in m["na"]
            continue  # The separate service is optional for the default local test run.
        assert len(m["forecast"]) == 24 and len(m["backtest"]) == r["holdout"]
        assert m["wape"] < 0.2, (m["key"], m["wape"])


def test_short_series_degrades_gracefully():
    r = forecast_series(monthly(14), "2025-01-01", "month", 12)
    assert "models" in r
    assert any("na" not in m for m in r["models"])


def test_xgboost_dependencies_support_forecasting():
    r = forecast_series(monthly(), "2022-01-01", "month", 12, ["xgb"])
    assert "error" not in r, r
    assert r["best"] == "xgb"
    assert len(r["models"][0]["forecast"]) == 12
    assert np.isfinite(r["models"][0]["forecast"]).all()


def test_too_short():
    assert "error" in forecast_series([1, 2, 3], "2025-01-01", "month", 12)


def test_api_batch():
    c = TestClient(app)
    body = {"freq": "month", "horizon": 12, "series": [
        {"id": "all", "values": monthly(), "start": "2022-01-01"},
        {"id": "short", "values": [1, 2], "start": "2022-01-01"}]}
    res = c.post("/api/forecast", json=body)
    assert res.status_code == 200
    data = res.json()["results"]
    assert data["all"]["best"] and "error" in data["short"]
    assert c.get("/api/health").json() == {"status": "ok"}
