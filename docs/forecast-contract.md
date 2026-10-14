# Matching forecast results across both applications

Both apps now run the same version of the forecasting code and the same pinned Python dependencies. The dashboard vendors `forecast_core/{data,models,engine}.py` from Forecast Studio's `backend/app`. Any engine update must be copied to both repositories and verified before deployment.

For identical CSV, date and measure columns, category filter, monthly/weekly grain and horizon, both apps return identical model predictions and metrics. CSV strings are preserved until explicit parsing; category labels such as `NA` and leading zeros are not replaced with missing values. Dates are validated, period totals are accumulated in input order, absent periods receive zero totals, and incomplete final periods are excluded using the same rules. If an absent period represents missing data rather than zero sales, repair that data before upload.

Models: Ensemble, ARIMA, SARIMA, XGBoost, LightGBM, Prophet, Holt-Winters, Theta, trend + seasonality, Ridge Regression, seasonal naive and moving average. Each model forecasts from target history and known calendar features. No validation actuals, future quantity or future prices are supplied as predictors. Lag models forecast recursively, moving average uses earlier observations only, and seasonal naive repeats its own seasonal history.

The final backtest contains 15% of periods, bounded to 2–6 months or 2–13 weeks. An earlier validation window chooses the automatic model and ensemble members. The reported final backtest never chooses the model. Short histories use a fixed baseline when earlier validation is impossible. A 5-month backtest does not establish 12-month-ahead accuracy.

Metrics are computed from the same returned backtest predictions: WAPE/WMAPE, MAPE (excluding zero/near-zero actuals), MAE, RMSE, bias and MASE. WAPE and bias are ratios; WMAPE, MAPE and bias_pct are percentages. Undefined metrics are null. Displayed accuracy is `max(0,100−WMAPE)`, not a probability.

The 80%/95% ranges are residual-based approximations; empirical coverage is not established. Currency changes formatting only, not exchange rates. Model availability depends on sufficient history and the server runtime; an unavailable model is explicitly marked and never substituted silently.

## Verification

The local audit on `sample_office_home_retail.csv` covered total monthly Sales and both monthly/weekly Mesh Task Chair Sales. Every successful model's forecasts, backtests and all metrics matched with zero difference. A raw CSV regression also exercised PapaParse and the dashboard multipart upload endpoint with `NA`/`N/A` labels, leading-zero identifiers and rejected numeric syntax.

Backend regression tests cover history-only evaluation, independent final holdout, metric calculations, bad inputs, period aggregation, upload filters and missing legacy artifacts. Frontend tests cover request identity, stale-response protection, parsing, metric units, date alignment, confidence ranges and scenarios.

Prophet's native runtime could not start on the local Windows sandbox. Its metrics are unavailable in this environment and the native-runtime test is explicitly skipped. Use the supplied Linux Docker configuration for deployment and verify `/health` or `/api/health` and a real upload after rollout. Local browser preview could not connect through the sandbox, so production build checks do not replace visual deployment verification.

## Run

Forecast Studio: install `backend/requirements.txt`, run `uvicorn app.main:app` from `backend`; run `npm ci` and `npm run dev` from `frontend`.

Dashboard: install `requirements.txt`, run `uvicorn main:app` from `tvs-sales-dashboard-main`; run `npm ci` and `npm run dev` from its `frontend`. Set `VITE_API_URL` to its backend URL. Set Forecast Studio's `VITE_API_BASE` to its backend URL and `ALLOWED_ORIGINS` to its frontend origin.

Use Node 24 for frontend regression tests (`npm test`), and `python -m pytest` for backend tests. Keep Python 3.10 and dependency pins identical across deployments. Legacy dashboard model/EDA sections are explicitly separate demos; they do not evaluate the uploaded CSV.
