import { useEffect, useState } from 'react';
import { forecastBatch, type SeriesReq } from './api';
import type { Gran, SeriesResult } from './types';

interface State { data: Record<string, SeriesResult> | null; loading: boolean; error: string | null }

/** Fetches forecasts for a list of series; re-runs when the inputs change. */
export function useForecast(list: SeriesReq[], gran: Gran, horizon: number, enabled = true) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([list.map((l) => [l.id, l.s.lo, l.s.y.length, l.s.y[0], l.s.y[l.s.y.length - 1], l.s.y.reduce((a, b) => a + b, 0)]), gran, horizon]);

  useEffect(() => {
    if (!enabled || !list.length) { setState({ data: null, loading: false, error: null }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true, error: null }));
    forecastBatch(list, gran, horizon, ctrl.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: Error) => { if (e.name !== 'AbortError') setState({ data: null, loading: false, error: e.message || 'Could not reach the forecasting service.' }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}
