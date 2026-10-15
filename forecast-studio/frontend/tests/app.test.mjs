import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import App from '../src/App.tsx';
import { Hero } from '../src/components/Hero.tsx';
import { ForecastTable } from '../src/components/ForecastTable.tsx';
import { Segments } from '../src/components/Segments.tsx';

let tree;
afterEach(() => { act(() => tree?.unmount()); mock.restoreAll(); delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; });

it('keeps the full model list after a transient registry failure and explicit model failure', async () => {
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), setTimeout, clearTimeout };
  globalThis.document = { documentElement: { dataset: {} }, getElementById: () => null };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  const keys = ['ens', 'arima', 'xgb', 'prophet', 'hw', 'theta', 'sr', 'sn', 'sarima', 'lgb', 'ridge', 'ma', 'timesfm'];
  mock.method(globalThis, 'fetch', async (_, options) => {
    if (!options.body) return { ok: false };
    const body = JSON.parse(options.body);
    const selected = body.models?.[0];
    return { ok: true, json: async () => ({ results: Object.fromEntries(body.series.map(s => [s.id, {
      best: selected || 'sr', holdout: 2, n: s.values.length, seasonal: true, seasonalStrength: .1,
      ...(selected === 'prophet' ? { error: 'Prophet is unavailable' } : {}),
      models: (selected ? [selected] : keys).map(key => ({ key, name: key, family: 'Regression', desc: key,
        ...(selected === 'prophet' ? { na: 'unavailable' } : { wape: .1, rmse: 1, bias: 0, sd: 1, params: 'Checked',
          backtest: [100, 101], forecast: Array(body.horizon).fill(111) }),
      })),
    }])) }) };
  });
  await act(async () => { tree = create(React.createElement(App)); });
  for (const key of ['timesfm', 'prophet']) {
    await act(async () => tree.root.findByProps({ id: 'model' }).props.onChange({ target: { value: key } }));
    assert.deepEqual(tree.root.findByProps({ id: 'model' }).findAllByType('option').map(o => o.props.value), ['auto', ...keys]);
  }
});

it('updates chart, table and segments for the selected model and hides old output on failure', async () => {
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), setTimeout, clearTimeout };
  globalThis.document = { documentElement: { dataset: {} }, getElementById: () => null };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  const requests = [];
  const keys = ['ens', 'arima', 'xgb', 'prophet', 'hw', 'theta', 'sr', 'sn', 'sarima', 'lgb', 'ridge', 'ma', 'timesfm'];
  mock.method(globalThis, 'fetch', async (_, options) => {
    if (!options.body) return { ok: true, json: async () => keys.map(key => ({ key, name: key, family: 'Regression', desc: key })) };
    const body = JSON.parse(options.body); requests.push(body);
    const key = body.models?.[0] || 'sr';
    return { ok: true, json: async () => ({ results: Object.fromEntries(body.series.map(s => [s.id,
      key === 'prophet' ? { error: 'Prophet is unavailable', models: [{ key, na: 'unavailable' }] } : {
        best: key, holdout: 2, n: s.values.length, seasonal: true, seasonalStrength: .1,
        models: [{ key, name: key === 'timesfm' ? 'TimesFM' : 'Trend + seasonality', family: 'Regression', desc: 'Forecast',
          wape: .1, rmse: 1, bias: 0, sd: 1, params: 'Checked', backtest: [100, 101],
          forecast: Array(body.horizon).fill(key === 'timesfm' ? 222 : 111) }],
      },
    ])) }) };
  });
  await act(async () => { tree = create(React.createElement(App)); });
  assert.deepEqual(tree.root.findByProps({ id: 'model' }).findAllByType('option').map(o => o.props.value), ['auto', ...keys]);
  await act(async () => tree.root.findByProps({ id: 'model' }).props.onChange({ target: { value: 'timesfm' } }));
  const hero = tree.root.findByType(Hero).props.v;
  const table = tree.root.findByType(ForecastTable).props.v;
  assert.equal(hero.sel.key, 'timesfm');
  assert.equal(table.sel.key, 'timesfm');
  assert.deepEqual(table.fc, Array(12).fill(222));
  const segments = tree.root.findByType(Segments).props.rows;
  assert.equal(segments.length, 4);
  assert.ok(segments.every(s => s.model === 'TimesFM'));
  assert.ok(requests.filter(r => r.models?.[0] === 'timesfm').length >= 2);
  for (const key of ['ma', 'lgb', 'ridge', 'sarima']) {
    await act(async () => tree.root.findByProps({ id: 'model' }).props.onChange({ target: { value: key } }));
    assert.equal(tree.root.findByType(ForecastTable).props.v.sel.key, key);
    assert.deepEqual(requests.at(-1).models, [key]);
    assert.deepEqual(tree.root.findByProps({ id: 'model' }).findAllByType('option').map(o => o.props.value), ['auto', ...keys]);
  }
  await act(async () => tree.root.findByProps({ id: 'horizon' }).props.onChange({ target: { value: '6' } }));
  assert.equal(tree.root.findByType(ForecastTable).props.v.fc.length, 6);
  assert.equal(requests.at(-1).horizon, 6);
  await act(async () => tree.root.findByProps({ id: 'model' }).props.onChange({ target: { value: 'prophet' } }));
  assert.equal(tree.root.findAllByType(ForecastTable).length, 0);
  assert.equal(tree.root.findAllByType(Hero).length, 0);
  assert.deepEqual(tree.root.findByProps({ role: 'alert' }).findByType('p').children, ['Prophet is unavailable']);
});
