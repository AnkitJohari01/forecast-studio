import numpy as np
import pytest

from app.engine import forecast_series
from app.models import Ctx, ModelUnavailable, MODELS


def test_all_models_report_the_same_metric_contract():
    y = 100 + np.arange(48) * 2 + 15 * np.sin(np.arange(48) * np.pi / 6)
    result = forecast_series(y, '2022-01-01', 'month', 12, ['sr', 'sn'])
    for model in result['models']:
        if 'na' in model:
            continue
        actual = y[-result['holdout']:]
        err = np.asarray(model['backtest']) - actual
        assert model['wmape'] == pytest.approx(model['wape'] * 100)
        assert model['mae'] == pytest.approx(np.mean(np.abs(err)))
        assert model['bias_pct'] == pytest.approx(model['bias'] * 100)
        assert model['rmse'] == pytest.approx(np.sqrt(np.mean(err ** 2)))


def test_final_test_values_do_not_choose_the_model_or_ensemble_members():
    y = 100 + np.arange(48) * 2
    a = forecast_series(y, '2022-01-01', 'month', 6, ['sr', 'sn'])
    y[-a['holdout']:] = [10000, 1, 9000, 1, 8000, 1]
    b = forecast_series(y, '2022-01-01', 'month', 6, ['sr', 'sn'])
    assert a['selection_basis'] == 'earlier_validation'
    assert a['best'] == b['best']
    for am, bm in zip(a['models'], b['models']):
        assert am.get('validation_wape') == bm.get('validation_wape')
        assert am.get('members') == bm.get('members')


def test_moving_average_forecast_uses_only_history_and_recurses():
    fn = next(m['fn'] for m in MODELS if m['key'] == 'ma')
    y = np.array([1., 2., 3., 4., 5., 6., 100.])
    fit = fn(y, Ctx(0, 12, None, 'MS'))
    assert fit.forecast(2) == pytest.approx([sum(y) / 7, (sum(y[1:]) + sum(y) / 7) / 7])
    assert fit.fitted[-1] == pytest.approx(np.mean(y[:-1]))


@pytest.mark.parametrize('values', [[1, 2, np.nan, 4, 5, 6], [1, 2, np.inf, 4, 5, 6]])
def test_invalid_values_fail_at_boundary(values):
    assert 'error' in forecast_series(values, '2023-01-01', 'month', 6)


def test_runtime_failures_are_not_reported_as_short_history(monkeypatch):
    def broken(*args):
        raise RuntimeError('native executable failed')
    monkeypatch.setitem(MODELS[0], 'fn', broken)
    result = forecast_series(np.arange(1, 49), '2022-01-01', 'month', 6, ['arima', 'sr'])
    failure = next(m for m in result['models'] if m['key'] == 'arima')
    assert failure['na'] != 'Not enough history for this model'
    assert 'RuntimeError' in failure['na']
