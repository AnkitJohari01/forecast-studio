# Forecast Studio deployment preparation

This is the original preparation log. For checks on the TimesFM and dynamic-selection update, see [VALIDATION.md](VALIDATION.md).

Prepared on 14 October 2026 from `AnkitJohari01/forecast-studio`, commit `f712e5d672049bfd10ddfe904ec99451b31a8e5d`.

## Changes

- Repository-root Render Blueprint for the nested backend, with the user-selected Free plan, health check, one worker, and limited cache/numerical-library threads.
- Vercel configuration and frontend environment example for `forecast-studio/frontend`.
- Docker startup and container health check honor `PORT`; local default remains 8000. `exec` passes termination signals to Gunicorn.
- Added the missing `scikit-learn==1.9.1` dependency required by `XGBRegressor`, a build-time import check, and a regression test.
- Added deployment instructions, generated-file ignores, and a Linux GitHub Actions build/test workflow.

## Verified locally

- All pinned packages resolve; the installed Python dependency consistency check passes.
- TypeScript type-check passes.
- Vite production build passes, including a build with an explicit API origin. This Windows sandbox rejects Node's native `realpath` call, so the build was run through Vite's API with `resolve.preserveSymlinks=true` as a local-only workaround. The committed Vite configuration was not changed. The exact unmodified `npm run build` remains to be checked by Linux CI.
- Render/Vercel configuration parses and the nested Docker/build paths exist.
- API health, all eight model metadata entries, allowed/denied CORS preflights, actual CORS response headers, two-series forecasts with XGBoost and trend regression, cached results, invalid horizons, empty batches, and non-finite-value rejection pass through FastAPI's TestClient.
- The new XGBoost regression test failed before the dependency fix and passes after it.
- Backend suite: **4 passed, 1 failed**. The all-model test fails because Prophet's native executable cannot start in this Windows environment (`WinError 623`, illegal system DLL relocation). The other seven models, including the ensemble, were available in the monthly test. No tests were skipped or weakened to hide this failure.
- Git whitespace/error check passes.

## Still requires verification

- Linux CI, including Prophet execution and the unmodified frontend build.
- Actual Docker image build: Docker's Linux daemon was not running, and WSL was inaccessible.
- Visual browser/end-to-end check: the browser could not reach the isolated local preview; it timed out. Direct in-process API tests were used instead.
- Live GitHub publication, Render deployment, Vercel deployment, final service URLs, and public-domain CORS. At the last access check, GitHub CLI authentication was invalid and the hosting browser sessions were still in their sign-in flows.

The source archive and patch contain code/configuration, not a running deployment. No hosting plan was purchased. Free Render has limited memory and sleeps on idle; the app currently has no login. Use sample/non-sensitive data for the public demo.

## Files

- `forecast-studio-render-vercel.zip`: complete repository source with deployment changes, preserving the existing nested folder structure. No dependencies, builds, caches, credentials, or Git history are included.
- `render-vercel.patch`: the same changes as a Git patch. Apply from the original repository root with `git apply --check render-vercel.patch`, then `git apply render-vercel.patch`.
- `DEPLOYMENT.md`: deployment settings and verification steps.
