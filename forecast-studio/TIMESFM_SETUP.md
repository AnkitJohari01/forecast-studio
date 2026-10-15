# TimesFM and fresh model selection

The main API stays on Render Free. TimesFM 2.5 runs on a separate machine with enough RAM; Google's basic CPU recommendation is 4–8 GB. Do not deploy the TimesFM container on the 512 MB Free instance.

## Deploy the separate service

Use the `timesfm-service` directory as the Docker build context on a container host you control. Choose one worker and at least 4 GB RAM (8 GB preferred for headroom). The image downloads the public `google/timesfm-2.5-200m-pytorch` checkpoint during its build, so allow roughly 1 GB for weights plus the Python/PyTorch image. The first forecast also loads the weights into RAM. Set the host's request timeout to at least 180 seconds.

Set `TIMESFM_TOKEN` to a long random secret in the service's environment. Generate one with:

```sh
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

The service listens on `PORT` (8000 by default). Health is `/health`. Serve it over HTTPS, and keep the service token private. All forecast requests require `Authorization: Bearer <token>`. The token must never be placed in frontend variables or committed to Git. A missing token makes forecasting return 503; a wrong token returns 401.

For a local Docker run:

```sh
docker build -t forecast-timesfm ./timesfm-service
docker run --rm -p 8001:8000 --env TIMESFM_TOKEN forecast-timesfm
```

Set the token in your shell before running the command. Docker forwards that environment variable without placing its value in the command. Local testing can use `http://localhost:8001`; a hosted Render API needs a publicly reachable HTTPS URL or a reachable private service address, not your computer's localhost.

## Connect the Render API

On your existing main Render service, set:

| Variable | Value |
|---|---|
| `TIMESFM_URL` | The separate service origin, e.g. `https://your-timesfm-service.example` (no `/forecast` suffix) |
| `TIMESFM_TOKEN` | Exactly the same secret as the separate service |

Save the variables and redeploy the updated backend. Redeploy the updated frontend on Vercel. Its existing `VITE_API_BASE` still points at the main Render API. No TimesFM credentials go to the browser. The included `render.yaml` is at the repository root, alongside the inner `forecast-studio` folder; its paths target that inner folder. The Blueprint remains on Free; no paid service is provisioned by these files.

The main API forwards aggregated values to the separate service, so choose a host suitable for your data. The main app's existing public API has no login; the service token protects the TimesFM service itself, not public calls through the main app. Before real shared production use, apply your existing access-control setup to the main API as well.

## Validate the app

1. Open sample data (57 monthly periods). Choose each of the nine options in the dropdown. Each selection sends `POST /api/forecast` with the selected model key, the displayed horizon and `refresh: true`. Auto omits the model list to compare all available models; Ensemble runs the member models before averaging the best three available, or two if only two work.
2. Confirm the chart title, totals, forecast table, CSV export and segment rows show that selected model's results. A failed model shows an error; another model is never silently substituted. Auto can choose a different best model for each segment.
3. Change the horizon and then upload changed data. Both must send fresh requests. Switch quickly between models: a slow earlier response must not replace the latest selection.
4. Choose TimesFM with the separate service configured. The API performs two service calls per series: one to check predictions against recent actual values, then one using all current history. Results must contain exactly the requested number of finite values.
5. Stop the TimesFM service and select TimesFM again. You should see a TimesFM connection error and a working Try again button. Select another model to continue.

Insufficient history, service downtime, and model fitting failures can still prevent a model from producing a forecast. The app reports these failures rather than showing misleading output. Short histories can also leave Ensemble with fewer than two working members.

## Run tests

```sh
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
cd ../frontend
npm ci
npm test
npm run typecheck
npm run build
cd ../timesfm-service
python -m pip install -r requirements.txt pytest httpx
python -m pytest -q
```

Frontend tests use Node's built-in test runner and the existing TypeScript compiler (Node 20+). Service unit tests replace only the heavy model boundary and do not download weights. To validate real inference, deploy/start the separate service and select TimesFM, or send an authenticated `/forecast` request. Consult `VALIDATION.md` for checks actually run on this source package.

Official references: [TimesFM 2.5 model](https://huggingface.co/google/timesfm-2.5-200m-pytorch), [CPU memory guidance](https://github.com/google-research/timesfm/blob/master/timesfm-forecasting/references/system_requirements.md).

To run the real service integration tests, install both sets of Python dependencies, set `TIMESFM_RUN_REAL_TESTS=1` in the service directory, and run `python -m pytest -q`. To check all nine model selections over HTTP, set `RUN_LIVE_MODEL_TESTS=1` in the backend directory and run `python -m pytest tests/test_live_models.py -q`. These checks download/load real weights and require enough RAM. `HF_HOME` can point at an existing model cache.
