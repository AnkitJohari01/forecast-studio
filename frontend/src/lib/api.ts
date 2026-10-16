import { periodDate } from './data';
import type { Gran, ModelResult, Series, SeriesResult } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

export interface SeriesReq { id: string; s: Series }

export const forecastKey = (list: SeriesReq[], gran: Gran, horizon: number, model = 'auto') =>
  JSON.stringify([list.map(({ id, s }) => [id, s.lo, s.y]), gran, horizon, model]);

export async function modelRegistry(signal?: AbortSignal): Promise<ModelResult[]> {
  const response = await fetch(`${API_BASE}/api/models`, { signal });
  if (!response.ok) throw new Error('Could not load the model list.');
  return response.json();
}

/** Run the requested model on the current series, bypassing result caches. */
export async function forecastBatch(list: SeriesReq[], gran: Gran, horizon: number, signal?: AbortSignal, model = 'auto'): Promise<Record<string, SeriesResult>> {
  signal?.throwIfAborted();
  if (!list.length) return {};
  const ctrl = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; ctrl.abort(); }, 180_000);
  const cancel = () => { clearTimeout(timeout); ctrl.abort(signal?.reason); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const res = await fetch(`${API_BASE}/api/forecast`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freq: gran, horizon, refresh: true, models: model === 'auto' ? undefined : [model],
        series: list.map(({ id, s }) => ({ id, values: s.y, start: periodDate(s.lo, gran).toISOString().slice(0, 10) })) }),
    });
    if (!res.ok) {
      let msg = `The forecasting service returned an error (${res.status}).`;
      try { const j = await res.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = (await res.json()) as { results: Record<string, SeriesResult> };
    ctrl.signal.throwIfAborted();
    if (!data.results || list.some(({ id }) => !data.results[id])) throw new Error('The forecasting service omitted series from its response. Please try again.');
    return data.results;
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new Error('The forecasting service took over 3 minutes for one series. Completed results are kept. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
