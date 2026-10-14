"""One deterministic evaluation contract, shared by both applications."""
from __future__ import annotations
import logging
import math
import warnings
from typing import Iterable
import numpy as np
import pandas as pd
from .models import ENSEMBLE, MODELS, Ctx, ModelUnavailable, seasonal_strength

FREQ = {'month': ('MS', 12), 'week': ('W-MON', 52)}
log = logging.getLogger(__name__)


def metrics(actual, predicted, history, season):
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    error = predicted - actual
    denominator = float(np.abs(actual).sum())
    wape = float(np.abs(error).sum() / denominator) if denominator else None
    bias = float(error.sum() / denominator) if denominator else None
    mask = np.abs(actual) >= max(float(np.abs(actual).mean()) * 1e-3, 1e-8)
    mape = float(np.mean(np.abs(error[mask] / actual[mask])) * 100) if mask.any() else None
    lag = season if len(history) > season else 1
    scale = float(np.mean(np.abs(history[lag:] - history[:-lag]))) if len(history) > lag else 0
    mae = float(np.abs(error).mean())
    return {'wape': wape, 'wmape': wape * 100 if wape is not None else None,
            'mape': mape, 'mae': mae, 'rmse': float(np.sqrt(np.mean(error ** 2))),
            'bias': bias, 'bias_pct': bias * 100 if bias is not None else None,
            'mase': mae / scale if scale else None}


def forecast_series(values: Iterable[float], start: str, freq: str, horizon: int,
                    model_keys: Iterable[str] | None = None) -> dict:
    y = np.asarray(list(values), dtype=float)
    if freq not in FREQ or not isinstance(horizon, int) or not 1 <= horizon <= 104:
        return {'error': 'Select monthly or weekly data and a horizon from 1 to 104.'}
    if y.ndim != 1 or not np.isfinite(y).all():
        return {'error': 'History must contain only finite numeric values.'}
    alias, period = FREQ[freq]
    n = len(y)
    unit = 'month' if freq == 'month' else 'week'
    if n < 6:
        return {'error': f'This selection has only {n} {unit}s of history. At least 6 are needed.'}
    if not np.any(y != 0):
        return {'error': 'All values in this selection are zero, so there is nothing to forecast.'}
    if (y < 0).any():
        return {'error': 'Non-negative sales or demand is required. Resolve negative totals before forecasting.'}
    try:
        dates = pd.date_range(pd.Timestamp(start), periods=n, freq=alias)
    except (ValueError, TypeError):
        return {'error': 'The start date is invalid.'}
    hold = int(np.clip(round(n * .15), 2, 6 if period == 12 else 13))
    train, test = y[:-hold], y[-hold:]
    if not np.abs(test).sum():
        return {'error': 'The final backtest periods are all zero; percentage accuracy is undefined.'}
    selection_hold = hold if len(train) - hold >= 6 and np.abs(train[-hold:]).sum() else 0
    wanted = set(model_keys) if model_keys else None
    unknown = (wanted or set()) - {s['key'] for s in MODELS} - {'ens'}
    if unknown:
        return {'error': 'Unknown forecast model: ' + ', '.join(sorted(unknown))}
    out, validation_predictions = [], {}

    def ctx(length):
        return Ctx(period if length >= 2 * period else 0, period, dates[:length], alias)

    def predict(spec, history, h):
        fit = spec['fn'](history, ctx(len(history)))
        prediction = np.asarray(fit.forecast(h), dtype=float).reshape(-1)
        if len(prediction) != h or not np.isfinite(prediction).all():
            raise ModelUnavailable('Model produced invalid predictions')
        return fit, np.maximum(prediction, 0)

    for spec in MODELS:
        if wanted is not None and spec['key'] not in wanted and 'ens' not in wanted:
            continue
        meta = {k: spec[k] for k in ('key', 'name', 'family', 'desc')}
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                validation_wape = None
                if selection_hold:
                    try:
                        _, vp = predict(spec, train[:-selection_hold], selection_hold)
                        validation_wape = metrics(train[-selection_hold:], vp, train[:-selection_hold], period)['wape']
                        validation_predictions[spec['key']] = vp
                    except Exception:
                        # Longer training history can still make the model available manually.
                        pass
                _, bt = predict(spec, train, hold)
                fit, fc = predict(spec, y, horizon)
            sc = metrics(test, bt, train, period)
            residual_sd = sc['rmse']
            if fit.fitted is not None:
                residuals = y - np.asarray(fit.fitted, dtype=float)
                residuals = residuals[np.isfinite(residuals)]
                if len(residuals):
                    residual_sd = float(np.sqrt(np.mean(residuals ** 2)))
            out.append({**meta, **sc, 'validation_wape': validation_wape,
                        'backtest': bt.tolist(), 'forecast': fc.tolist(),
                        'sd': math.sqrt((residual_sd ** 2 + sc['rmse'] ** 2) / 2), 'params': fit.params})
        except ModelUnavailable as exc:
            out.append({**meta, 'na': str(exc)})
        except ImportError:
            out.append({**meta, 'na': 'Required model dependency is not installed on the server'})
        except Exception as exc:
            log.warning('%s could not run: %s', spec['name'], exc)
            out.append({**meta, 'na': f'Model runtime failed ({type(exc).__name__}); check the server model installation'})

    live = [m for m in out if 'na' not in m]
    eligible = sorted([m for m in live if m['validation_wape'] is not None], key=lambda m: (m['validation_wape'], m['key']))
    if len(eligible) >= 2:
        top = eligible[:3]
        bt = np.mean([m['backtest'] for m in top], axis=0)
        fc = np.mean([m['forecast'] for m in top], axis=0)
        vp = np.mean([validation_predictions[m['key']] for m in top], axis=0)
        ensemble = {**ENSEMBLE, **metrics(test, bt, train, period),
                    'validation_wape': metrics(train[-selection_hold:], vp, train[:-selection_hold], period)['wape'],
                    'members': [m['key'] for m in top], 'backtest': bt.tolist(), 'forecast': fc.tolist(),
                    'sd': float(np.sqrt(np.mean([m['sd'] ** 2 for m in top]))),
                    'params': 'Average of ' + ', '.join(m['name'] for m in top)}
        out.insert(0, ensemble)
        live.append(ensemble)
        eligible.append(ensemble)
    elif wanted is None or 'ens' in wanted:
        out.insert(0, {**ENSEMBLE, 'na': 'Needs at least two models with an earlier validation window'})
    if not live:
        return {'error': 'None of the models could be fitted to this series.', 'models': out}
    if eligible:
        best = min(eligible, key=lambda m: (m['validation_wape'], m['key']))
    else:
        best = next((m for key in ('ma', 'sr', 'sn') for m in live if m['key'] == key), live[0])
    return {'models': out, 'best': best['key'], 'holdout': hold, 'n': n,
            'selection_holdout': selection_hold,
            'selection_basis': 'earlier_validation' if eligible else 'fixed_baseline_short_history',
            'seasonal': ctx(n).m > 0, 'seasonalStrength': seasonal_strength(y, period)}
