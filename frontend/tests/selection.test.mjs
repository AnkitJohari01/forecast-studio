import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { useForecast } from '../src/lib/useForecast.ts';

let tree;
afterEach(() => { act(() => tree?.unmount()); mock.restoreAll(); });
const series = (y = [100, 200, 300, 400, 500, 600]) => [{ id: 'main', s: { lo: 24264, y, partial: false } }];
const answer = (key, value) => ({ ok: true, json: async () => ({ results: { main: {
  best: key, models: [{ key, forecast: [value, value, value] }], holdout: 2, n: 6,
} } }) });
let state;
function Probe({ list, model = 'auto', horizon = 3, enabled = true }) {
  state = useForecast(list, 'month', horizon, enabled, model);
  return null;
}
async function mount(props) { await act(async () => { tree = create(React.createElement(Probe, props)); }); }
async function update(props) { await act(async () => { tree.update(React.createElement(Probe, props)); }); }

describe('fresh selected-model forecasts', () => {
  it('sends the chosen model and current horizon on every selection, including switching back', async () => {
    const bodies = [];
    mock.method(globalThis, 'fetch', async (_, options) => {
      const body = JSON.parse(options.body); bodies.push(body);
      return answer(body.models?.[0] || 'sr', bodies.length);
    });
    const list = series();
    await mount({ list, model: 'sr' });
    await update({ list, model: 'timesfm', horizon: 4 });
    await update({ list, model: 'sr' });
    assert.deepEqual(bodies.map(b => [b.models, b.horizon, b.refresh]), [
      [['sr'], 3, true], [['timesfm'], 4, true], [['sr'], 3, true],
    ]);
    assert.equal(state.data.main.models[0].forecast[0], 3);
  });

  it('requests new results when middle values change but the total and endpoints do not', async () => {
    mock.method(globalThis, 'fetch', async (_, options) => answer('sr', JSON.parse(options.body).series[0].values[1]));
    await mount({ list: series(), model: 'sr' });
    await update({ list: series([100, 400, 100, 400, 500, 600]), model: 'sr' });
    assert.equal(state.data.main.models[0].forecast[0], 400);
  });

  it('discards a slow response from a previously selected model', async () => {
    let finishOld;
    mock.method(globalThis, 'fetch', (_, options) => {
      const key = JSON.parse(options.body).models?.[0];
      return key === 'arima' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(answer('timesfm', 999));
    });
    await mount({ list: series(), model: 'arima' });
    await update({ list: series(), model: 'timesfm' });
    await act(async () => finishOld(answer('arima', 123)));
    assert.equal(state.data.main.best, 'timesfm');
  });

  it('retries the selected model with a fresh request', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => answer('sr', ++calls));
    await mount({ list: series(), model: 'sr' });
    await act(async () => state.retry());
    assert.equal(state.data.main.models[0].forecast[0], 2);
  });
});

describe('segment progress', () => {
  const items = ['first', 'second', 'third'].map(id => ({ ...series()[0], id }));
  const response = (id, error) => ({ ok: true, json: async () => ({ results: {
    [id]: error ? { error, models: [] } : { best: 'sr', models: [{ key: 'sr', forecast: [1, 2, 3] }] },
  } }) });

  it('publishes completed items while requesting only one item at a time', async () => {
    const pending = [];
    mock.method(globalThis, 'fetch', (_, options) => new Promise(resolve => {
      pending.push({ body: JSON.parse(options.body), resolve });
    }));
    await mount({ list: items });
    assert.deepEqual(pending[0].body.series.map(s => s.id), ['first']);
    await act(async () => pending[0].resolve(response('first')));
    assert.deepEqual(Object.keys(state.data), ['first']);
    assert.equal(state.loading, true);
    assert.equal(pending.length, 2);
    await act(async () => pending[1].resolve(response('second', 'All zero history')));
    assert.equal(state.data.second.error, 'All zero history');
    assert.equal(pending.length, 3);
    await act(async () => pending[2].resolve(response('third')));
    assert.deepEqual(Object.keys(state.data), ['first', 'second', 'third']);
    assert.equal(state.loading, false);
  });

  it('retains completed items on network failure and does not start the rest', async () => {
    const pending = [];
    mock.method(globalThis, 'fetch', (_, options) => new Promise((resolve, reject) => {
      pending.push({ body: JSON.parse(options.body), resolve, reject });
    }));
    await mount({ list: items });
    await act(async () => pending[0].resolve(response('first')));
    await act(async () => pending[1].reject(new Error('Service unavailable')));
    assert.deepEqual(Object.keys(state.data), ['first']);
    assert.equal(state.error, 'Service unavailable');
    assert.equal(state.loading, false);
    assert.equal(pending.length, 2);
    await act(async () => state.retry());
    assert.equal(state.data, null);
    assert.equal(pending.length, 3);
  });

  it('stops the old queue and clears partial output when selection or enabled changes', async () => {
    const pending = [];
    mock.method(globalThis, 'fetch', (_, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal })));
    await mount({ list: items });
    await act(async () => pending[0].resolve(response('first')));
    await update({ list: items, model: 'ma' });
    assert.equal(pending[1].signal.aborted, true);
    assert.equal(state.data, null);
    await act(async () => pending[1].resolve(response('second')));
    assert.equal(pending.length, 3);
    await update({ list: items, model: 'ma', enabled: false });
    assert.equal(pending[2].signal.aborted, true);
    assert.equal(state.loading, false);
    await act(async () => pending[2].resolve(response('first')));
    assert.equal(pending.length, 3);
  });

  it('finishes loading with a useful error if a request exceeds three minutes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0, requestSignal;
    mock.method(globalThis, 'fetch', (_, options) => {
      calls++; requestSignal = options.signal;
      return new Promise((_, reject) => requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    });
    await mount({ list: items });
    await act(async () => t.mock.timers.tick(180_000));
    assert.equal(requestSignal.aborted, true);
    assert.equal(state.loading, false);
    assert.match(state.error, /3 minutes/);
    assert.equal(calls, 1);
  });
});
