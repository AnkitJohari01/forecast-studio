import { unitWord } from '../lib/data';
import { accOf, type Fmt } from '../lib/format';
import { isLive, type Gran, type View } from '../lib/types';
import { Icon } from './Icons';

export const FAMILY: Record<string, string> = {
  Statistical: '#4F7BFF', 'Machine learning': '#A855F7', 'Exponential smoothing': '#19C3B1', Regression: '#F59E0B', Baseline: '#94A3B8', Ensemble: '#EC4899',
};

function Ring({ acc }: { acc: number }) {
  const r = 24, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, acc / 100));
  const col = acc >= 95 ? '#19C3B1' : acc >= 90 ? '#4F7BFF' : acc >= 80 ? '#F59E0B' : '#E5484D';
  return (
    <div className="ring"><svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
      <circle cx="29" cy="29" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * p).toFixed(1)} ${c.toFixed(1)}`} />
    </svg><b>{acc.toFixed(1)}</b></div>
  );
}

export function ModelLab({ v, gran, fmt, onPick, onAuto }: { v: View; gran: Gran; fmt: Fmt; onPick: (k: string) => void; onAuto: () => void }) {
  const { res, sel, best, n, s } = v;
  const ranked = [...res.models].sort((a, b) => (isLive(a) ? 0 : 1) - (isLive(b) ? 0 : 1) || (a.wape ?? 9) - (b.wape ?? 9));
  const show = Math.min(n, 24), act = s.y.slice(n - show), W = 200, Hh = 46;
  return (
    <section id="models">
      <div className="sec-h">
        <div><h2>Model lab</h2><p>Every model was trained on earlier data and asked to predict the last {res.holdout} {unitWord(gran, res.holdout)}. Ranked by accuracy; select a card to use that model.</p></div>
        <button type="button" className="btn" onClick={onAuto}><Icon name="star" />Use most accurate</button>
      </div>
      <div className="mgrid">
        {ranked.map((m, i) => {
          const col = FAMILY[m.family] || '#4F7BFF';
          const fam = <span className="fam" style={{ background: `color-mix(in srgb,${col} 14%,transparent)`, color: col }}>{m.family}</span>;
          if (!isLive(m)) return (
            <div key={m.key} className="mcard na"><div className="mtop"><div><div className="rank">Not ranked</div><div className="mname">{m.name}</div>{fam}</div></div>
              <div className="mdesc">{m.desc}</div><div className="params">{m.na}</div></div>
          );
          const all = [...act, ...m.backtest], mn = Math.min(...all), mx = Math.max(...all), sp = mx - mn || 1;
          const pts = (arr: (number | null)[]) => arr.map((val, j) => (val == null ? null : `${((j / (show - 1)) * W).toFixed(1)},${(Hh - 4 - ((val - mn) / sp) * (Hh - 8)).toFixed(1)}`)).filter(Boolean).join(' ');
          const btPos = [...new Array<null>(show - res.holdout).fill(null), ...m.backtest];
          const x0 = ((show - res.holdout) / (show - 1)) * W;
          const bias = Math.abs(m.bias) < 0.005 ? 'Balanced' : `${(Math.abs(m.bias) * 100).toFixed(1)}% ${m.bias > 0 ? 'over' : 'under'}`;
          const isSel = m.key === sel.key;
          return (
            <button key={m.key} type="button" className={'mcard' + (isSel ? ' sel' : '')} aria-pressed={isSel} onClick={() => onPick(m.key)}>
              {isSel ? <span className="tag">In use</span> : m.key === best.key ? <span className="tag best">Most accurate</span> : null}
              <div className="mtop"><div><div className="rank">#{i + 1}</div><div className="mname">{m.name}</div>{fam}</div><Ring acc={accOf(m)} /></div>
              <svg className="spark" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true">
                <rect x={x0} y="0" width={W - x0} height={Hh} fill={`color-mix(in srgb,${col} 9%,transparent)`} />
                <polyline points={pts(act)} fill="none" stroke="var(--muted)" strokeOpacity=".55" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                <polyline points={pts(btPos)} fill="none" stroke={col} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="mdesc">{m.desc}</div>
              <div className="params">{m.params}</div>
              <div className="mstats"><div>Typical miss<b>{fmt(m.rmse)}</b></div><div>Bias<b>{bias}</b></div></div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
