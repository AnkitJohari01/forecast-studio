import { useEffect, useState } from 'react';
import { forecastBatch, forecastKey, type SeriesReq } from './api';
import type { Gran, SeriesResult } from './types';

interface State { key: string; data: Record<string, SeriesResult> | null; loading: boolean; error: string | null }

/** Fetches forecasts for a list of series; re-runs when the inputs change. */
export function useForecast(list: SeriesReq[], gran: Gran, horizon: number, enabled = true, model = 'auto') {
  const [state, setState] = useState<State>({ key: '', data: null, loading: false, error: null });
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([forecastKey(list, gran, horizon, model), nonce]);

  useEffect(() => {
    if (!enabled || !list.length) return;
    const ctrl = new AbortController();
    setState({ key, data: null, loading: true, error: null });
    forecastBatch(list, gran, horizon, ctrl.signal, model)
      .then((data) => { if (!ctrl.signal.aborted) setState({ key, data, loading: false, error: null }); })
      .catch((e: Error) => { if (!ctrl.signal.aborted) setState({ key, data: null, loading: false, error: e.message || 'Could not reach the forecasting service.' }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const current = enabled && list.length && state.key === key;
  return { data: current ? state.data : null, loading: !!(enabled && list.length) && (!current || state.loading),
    error: current ? state.error : null, retry: () => setNonce((n) => n + 1) };
}
