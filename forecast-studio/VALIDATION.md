# Combined branch validation - 15 October 2026

This package reconciles deployed `codex/forecast-parity` commit `ac223d4f3ccde7a7f954fe1137d2cc55e95ddca1` and `timesfm-update` commit `a200e630b5bb9dd9f13329f031a9c2ae58c0a8c0`. Common base: `2827356576626a8a07a57be13b6619df3e12c5ce`. Eleven file conflicts were resolved locally. No GitHub branch, live service, credentials or original ZIP was changed by this work.

## Retained and combined

All 12 deployed model choices remain: Ensemble, ARIMA, XGBoost, Prophet, Holt-Winters, Theta, Trend + seasonality, Seasonal naive, SARIMA, LightGBM, Ridge Regression and Moving Average. TimesFM is the 13th choice, using the approved separate authenticated service. The frontend obtains the complete list from the API and preserves it after selecting one model, a selected-model failure or a temporary registry-loading failure.

The live branch's strict CSV/date parsing, aggregation, nullable metrics, earlier-validation model selection, independent final backtest, deterministic model code and Python 3.10 backend Docker/dependency configuration are retained. TimesFM service code and its separate Python 3.12 image are unchanged from the previous package. The existing backend does not install PyTorch.

Explicit selection runs that model with current data/horizon and refresh enabled. Ensemble runs its candidate members and returns only Ensemble when explicitly requested; insufficient working members produce an error. Chart, table, export and segments use the requested model; failed selections do not substitute another model. Caches cannot return a stale frontend selection, and aborted/late results cannot replace a current result.

## Checks actually run on the combined source

- Backend default suite: **35 passed, 27 skipped**. The skips are 26 opt-in live cases and the existing parity branch's Prophet native-runtime test. The live cases were enabled separately below; Prophet is not being counted as working.
- Frontend: **13 passed**, including all 13 dropdown options, preserved extra models, model/horizon routing to chart/table/segments, retry, changed middle values, canceled/late responses, strict parsing, nullable metrics and transient registry failure. The registry recovery regression failed before the fix and passed afterward.
- TypeScript `tsc --noEmit` and `tsc -b`: passed. Vite production build: passed using the existing parity `preserveSymlinks` setting. Node 24.18.0 was used.
- Separate TimesFM service: **9 passed**, with real-weight tests enabled, including authentication, boundary validation and actual pretrained inference.
- Fresh independent code review: no unresolved substantive merge regressions. The registry recovery finding was reproduced and fixed. Source comparison confirmed retained parsing, metrics and backend deployment pins.

## Real model selections through the API

Each test requests one named model with refresh enabled, then verifies the same returned model key, exact horizon and finite output. TimesFM runs through a real HTTP service using the actual public Google TimesFM 2.5 checkpoint. Monthly data has 57 points, weekly data 130. Result: **24 passed, 2 failed**.

| Choice | Monthly | Weekly |
|---|---|---|
| ARIMA | Passed | Passed |
| XGBoost | Passed | Passed |
| Prophet | Native runtime failed | Native runtime failed |
| Holt-Winters | Passed | Passed |
| Theta | Passed | Passed |
| Trend + seasonality | Passed | Passed |
| Seasonal naive | Passed | Passed |
| SARIMA | Passed | Passed |
| LightGBM | Passed | Passed |
| Ridge Regression | Passed | Passed |
| Moving Average | Passed | Passed |
| Ensemble | Passed | Passed |
| TimesFM | Passed, real weights | Passed, real weights |

Prophet could not start its native CmdStan runtime in this Windows sandbox. Its two live assertions failed explicitly. Linux/Render Prophet remains to be checked; no substitute forecast is presented as Prophet.

## Limits and deployment still required

These are local routing and output checks, not a forecast-quality guarantee or proof that every input has enough history. Local Python was 3.12.14 with the backend's exact pinned package versions; the retained Python 3.10 Linux image was not built or run here. Docker/hosted resource capacity, Render configuration, deployed frontend CORS and actual hosted requests were not verified. TimesFM still requires a separate sufficiently sized running service plus TIMESFM_URL/TIMESFM_TOKEN on Render. Vercel frontend variables require a new deployment. The separate dashboard repository was not updated; its historical parity audit must be repeated after synchronization if matching it remains necessary. Existing Vite 5.4.6 dependencies were not upgraded.

The full source ZIP excludes installed dependencies, generated builds, caches, weights, credentials and Git metadata. The upload instructions describe how to record a real merge through GitHub's conflict editor; uploading files alone does not establish merge ancestry.
