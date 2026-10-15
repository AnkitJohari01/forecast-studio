"""Private TimesFM inference service; run separately from the small main API."""
import hmac
import logging
import os
from functools import lru_cache
from threading import Lock

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

MODEL_ID = "google/timesfm-2.5-200m-pytorch"
app = FastAPI(title="Forecast Studio TimesFM", docs_url=None, redoc_url=None)
_inference_lock = Lock()


@lru_cache(maxsize=1)
def get_model():
    import timesfm
    import torch

    torch.set_num_threads(max(1, int(os.getenv("TIMESFM_THREADS", "2"))))
    torch.set_float32_matmul_precision("high")
    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(MODEL_ID, force_download=False, torch_compile=False)
    model.compile(timesfm.ForecastConfig(max_context=1024, max_horizon=128, per_core_batch_size=1,
                                       normalize_inputs=True, infer_is_positive=False))
    return model


class ForecastRequest(BaseModel):
    values: list[float] = Field(min_length=4, max_length=1000)
    horizon: int = Field(ge=1, le=104)

    @field_validator("values")
    @classmethod
    def finite_values(cls, values: list[float]) -> list[float]:
        if not np.all(np.isfinite(values)):
            raise ValueError("Values must be finite numbers")
        return values


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast")
def forecast(request: ForecastRequest, authorization: str = Header(default="")):
    token = os.getenv("TIMESFM_TOKEN", "")
    if not token:
        raise HTTPException(503, "Service token is not configured")
    if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise HTTPException(401, "Invalid service token")
    try:
        # One loaded checkpoint and one inference at a time keep memory bounded.
        with _inference_lock:
            point, _ = get_model().forecast(horizon=request.horizon, inputs=[np.asarray(request.values, dtype=float)])
        point = np.asarray(point, dtype=float)
        if point.shape != (1, request.horizon) or not np.all(np.isfinite(point)):
            raise ValueError("Invalid model output")
        return {"forecast": point[0].tolist()}
    except Exception as exc:
        logging.getLogger("timesfm").exception("TimesFM inference failed")
        raise HTTPException(503, "TimesFM inference failed. Check service logs and retry.") from exc
