import { unitWord } from '../lib/data';
import { cls, metricPct, pct, type Fmt } from '../lib/format';
import type { Gran } from '../lib/types';

export const SEG_COLORS = ['#4F7BFF', '#19C3B1', '#A855F7', '#F59E0B', '#EC4899', '#22C55E', '#F97316', '#06B6D4', '#8B5CF6', '#EF4444', '#84CC16', '#64748B'];
export interface SegRow { v: string; i: number; err?: string; total?: number; recent?: number; growth?: number | null; acc?: number | null; model?: string; hist?: number[]; fc?: number[] }

interface Props { rows: SegRow[]; dim: string; gran: Gran; M: number; n: number; H: number; fmt: Fmt; filter: string; onPick: (v: string) => void; loading: boolean; error: string | null; retry: () => void }

export function Segments({ rows, dim, gran, M, n, H, fmt, filter, onPick, loading, error, retry }: Props) {
  const maxG = Math.max(0.01, ...rows.filter((o) => o.growth != null).map((o) => Math.abs(o.growth!)));
  return (
    <section className="card" id="segments">
      <div className="sec-h" style={{ margin: 0 }}><div><h3>Outlook by {dim.toLowerCase()}</h3><p className="sub">Each segment gets its own forecast from its auto-selected model. Select a name to focus the chart on it.</p></div></div>
      <div className="tbl-wrap">
        {error ? <p className="sub err">{error} <button type="button" className="btn" onClick={retry}>Try again</button></p>
          : loading && !rows.length ? <p className="sub">Training models for each {dim.toLowerCase()}…</p> : (
          <table>
            <thead><tr><th>{dim}</th><th>Trend and forecast</th><th className="num">Last {Math.min(M, n)} {unitWord(gran, M)}</th><th className="num">Next {H} {unitWord(gran, H)}</th><th>Growth vs last year</th><th>Auto-selected model</th><th className="num">Accuracy</th></tr></thead>
            <tbody>
              {rows.map((o) => {
                const sel = filter === o.v, col = SEG_COLORS[o.i % SEG_COLORS.length];
                const name = <button type="button" className="rowbtn" aria-pressed={sel} onClick={() => onPick(o.v)}><span className="dot" style={{ background: col }} />{o.v}</button>;
                if (o.err || !o.hist || !o.fc) return <tr key={o.v}><td>{name}</td><td colSpan={6} className="muted">{o.err || 'Not enough history to forecast'}</td></tr>;
                const all = [...o.hist, ...o.fc], mn = Math.min(...all), mx = Math.max(...all), sp = mx - mn || 1, N = all.length, W = 120, Hh = 30;
                const P = (arr: number[], off: number) => arr.map((val, j) => `${(((j + off) / (N - 1)) * W).toFixed(1)},${(Hh - 3 - ((val - mn) / sp) * (Hh - 6)).toFixed(1)}`).join(' ');
                const w = o.growth == null ? 0 : Math.round((Math.abs(o.growth) / maxG) * 64) + 4;
                return (
                  <tr key={o.v} className={sel ? 'sel' : ''}>
                    <td>{name}</td>
                    <td><svg className="sspark" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={P(o.hist, 0)} fill="none" stroke="var(--muted)" strokeOpacity=".6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      <polyline points={P([o.hist[o.hist.length - 1], ...o.fc], o.hist.length - 1)} fill="none" stroke={col} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
                    </svg></td>
                    <td className="num">{fmt(o.recent)}</td><td className="num"><b>{fmt(o.total)}</b></td>
                    <td>{o.growth == null ? <span className="muted">–</span> : <><span className="gbar" style={{ width: w, background: `var(${o.growth >= 0 ? '--pos' : '--neg'})` }} /><span className={cls(o.growth)} style={{ fontWeight: 600 }}>{pct(o.growth)}</span></>}</td>
                    <td>{o.model}</td><td className="num">{metricPct(o.acc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
