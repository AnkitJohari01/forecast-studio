import { periodDate } from './data';
import type { Gran, Series, SeriesResult } from './types';

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const cache = new Map<string, SeriesResult>();

export interface SeriesReq { id: string; s: Series }

export const forecastKey = (list: SeriesReq[], gran: Gran, horizon: number) =>
  JSON.stringify([list.map(({ id, s }) => [id, s.lo, s.y]), gran, horizon]);

/** Forecast many series in one request. Results are cached per series in memory. */
export async function forecastBatch(list: SeriesReq[], gran: Gran, horizon: number, signal?: AbortSignal): Promise<Record<string, SeriesResult>> {
  signal?.throwIfAborted();
  const out: Record<string, SeriesResult> = {};
  const todo: { id: string; key: string; values: number[]; start: string }[] = [];
  for (const { id, s } of list) {
    const start = periodDate(s.lo, gran).toISOString().slice(0, 10);
    const key = JSON.stringify([s.y, start, gran, horizon]);
    const hit = cache.get(key);
    if (hit) out[id] = hit; else todo.push({ id, key, values: s.y, start });
  }
  if (!todo.length) return out;
  const res = await fetch(`${API_BASE}/api/forecast`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ freq: gran, horizon, series: todo.map(({ id, values, start }) => ({ id, values, start })) }),
  });
  if (!res.ok) {
    let msg = `The forecasting service returned an error (${res.status}).`;
    try { const j = await res.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { results: Record<string, SeriesResult> };
  signal?.throwIfAborted();
  for (const t of todo) {
    const r = data.results?.[t.id];
    if (!r) throw new Error(`The forecasting service omitted series ${t.id}. Please retry.`);
    out[t.id] = r; if (!r.error) cache.set(t.key, r);
  }
  return out;
}
