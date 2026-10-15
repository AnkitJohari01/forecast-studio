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
function Probe({ list, model = 'auto', horizon = 3 }) {
  state = useForecast(list, 'month', horizon, true, model);
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
