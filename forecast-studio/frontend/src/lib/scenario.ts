import { periodDate } from './data';
import { mean } from './format';
import type { Gran, Scenario, ScenarioResult } from './types';

export const PRESETS: Record<string, Omit<Scenario, 'preset'> & { name: string }> = {
  base: { name: 'Base case', price: 0, elast: 1.2, promo: 0, months: [], growth: 0, nb: 0, nbStart: 0, target: 8 },
  growth: { name: 'Growth plan', price: 3, elast: 1.2, promo: 12, months: [9, 10], growth: 6, nb: 0, nbStart: 3, target: 10 },
  expansion: { name: 'Expansion', price: 0, elast: 1.2, promo: 15, months: [2, 9, 10], growth: 10, nb: 8, nbStart: 3, target: 15 },
  priceled: { name: 'Price-led', price: 8, elast: 0.7, promo: 5, months: [9], growth: 0, nb: 0, nbStart: 0, target: 10 },
  conservative: { name: 'Conservative', price: 5, elast: 1.4, promo: 0, months: [], growth: -6, nb: 0, nbStart: 0, target: 5 },
};

export function presetScenario(key: string): Scenario {
  const { name: _n, ...p } = PRESETS[key];
  void _n;
  return { ...p, months: [...p.months], preset: key };
}
export const scenarioName = (s: Scenario) => (s.preset === 'custom' ? 'Custom' : PRESETS[s.preset].name);

/** Applies the levers to the base forecast and decomposes the change into a bridge. */
export function computeScenario(sc: Scenario, fc: number[], lo: number, n: number, y: number[], M: number, g: Gran, units: boolean): ScenarioResult {
  const p = sc.price / 100;
  const P = units ? 1 - sc.elast * p : (1 + p) * (1 - sc.elast * p);
  const avg = mean(y.slice(-Math.min(M, n)));
  const ramp = g === 'month' ? 3 : 13, per = g === 'month' ? 12 : 52;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
  const series: number[] = [];
  fc.forEach((b, k) => {
    const mo = periodDate(lo + n + k, g).getUTCMonth();
    const pr = sc.months.includes(mo) ? 1 + sc.promo / 100 : 1;
    const G = Math.pow(1 + sc.growth / 100, (k + 1) / per);
    const nb = k >= sc.nbStart ? (sc.nb / 100) * avg * Math.min(1, (k - sc.nbStart + 1) / ramp) : 0;
    const v1 = b * P, v2 = v1 * pr, v3 = v2 * G, v4 = Math.max(0, v3 + nb);
    b0 += b; b1 += v1; b2 += v2; b3 += v3; b4 += v4; series.push(v4);
  });
  return { series, base: b0, total: b4, steps: [b0, b1, b2, b3, b4],
    eff: { price: b1 - b0, promo: b2 - b1, growth: b3 - b2, nb: b4 - b3 }, active: Math.abs(b4 - b0) > Math.abs(b0) * 1e-6 };
}

export function topDriver(r: ScenarioResult): string {
  const names: Record<string, string> = { price: 'pricing', promo: 'promotions', growth: 'market growth', nb: 'new business' };
  let best: keyof ScenarioResult['eff'] | null = null;
  for (const k of Object.keys(r.eff) as (keyof ScenarioResult['eff'])[]) {
    if (Math.abs(r.eff[k]) > Math.abs(r.base) * 1e-4 && (!best || Math.abs(r.eff[k]) > Math.abs(r.eff[best]))) best = k;
  }
  return best ? names[best] : '';
}
