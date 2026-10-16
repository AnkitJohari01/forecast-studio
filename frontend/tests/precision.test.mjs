import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ForecastTable } from '../src/components/ForecastTable.tsx';
import { ModelLab } from '../src/components/ModelLab.tsx';
import { Insights } from '../src/components/Insights.tsx';
import { Hero } from '../src/components/Hero.tsx';
import { presetScenario } from '../src/lib/scenario.ts';
import { accOf, makeFmt } from '../src/lib/format.ts';

let tree;
afterEach(() => { act(() => tree?.unmount()); mock.restoreAll(); });
const model = { key: 'sr', name: 'Trend', family: 'Regression', desc: '', validation_wape: .0123456789012345, wape: .0098765432198765,
  forecast: [1234567.8912345], backtest: [123, 124], rmse: 1.234567891234, mae: 2.345678912345, bias: .000123456789, params: '', sd: 1 };
const v = { sel: model, best: model, fc: model.forecast, lo: [1000000.1234567], hi: [1500000.9876543],
  H: 1, n: 12, s: { lo: 24288, y: Array(12).fill(100) }, res: { models: [model], holdout: 2, selection_holdout: 2, selection_basis: 'earlier_validation' },
  scn: { active: true, series: [1333333.3333333] } };
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join(' ');

it('insights retain the computed seasonality percentage', () => {
  const strength = .456789;
  const view = { ...v, M: 12, res: { ...v.res, seasonal: true, seasonalStrength: strength }, scn: { active: false } };
  act(() => { tree = create(React.createElement(Insights, { v: view, gran: 'month', fmt: makeFmt('INR'), measure: 'Revenue', dim: 'Region', seg: null, scn: {} })); });
  assert.ok(text(tree.toJSON()).includes(`${strength * 100}%`));
});

it('shows the full validation score and small nonzero bias on a model card', () => {
  act(() => { tree = create(React.createElement(ModelLab, { v, gran: 'month', fmt: makeFmt('INR'), models: [], onPick() {}, onAuto() {} })); });
  assert.ok(text(tree.toJSON()).includes(`${accOf({ wape: model.validation_wape })}%`));
  assert.ok(text(tree.toJSON()).includes(`${model.bias * 100}% over`));
});

it('dashboard and selected model card display the same validation score', () => {
  const props = { v, gran: 'month', fmt: makeFmt('INR'), conf: 95, model: 'auto', horizon: 1,
    setHorizon() {}, scn: presetScenario('growth'), applyPreset() {}, loading: false };
  act(() => { tree = create(React.createElement(Hero, props)); });
  const tile = tree.root.findAllByProps({ className: 'kpi' })[2];
  assert.match(text(tile), /Validation accuracy/);
  assert.equal(text(tile.findByProps({ className: 'v' })), `${accOf({ wape: model.validation_wape })}%`);
  act(() => tree.update(React.createElement(ModelLab, { v, gran: 'month', fmt: makeFmt('INR'), models: [], onPick() {}, onAuto() {} })));
  assert.equal(text(tree.root.findByProps({ className: 'score' })), `${accOf({ wape: model.validation_wape })}%`);
});

it('table, clipboard and CSV preserve fractional forecasts, bounds and scenario values', async () => {
  let copied, blob;
  const clipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { async writeText(value) { copied = value; } } });
  mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:precision-test'; });
  mock.method(URL, 'revokeObjectURL', () => {});
  mock.method(globalThis, 'setTimeout', fn => { fn(); return 0; });
  globalThis.document = { createElement: () => ({ click() {} }) };
  try {
    act(() => { tree = create(React.createElement(ForecastTable, { v, gran: 'month', fmt: makeFmt('INR'), measure: 'Revenue', conf: 95, priorAt: () => 1000000.123456, toast() {} })); });
    assert.ok(text(tree.toJSON()).includes(makeFmt('INR')(v.fc[0])));
    const buttons = tree.root.findAllByType('button');
    await act(async () => buttons[0].props.onClick());
    assert.deepEqual(copied.split('\n')[1].split('\t').slice(1, 5), [v.fc[0], v.lo[0], v.hi[0], v.scn.series[0]].map(String));
    act(() => buttons[1].props.onClick());
    assert.deepEqual((await blob.text()).split('\n')[1].split(',').slice(1, 5), [v.fc[0], v.lo[0], v.hi[0], v.scn.series[0]].map(String));
  } finally {
    delete globalThis.document;
    if (clipboard) Object.defineProperty(globalThis.navigator, 'clipboard', clipboard);
    else delete globalThis.navigator.clipboard;
  }
});
