import numpy as np
import pytest
from fastapi.testclient import TestClient

import service


class Forecaster:
    def forecast(self, *, horizon, inputs):
        assert len(inputs) == 1
        return np.full((1, horizon), float(inputs[0][-1]) + 10), None


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TIMESFM_TOKEN", "test-token")
    monkeypatch.setattr(service, "get_model", lambda: Forecaster())
    return TestClient(service.app)


def test_requires_service_token(client):
    response = client.post("/forecast", json={"values": [100.] * 40, "horizon": 3})
    assert response.status_code == 401


def test_returns_exact_requested_horizon(client):
    response = client.post("/forecast", headers={"Authorization": "Bearer test-token"},
                           json={"values": [100.] * 40, "horizon": 3})
    assert response.status_code == 200
    assert response.json()["forecast"] == [110., 110., 110.]


@pytest.mark.parametrize("values,horizon", [([100.] * 3, 3), ([100.] * 40, 0), ([100.] * 40, 105), (["NaN"] * 40, 3)])
def test_rejects_invalid_inputs(client, values, horizon):
    response = client.post("/forecast", headers={"Authorization": "Bearer test-token"},
                           json={"values": values, "horizon": horizon})
    assert response.status_code == 422


def test_accepts_four_training_points_from_a_six_period_history(client):
    response = client.post("/forecast", headers={"Authorization": "Bearer test-token"},
                           json={"values": [100., 110., 120., 130.], "horizon": 2})
    assert response.status_code == 200
    assert response.json()["forecast"] == [140., 140.]


def test_invalid_model_output_is_an_error(client, monkeypatch):
    class Invalid:
        def forecast(self, **_):
            return np.array([[float("nan")]]), None
    monkeypatch.setattr(service, "get_model", lambda: Invalid())
    response = client.post("/forecast", headers={"Authorization": "Bearer test-token"},
                           json={"values": [100.] * 40, "horizon": 3})
    assert response.status_code == 503
