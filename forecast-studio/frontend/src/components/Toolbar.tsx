import type { Currency } from '../lib/format';
import type { Cfg, Dataset, Gran } from '../lib/types';

interface Props {
  ds: Dataset; cfg: Cfg; setCfg: (c: Cfg) => void; dims: string[]; filter: string; setFilter: (f: string) => void;
  gran: Gran; setGran: (g: Gran) => void; weekOk: boolean; model: string; setModel: (m: string) => void;
  models: { key: string; name: string }[]; conf: number; setConf: (c: number) => void; currency: Currency; setCurrency: (c: Currency) => void;
}

export function Toolbar(p: Props) {
  return (
    <div className="toolbar" role="group" aria-label="Forecast settings">
      <div className="tool"><label htmlFor="valueCol">Measure</label>
        <select id="valueCol" value={p.cfg.value} onChange={(e) => p.setCfg({ ...p.cfg, value: e.target.value })}>
          {p.ds.numCols.map((c) => <option key={c}>{c}</option>)}
        </select></div>
      <div className="tool"><label htmlFor="dimCol">Break down by</label>
        <select id="dimCol" value={p.cfg.dim} onChange={(e) => { p.setCfg({ ...p.cfg, dim: e.target.value }); p.setFilter('__all'); }}>
          <option value="">None</option>{p.ds.catCols.map((c) => <option key={c}>{c}</option>)}
        </select></div>
      <div className="tool"><label htmlFor="filterVal">Show</label>
        <select id="filterVal" value={p.filter} disabled={!p.cfg.dim} onChange={(e) => p.setFilter(e.target.value)}>
          <option value="__all">{p.cfg.dim ? `All ${p.cfg.dim.toLowerCase()} values` : 'All data'}</option>
          {p.dims.map((v) => <option key={v}>{v}</option>)}
        </select></div>
      <div className="tool"><label htmlFor="gran">Time grain</label>
        <select id="gran" value={p.gran} onChange={(e) => p.setGran(e.target.value as Gran)}>
          <option value="month">Monthly</option><option value="week" disabled={!p.weekOk}>Weekly</option>
        </select></div>
      <div className="tool"><label htmlFor="model">Forecast model</label>
        <select id="model" value={p.model} onChange={(e) => p.setModel(e.target.value)}>
          <option value="auto">Auto: validated model</option>
          {p.models.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select></div>
      <div className="tool"><label htmlFor="conf">Estimated range</label>
        <select id="conf" value={p.conf} onChange={(e) => p.setConf(+e.target.value)}>
          <option value={95}>95% estimated</option><option value={80}>80% estimated</option>
        </select></div>
      <div className="tool"><label htmlFor="currency">Currency</label>
        <select id="currency" value={p.currency} onChange={(e) => p.setCurrency(e.target.value as Currency)}>
          <option value="INR">₹ Indian rupee</option><option value="USD">$ US dollar</option><option value="EUR">€ Euro</option><option value="NUM">No currency</option>
        </select></div>
    </div>
  );
}
