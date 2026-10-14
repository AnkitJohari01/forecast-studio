"""Forecasting models.

Every model is a function ``fit(y, ctx) -> Fit``. ``y`` is a 1-D float array of
equally spaced history, ``ctx`` carries the season length and the period dates.
A ``Fit`` exposes in-sample one-step fitted values (may contain NaN) and a
``forecast(h)`` function returning ``h`` future values.
"""
from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
for name in ("cmdstanpy", "prophet", "prophet.plot", "statsmodels"):
    logging.getLogger(name).setLevel(logging.CRITICAL)


class ModelUnavailable(Exception):
    """Raised when a model cannot run on the given series (reason is user-facing)."""


@dataclass
class Ctx:
    m: int                 # season length used for this fit (0 = no seasonality)
    period: int            # calendar season length (12 monthly, 52 weekly)
    dates: pd.DatetimeIndex  # dates of the history passed to the model
    freq: str              # pandas frequency alias ("MS" or "W-MON")


@dataclass
class Fit:
    fitted: Optional[np.ndarray]
    forecast: Callable[[int], np.ndarray]
    params: str


def _future_dates(ctx: Ctx, h: int) -> pd.DatetimeIndex:
    return pd.date_range(ctx.dates[-1], periods=h + 1, freq=ctx.freq)[1:]


def _linear(y: np.ndarray) -> tuple[float, float]:
    x = np.arange(len(y), dtype=float)
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


# --------------------------------------------------------------------------- baselines
def seasonal_naive(y: np.ndarray, ctx: Ctx) -> Fit:
    n, m = len(y), ctx.period
    if n < m:
        raise ModelUnavailable("Needs a full year of history")
    fitted = np.full(n, np.nan)
    fitted[m:] = y[:-m]
    last = y[-m:]
    return Fit(fitted, lambda h: np.array([last[k % m] for k in range(h)]), f"Repeats the last {m} periods")


def trend_seasonality(y: np.ndarray, ctx: Ctx) -> Fit:
    n, m = len(y), ctx.m
    x = np.arange(n, dtype=float)
    cols = [np.ones(n), x]
    if m:
        for k in range(1, m):
            cols.append((np.arange(n) % m == k).astype(float))
    X = np.column_stack(cols)
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)

    def design(t: np.ndarray) -> np.ndarray:
        c = [np.ones(len(t)), t.astype(float)]
        if m:
            for k in range(1, m):
                c.append((t % m == k).astype(float))
        return np.column_stack(c)

    fitted = X @ coef
    return Fit(fitted, lambda h: design(np.arange(n, n + h)) @ coef,
               f"Linear trend + {m} seasonal effects" if m else "Linear trend")


def seasonal_strength(y: np.ndarray, m: int) -> float:
    """Share of detrended variance explained by the seasonal pattern (0..1)."""
    if not m or len(y) < 2 * m:
        return 0.0
    a, b = _linear(y)
    det = y - (a + b * np.arange(len(y)))
    pos = np.arange(len(y)) % m
    seas = np.array([det[pos == k].mean() for k in range(m)])
    seas -= seas.mean()
    vd = float(np.mean(det ** 2))
    return float(np.clip(np.mean(seas[pos] ** 2) / vd, 0, 1)) if vd else 0.0


# --------------------------------------------------------------------------- statsmodels
def holt_winters(y: np.ndarray, ctx: Ctx) -> Fit:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    m = ctx.m
    seasonal = None
    if m:
        seasonal = "mul" if np.all(y > 0) else "add"
    res = ExponentialSmoothing(
        y, trend="add", damped_trend=True, seasonal=seasonal,
        seasonal_periods=m or None, initialization_method="estimated",
    ).fit(optimized=True)
    p = res.params
    desc = f"α {p['smoothing_level']:.2f}, β {p['smoothing_trend']:.2f}, damping {p['damping_trend']:.2f}"
    if seasonal:
        desc += f", {'multiplicative' if seasonal == 'mul' else 'additive'} seasonality"
    return Fit(np.asarray(res.fittedvalues), lambda h: np.asarray(res.forecast(h)), desc)


def theta(y: np.ndarray, ctx: Ctx) -> Fit:
    from statsmodels.tsa.forecasting.theta import ThetaModel

    m = ctx.m
    positive = bool(np.all(y > 0))
    res = ThetaModel(
        y, period=m if m else 1, deseasonalize=bool(m),
        method="multiplicative" if positive else "additive",
    ).fit()
    alpha = float(res.params.get("alpha", np.nan)) if hasattr(res.params, "get") else np.nan
    desc = f"α {alpha:.2f}" if np.isfinite(alpha) else "Theta = 2"
    if m:
        desc += ", seasonally adjusted"
    return Fit(None, lambda h: np.asarray(res.forecast(h)), desc)


def _fourier(t: np.ndarray, period: int, k: int) -> np.ndarray:
    cols = []
    for j in range(1, k + 1):
        cols += [np.sin(2 * np.pi * j * t / period), np.cos(2 * np.pi * j * t / period)]
    return np.column_stack(cols)


def arima(y: np.ndarray, ctx: Ctx) -> Fit:
    """Seasonal ARIMA with order picked by AIC from a compact candidate set.

    Monthly data uses SARIMAX seasonal terms; long seasons (weekly) use Fourier
    terms as exogenous regressors, which is far faster and just as accurate.
    """
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    n, m = len(y), ctx.m
    use_log = bool(np.all(y > 0))
    z = np.log(y) if use_log else y.astype(float)
    seasonal_order = (0, 0, 0, 0)
    exog = None
    k_f = 0
    if m and m <= 24 and n >= 2 * m + 6:
        seasonal_order = (0, 1, 1, m)
    elif m and n >= m + 10:
        k_f = 4
        exog = _fourier(np.arange(n), m, k_f)
    orders = [(0, 1, 1), (1, 1, 0), (1, 1, 1), (2, 1, 0)]
    best = None
    for order in orders:
        try:
            r = SARIMAX(z, exog=exog, order=order, seasonal_order=seasonal_order,
                        trend="c" if seasonal_order[1] == 0 else None,
                        enforce_stationarity=False, enforce_invertibility=False
                        ).fit(disp=False, maxiter=60)
            if np.isfinite(r.aic) and (best is None or r.aic < best[0]):
                best = (r.aic, order, r)
        except Exception:  # noqa: BLE001 - try the next candidate
            continue
    if best is None:
        raise ModelUnavailable("ARIMA could not be estimated on this series")
    _, order, res = best
    burn = order[1] + seasonal_order[1] * seasonal_order[3]
    fitted = np.asarray(res.fittedvalues, dtype=float)
    fitted = np.exp(fitted) if use_log else fitted
    fitted[: max(burn, 1)] = np.nan

    def fc(h: int) -> np.ndarray:
        ex = _fourier(np.arange(n, n + h), m, k_f) if exog is not None else None
        out = np.asarray(res.forecast(h, exog=ex), dtype=float)
        return np.exp(out) if use_log else out

    s = f"({seasonal_order[0]},{seasonal_order[1]},{seasonal_order[2]})[{m}]" if seasonal_order[3] else (f" + {k_f} Fourier pairs" if k_f else "")
    return Fit(fitted, fc, f"ARIMA({order[0]},{order[1]},{order[2]}){s}{', log scale' if use_log else ''}, picked by AIC")


# --------------------------------------------------------------------------- machine learning
def xgboost_model(y: np.ndarray, ctx: Ctx) -> Fit:
    import xgboost as xgb

    n, m, per = len(y), ctx.m, ctx.period
    a, b = _linear(y)
    trend = lambda t: a + b * t  # noqa: E731
    r = y - trend(np.arange(n))
    lag_s = m if (m and n >= m + 12) else 0

    def feats(arr: list[float], t: int) -> list[float]:
        f = [arr[t - 1], arr[t - 2], arr[t - 3], (arr[t - 1] + arr[t - 2] + arr[t - 3]) / 3,
             np.sin(2 * np.pi * (t % per) / per), np.cos(2 * np.pi * (t % per) / per), t % per]
        if lag_s:
            f += [arr[t - lag_s], arr[t - lag_s + 1]]
        return f

    start = max(3, lag_s)
    if n - start < 8:
        raise ModelUnavailable("Not enough history for this model")
    rl = r.tolist()
    X = np.array([feats(rl, t) for t in range(start, n)])
    Y = r[start:]
    model = xgb.XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.85,
                             colsample_bytree=0.9, reg_lambda=1.0, min_child_weight=2,
                             n_jobs=1, random_state=7, verbosity=0)
    model.fit(X, Y)
    fitted = np.full(n, np.nan)
    fitted[start:] = model.predict(X) + trend(np.arange(start, n))

    def fc(h: int) -> np.ndarray:
        arr, out = rl.copy(), []
        for k in range(h):
            t = n + k
            p = float(model.predict(np.array([feats(arr, t)]))[0])
            arr.append(p)
            out.append(trend(t) + p)
        return np.array(out)

    return Fit(fitted, fc, f"300 trees, depth 3, {X.shape[1]} lag + calendar features")


def moving_average(y: np.ndarray, ctx: Ctx) -> Fit:
    window = min(7, len(y))
    fitted = pd.Series(y).shift(1).rolling(window, min_periods=1).mean().to_numpy()

    def fc(h):
        history, out = list(y), []
        for _ in range(h):
            value = float(np.mean(history[-window:]))
            out.append(value)
            history.append(value)
        return np.array(out)
    return Fit(fitted, fc, f'Recursive mean of the preceding {window} periods')


def lag_regression(y: np.ndarray, ctx: Ctx, learner: str) -> Fit:
    """Identical history-only features during training and recursive prediction."""
    n = len(y)
    lags = [k for k in (1, 2, 3, ctx.period) if k < n - 7]
    if not lags:
        raise ModelUnavailable('Needs at least 9 periods of history')
    start = max(lags)

    def features(history, t):
        recent = np.asarray(history[max(0, t - 3):t])
        return [history[t - k] for k in lags] + [float(recent.mean()), float(recent.std()),
                np.sin(2 * np.pi * t / ctx.period), np.cos(2 * np.pi * t / ctx.period), float(t)]
    X = np.array([features(y, t) for t in range(start, n)])
    if learner == 'lgb':
        from lightgbm import LGBMRegressor
        model = LGBMRegressor(n_estimators=200, max_depth=3, num_leaves=7, learning_rate=.05,
                              min_child_samples=3, n_jobs=1, random_state=7, verbosity=-1,
                              deterministic=True, force_col_wise=True)
    else:
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.linear_model import Ridge
        model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    model.fit(X, y[start:])
    fitted = np.full(n, np.nan)
    fitted[start:] = model.predict(X)

    def fc(h):
        history, out = list(y), []
        for _ in range(h):
            p = max(0., float(np.asarray(model.predict(np.array([features(history, len(history))])))[0]))
            history.append(p)
            out.append(p)
        return np.array(out)
    return Fit(fitted, fc, f'Deterministic {learner} with lag, rolling and calendar features')


def lightgbm_model(y: np.ndarray, ctx: Ctx) -> Fit:
    return lag_regression(y, ctx, 'lgb')


def ridge_model(y: np.ndarray, ctx: Ctx) -> Fit:
    return lag_regression(y, ctx, 'ridge')


def sarima_model(y: np.ndarray, ctx: Ctx) -> Fit:
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    if not ctx.m or len(y) < 2 * ctx.period:
        raise ModelUnavailable('Needs at least two full years of history')
    if ctx.period > 24:
        return arima(y, ctx)  # Fourier regressors avoid a very large weekly state space.
    result = SARIMAX(y, order=(1, 1, 0), seasonal_order=(0, 1, 1, ctx.period),
                     enforce_stationarity=False, enforce_invertibility=False).fit(disp=False, maxiter=100)
    fitted = np.asarray(result.fittedvalues)
    fitted[:ctx.period + 1] = np.nan
    return Fit(fitted, lambda h: np.asarray(result.forecast(h)), f'SARIMA(1,1,0)(0,1,1)[{ctx.period}]')


def prophet_model(y: np.ndarray, ctx: Ctx) -> Fit:
    try:
        from prophet import Prophet
    except Exception as exc:  # pragma: no cover - optional dependency
        raise ModelUnavailable("Prophet is not installed on the server") from exc

    n, positive = len(y), bool(np.all(y > 0))
    yearly = bool(ctx.m)
    mdl = Prophet(yearly_seasonality=yearly, weekly_seasonality=False, daily_seasonality=False,
                  seasonality_mode="multiplicative" if positive and yearly else "additive",
                  changepoint_prior_scale=0.05, uncertainty_samples=0)
    df = pd.DataFrame({"ds": ctx.dates, "y": y})
    try:
        mdl.fit(df, seed=7)
    except Exception as exc:
        raise ModelUnavailable('Prophet runtime could not start; verify the server CmdStan installation') from exc
    fitted = mdl.predict(df[["ds"]])["yhat"].to_numpy()

    def fc(h: int) -> np.ndarray:
        fut = pd.DataFrame({"ds": _future_dates(ctx, h)})
        return mdl.predict(fut)["yhat"].to_numpy()

    return Fit(fitted, fc, f"Piecewise trend, {len(mdl.changepoints)} changepoints"
               + (", yearly seasonality" if yearly else "")
               + (", multiplicative" if positive and yearly else ""))


# --------------------------------------------------------------------------- registry
MODELS = [
    {"key": "arima", "name": "ARIMA", "family": "Statistical", "desc": "Seasonal ARIMA (statsmodels SARIMAX), order by AIC", "fn": arima},
    {"key": "xgb", "name": "XGBoost", "family": "Machine learning", "desc": "Gradient-boosted trees on lag and calendar features", "fn": xgboost_model},
    {"key": "prophet", "name": "Prophet", "family": "Statistical", "desc": "Meta Prophet: piecewise trend with seasonality", "fn": prophet_model},
    {"key": "hw", "name": "Holt-Winters", "family": "Exponential smoothing", "desc": "Damped trend with seasonal smoothing", "fn": holt_winters},
    {"key": "theta", "name": "Theta", "family": "Exponential smoothing", "desc": "Theta method on deseasonalised data", "fn": theta},
    {"key": "sr", "name": "Trend + seasonality", "family": "Regression", "desc": "Linear trend plus seasonal effects", "fn": trend_seasonality},
    {"key": "sn", "name": "Seasonal naive", "family": "Baseline", "desc": "Same period last year", "fn": seasonal_naive},
    {"key": "sarima", "name": "SARIMA", "family": "Statistical", "desc": "Seasonal autoregression on past sales", "fn": sarima_model},
    {"key": "lgb", "name": "LightGBM", "family": "Machine learning", "desc": "Deterministic boosted trees with recursive lag features", "fn": lightgbm_model},
    {"key": "ridge", "name": "Ridge Regression", "family": "Regression", "desc": "Regularised regression with recursive lag features", "fn": ridge_model},
    {"key": "ma", "name": "Moving Average", "family": "Baseline", "desc": "Recursive mean of earlier periods", "fn": moving_average},
]
ENSEMBLE = {"key": "ens", "name": "Ensemble", "family": "Ensemble", "desc": "Average of up to three models selected on earlier validation"}
