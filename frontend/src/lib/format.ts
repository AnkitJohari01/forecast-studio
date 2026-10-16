export type Currency = 'INR' | 'USD' | 'EUR' | 'NUM';

/** Unit-like measures are never shown as money. */
export const effectiveCurrency = (measure: string, cur: Currency): Currency =>
  /unit|qty|quantity|volume|count|pcs|pieces/i.test(measure) ? 'NUM' : cur;

export function makeFmt(cur: Currency) {
  const number = new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { maximumSignificantDigits: 21 });
  const symbol = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
  return (v: number | null | undefined): string => {
    if (v == null || !isFinite(v)) return '–';
    return (v < 0 ? '-' : '') + symbol + number.format(Math.abs(v));
  };
}
export type Fmt = ReturnType<typeof makeFmt>;
export const pct = (v: number) => (v >= 0 ? '+' : '') + (v * 100) + '%';
export const cls = (v: number) => (v >= 0 ? 'up' : 'down');
export const accOf = (m: { wape: number | null }) => m.wape == null ? null : Math.max(0, 100 - m.wape * 100);
export const metricPct = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '–' : `${v}%`;
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
