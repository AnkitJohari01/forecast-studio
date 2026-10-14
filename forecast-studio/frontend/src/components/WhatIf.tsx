import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { barLabels, cssVar, reduceMotion } from '../lib/charts';
import { MN, periodLabel, unitWord } from '../lib/data';
import { cls, pct, type Fmt } from '../lib/format';
import { PRESETS, scenarioName, topDriver } from '../lib/scenario';
import type { Gran, Scenario, View } from '../lib/types';

interface Props { v: View; gran: Gran; fmt: Fmt; scn: Scenario; setScn: (s: Scenario) => void; applyPreset: (k: string) => void; theme: string }

type Lever = { id: keyof Scenario; label: string; hint: string; min: number; max: number; step: number; out: (v: number) => string; amb?: boolean };
const sg = (v: number) => (v > 0 ? '+' : '') + v;

function LeverInput({ l, scn, onChange }: { l: Lever; scn: Scenario; onChange: (id: keyof Scenario, v: number) => void }) {
  const val = scn[l.id] as number;
  const p = ((val - l.min) / (l.max - l.min)) * 100;
  const id = 'lv-' + l.id;
  return (
    <div className="lever">
      <label htmlFor={id}><span>{l.label}<small>{l.hint}</small></span><output htmlFor={id}>{l.out(val)}</output></label>
      <input type="range" className={'lite' + (l.amb ? ' amb' : '')} id={id} min={l.min} max={l.max} step={l.step} value={val}
        style={{ ['--p' as string]: p + '%' }} onChange={(e) => onChange(l.id, +e.target.value)} />
    </div>
  );
}

const L: Record<string, Lever> = {
  price: { id: 'price', label: 'Price change', hint: 'Higher prices lose some volume', min: -15, max: 15, step: 1, out: (v) => sg(v) + '%' },
  elast: { id: 'elast', label: 'Price sensitivity', hint: '% volume lost per 1% price rise', min: 0, max: 2.5, step: 0.1, out: (v) => v.toFixed(1) },
  promo: { id: 'promo', label: 'Promotion lift', hint: 'Extra sales in promotion months', min: 0, max: 40, step: 1, out: (v) => '+' + v + '%', amb: true },
  growth: { id: 'growth', label: 'Market growth', hint: 'Extra demand on top of the trend, per year', min: -20, max: 30, step: 1, out: (v) => sg(v) + '% / yr' },
  nb: { id: 'nb', label: 'New business', hint: 'New stores, channels or dealers, as % of a typical period', min: 0, max: 30, step: 1, out: (v) => '+' + v + '%' },
  target: { id: 'target', label: 'Growth target', hint: 'Compared with the same period last year', min: -10, max: 40, step: 1, out: (v) => sg(v) + '%' },
};

export function WhatIf({ v, gran, fmt, scn, setScn, applyPreset, theme }: Props) {
  const r = v.scn, H = v.H, d = r.total - r.base;
  const change = (id: keyof Scenario, val: number) => setScn({ ...scn, [id]: val, preset: id === 'target' ? scn.preset : 'custom' });
  const toggleMonth = (m: number) => setScn({ ...scn, months: scn.months.includes(m) ? scn.months.filter((x) => x !== m) : [...scn.months, m], preset: 'custom' });
  const tgt = v.prior ? v.prior * (1 + scn.target / 100) : null;
  const drv = topDriver(r);

  let note = r.active
    ? `${scenarioName(scn)} ${d >= 0 ? 'adds' : 'removes'} ${fmt(Math.abs(d))} over the next ${H} ${unitWord(gran, H)}${drv ? `, mostly from ${drv}` : ''}.`
    : 'Base case: the scenario matches the model forecast. Move a lever or pick a preset to test a plan.';
  if (tgt) note += r.total < tgt ? ` Reaching the ${sg(scn.target)}% target needs about ${(Math.abs(tgt / r.total - 1) * 100).toFixed(1)}% more on top of this scenario.` : ` This meets the ${sg(scn.target)}% growth target.`;

  const chart = useMemo(() => {
    const st = r.steps, pos = cssVar('--pos'), neg = cssVar('--neg');
    const data = [[0, st[0]], [st[0], st[1]], [st[1], st[2]], [st[2], st[3]], [st[3], st[4]], [0, st[4]]] as [number, number][];
    const colors = data.map(([a, b], i) => (i === 0 ? '#4F7BFF' : i === 5 ? '#F5A524' : b - a >= 0 ? pos : neg));
    const lo = Math.min(...st), hi = Math.max(...st), ymin = Math.max(0, lo - (hi - lo) * 1.5 - lo * 0.04);
    const muted = cssVar('--muted'), line = cssVar('--line');
    const options: ChartOptions<'bar'> = {
      responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : { duration: 400 }, layout: { padding: { top: 22 } },
      scales: {
        x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, font: { weight: 600 } } },
        y: { min: ymin, grid: { color: line }, border: { display: false }, ticks: { color: muted, callback: (val) => fmt(+val), maxTicksLimit: 5 } },
      },
      plugins: {
        // @ts-expect-error custom plugin options
        barLabels: { fmt, color: cssVar('--ink') },
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => { const [a, b] = it.raw as [number, number]; return it.dataIndex === 0 || it.dataIndex === 5 ? fmt(b) : `${b - a >= 0 ? '+' : '-'}${fmt(Math.abs(b - a))}`; } } },
      },
    };
    return { data: { labels: ['Base forecast', 'Pricing', 'Promotions', 'Market growth', 'New business', 'Scenario'], datasets: [{ data, backgroundColor: colors, borderRadius: 8, borderSkipped: false, maxBarThickness: 64 }] }, options };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, fmt, theme]);

  return (
    <section className="card" id="whatif">
      <div className="sec-h" style={{ margin: 0 }}>
        <div><h2>What-if scenario planner</h2><p>Adjust business levers to see how pricing, promotions, growth plans and new business would change the forecast. Start from a preset or build your own.</p></div>
      </div>
      <div className="presets" role="group" aria-label="Scenario presets" style={{ marginTop: 12 }}>
        {Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" className="chipbtn" aria-pressed={scn.preset === k} onClick={() => applyPreset(k)}>{p.name}</button>)}
        {scn.preset === 'custom' && <button type="button" className="chipbtn" aria-pressed="true">Custom</button>}
      </div>
      <div className="wi">
        <div className="levers">
          <div className="lgroup"><h4><i style={{ background: '#4F7BFF' }} />Pricing</h4><LeverInput l={L.price} scn={scn} onChange={change} /><LeverInput l={L.elast} scn={scn} onChange={change} /></div>
          <div className="lgroup"><h4><i style={{ background: '#F5A524' }} />Promotions</h4><LeverInput l={L.promo} scn={scn} onChange={change} />
            <div><div className="inline" style={{ marginBottom: 6 }}><span>Promotion months</span></div>
              <div className="months" role="group" aria-label="Promotion months">
                {MN.map((m, i) => <button key={m} type="button" aria-pressed={scn.months.includes(i)} onClick={() => toggleMonth(i)}>{m}</button>)}
              </div></div></div>
          <div className="lgroup"><h4><i style={{ background: '#19C3B1' }} />Growth</h4><LeverInput l={L.growth} scn={scn} onChange={change} /><LeverInput l={L.nb} scn={scn} onChange={change} />
            <div className="inline"><label htmlFor="nbStart">New business starts in</label>
              <select id="nbStart" value={Math.min(scn.nbStart, H - 1)} onChange={(e) => setScn({ ...scn, nbStart: +e.target.value, preset: 'custom' })}>
                {v.fc.map((_, k) => <option key={k} value={k}>{periodLabel(v.s.lo + v.n + k, gran)}</option>)}
              </select></div></div>
          <div className="lgroup"><h4><i style={{ background: '#A855F7' }} />Target</h4><LeverInput l={L.target} scn={scn} onChange={change} /></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="wstats">
            <div className="wstat"><div className="k">Base forecast</div><div className="v">{fmt(r.base)}</div><div className="n">Next {H} {unitWord(gran, H)}, {v.sel.name}</div></div>
            <div className="wstat hl"><div className="k">Scenario: {scenarioName(scn)}</div><div className="v">{fmt(r.total)}</div><div className="n">{r.active ? 'With your levers applied' : 'Same as base'}</div></div>
            <div className="wstat"><div className="k">Change vs base</div><div className="v"><span className={cls(d)}>{d >= 0 ? '+' : '-'}{fmt(Math.abs(d))}</span></div><div className="n"><span className={cls(d)}>{pct(r.base ? d / r.base : 0)}</span></div></div>
            <div className="wstat"><div className="k">Target</div><div className="v">{tgt ? fmt(tgt) : '–'}</div>
              <div className="n">{tgt ? (r.total >= tgt ? <span className="up">Scenario beats it by {fmt(r.total - tgt)}</span> : <span className="down">Short by {fmt(tgt - r.total)}</span>) : 'Needs a year of history'}</div></div>
          </div>
          <div className="wchart"><Bar data={chart.data} options={chart.options} plugins={[barLabels]} role="img" aria-label="Bridge chart from base forecast to scenario" /></div>
          <p className="wnote">{note}</p>
        </div>
      </div>
    </section>
  );
}
