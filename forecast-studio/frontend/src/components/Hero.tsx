import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, ScriptableContext } from 'chart.js';
import { forecastLine, reduceMotion } from '../lib/charts';
import { maxH, periodLabel, unitWord } from '../lib/data';
import { accOf, metricPct, cls, pct, type Fmt } from '../lib/format';
import { PRESETS, scenarioName } from '../lib/scenario';
import type { Gran, Scenario, View } from '../lib/types';

interface Props {
  v: View | null; gran: Gran; fmt: Fmt; conf: number; model: string; horizon: number; setHorizon: (h: number) => void;
  scn: Scenario; applyPreset: (k: string) => void; loading: boolean;
}

const grad = (c: ScriptableContext<'line'>, stops: string[], vertical = false) => {
  const { chart } = c, a = chart.chartArea;
  if (!a) return stops[0];
  const g = vertical ? chart.ctx.createLinearGradient(0, a.top, 0, a.bottom) : chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
};

export function Hero({ v, gran, fmt, conf, model, horizon, setHorizon, scn, applyPreset, loading }: Props) {
  const mh = maxH(gran);
  const chartData = useMemo(() => {
    if (!v) return null;
    const { s, sel, res, n, H, fc, lo, hi, scn: r } = v;
    const labels = Array.from({ length: n + H }, (_, i) => periodLabel(s.lo + i, gran));
    const pad = (k: number) => new Array<number | null>(k).fill(null);
    const last = s.y[n - 1];
    return {
      labels,
      datasets: [
        { label: 'Actual', data: [...s.y, ...pad(H)], borderColor: '#E8EEFF', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: 'start' as const,
          backgroundColor: (c: ScriptableContext<'line'>) => grad(c, ['rgba(232,238,255,.16)', 'rgba(232,238,255,0)'], true) },
        { label: 'Backtest', data: [...pad(n - res.holdout), ...sel.backtest, ...pad(H)], borderColor: 'rgba(232,238,255,.6)', borderDash: [4, 4], borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 3, tension: 0.3 },
        { label: 'High', data: [...pad(n - 1), last, ...hi], borderWidth: 0, pointRadius: 0, fill: '+1' as const, tension: 0.3,
          backgroundColor: (c: ScriptableContext<'line'>) => grad(c, ['rgba(79,123,255,.34)', 'rgba(25,195,177,.22)']) },
        { label: 'Low', data: [...pad(n - 1), last, ...lo], borderWidth: 0, pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Forecast', data: [...pad(n - 1), last, ...fc], borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: 0.3,
          borderColor: (c: ScriptableContext<'line'>) => grad(c, ['#6F94FF', '#19C3B1']) },
        { label: 'Scenario', data: r.active ? [...pad(n - 1), last, ...r.series] : [], borderColor: '#F5A524', borderDash: [7, 4], borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3 },
      ],
    };
  }, [v, gran]);

  const options = useMemo<ChartOptions<'line'>>(() => {
    const n = v?.n ?? 0;
    return {
      responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : { duration: 450 },
      interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 4 } },
      scales: {
        x: { grid: { display: false }, border: { color: 'rgba(232,238,255,.15)' }, ticks: { color: 'rgba(232,238,255,.55)', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: { color: 'rgba(232,238,255,.07)' }, border: { display: false }, ticks: { color: 'rgba(232,238,255,.55)', callback: (val) => fmt(+val), maxTicksLimit: 6 } },
      },
      plugins: {
        forecastLine: { index: n - 1 },
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(9,15,36,.95)', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, titleColor: '#fff', bodyColor: '#DCE4FF',
          padding: 12, boxPadding: 4, usePointStyle: true, titleFont: { family: 'Sora', weight: 600 },
          filter: (it) => {
            if (it.datasetIndex === 2 || it.datasetIndex === 3) return false;
            if ((it.datasetIndex === 4 || it.datasetIndex === 5) && it.dataIndex === n - 1) return false;
            return it.raw != null;
          },
          callbacks: {
            label: (it) => {
              let t = `${it.dataset.label}: ${fmt(it.raw as number)}`;
              if (it.datasetIndex === 4) { const d = it.chart.data.datasets; t += `  (${fmt(d[3].data[it.dataIndex] as number)} to ${fmt(d[2].data[it.dataIndex] as number)})`; }
              return t;
            },
            labelColor: (it) => { const c = ['#E8EEFF', 'rgba(232,238,255,.6)', '', '', '#19C3B1', '#F5A524'][it.datasetIndex]; return { borderColor: c, backgroundColor: c }; },
          },
        },
      },
    };
  }, [v?.n, fmt]);

  const total = v ? v.fc.reduce((a, b) => a + b, 0) : 0;
  const r = v?.scn;
  const hp = ((horizon - 3) / (mh - 3)) * 100;

  return (
    <section className="hero" id="overview" aria-label="Forecast overview" aria-busy={loading}>
      {loading && <div className="overlay"><div><div className="spinner" />Running forecast…</div></div>}
      <div className="kpis">
        <div className="kpi"><div className="k"><i style={{ background: 'var(--brand)' }} /><span>Next {horizon} {unitWord(gran, horizon)}</span></div>
          <div className="v">{v ? fmt(total) : '–'}</div>
          <div className="n">{v?.prior ? <><span className={'pill ' + cls(total / v.prior - 1)}>{pct(total / v.prior - 1)}</span> vs same period last year</> : 'No prior-year comparison available'}</div></div>
        <div className="kpi"><div className="k"><i style={{ background: 'var(--brand2)' }} /><span>{v ? periodLabel(v.s.lo + v.n, gran) : 'Next period'} forecast</span></div>
          <div className="v">{v ? fmt(v.fc[0]) : '–'}</div><div className="n">{v ? `Estimated ${fmt(v.lo[0])} to ${fmt(v.hi[0])}` : ''}</div></div>
        <div className="kpi"><div className="k"><i style={{ background: '#A78BFA' }} /><span>Backtest accuracy</span></div>
          <div className="v">{v ? metricPct(accOf(v.sel)) : '–'}</div><div className="n">{v ? `${v.sel.name}, last ${v.res.holdout} ${unitWord(gran, v.res.holdout)}` : ''}</div></div>
        <div className="kpi"><div className="k"><i style={{ background: 'var(--amber)' }} /><span>{r?.active ? `Scenario: ${scenarioName(scn)}` : 'What-if scenario'}</span></div>
          <div className="v">{r?.active ? fmt(r.total) : 'Base case'}</div>
          <div className="n">{r?.active ? <><span className={'pill ' + cls(r.total - r.base)}>{pct(r.total / r.base - 1)}</span> {r.total >= r.base ? '+' : '-'}{fmt(Math.abs(r.total - r.base))} vs base</> : 'Choose a scenario below the chart'}</div></div>
      </div>
      <div className="chead">
        <div><h2>{v ? `${v.sel.name} forecast${model === 'auto' ? ' (auto-selected)' : ''}` : 'Forecast'}</h2>
          <p>{v ? `${periodLabel(v.s.lo, gran)} to ${periodLabel(v.s.lo + v.n - 1, gran)} actuals, ${v.H} ${unitWord(gran, v.H)} ahead, ${conf}% estimated range` : ''}</p></div>
        <div className="legend" aria-hidden="true">
          <span><i className="l-act" />Actual</span><span><i className="l-bt" />Backtest</span><span><i className="l-fc" />Forecast</span><span><i className="l-band" />Estimated range</span>
          {r?.active && <span><i className="l-sc" />Scenario</span>}
        </div>
      </div>
      <div className="chart-box">{chartData && <Line data={chartData} options={options} plugins={[forecastLine]} aria-label="Line chart of actual sales, backtest and forecast" role="img" />}</div>
      {v?.s.partial && <p className="hnote">The latest {gran === 'month' ? 'month' : 'week'} is incomplete, so it is left out of training.</p>}
      <div className="sliders">
        <div className="slider">
          <label htmlFor="horizon"><span>Forecast horizon</span><output htmlFor="horizon">{horizon} {unitWord(gran, horizon)}</output></label>
          <input type="range" id="horizon" min={3} max={mh} step={1} value={horizon} style={{ ['--p' as string]: hp + '%' }} onChange={(e) => setHorizon(+e.target.value)} />
          <div className="ticks"><span>3</span><span>{mh}</span></div>
        </div>
        <div className="slider">
          <label htmlFor="scnQuick"><span>What-if scenario</span><a href="#whatif">Adjust levers</a></label>
          <select id="scnQuick" className="hsel" value={scn.preset} onChange={(e) => e.target.value !== 'custom' && applyPreset(e.target.value)}>
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            {scn.preset === 'custom' && <option value="custom">Custom</option>}
          </select>
          <div className="ticks"><span>{r ? (r.active ? `${pct(r.total / r.base - 1)} vs base forecast` : 'No changes to the forecast') : '\u00a0'}</span></div>
        </div>
      </div>
    </section>
  );
}
