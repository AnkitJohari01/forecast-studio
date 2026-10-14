import type { Cfg, Dataset, DateInfo, Gran, Row, Series } from './types';

export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic automotive-aftermarket sales: 4 regions x 4 categories, monthly, with festive seasonality. */
export function makeSample(): Row[] {
  const rnd = mulberry32(20261013);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const regions: [string, number, number][] = [['North', 0.32, 0.08], ['South', 0.28, 0.12], ['West', 0.24, 0.1], ['East', 0.16, 0.19]];
  const cats: [string, number, number, number][] = [['Tyres', 0.34, 2400, 1.0], ['Spare parts', 0.3, 850, 1.05], ['Lubricants', 0.22, 520, 0.9], ['Accessories', 0.14, 1300, 1.15]];
  const season = [0.92, 0.95, 1.12, 0.97, 0.98, 0.94, 0.86, 0.88, 1.02, 1.18, 1.16, 1.02];
  const rows: Row[] = [];
  for (let i = 0; i < 57; i++) {
    const y = 2022 + Math.floor(i / 12), mo = i % 12;
    for (const [r, rw, rg] of regions) for (const [c, cw, price, amp] of cats) {
      const rev = 4.6e7 * rw * cw * Math.pow(1 + rg, i / 12) * (1 + (season[mo] - 1) * amp) * (1 + gauss() * 0.045);
      rows.push({ Date: `${y}-${String(mo + 1).padStart(2, '0')}-01`, Region: r, Category: c, Revenue: Math.round(rev),
        Units: Math.round(rev / (price * (1 + (0.03 * i) / 12) * (1 + gauss() * 0.02))) });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ parsing */
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function mk(y: number, mo: number, d: number): Date | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo, d));
  return isNaN(+dt) ? null : dt;
}
export function parseDate(v: unknown, dayFirst: boolean): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(+v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = +s; return n > 20000 && n < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5) : null; }
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/))) return mk(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    const a = +m[1], b = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
    let d: number, mo: number;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (dayFirst) { d = a; mo = b; } else { d = b; mo = a; }
    return mk(y, mo - 1, d);
  }
  if ((m = s.match(/^([A-Za-z]{3,9})[\s\-/.,']*(\d{2,4})$/))) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo != null) { let y = +m[2]; if (y < 100) y += 2000; return mk(y, mo, 1); } }
  if ((m = s.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,']*(\d{2,4})/))) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo != null) { let y = +m[3]; if (y < 100) y += 2000; return mk(y, mo, +m[1]); } }
  if (/^\d+$/.test(s)) return null;
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  const d = new Date(t);
  return mk(d.getFullYear(), d.getMonth(), d.getDate());
}
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim().replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return s === '' ? NaN : Number(s);
}

/* ------------------------------------------------------------------ datasets */
let seq = 0;
export function makeDataset(name: string, rows: Row[], kind: Dataset['kind']): Dataset {
  const columns = Object.keys(rows[0] || {}).filter((c) => c && c.trim());
  const smp = rows.slice(0, 400);
  const vals = (c: string) => smp.map((r) => r[c]).filter((v) => v !== '' && v != null);
  const dateCols = columns.filter((c) => {
    const vs = vals(c); if (!vs.length) return false;
    const named = /date|month|period|week|day|time/i.test(c);
    if (vs.every((v) => /^-?\d+(\.\d+)?$/.test(String(v).trim())) && !named) return false;
    return vs.filter((v) => parseDate(v, true)).length / vs.length > 0.8;
  }).sort((a, b) => (/date/i.test(b) ? 1 : 0) - (/date/i.test(a) ? 1 : 0));
  const numCols = columns.filter((c) => {
    if (dateCols.includes(c)) return false;
    const vs = vals(c);
    return vs.length > 0 && vs.filter((v) => isFinite(parseNumber(v))).length / vs.length > 0.9;
  });
  const catCols = columns.filter((c) => {
    if (dateCols.includes(c) || numCols.includes(c)) return false;
    const set = new Set(rows.slice(0, 5000).map((r) => r[c]));
    return set.size >= 2 && set.size <= 60;
  });
  return { id: ++seq, name, rows, columns, dateCols, numCols, catCols, dateCache: {}, kind };
}

export function getDates(ds: Dataset, col: string): DateInfo {
  if (ds.dateCache[col]) return ds.dateCache[col];
  let dayFirst = true;
  for (const r of ds.rows) {
    const m = String(r[col] ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (m) { if (+m[1] > 12) { dayFirst = true; break; } if (+m[2] > 12) { dayFirst = false; break; } }
  }
  const dates = ds.rows.map((r) => parseDate(r[col], dayFirst));
  let min = Infinity, max = -Infinity, valid = 0;
  const days = new Set<number>();
  for (const d of dates) {
    if (!d) continue;
    valid++;
    const t = d.getTime(); if (t < min) min = t; if (t > max) max = t;
    if (days.size < 6) days.add(d.getUTCDate());
  }
  return (ds.dateCache[col] = { dates, min: new Date(min), max: new Date(max), dayLevel: days.size > 3, valid });
}

/* ------------------------------------------------------------------ periods */
export const periodIndex = (d: Date, g: Gran) => (g === 'month' ? d.getUTCFullYear() * 12 + d.getUTCMonth() : Math.floor((Math.floor(d.getTime() / 864e5) + 3) / 7));
export const periodDate = (i: number, g: Gran) => (g === 'month' ? new Date(Date.UTC(Math.floor(i / 12), i % 12, 1)) : new Date((i * 7 - 3) * 864e5));
export function periodLabel(i: number, g: Gran): string {
  const d = periodDate(i, g), yy = "'" + String(d.getUTCFullYear()).slice(2);
  return g === 'month' ? `${MN[d.getUTCMonth()]} ${yy}` : `${d.getUTCDate()} ${MN[d.getUTCMonth()]} ${yy}`;
}
export const unitWord = (g: Gran, n: number) => (g === 'month' ? 'month' : 'week') + (n === 1 ? '' : 's');
export const maxH = (g: Gran) => (g === 'month' ? 24 : 52);
export const seasonLen = (g: Gran) => (g === 'month' ? 12 : 52);

export function buildSeries(ds: Dataset, cfg: Cfg, g: Gran, filter: string | null): Series {
  const info = getDates(ds, cfg.date);
  if (!info.valid) return { lo: 0, y: [], partial: false };
  let lo = periodIndex(info.min, g), hi = periodIndex(info.max, g), partial = false;
  if (info.dayLevel) {
    const mx = info.max;
    if (g === 'month') {
      const last = new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth() + 1, 0)).getUTCDate();
      if (mx.getUTCDate() < last - 2) { hi--; partial = true; }
    } else { const wd = mx.getUTCDay(); if (wd !== 0 && wd !== 6) { hi--; partial = true; } }
  }
  lo = Math.max(lo, hi - (g === 'month' ? 240 : 520));
  const n = hi - lo + 1;
  if (n <= 0) return { lo, y: [], partial };
  const y = new Array<number>(n).fill(0);
  ds.rows.forEach((r, i) => {
    const d = info.dates[i]; if (!d) return;
    if (filter != null && String(r[cfg.dim]) !== filter) return;
    const v = parseNumber(r[cfg.value]); if (!isFinite(v)) return;
    const p = periodIndex(d, g) - lo; if (p >= 0 && p < n) y[p] += v;
  });
  let f = 0; while (f < y.length - 1 && y[f] === 0) f++;
  return { lo: lo + f, y: y.slice(f), partial };
}

export function dimValues(ds: Dataset, cfg: Cfg): string[] {
  if (!cfg.dim) return [];
  const tot = new Map<string, number>();
  for (const r of ds.rows) {
    const k = String(r[cfg.dim] ?? ''); if (k === '') continue;
    const v = parseNumber(r[cfg.value]);
    tot.set(k, (tot.get(k) || 0) + (isFinite(v) ? v : 0));
  }
  return [...tot.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

export function defaultsFor(ds: Dataset): { cfg: Cfg; gran: Gran; horizon: number } {
  const pick = (a: string[], re: RegExp) => a.find((c) => re.test(c));
  const cfg: Cfg = {
    date: ds.dateCols[0],
    value: pick(ds.numCols, /revenue|sales|amount|value|total|net/i) || ds.numCols[0],
    dim: pick(ds.catCols, /region|zone|state|category|product|segment|channel|branch|store|city/i) || '',
  };
  const d = getDates(ds, cfg.date);
  const span = (d.max.getUTCFullYear() - d.min.getUTCFullYear()) * 12 + d.max.getUTCMonth() - d.min.getUTCMonth() + 1;
  const gran: Gran = d.dayLevel && span < 10 ? 'week' : 'month';
  return { cfg, gran, horizon: gran === 'week' ? 13 : 12 };
}
