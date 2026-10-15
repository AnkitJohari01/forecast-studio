# Forecast Studio: Render + Vercel

For the TimesFM update, also follow [TIMESFM_SETUP.md](TIMESFM_SETUP.md). TimesFM runs on a separate host; the main API's Render Free plan is unchanged. All nine options appear in the frontend, and each explicit selection runs only that option (Ensemble runs its member models). TimesFM needs its service URL and token configured before it can produce results.

Repository: https://github.com/AnkitJohari01/forecast-studio

The browser loads the React app from Vercel and calls the Python API directly on Render over HTTPS. No database is needed. CSV parsing stays in the browser; aggregated series go to the API. The API's cache is temporary.

## 1. Push the deployment files

Keep the existing nested folder structure:

```text
render.yaml
DEPLOYMENT.md
forecast-studio/
  backend/Dockerfile
  frontend/vercel.json
  frontend/.env.example
```

`render.yaml` belongs at the GitHub repository root, outside the inner `forecast-studio` folder. Vercel's root directory is `forecast-studio/frontend`.

## 2. Deploy the API on Render

Open [Render](https://dashboard.render.com), select **New > Blueprint**, connect the repository, select `main`, and use the root `render.yaml`.

The Blueprint selects the **Free** plan, Docker, root directory `forecast-studio/backend`, and health check `/api/health`. It uses one web worker, one model worker, single-threaded numerical libraries, and a small result cache to reduce memory use. The Dockerfile binds to Render's `PORT` on `0.0.0.0`.

When prompted for `ALLOWED_ORIGINS`, enter the exact Vercel production origin, for example `https://your-project.vercel.app`, with no trailing slash. If Vercel has not assigned your URL yet, use `http://localhost:5173` temporarily and replace it after step 3. Do not use `*` or assume a project URL is available.

After the service is live, copy its actual `https://...onrender.com` URL. Open `<RENDER_URL>/api/health`; it must return `{"status":"ok"}`. API documentation is at `<RENDER_URL>/api/docs`. The API root `/` is not a dashboard.

If configuring a Web Service manually, choose Docker, root `forecast-studio/backend`, Dockerfile `./Dockerfile`, Docker context `.`, Free instance, and health check `/api/health`. Copy the environment values from `render.yaml`; leave the Docker command override empty.

## 3. Deploy the frontend on Vercel

Open [Vercel](https://vercel.com/new), import the same repository, and set:

| Setting | Value |
|---|---|
| Root Directory | `forecast-studio/frontend` |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment variable | `VITE_API_BASE=https://YOUR-ACTUAL-RENDER-SERVICE.onrender.com` |

Set `VITE_API_BASE` for Production. Include Preview too if previews should call the same API. The value is only the HTTPS origin: **do not append `/api`**, because the app already appends `/api/forecast`. This is a public URL, not a secret. Vercel reads the included `vercel.json` from the selected root directory.

Deploy, then copy the actual production URL. In Render, set `ALLOWED_ORIGINS` to that exact origin and save/redeploy. For a custom domain or a specific preview, add its exact origin separated by commas. Do not allow every `vercel.app` site. CORS controls browser access; it is not authentication.

Changing `VITE_API_BASE` requires a new Vercel deployment because Vite embeds it at build time. Changing `ALLOWED_ORIGINS` requires a Render restart/redeploy.

## 4. Verify the connected deployment

1. Open the Render health endpoint and confirm `{"status":"ok"}`.
2. Open the Vercel production URL. The sample-data dashboard should finish forecasting and show charts, model scores, and segment forecasts.
3. In Model lab, confirm all nine models are listed (TimesFM requires its separate service) for the sample monthly data.
4. Select a region and change the forecast horizon. Confirm the values update.
5. Upload a small CSV with at least six periods and confirm it forecasts. Reload the page; uploads are not saved.

Optional API check (replace the URL):

```bash
curl https://YOUR-ACTUAL-RENDER-SERVICE.onrender.com/api/forecast \
  -H 'Content-Type: application/json' \
  -d '{"freq":"month","horizon":3,"models":["sr"],"series":[{"id":"check","start":"2025-01-01","values":[100,110,105,120,125,130,128,140,145,150,148,160]}]}'
```

Expect HTTP 200 and `results.check.models` with three forecast values.

## Free demo limits and troubleshooting

- Render Free sleeps after 15 minutes without traffic; waking normally takes about a minute. Open the health endpoint, wait for it to become healthy, then use the dashboard's **Try again** button if necessary. There is no keep-alive job.
- The free service has 512 MB RAM and limited CPU. All forecasting models remain enabled. Single-worker settings reduce memory use but do not guarantee that large uploads, weekly histories, many segments, or concurrent users will fit. Out-of-memory restarts or slow batches require a smaller demo workload or an explicitly chosen paid instance with more memory.
- A page that loads but reports a forecasting error usually indicates an incorrect `VITE_API_BASE`, a sleeping/unhealthy Render service, or an `ALLOWED_ORIGINS` mismatch. Check Render logs and the browser Network panel.
- A response containing HTML instead of forecast JSON usually means `VITE_API_BASE` was empty and the request went to Vercel's SPA fallback. Set the Render origin and redeploy Vercel.
- This app has no login. Use sample/non-sensitive data for the public demo. CORS does not restrict direct API callers, and no authentication or rate-limiting service has been added.

## Local checks

Backend: Python 3.12, `pip install -r requirements-dev.txt`, then `POOL_WORKERS=1 pytest -q` from `forecast-studio/backend`. Frontend: `npm ci && npm run build` from `forecast-studio/frontend`.

The included GitHub Actions workflow runs the frontend build and the complete backend test suite on Linux on each push and pull request. Check its result before relying on the demo. The scikit-learn dependency is explicitly included because the app uses XGBoost's `XGBRegressor` interface.

Existing Docker Compose and local Vite development retain port 8000 and the same-origin `/api` proxy.

References: [Render monorepo roots](https://render.com/docs/monorepo-support), [Blueprint format](https://render.com/docs/blueprint-spec), [Render port binding](https://render.com/docs/web-services#port-binding), [Render Free limits](https://render.com/docs/free), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
