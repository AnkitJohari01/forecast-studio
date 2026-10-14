# ---- Forecast Studio API (FastAPI + statsmodels + XGBoost + Prophet) ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONWARNINGS=ignore \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp is needed by XGBoost; curl-free healthcheck uses Python.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
RUN useradd --create-home --uid 10001 appuser
USER appuser

# Warm imports at build time so the first request is fast.
RUN python -c "import statsmodels.api, xgboost, prophet; print('models ready')"

ENV WEB_CONCURRENCY=2 POOL_WORKERS=2
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"

CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY} -b 0.0.0.0:8000 --timeout 180 --graceful-timeout 30 --access-logfile -"]
