import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './lib/charts';
import { buildSeries, defaultsFor, dimValues, getDates, makeDataset, makeSample, maxH, seasonLen, unitWord } from './lib/data';
import { clamp, effectiveCurrency, makeFmt, sum, type Currency } from './lib/format';
import { computeScenario, PRESETS, presetScenario } from './lib/scenario';
import { isLive, type Cfg, type Dataset, type Gran, type Scenario, type View } from './lib/types';
import { useForecast } from './lib/useForecast';
import { ForecastTable } from './components/ForecastTable';
import { Hero } from './components/Hero';
import { Insights, SeasonChart, type SegSummary } from './components/Insights';
import { ModelLab } from './components/ModelLab';
import { Segments, type SegRow } from './components/Segments';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { WhatIf } from './components/WhatIf';

const MODEL_LIST = [
  { key: 'ens', name: 'Ensemble' }, { key: 'arima', name: 'ARIMA' }, { key: 'xgb', name: 'XGBoost' }, { key: 'prophet', name: 'Prophet' },
  { key: 'hw', name: 'Holt-Winters' }, { key: 'theta', name: 'Theta' }, { key: 'sr', name: 'Trend + seasonality' }, { key: 'sn', name: 'Seasonal naive' },
  { key: 'timesfm', name: 'TimesFM' },
];

interface Settings { cfg: Cfg; filter: string; gran: Gran; horizon: number }
type Source = 'sample' | 'upload';

function useSystemDark() {
  const mq = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = useState(mq.matches);
  useEffect(() => { const f = () => setDark(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [mq]);
  return dark;
}

/** Value one season earlier, from history or (if needed) from the forecast itself. */
function priorAtFn(y: number[], fc: number[], M: number) {
  const n = y.length;
  return (k: number) => { const j = n + k - M; if (j < 0) return null; return j < n ? y[j] : fc[j - n]; };
}

export default function App() {
  const sample = useMemo(() => makeDataset('Sample', makeSample(), 'sample'), []);
  const [upload, setUpload] = useState<Dataset | null>(null);
  const [source, setSource] = useState<Source>('sample');
  const [st, setSt] = useState<Settings>({ cfg: { date: 'Date', value: 'Revenue', dim: 'Region' }, filter: '__all', gran: 'month', horizon: 12 });
  const saved = useRef<Partial<Record<Source, Settings>>>({});
  const [model, setModel] = useState('auto');
  const [conf, setConf] = useState(95);
  const [currency, setCurrency] = useState<Currency>('INR');
  const [scn, setScn] = useState<Scenario>(() => presetScenario('growth'));
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number>();

  const sysDark = useSystemDark();
  const dark = theme ? theme === 'dark' : sysDark;
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; }, [theme]);
  const themeKey = dark ? 'dark' : 'light';

  const toast = useCallback((m: string) => {
    setToastMsg(m); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1900);
  }, []);

  const ds = source === 'sample' ? sample : upload;
  const { cfg, filter, gran, horizon } = st;
  const filt = filter === '__all' ? null : filter;
  const info = ds ? getDates(ds, cfg.date) : null;
  const M = seasonLen(gran), H = clamp(horizon, 3, maxH(gran));

  const series = useMemo(() => (ds ? buildSeries(ds, cfg, gran, filt) : null), [ds, cfg, gran, filt]);
  const dims = useMemo(() => (ds ? dimValues(ds, cfg) : []), [ds, cfg]);
  const mainList = useMemo(() => (series ? [{ id: 'main', s: series }] : []), [series]);
  const main = useForecast(mainList, gran, H, true, model);
  const segList = useMemo(() => (ds && cfg.dim ? dims.slice(0, 12).map((v) => ({ id: v, s: buildSeries(ds, cfg, gran, v) })) : []), [ds, cfg, gran, dims]);
  const seg = useForecast(segList, gran, H, !main.loading && !!main.data && !main.data.main?.error, model);

  const curr = effectiveCurrency(cfg.value, currency);
  const fmt = useMemo(() => makeFmt(curr), [curr]);
  const result = main.data?.main;

  const view: View | null = useMemo(() => {
    if (!series || !result || result.error) return null;
    const live = result.models.filter(isLive);
    if (!live.length) return null;
    const best = live.find((m) => m.key === result.best) || live[0];
    const picked = model === 'auto' ? best : live.find((m) => m.key === model);
    if (!picked) return null;
    const sel = picked, n = series.y.length;
    const fc = sel.forecast.slice(0, H), z = conf === 80 ? 1.2816 : 1.96;
    const w = (k: number) => z * sel.sd * Math.sqrt(1 + 0.15 * k);
    const lo = fc.map((x, k) => Math.max(0, x - w(k))), hi = fc.map((x, k) => x + w(k));
    const pa = priorAtFn(series.y, fc, M);
    let prior: number | null = 0;
    for (let k = 0; k < H; k++) { const p = pa(k); if (p == null) { prior = null; break; } prior += p; }
    return { s: series, res: result, sel, best, M, n, H, fc, lo, hi, prior: prior || null, filter: filt,
      scn: computeScenario(scn, fc, series.lo, n, series.y, M, gran, curr === 'NUM') };
  }, [series, result, model, H, conf, M, filt, scn, gran, curr]);

  const segRows: SegRow[] = useMemo(() => {
    if (!seg.data) return [];
    return segList.map(({ id, s }, i) => {
      const r = seg.data![id];
      if (!r || r.error) return { v: id, i, err: r?.error };
      const live = r.models.filter(isLive), b = live.find((m) => m.key === r.best) || live[0];
      if (!b) return { v: id, i, err: 'No model could be fitted' };
      const fc = b.forecast.slice(0, H), pa = priorAtFn(s.y, fc, M);
      let prior: number | null = 0;
      for (let k = 0; k < H; k++) { const p = pa(k); if (p == null) { prior = null; break; } prior += p; }
      const total = sum(fc);
      return { v: id, i, total, recent: sum(s.y.slice(-Math.min(M, s.y.length))), growth: prior ? total / prior - 1 : null,
        acc: Math.max(0, 100 - b.wape * 100), model: b.name, hist: s.y.slice(-24), fc: fc.slice(0, 12) };
    });
  }, [seg.data, segList, H, M]);

  const segSummary: SegSummary | null = useMemo(() => {
    const r = segRows.filter((o) => o.growth != null).sort((a, b) => b.growth! - a.growth!);
    return r.length > 1 ? { top: { v: r[0].v, growth: r[0].growth! }, bottom: { v: r[r.length - 1].v, growth: r[r.length - 1].growth! } } : null;
  }, [segRows]);

  /* ---------- handlers ---------- */
  function switchSource(src: Source) {
    if (src === source) return;
    saved.current[source] = st;
    setSource(src);
    const sv = saved.current[src];
    if (sv) setSt(sv);
    else if (src === 'upload' && upload) { const d = defaultsFor(upload); setSt({ ...d, filter: '__all' }); }
  }
  function onUpload(d: Dataset) {
    const def = defaultsFor(d);
    saved.current.upload = undefined;
    setUpload(d); setSource('upload'); setSt({ ...def, filter: '__all' });
  }
  const setCfg = (c: Cfg) => setSt((s) => ({ ...s, cfg: c }));
  const setFilter = (f: string) => setSt((s) => ({ ...s, filter: f }));
  const focusOverview = () => document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const applyPreset = (k: string) => setScn(presetScenario(k));
  const modelName = (k: string) => MODEL_LIST.find((m) => m.key === k)?.name || 'model';

  const title = `${cfg.value || 'Sales'} forecast${filt ? `: ${filt}` : ''}`;
  const busy = main.loading && !view;

  return (
    <div className="shell">
      <Sidebar source={source} onSource={switchSource} onUpload={onUpload} ds={ds}
        periods={series ? `${series.y.length} ${unitWord(gran, series.y.length)}` : '–'}
        dateCol={cfg.date} onDateCol={(c) => setCfg({ ...cfg, date: c })} dark={dark} onTheme={() => setTheme(dark ? 'light' : 'dark')}
        minDate={info?.valid ? info.min : null} maxDate={info?.valid ? info.max : null} />

      <main className="main">
        <header className="topbar">
          <div><h1>{ds ? title : 'Sales forecast'}</h1>
            {ds?.kind === 'upload' && <p>{ds.name}, {ds.rows.length.toLocaleString('en-IN')} rows.</p>}
            {!ds && <p>Upload a CSV with dates and sales values to train the models.</p>}</div>
        </header>

        {ds && (
          <Toolbar ds={ds} cfg={cfg} setCfg={setCfg} dims={dims} filter={filter} setFilter={setFilter}
            gran={gran} setGran={(g) => setSt((s) => ({ ...s, gran: g, horizon: g === 'week' ? 13 : 12 }))} weekOk={!!info?.dayLevel}
            model={model} setModel={setModel} models={MODEL_LIST} conf={conf} setConf={setConf} currency={currency} setCurrency={setCurrency} />
        )}

        {!ds && (
          <section className="card empty">
            <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'Sora, Figtree, sans-serif' }}>Upload a CSV to forecast your own sales</h2>
            <p className="sub" style={{ margin: 0 }}>One row per transaction or per period works. Columns are detected automatically and can be remapped.</p>
            <pre>{'Date,Region,Product,Revenue\n2025-01-31,North,Tyres,1245000\n2025-01-31,South,Lubricants,486500\n2025-02-28,North,Tyres,1302800'}</pre>
            <p className="sub" style={{ margin: 0 }}>Dates like 2025-01-31, 31/01/2025 or Jan-2025 all work. At least 6 periods are needed; 2+ years unlocks every model.</p>
            <button type="button" className="btn" onClick={() => switchSource('sample')}>Use sample data instead</button>
          </section>
        )}

        {ds && main.error && (
          <section className="card"><h3>Can't reach the forecasting service</h3>
            <p className="sub err">{main.error}</p>
            <p style={{ marginTop: 12 }}><button type="button" className="btn" onClick={main.retry}>Try again</button></p></section>
        )}
        {ds && result?.error && <section className="card" role="alert"><h3>Can't forecast this selection</h3><p className="sub err">{result.error}</p>
          <button type="button" className="btn" onClick={main.retry}>Try again</button></section>}

        {ds && !main.error && !result?.error && (
          <div style={{ display: 'grid', gap: 26 }}>
            <Hero v={view} gran={gran} fmt={fmt} conf={conf} model={model} horizon={H} setHorizon={(h) => setSt((s) => ({ ...s, horizon: h }))}
              scn={scn} applyPreset={(k) => { applyPreset(k); toast(`Scenario: ${PRESETS[k].name}`); }} loading={busy || (main.loading && !!view)} />
            {view && (
              <>
                <WhatIf v={view} gran={gran} fmt={fmt} scn={scn} setScn={setScn} applyPreset={applyPreset} theme={themeKey} />
                <ModelLab v={view} gran={gran} fmt={fmt} models={MODEL_LIST}
                  onPick={(k) => { if (k === model) main.retry(); else setModel(k); toast(`Running ${modelName(k)}`); focusOverview(); }}
                  onAuto={() => { if (model === 'auto') main.retry(); else setModel('auto'); toast('Comparing available models'); }} />
                <div className="grid2" id="insightsSec">
                  <Insights v={view} gran={gran} fmt={fmt} measure={cfg.value} dim={cfg.dim} seg={segSummary} scn={scn} />
                  <SeasonChart v={view} gran={gran} theme={themeKey} />
                </div>
                {cfg.dim && (
                  <Segments rows={segRows} dim={cfg.dim} gran={gran} M={M} n={view.n} H={H} fmt={fmt} filter={filter}
                    onPick={(v) => { setFilter(filter === v ? '__all' : v); focusOverview(); }}
                    loading={seg.loading} error={seg.error} retry={seg.retry} />
                )}
                <ForecastTable v={view} gran={gran} fmt={fmt} measure={cfg.value} conf={conf} priorAt={priorAtFn(view.s.y, view.fc, M)} toast={toast} />
                <p className="foot">The selected model runs on the current data. Auto compares available models; Ensemble averages the best available models. TimesFM runs through a separate service. Models are checked against the most recent actual values; accuracy is 100% minus the weighted absolute percentage error. Ranges are approximate prediction intervals based on historical error.</p>
              </>
            )}
          </div>
        )}
      </main>
      <div className={'toast' + (toastMsg ? ' show' : '')} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
