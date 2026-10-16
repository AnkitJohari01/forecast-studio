import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { makeDataset, MN } from '../lib/data';
import type { Dataset, Row } from '../lib/types';
import { Icon } from './Icons';

const NAV = [
  ['overview', 'Forecast', 'chart'], ['whatif', 'What-if planner', 'sliders'], ['models', 'Model lab', 'grid'],
  ['insightsSec', 'Insights', 'bulb'], ['segments', 'Segments', 'pie'], ['detail', 'Forecast table', 'table'],
] as const;

interface Props {
  source: 'sample' | 'upload'; onSource: (s: 'sample' | 'upload') => void; onUpload: (ds: Dataset) => void;
  ds: Dataset | null; periods: string; dateCol: string; onDateCol: (c: string) => void;
  dark: boolean; onTheme: () => void; minDate: Date | null; maxDate: Date | null;
}

export function Sidebar(p: Props) {
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>({ text: '' });
  const [over, setOver] = useState(false);
  const [active, setActive] = useState('overview');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-35% 0px -55% 0px' });
    NAV.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [p.ds]);

  function handleFile(file?: File) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return setMsg({ text: 'That file is not a CSV. Export it as .csv and try again.', err: true });
    if (file.size > 60e6) return setMsg({ text: 'That file is over 60 MB. Aggregate it to daily or monthly totals first.', err: true });
    setMsg({ text: `Reading ${file.name}…` });
    Papa.parse<Row>(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
      complete: (r) => {
        const rows = r.data.filter((row) => row && Object.values(row).some((v) => v !== '' && v != null));
        if (!rows.length) return setMsg({ text: 'That file has no data rows.', err: true });
        const ds = makeDataset(file.name, rows, 'upload');
        if (!ds.dateCols.length) return setMsg({ text: 'No date column found. Add a column with dates such as 2025-01-31 or 31/01/2025.', err: true });
        if (!ds.numCols.length) return setMsg({ text: 'No numeric column found. Add a column with sales amounts or quantities.', err: true });
        setMsg({ text: `Loaded ${rows.length.toLocaleString('en-IN')} rows from ${file.name}.` });
        p.onUpload(ds);
      },
      error: () => setMsg({ text: 'The file could not be read. Check that it is a valid CSV.', err: true }),
    });
  }

  const md = (d: Date | null) => (d ? `${MN[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '–');
  return (
    <aside className="side" aria-label="Navigation and data">
      <div className="brand">
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#19C3B1" /><stop offset="1" stopColor="#6A5CFF" /></linearGradient></defs><rect width="38" height="38" rx="11" fill="url(#lg)" /><path d="M8 26l7-7 5 4 9-11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="29" cy="12" r="2.6" fill="#fff" /></svg>
        <div><b>Forecast Studio</b><small>Predictive sales analytics</small></div>
      </div>
      <nav className="nav" aria-label="Sections">
        {NAV.map(([id, label, icon]) => (
          <a key={id} href={`#${id}`} className={active === id ? 'on' : ''}><Icon name={icon} />{label}</a>
        ))}
      </nav>
      <div className="sidecard">
        <h3>Data source</h3>
        <div className="srcseg" role="group" aria-label="Data source">
          <button type="button" aria-pressed={p.source === 'sample'} onClick={() => p.onSource('sample')}>Sample</button>
          <button type="button" aria-pressed={p.source === 'upload'} onClick={() => p.onSource('upload')}>Your CSV</button>
        </div>
        {p.source === 'upload' && (
          <div>
            <label className={'drop' + (over ? ' over' : '')} htmlFor="file"
              onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
              onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}>
              <strong>Choose a CSV</strong> or drop it here<span>Needs a date column and a numeric sales column</span>
            </label>
            <input ref={fileRef} type="file" id="file" accept=".csv,text/csv" className="sr-only"
              onChange={(e) => { handleFile(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ''; }} />
            <p className={'fileinfo' + (msg.err ? ' err' : '')} aria-live="polite">{msg.text}</p>
          </div>
        )}
      </div>
      {p.ds && (
        <div className="sidecard">
          <h3>Dataset</h3>
          <dl className="stats">
            <div><dt>Rows</dt><dd>{p.ds.rows.length.toLocaleString('en-IN')}</dd></div>
            <div><dt>Periods</dt><dd>{p.periods}</dd></div>
            <div><dt>From</dt><dd>{md(p.minDate)}</dd></div>
            <div><dt>To</dt><dd>{md(p.maxDate)}</dd></div>
          </dl>
          {p.ds.dateCols.length > 1 && (
            <div className="sidefield"><label htmlFor="dateCol">Date column</label>
              <select id="dateCol" value={p.dateCol} onChange={(e) => p.onDateCol(e.target.value)}>
                {p.ds.dateCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
          )}
        </div>
      )}
      <div className="sidefoot">
        <span />
        <button type="button" className="themebtn" onClick={p.onTheme} aria-label="Switch colour theme">
          <Icon name={p.dark ? 'sun' : 'moon'} size={14} /><span>{p.dark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </aside>
  );
}
