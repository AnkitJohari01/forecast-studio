import numpy as np
import pytest
from fastapi.testclient import TestClient
from app import engine, main, models

KEYS = {'ens', 'arima', 'xgb', 'prophet', 'hw', 'theta', 'sr', 'sn', 'sarima', 'lgb', 'ridge', 'ma', 'timesfm'}


def test_registry_preserves_all_live_models_and_adds_timesfm():
    response = TestClient(main.app).get('/api/models')
    assert response.status_code == 200
    assert {m['key'] for m in response.json()} == KEYS


@pytest.mark.parametrize('key', sorted(KEYS - {'ens'}))
def test_every_explicit_choice_runs_only_that_model_with_current_data(monkeypatch, key):
    calls = []
    def fit(history, ctx):
        calls.append(history.tolist())
        return models.Fit(None, lambda h: np.repeat(history[-1], h), 'routing check')
    specs = [{**spec, 'fn': fit} for spec in models.MODELS if spec['key'] == key]
    assert len(specs) == 1
    monkeypatch.setattr(engine, 'MODELS', specs)
    client = TestClient(main.app)
    for values, horizon in [(list(range(100, 157)), 3), (list(range(100, 156)) + [500], 5)]:
        body = {'models': [key], 'refresh': True, 'horizon': horizon,
                'series': [{'id': 'main', 'start': '2022-01-01', 'values': values}]}
        response = client.post('/api/forecast', json=body)
        assert response.status_code == 200, response.text
        result = response.json()['results']['main']
        assert 'error' not in result, result
        assert [m['key'] for m in result['models']] == [key]
        assert result['models'][0]['forecast'] == [values[-1]] * horizon
        assert calls[-1] == values


def test_failed_ensemble_does_not_substitute_one_working_member(monkeypatch):
    monkeypatch.setattr(engine, 'MODELS', [next(s for s in models.MODELS if s['key'] == 'sr')])
    result = engine.forecast_series(range(100, 157), '2022-01-01', 'month', 3, ['ens'])
    assert 'error' in result
    assert [m['key'] for m in result['models']] == ['ens']
    assert 'na' in result['models'][0]
