import { periodLabel, unitWord } from '../lib/data';
import { cls, pct, type Fmt } from '../lib/format';
import type { Gran, View } from '../lib/types';
import { Icon } from './Icons';

export function ForecastTable({ v, gran, fmt, measure, conf, priorAt, toast }: { v: View; gran: Gran; fmt: Fmt; measure: string; conf: number; priorAt: (k: number) => number | null; toast: (m: string) => void }) {
  const sc = v.scn.active;
  const rows = v.fc.map((x, k) => { const p = priorAt(k); return { label: periodLabel(v.s.lo + v.n + k, gran), fc: x, lo: v.lo[k], hi: v.hi[k], sc: sc ? v.scn.series[k] : null, yoy: p ? x / p - 1 : null }; });

  function copy() {
    const head = ['Period', 'Forecast', 'Low', 'High', ...(sc ? ['Scenario'] : []), 'vs last year'];
    const text = [head.join('\t'), ...rows.map((r) => [r.label, Math.round(r.fc), Math.round(r.lo), Math.round(r.hi), ...(sc ? [Math.round(r.sc!)] : []), r.yoy == null ? '' : (r.yoy * 100).toFixed(1) + '%'].join('\t'))].join('\n');
    const done = () => toast(`Copied ${rows.length} rows. Paste into Excel or Sheets.`);
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { toast('Copy is blocked here. Select the table and copy it manually.'); }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  function download() {
    const head = ['Period', 'Forecast', 'Low', 'High', ...(sc ? ['Scenario'] : []), 'vs last year %'];
    const csv = [head.join(','), ...rows.map((r) => [r.label, Math.round(r.fc), Math.round(r.lo), Math.round(r.hi), ...(sc ? [Math.round(r.sc!)] : []), r.yoy == null ? '' : (r.yoy * 100).toFixed(1)].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `forecast-${measure.toLowerCase()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card" id="detail">
      <div className="sec-h" style={{ margin: 0 }}>
        <div><h3>Forecast table</h3><p className="sub">{v.sel.name}, {v.H} {unitWord(gran, v.H)} of {measure.toLowerCase()}{v.filter ? ' for ' + v.filter : ''}, {conf}% estimated range</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={copy}><Icon name="copy" />Copy table</button>
          <button type="button" className="btn" onClick={download}><Icon name="table" />Download CSV</button>
        </div>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Period</th><th className="num">Forecast</th><th className="num">Low</th><th className="num">High</th>{sc && <th className="num">Scenario</th>}<th className="num">vs last year</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.label}><td>{r.label}</td><td className="num"><b>{fmt(r.fc)}</b></td><td className="num">{fmt(r.lo)}</td><td className="num">{fmt(r.hi)}</td>
            {sc && <td className="num">{fmt(r.sc)}</td>}<td className={'num ' + (r.yoy == null ? '' : cls(r.yoy))}>{r.yoy == null ? '–' : pct(r.yoy)}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
