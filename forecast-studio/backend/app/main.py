"""Forecast Studio API."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from collections import OrderedDict
from contextlib import asynccontextmanager
from concurrent.futures import ProcessPoolExecutor
from threading import Lock
from typing import Literal

import anyio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, field_validator

from .engine import forecast_series
from .models import ENSEMBLE, MODELS

log = logging.getLogger("forecast")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

MAX_SERIES = int(os.getenv("MAX_SERIES", "50"))
MAX_POINTS = int(os.getenv("MAX_POINTS", "1000"))
CACHE_SIZE = int(os.getenv("CACHE_SIZE", "512"))
POOL_WORKERS = int(os.getenv("POOL_WORKERS", str(max(1, min(4, (os.cpu_count() or 2))))))

_pool: ProcessPoolExecutor | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    if _pool:
        _pool.shutdown(cancel_futures=True)


app = FastAPI(title="Forecast Studio API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


class Series(BaseModel):
    id: str = Field(max_length=200)
    values: list[float]
    start: str = Field(description="ISO date of the first period")

    @field_validator("values")
    @classmethod
    def check_values(cls, v: list[float]) -> list[float]:
        if len(v) > MAX_POINTS:
            raise ValueError(f"At most {MAX_POINTS} periods per series")
        if any(x != x or x in (float("inf"), float("-inf")) for x in v):
            raise ValueError("Values must be finite numbers")
        return v


class ForecastRequest(BaseModel):
    series: list[Series] = Field(min_length=1)
    freq: Literal["month", "week"] = "month"
    horizon: int = Field(24, ge=1, le=104)
    models: list[str] | None = None
    refresh: bool = False

    @field_validator("models")
    @classmethod
    def check_models(cls, v: list[str] | None) -> list[str] | None:
        known = {m["key"] for m in MODELS} | {ENSEMBLE["key"]}
        if v is not None and (not v or any(k not in known for k in v)):
            raise ValueError("Select at least one valid model")
        return v

    @field_validator("series")
    @classmethod
    def check_count(cls, v: list[Series]) -> list[Series]:
        if len(v) > MAX_SERIES:
            raise ValueError(f"At most {MAX_SERIES} series per request")
        return v


# ----------------------------------------------------------------- small LRU cache
_cache: OrderedDict[str, dict] = OrderedDict()
_lock = Lock()


def _key(s: Series, req: ForecastRequest) -> str:
    raw = json.dumps([s.values, s.start, req.freq, req.horizon, sorted(req.models or [])])
    return hashlib.sha256(raw.encode()).hexdigest()


def _get(k: str):
    with _lock:
        if k in _cache:
            _cache.move_to_end(k)
            return _cache[k]
    return None


def _put(k: str, v: dict) -> None:
    with _lock:
        _cache[k] = v
        _cache.move_to_end(k)
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)


def _run(args: tuple) -> dict:
    values, start, freq, horizon, models = args
    return forecast_series(values, start, freq, horizon, models)


# ----------------------------------------------------------------- routes
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/models")
def list_models() -> list[dict]:
    return [ENSEMBLE] + [{k: m[k] for k in ("key", "name", "family", "desc")} for m in MODELS]


@app.post("/api/forecast")
async def forecast(req: ForecastRequest) -> dict:
    global _pool
    results: dict[str, dict] = {}
    todo: list[tuple[str, str, tuple]] = []
    for s in req.series:
        k = _key(s, req)
        hit = None if req.refresh else _get(k)
        if hit is not None:
            results[s.id] = hit
        else:
            todo.append((s.id, k, (s.values, s.start, req.freq, req.horizon, req.models)))

    if todo:
        try:
            if len(todo) == 1 or POOL_WORKERS <= 1:
                outs = [await anyio.to_thread.run_sync(_run, todo[0][2])] if len(todo) == 1 else \
                       [await anyio.to_thread.run_sync(_run, t[2]) for t in todo]
            else:
                if _pool is None:
                    _pool = ProcessPoolExecutor(max_workers=POOL_WORKERS)
                loop_pool = _pool
                outs = await anyio.to_thread.run_sync(lambda: list(loop_pool.map(_run, [t[2] for t in todo])))
        except Exception as exc:  # noqa: BLE001
            log.exception("forecast failed")
            raise HTTPException(status_code=500, detail="Forecasting failed on the server") from exc
        for (sid, k, _), res in zip(todo, outs):
            if "error" not in res:
                _put(k, res)
            results[sid] = res
    return {"results": results}
