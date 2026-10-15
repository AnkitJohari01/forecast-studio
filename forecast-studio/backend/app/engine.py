"""Backtest, score and combine every model for one series."""
from __future__ import annotations

import math
import logging
import warnings
from typing import Iterable

import numpy as np
import pandas as pd

from .models import ENSEMBLE, MODELS, Ctx, ModelUnavailable, seasonal_strength

FREQ = {"month": ("MS", 12), "week": ("W-MON", 52)}


def _clean(a: np.ndarray) -> list[float]:
    return [float(max(0.0, v)) for v in a]


def forecast_series(values: Iterable[float], start: str, freq: str, horizon: int,
                    model_keys: Iterable[str] | None = None) -> dict:
    y = np.asarray(list(values), dtype=float)
    alias, period = FREQ[freq]
    n = len(y)
    unit = "month" if freq == "month" else "week"
    if n < 6:
        return {"error": f"This selection has only {n} {unit}{'' if n == 1 else 's'} of history. At least 6 are needed."}
    if not np.any(y != 0):
        return {"error": "All values in this selection are zero, so there is nothing to forecast."}

    dates = pd.date_range(pd.Timestamp(start), periods=n, freq=alias)
    hold = int(np.clip(round(n * 0.15), 2, 6 if period == 12 else 13))
    train, test = y[: n - hold], y[n - hold:]
    m_for = lambda length: period if length >= 2 * period else 0  # noqa: E731
    abs_test = float(np.sum(np.abs(test))) or 1.0
    wanted = set(model_keys) if model_keys else None

    def score(bt: np.ndarray) -> dict:
        err = bt - test
        return {"wape": float(np.sum(np.abs(err)) / abs_test),
                "rmse": float(math.sqrt(np.mean(err ** 2))),
                "bias": float(np.sum(err) / abs_test)}

    out = []
    for spec in MODELS:
        meta = {k: spec[k] for k in ("key", "name", "family", "desc")}
        if wanted is not None and "ens" not in wanted and spec["key"] not in wanted:
            continue
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fit_t = spec["fn"](train, Ctx(m_for(len(train)), period, dates[: n - hold], alias))
                bt = np.maximum(np.asarray(fit_t.forecast(hold), dtype=float), 0)
                fit_f = spec["fn"](y, Ctx(m_for(n), period, dates, alias))
                fc = np.maximum(np.asarray(fit_f.forecast(horizon), dtype=float), 0)
            if bt.shape != (hold,) or fc.shape != (horizon,) or not (np.all(np.isfinite(bt)) and np.all(np.isfinite(fc))):
                raise ModelUnavailable("Model produced invalid values on this series")
            sc = score(bt)
            insd = sc["rmse"]
            if fit_f.fitted is not None:
                res = y - np.asarray(fit_f.fitted, dtype=float)
                res = res[np.isfinite(res)]
                if len(res):
                    insd = float(math.sqrt(np.mean(res ** 2)))
            sd = math.sqrt((insd ** 2 + sc["rmse"] ** 2) / 2)
            out.append({**meta, **sc, "backtest": _clean(bt), "forecast": _clean(fc), "sd": sd, "params": fit_f.params})
        except ModelUnavailable as exc:
            out.append({**meta, "na": str(exc)})
        except Exception:  # noqa: BLE001 - never let one model break the response
            logging.getLogger("forecast").exception("Model %s failed", spec["key"])
            out.append({**meta, "na": f"{spec['name']} could not run on this data. Check the server logs."})

    live = sorted([o for o in out if "na" not in o], key=lambda o: o["wape"])
    if len(live) >= 2 and (wanted is None or "ens" in wanted):
        top = live[:3]
        bt = np.mean([t["backtest"] for t in top], axis=0)
        fc = np.mean([t["forecast"] for t in top], axis=0)
        ens = {**ENSEMBLE, **score(bt), "backtest": _clean(bt), "forecast": _clean(fc),
               "sd": float(math.sqrt(np.mean([t["sd"] ** 2 for t in top])) * 0.92),
               "params": "Average of " + ", ".join(t["name"] for t in top)}
        out.insert(0, ens)
        live.append(ens)
    elif wanted is not None and "ens" in wanted:
        out.insert(0, {**ENSEMBLE, "na": "Ensemble needs at least two working models for this data."})
    if wanted is not None:
        out = [o for o in out if o["key"] in wanted]
        live = [o for o in out if "na" not in o]
    if not live:
        reason = "; ".join(f"{o['name']}: {o['na']}" for o in out)
        return {"models": out, "error": reason or "None of the selected models could be fitted to this series."}
    best = min(live, key=lambda o: o["wape"])
    return {"models": out, "best": best["key"], "holdout": hold, "seasonal": m_for(n) > 0,
            "seasonalStrength": seasonal_strength(y, period), "n": n}
