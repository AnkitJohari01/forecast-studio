import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { cssVar, reduceMotion } from '../lib/charts';
import { MN, periodLabel, unitWord } from '../lib/data';
import { accOf, cls, mean, pct, sum, type Fmt } from '../lib/format';
import { scenarioName, topDriver } from '../lib/scenario';
import { isLive, type Gran, type Scenario, type View } from '../lib/types';
import { Icon } from './Icons';

export interface SegSummary { top: { v: string; growth: number }; bottom: { v: string; growth: number } }

export function Insights({ v, gran, fmt, measure, dim, seg, scn }: { v: View; gran: Gran; fmt: Fmt; measure: string; dim: string; seg: SegSummary | null; scn: Scenario }) {
  const { s, n, H, M, fc, res, prior } = v, y = s.y, items: [string, JSX.Element][] = [];
  const total = sum(fc);
  if (prior) { const d = total / prior - 1; items.push(['trend', <>{measure} is expected to <b>{d >= 0 ? 'grow' : 'decline'} <span className={cls(d)}>{(Math.abs(d) * 100).toFixed(1)}%</span></b> over the next {H} {unitWord(gran, H)} vs the same period last year, reaching <b>{fmt(total)}</b>.</>]); }
  else items.push(['trend', <>{measure} is forecast at <b>{fmt(total)}</b> over the next {H} {unitWord(gran, H)}.</>]);
  if (H >= 3) {
    let pk = 0, lw = 0; fc.forEach((x, i) => { if (x > fc[pk]) pk = i; if (x < fc[lw]) lw = i; });
    items.push(['cal', <>Strongest {unitWord(gran, 1)} ahead: <b>{periodLabel(s.lo + n + pk, gran)}</b> at {fmt(fc[pk])}. Softest: {periodLabel(s.lo + n + lw, gran)} at {fmt(fc[lw])}.</>]);
  }
  if (res.seasonal) { const st = res.seasonalStrength; items.push(['wave', <>Seasonality is <b>{st > 0.5 ? 'strong' : st > 0.2 ? 'moderate' : 'weak'}</b>, explaining about {Math.round(st * 100)}% of the swings once the trend is removed.</>]); }
  const k = Math.min(3, n - M);
  if (k > 0) { const a = sum(y.slice(n - k)), b = sum(y.slice(n - k - M, n - M)); if (b) { const d = a / b - 1; items.push(['bolt', <>Recent momentum: the last {k} {unitWord(gran, k)} ran <b className={cls(d)}>{pct(d)}</b> vs a year earlier.</>]); } }
  const live = res.models.filter(isLive).sort((a, b) => a.wape - b.wape), worst = live[live.length - 1], best = v.best;
  items.push(['cpu', <><b>{best.name}</b> {live.length > 1 ? `was most accurate among the evaluated models at ${accOf(best).toFixed(1)}%, against ${accOf(worst).toFixed(1)}% for ${worst.name}.` : `scored ${accOf(best).toFixed(1)}% in the recent check.`} {Math.abs(best.bias) >= 0.02 ? `It tends to ${best.bias > 0 ? 'over' : 'under'}-forecast by ${(Math.abs(best.bias) * 100).toFixed(1)}%.` : 'It shows no consistent bias.'}</>]);
  if (seg && !v.filter) items.push(['layers', <>By {dim.toLowerCase()}, <b>{seg.top.v}</b> leads at <span className={cls(seg.top.growth)}>{pct(seg.top.growth)}</span>; <b>{seg.bottom.v}</b> trails at <span className={cls(seg.bottom.growth)}>{pct(seg.bottom.growth)}</span>.</>]);
  if (v.scn.active) { const r = v.scn, d = r.total / r.base - 1, drv = topDriver(r); items.push(['sliders', <>The <b>{scenarioName(scn)}</b> scenario moves the total to <b>{fmt(r.total)}</b> (<span className={cls(d)}>{pct(d)}</span> vs base){drv ? `, driven mostly by ${drv}` : ''}.</>]); }
  return (
    <section className="card"><h3>What the forecast says</h3><p className="sub">Generated from the model in use and the backtest results</p>
      <ul className="insights">{items.map(([ic, t], i) => <li key={i}><span className="ic"><Icon name={ic} /></span><span>{t}</span></li>)}</ul>
    </section>
  );
}

export function SeasonChart({ v, gran, theme }: { v: View; gran: Gran; theme: string }) {
  const { s, n, M } = v, y = s.y;
  const calc = useMemo(() => {
    if (n < M) return null;
    const xs = y.map((_, i) => i), xm = mean(xs), ym = mean(y);
    let num = 0, den = 0; xs.forEach((x, i) => { num += (x - xm) * (y[i] - ym); den += (x - xm) ** 2; });
    const b = den ? num / den : 0, a = ym - b * xm, pos = y.every((x) => x > 0);
    const acc = new Array(M).fill(0), cnt = new Array(M).fill(0);
    y.forEach((val, t) => { const tr = a + b * t, k = (s.lo + t) % M; acc[k] += pos && tr > 0 ? val / tr - 1 : (val - tr) / (ym || 1); cnt[k]++; });
    const vals = acc.map((x, k) => (cnt[k] ? (x / cnt[k]) * 100 : 0)), mu = mean(vals);
    const eff = vals.map((x) => +(x - mu).toFixed(1));
    const labels = gran === 'month' ? MN.slice() : eff.map((_, i) => 'W' + (i + 1));
    return { eff, labels, pk: eff.indexOf(Math.max(...eff)), lw: eff.indexOf(Math.min(...eff)) };
  }, [y, n, M, s.lo, gran]);

  const chart = useMemo(() => {
    if (!calc) return null;
    const muted = cssVar('--muted'), line = cssVar('--line');
    const options: ChartOptions<'bar'> = {
      responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : { duration: 400 },
      scales: { x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, autoSkip: true, maxRotation: 0 } },
        y: { grid: { color: line }, border: { display: false }, ticks: { color: muted, callback: (val) => (+val > 0 ? '+' : '') + val + '%', maxTicksLimit: 6 } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => `${(it.raw as number) > 0 ? '+' : ''}${it.raw}% vs trend` } } },
    };
    return { data: { labels: calc.labels, datasets: [{ data: calc.eff, backgroundColor: calc.eff.map((x) => (x >= 0 ? '#4F7BFF' : '#F59E0B')), borderRadius: 6, borderSkipped: false, maxBarThickness: 28 }] }, options };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, theme]);

  return (
    <section className="card"><h3>Seasonal pattern</h3>
      <p className="sub">{calc ? `Typical ${unitWord(gran, 1)} vs trend. Peak: ${calc.labels[calc.pk]} (${pct(calc.eff[calc.pk] / 100)}), low: ${calc.labels[calc.lw]} (${pct(calc.eff[calc.lw] / 100)})` : 'Needs at least a full year of history to show a seasonal pattern.'}</p>
      <div className="minichart">{chart && <Bar data={chart.data} options={chart.options} role="img" aria-label="Bar chart of seasonal effect by period" />}</div>
    </section>
  );
}
