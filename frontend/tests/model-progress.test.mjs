import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModelLab } from '../src/components/ModelLab.tsx';
import { Segments } from '../src/components/Segments.tsx';

let tree;
afterEach(() => act(() => tree?.unmount()));
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join(' ');

it('ranks by earlier validation, even when a different model wins the final backtest', () => {
  const model = (key, validation_wape, wape) => ({ key, name: key, family: 'Regression', desc: key, validation_wape, wape,
    forecast: [10, 11, 12], backtest: [8, 9], sd: 1, rmse: 1, mae: 1, bias: 0, params: '' });
  const models = [model('final-winner', .3, .01), model('validation-winner', .05, .2), model('unscored', null, .001)];
  const v = { res: { models, holdout: 2, selection_holdout: 2, selection_basis: 'earlier_validation' }, sel: models[1], best: models[1], n: 12, s: { y: Array(12).fill(10) } };
  act(() => { tree = create(React.createElement(ModelLab, { v, gran: 'month', fmt: String, models: [], onPick() {}, onAuto() {} })); });
  const cards = tree.root.findAll(n => n.type === 'button' && String(n.props.className).startsWith('mcard'));
  assert.match(text(cards[0]), /validation-winner/);
  assert.match(text(cards[0]), /Validation accuracy/);
  assert.match(text(cards[0]), /95%/);
  assert.match(text(cards[0]), /Backtest accuracy/);
  assert.match(text(cards[0]), /80%/);
  assert.match(text(cards[2]), /Not ranked/);
  assert.doesNotMatch(text(cards[2].findByProps({ className: 'ring' })), /99\.9/);
});

it('keeps completed rows visible with progress and a retryable error', () => {
  const props = { rows: [{ v: 'Ready item', i: 0, hist: [10, 20], fc: [30], acc: 90, model: 'sr' }], dim: 'item_name', gran: 'month',
    M: 12, n: 24, H: 3, fmt: String, filter: '__all', onPick() {}, loading: true, error: null, retry() {}, total: 3 };
  act(() => { tree = create(React.createElement(Segments, props)); });
  assert.match(text(tree.toJSON()), /1\s+of\s+3/);
  assert.match(text(tree.toJSON()), /Ready item/);
  act(() => tree.update(React.createElement(Segments, { ...props, loading: false, error: 'Service timed out' })));
  assert.match(text(tree.toJSON()), /Service timed out/);
  assert.match(text(tree.toJSON()), /Ready item/);
  assert.match(text(tree.toJSON()), /Try again/);
});
