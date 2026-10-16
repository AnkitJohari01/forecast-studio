import { BarElement, CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip, type Plugin } from 'chart.js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);
Chart.defaults.font.family = 'Figtree, system-ui, sans-serif';

export const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Dashed "Forecast →" marker where history ends. Options: { index: number } */
export const forecastLine: Plugin<'line'> = {
  id: 'forecastLine',
  afterDatasetsDraw(c, _a, opts: { index?: number }) {
    if (opts.index == null) return;
    const x = c.scales.x.getPixelForValue(opts.index), { top, bottom } = c.chartArea, g = c.ctx;
    g.save();
    g.strokeStyle = 'rgba(232,238,255,.35)'; g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.setLineDash([]);
    g.font = '600 11px Figtree, system-ui, sans-serif';
    const w = g.measureText('Forecast →').width + 14;
    g.fillStyle = 'rgba(232,238,255,.12)'; g.beginPath();
    if (g.roundRect) g.roundRect(x + 6, top + 2, w, 20, 10); else g.rect(x + 6, top + 2, w, 20);
    g.fill(); g.fillStyle = '#E8EEFF'; g.textBaseline = 'middle'; g.fillText('Forecast →', x + 13, top + 12);
    g.restore();
  },
};

/** Value labels above floating bars. Options: { fmt, color } */
export const barLabels: Plugin<'bar'> = {
  id: 'barLabels',
  afterDatasetsDraw(c, _a, opts: { fmt?: (v: number) => string; color?: string }) {
    if (!opts.fmt) return;
    const g = c.ctx, ds = c.data.datasets[0], meta = c.getDatasetMeta(0);
    g.save(); g.font = '600 12px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = opts.color || '#333';
    meta.data.forEach((el, i) => {
      const [a, b] = ds.data[i] as unknown as [number, number];
      const last = i === 0 || i === ds.data.length - 1;
      const txt = last ? opts.fmt!(b) : (b - a >= 0 ? '+' : '-') + opts.fmt!(Math.abs(b - a));
      const p = el as unknown as { x: number; y: number; base: number };
      g.fillText(txt, p.x, Math.min(p.y, p.base) - 7);
    });
    g.restore();
  },
};
