# Validation — 15 October 2026

Status: implementation prepared from the supplied `forecast-studio-main.zip`; no hosting deployment or purchase was made. The original ZIPs were left unchanged.

## What changed

- Added a ninth option, TimesFM 2.5, using a separate authenticated service. The main API does not install/load PyTorch and its Render Blueprint remains on Free.
- Explicit model selection sends that model key, all current aggregated values, the displayed horizon, and `refresh: true`. Auto compares available models. Ensemble evaluates its members and returns the ensemble result.
- Removed the browser result cache and fixed the request key to include the whole series. Old requests are aborted and their late responses ignored. Results from an earlier input are hidden while a new request runs.
- The chart, totals, What-if calculations, table, export and segment results consume the selected forecast. Failed selections show an error and Retry; another model is never substituted.
- Kept all nine choices accessible in Model lab after a single-model request. Unknown/empty model selections are rejected by the API. Model failures are logged instead of being mislabeled as insufficient history.
- The separate service validates authorization, finite inputs and exact forecast dimensions. It loads the real pretrained checkpoint once and serializes inference. Four training points are allowed because a valid six-period series loses two periods for the recent-data check.
- Placed `render.yaml` at the repository root so `forecast-studio/backend` resolves correctly.

## Real monthly and weekly API checks

Each row was tested through the main FastAPI route with an explicit model key and refresh enabled. Assertions required the same returned key, no substitute model, the requested forecast length, and finite values. The TimesFM service ran as a real HTTP server in the test process and loaded the downloaded public model weights.

| Option | Monthly | Weekly |
|---|---|---|
| ARIMA | Passed | Passed |
| XGBoost | Passed | Passed |
| Prophet | Blocked by Windows executable launch failure | Same failure |
| Holt-Winters | Passed | Passed |
| Theta | Passed | Passed |
| Trend + seasonality | Passed | Passed |
| Seasonal naive | Passed | Passed |
| Ensemble | Passed | Passed |
| TimesFM | Passed with real weights | Passed with real weights |

Command: `RUN_LIVE_MODEL_TESTS=1 python -m pytest tests/test_live_models.py -q` from the backend, with both Python dependency sets installed. Result: **16 passed, 2 failed**. The failures are the Prophet monthly and weekly cases. Prophet's native executable cannot launch in this sandbox (`WinError 623`, illegal system DLL relocation); no fallback implementation or skipped Prophet assertion was added to hide the failure. This does not verify Prophet on the eventual Linux host.

These are routing and output checks, not a guarantee of forecasting quality for arbitrary business data.

## Other checks actually run

- Frontend `npm test`: **5 passed**. Includes selected model and horizon in requests, switching back makes a fresh request, changed middle values with unchanged totals/endpoints trigger recomputation, retry, and a slow obsolete response cannot overwrite the new selection. A component integration test checks chart input, forecast table and all four sample segment rows switch to TimesFM; a failed Prophet selection removes the old forecast and shows the error.
- `npm run typecheck`: passed. Fixed the existing incompatible `tsc -b --noEmit` typecheck command to `tsc --noEmit`.
- Production Vite build: passed with an environment-only `resolve.preserveSymlinks=true` override using Vite's API. The exact `npm run build` failed at native Windows `realpath` with EPERM in this sandbox. Production Vite configuration was left unchanged; the exact Linux build still needs validation.
- Default backend suite: **10 passed, 1 failed, 18 skipped**. The failing test is `test_all_models_run_monthly`, caused by the same Prophet native executable failure. The 18 skips are the opt-in live tests; those were separately enabled and run with the results above. Six added selection/remote-adapter tests passed, covering selected-key isolation, explicit Ensemble routing, model validation, fresh computation, preserved failure reasons, HTTP authorization/payload and invalid remote forecast dimensions.
- TimesFM service suite with `TIMESFM_RUN_REAL_TESTS=1`: **9 passed**, including real inference at 4, 57 and 156 input points and horizons 2, 24 and 52. Actual weights were loaded; a native compiler was deliberately unavailable to confirm the service does not require PyTorch graph compilation. Other tests cover token checks, invalid inputs and invalid output.
- Independent code review found the four-training-point boundary issue; its reproducing test failed before the fix and passed after it. No other actionable findings were reported.
- Python source syntax checks passed. The standalone service's CPU PyTorch wheel availability was checked against the official CPU wheel index.

## Remaining validation and limits

- No deployed Render/Vercel/service URLs were provided or modified. Configure `TIMESFM_URL` and matching private `TIMESFM_TOKEN` on the main API and separate service, then redeploy both application components. See `TIMESFM_SETUP.md`.
- Docker execution was not tested: the local Docker Linux daemon was unavailable. Public-domain connectivity, CORS, visual browser/canvas rendering and resource use under real hosting load remain unverified.
- Render Free still has the original limits for the other models. Moving TimesFM out does not guarantee that every workload fits on the main Free instance. The main app's existing public API has no login; use the existing access-control deployment guidance for real client data.
- The existing Vite 5.4.6 development toolchain has npm audit findings (one moderate and one high). No new runtime frontend dependency was introduced; `react-test-renderer` is a development-only test dependency. Do not expose the development server publicly.

The package excludes installed dependencies, generated builds/caches, downloaded weights, Git data, credentials and the obsolete `render-vercel.patch`. Service Docker builds download the public weights themselves.
