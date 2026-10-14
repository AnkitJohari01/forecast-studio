# Forecast Studio · Predictive Sales Analytics

A production-ready predictive analytics application. It has two parts:

- A **React + TypeScript** frontend with the forecast dashboard, What-if scenario planner, model lab, segment outlook and CSV upload.
- A **Python FastAPI** backend that trains real forecasting models: ARIMA (statsmodels SARIMAX), XGBoost, Prophet, Holt-Winters, Theta, trend + seasonality regression, seasonal naive, and an ensemble of the top three.

```
Browser ──► web (nginx: React build + /api proxy) ──► api (FastAPI + gunicorn)
                                                          └─ statsmodels · xgboost · prophet
```

Uploaded CSVs are parsed and aggregated **in the browser**. Only the aggregated time series (one number per month or week) is sent to the API. Nothing is stored on the server apart from an in-memory result cache.

---

## 1. Run it anywhere with Docker (recommended)

You need Docker with the Compose plugin. A host with 2 vCPU and 4 GB RAM is enough for a team demo.

```bash
cp .env.example .env          # optional: change WEB_PORT etc.
docker compose up -d --build  # first build takes ~5-8 min (model libraries)
```

Open `http://<server>:8080`. Check health with:

```bash
curl http://localhost:8080/api/health     # {"status":"ok"}
docker compose ps                          # both services "healthy"
docker compose logs -f api                 # API logs
```

Update after code changes: `docker compose up -d --build`. Stop: `docker compose down`.

---

## 2. Deploy to the cloud

Both images are standard Linux containers, so any container platform works. The **web** container must reach the **api** container. Set `API_UPSTREAM` on the web container to the API's internal URL.

### Azure Container Apps

```bash
RG=rg-forecast-studio; LOC=centralindia; ACR=forecaststudio$RANDOM; ENV=forecast-env

az group create -n $RG -l $LOC
az acr create -g $RG -n $ACR --sku Basic --admin-enabled true
az acr build -r $ACR -t forecast-api:1.0.0 ./backend
az acr build -r $ACR -t forecast-web:1.0.0 ./frontend
az containerapp env create -g $RG -n $ENV -l $LOC

# API: internal only, 2 vCPU / 4 GiB
az containerapp create -g $RG -n forecast-api --environment $ENV \
  --image $ACR.azurecr.io/forecast-api:1.0.0 --registry-server $ACR.azurecr.io \
  --ingress internal --target-port 8000 --cpu 2 --memory 4Gi \
  --min-replicas 1 --max-replicas 3 --env-vars WEB_CONCURRENCY=2 POOL_WORKERS=2

# Web: public, proxies /api to the internal API app
az containerapp create -g $RG -n forecast-web --environment $ENV \
  --image $ACR.azurecr.io/forecast-web:1.0.0 --registry-server $ACR.azurecr.io \
  --ingress external --target-port 80 --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --env-vars API_UPSTREAM=http://forecast-api

az containerapp show -g $RG -n forecast-web --query properties.configuration.ingress.fqdn -o tsv
```

Keep `--min-replicas 1` on the API to avoid cold starts. Releases: rebuild with a new tag, then `az containerapp update -n forecast-api -g $RG --image ...:1.0.1`.

### Other platforms

- **Azure App Service / any VM:** install Docker and run section 1, or use App Service "Docker Compose" with `docker-compose.yml`.
- **AWS:** push both images to ECR and run them as two ECS Fargate services, or one task with two containers (`API_UPSTREAM=http://localhost:8000` in a single task). Give the API 2 vCPU / 4 GB.
- **Google Cloud Run:** deploy `api` and `web` as two services and set `API_UPSTREAM` to the API's `https://…run.app` URL. Use `--min-instances 1` and request timeout ≥ 180 s for the API.
- **Kubernetes:** two Deployments + Services; set `API_UPSTREAM=http://forecast-api:8000`.

**Frontend on a separate domain** (e.g. Azure Static Web Apps or S3 + CloudFront): build with `VITE_API_BASE=https://api.yourdomain.com npm run build`, and set `ALLOWED_ORIGINS=https://app.yourdomain.com` on the API.

---

## 3. Configuration

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `WEB_PORT` | compose | `8080` | Public port |
| `API_UPSTREAM` | web | `http://api:8000` | Where nginx forwards `/api` |
| `WEB_CONCURRENCY` | api | `2` | Gunicorn worker processes |
| `POOL_WORKERS` | api | `2` | Parallel processes per worker for segment batches |
| `MAX_SERIES` / `MAX_POINTS` | api | `50` / `1000` | Request size limits |
| `CACHE_SIZE` | api | `512` | Cached series results per worker |
| `ALLOWED_ORIGINS` | api | empty | CORS origins (only for split-domain hosting) |
| `VITE_API_BASE` | web build arg | empty | API URL if not same-origin |

**Sizing:** each API worker uses roughly 400–700 MB with all libraries loaded. A full forecast (8 models with backtest) takes about 2 s per series. Segment forecasts run in parallel.

---

## 4. Security before using client data

The app has **no login** out of the box. Before exposing it with real data, do one of the following:

- **Azure:** enable Container Apps / App Service **Authentication (Easy Auth)** with Microsoft Entra ID. No code changes are needed.
- **Elsewhere:** put it behind your SSO proxy or VPN, or restrict ingress by IP.

Always serve over HTTPS. Container Apps, App Service and Cloud Run do this automatically.

---

## 5. Local development

```bash
# API (Python 3.12)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q                                   # engine + API tests

# Web (Node 20)
cd frontend
npm install
npm run dev                                 # http://localhost:5173, /api proxied to :8000
npm run build                               # type-check + production build
```

Interactive API docs: `http://localhost:8000/api/docs`.

---

## 6. API

`POST /api/forecast`

```json
{
  "freq": "month",
  "horizon": 24,
  "series": [{ "id": "main", "start": "2022-01-01", "values": [41912975, 43120044, 51023811] }]
}
```

Returns, per series id: every model's backtest accuracy (`wape`, `rmse`, `bias`), the backtest predictions, the forecast for `horizon` periods, the prediction-interval width (`sd`), the fitted parameters, and the `best` model key. Also available: `GET /api/health` and `GET /api/models`.

---

## 7. CSV format

Uploads need one row per transaction or per period, a date column, and at least one numeric column. Category columns (region, product, channel…) are optional and enable the segment breakdown.

```
Date,Region,Product,Revenue
2025-01-31,North,Tyres,1245000
```

Accepted date formats include `2025-01-31`, `31/01/2025`, `Jan-2025`, `15 Mar 2025` and Excel serial numbers. Six periods are the minimum; 2+ years unlocks every seasonal model.

---

## 8. Project structure

```
backend/
  app/models.py      model implementations (statsmodels, xgboost, prophet, baselines)
  app/engine.py      backtesting, scoring, ensemble, intervals
  app/main.py        FastAPI app, validation, caching, parallel batches
  tests/             pytest suite
frontend/
  src/lib/           data parsing, API client, scenario engine, formatting
  src/components/    Hero, WhatIf, ModelLab, Insights, Segments, ForecastTable, Sidebar, Toolbar
  nginx.conf.template
docker-compose.yml
```
