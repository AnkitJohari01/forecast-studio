import { periodDate } from './data';
import type { Gran, Series, SeriesResult } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

export interface SeriesReq { id: string; s: Series }

/** Run the requested model on the current series, bypassing result caches. */
export async function forecastBatch(list: SeriesReq[], gran: Gran, horizon: number, signal?: AbortSignal, model = 'auto'): Promise<Record<string, SeriesResult>> {
  if (!list.length) return {};
  const res = await fetch(`${API_BASE}/api/forecast`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ freq: gran, horizon, refresh: true, models: model === 'auto' ? undefined : [model],
      series: list.map(({ id, s }) => ({ id, values: s.y, start: periodDate(s.lo, gran).toISOString().slice(0, 10) })) }),
  });
  if (!res.ok) {
    let msg = `The forecasting service returned an error (${res.status}).`;
    try { const j = await res.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { results: Record<string, SeriesResult> };
  if (!data.results || list.some(({ id }) => !data.results[id])) throw new Error('The forecasting service returned an incomplete response. Please try again.');
  return data.results;
}
