import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSeries, getDates, makeDataset, parseDate, parseNumber } from '../src/lib/data.ts';
import { accOf, makeFmt, metricPct, pct } from '../src/lib/format.ts';

const { forecastBatch, forecastKey } = await import('../src/lib/api.ts');
const req = (y, lo = 24288) => [{ id: 'main', s: { lo, y, partial: false } }];

test('unavailable percentage metrics never imply perfect accuracy', () => {
  assert.equal(accOf({ wape: null }), null);
  assert.equal(metricPct(accOf({ wape: null })), '–');
  assert.equal(metricPct(accOf({ wape: 0.15 })), '85%');
  assert.equal(accOf({ wape: 1.5 }), 0);
  assert.equal(metricPct(12.345), '12.345%');
});

test('amounts keep all computed digits with grouping and no Cr/L/K/M abbreviation', () => {
  assert.equal(makeFmt('INR')(984012345.6789012), '₹98,40,12,345.6789012');
  assert.equal(makeFmt('INR')(-123456.7890123), '-₹1,23,456.7890123');
  assert.equal(makeFmt('USD')(1234567.8912345), '$1,234,567.8912345');
  assert.equal(makeFmt('EUR')(1.2345678912345678), `€${1.2345678912345678}`);
  assert.equal(makeFmt('NUM')(123456.789), '123,456.789');
  assert.equal(makeFmt('INR')(1e-21), '₹0.000000000000000000001');
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(makeFmt('INR')(value), '–');
  assert.equal(makeFmt('INR')(0), '₹0');
});

test('accuracy and growth percentages retain all available digits', () => {
  const accuracy = accOf({ wape: .0123456789012345 });
  assert.equal(metricPct(accuracy), `${accuracy}%`);
  assert.equal(metricPct(98.81234567890123), `${98.81234567890123}%`);
  assert.equal(metricPct(Infinity), '–');
  assert.equal(pct(.12345678912345), `+${.12345678912345 * 100}%`);
  assert.equal(pct(-.12345678912345), `${-.12345678912345 * 100}%`);
});

test('request identity includes interior observations, period, frequency, horizon and series IDs', () => {
  const a = req([1, 2, 3, 4]), b = req([1, 3, 2, 4]);
  assert.notEqual(forecastKey(a, 'month', 12), forecastKey(b, 'month', 12));
  assert.equal(forecastKey(a, 'month', 12), forecastKey(structuredClone(a), 'month', 12));
  assert.notEqual(forecastKey(a, 'month', 12), forecastKey(req([1, 2, 3, 4], 24289), 'month', 12));
  assert.notEqual(forecastKey(a, 'month', 12), forecastKey(a, 'week', 12));
  assert.notEqual(forecastKey(a, 'month', 12), forecastKey(a, 'month', 13));
  assert.notEqual(forecastKey(a, 'month', 12), forecastKey([{ ...a[0], id: 'other' }], 'month', 12));
});

test('dates reject rollovers and garbage while preserving supported calendar formats', () => {
  for (const s of ['2025-02-29', '2024-02-30', '31/04/2025', '31-Apr-2025', 'Feb 30, 2025', '2025-01-01oops']) {
    assert.equal(parseDate(s, true), null, s);
  }
  for (const s of ['2024-02-29', '29/02/2024', '29-Feb-2024', 'Feb 29, 2024', '2024-02-29T12:30:00Z']) {
    assert.equal(parseDate(s, true)?.toISOString(), '2024-02-29T00:00:00.000Z', s);
  }
  assert.equal(parseDate('Jan-2025', true)?.toISOString(), '2025-01-01T00:00:00.000Z');
});

test('numeric parsing rejects non-finite and non-decimal inputs', () => {
  for (const v of [Infinity, NaN, 'Infinity', '1e400', '', null, '0x10', 'abc']) assert.ok(Number.isNaN(parseNumber(v)), String(v));
  assert.equal(parseNumber('₹ 1,234.50'), 1234.5);
  assert.equal(parseNumber('(200.5)'), -200.5);
  assert.equal(parseNumber('1e3'), 1000);
});

test('US date detection and aggregation use evidence beyond the detection sample', () => {
  const rows = Array.from({ length: 400 }, () => ({ Date: '01/02/2024', Value: 1 }));
  rows.push({ Date: '01/31/2024', Value: 5 }, { Date: '02/29/2024', Value: 7 });
  const ds = makeDataset('US dates', rows, 'upload');
  assert.ok(ds.dateCols.includes('Date'));
  assert.equal(getDates(ds, 'Date').dates[0].toISOString(), '2024-01-02T00:00:00.000Z');
  assert.deepEqual(buildSeries(ds, { date: 'Date', value: 'Value', dim: '' }, 'month', null),
    { lo: 24288, y: [405, 7], partial: false });
  const unambiguous = makeDataset('US month ends', rows.slice(400), 'upload');
  assert.ok(unambiguous.dateCols.includes('Date'));
});

test('aggregation sums valid rows in input order and inserts missing periods', () => {
  const rows = [
    { Date: '2024-01-01', Value: 10, Region: 'A' },
    { Date: '2024-01-01', Value: '₹20', Region: 'B' },
    { Date: '2024-02-30', Value: 999, Region: 'A' },
    { Date: '2024-03-01', Value: 'Infinity', Region: 'A' },
    { Date: '2024-03-01', Value: 7, Region: 'A' },
  ];
  const ds = makeDataset('test', rows, 'upload'), cfg = { date: 'Date', value: 'Value', dim: 'Region' };
  assert.deepEqual(buildSeries(ds, cfg, 'month', null), { lo: 24288, y: [30, 0, 7], partial: false });
  assert.deepEqual(buildSeries(ds, cfg, 'month', 'A').y, [10, 0, 7]);
});

test('requests fresh equal-sum series and rejects canceled or incomplete results', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ results: Object.fromEntries(body.series.map(s => [s.id, { models: [], best: '', marker: s.values }])) }) };
  };
  try {
    const a = req([10, 20, 30, 40]), b = req([10, 30, 20, 40]);
    assert.deepEqual((await forecastBatch(a, 'month', 12)).main.marker, a[0].s.y);
    assert.deepEqual((await forecastBatch(b, 'month', 12)).main.marker, b[0].s.y);
    await forecastBatch(a, 'month', 12);
    assert.equal(calls, 3);
    const ctrl = new AbortController(); ctrl.abort();
    await assert.rejects(forecastBatch(a, 'month', 12, ctrl.signal), { name: 'AbortError' });
    const late = new AbortController();
    globalThis.fetch = async () => ({ ok: true, json: async () => { late.abort(); return { results: { main: { models: [] } } }; } });
    await assert.rejects(forecastBatch(req([4, 5, 6]), 'month', 12, late.signal), { name: 'AbortError' });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: {} }) });
    await assert.rejects(forecastBatch(req([4, 5, 6]), 'month', 12), /omitted series/);
  } finally { globalThis.fetch = originalFetch; }
});
