export type Currency = 'INR' | 'USD' | 'EUR' | 'NUM';

/** Unit-like measures are never shown as money. */
export const effectiveCurrency = (measure: string, cur: Currency): Currency =>
  /unit|qty|quantity|volume|count|pcs|pieces/i.test(measure) ? 'NUM' : cur;

export function makeFmt(cur: Currency) {
  return (v: number | null | undefined): string => {
    if (v == null || !isFinite(v)) return '–';
    const abs = Math.abs(v), sg = v < 0 ? '-' : '';
    if (cur === 'INR') {
      if (abs >= 1e7) return sg + '₹' + (abs / 1e7).toFixed(abs >= 1e11 ? 0 : abs >= 1e10 ? 1 : 2) + ' Cr';
      if (abs >= 1e5) return sg + '₹' + (abs / 1e5).toFixed(2) + ' L';
      return sg + '₹' + Math.round(abs).toLocaleString('en-IN');
    }
    const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
    if (abs >= 1e9) return sg + sym + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sg + sym + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e4) return sg + sym + (abs / 1e3).toFixed(1) + 'K';
    return sg + sym + Math.round(abs).toLocaleString('en-US');
  };
}
export type Fmt = ReturnType<typeof makeFmt>;
export const pct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
export const cls = (v: number) => (v >= 0 ? 'up' : 'down');
export const accOf = (m: { wape: number }) => Math.max(0, 100 - m.wape * 100);
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
