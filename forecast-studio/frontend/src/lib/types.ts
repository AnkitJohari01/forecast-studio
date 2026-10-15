export type Gran = 'month' | 'week';
export type Row = Record<string, string | number | null | undefined>;

export interface DateInfo { dates: (Date | null)[]; min: Date; max: Date; dayLevel: boolean; valid: number }
export interface Dataset {
  id: number; name: string; kind: 'sample' | 'upload'; rows: Row[];
  columns: string[]; dateCols: string[]; numCols: string[]; catCols: string[];
  dateCache: Record<string, DateInfo>;
}
export interface Cfg { date: string; value: string; dim: string }
export interface Series { lo: number; y: number[]; partial: boolean }

export interface ModelResult {
  key: string; name: string; family: string; desc: string; na?: string;
  wape?: number | null; rmse?: number; bias?: number | null; backtest?: number[]; forecast?: number[]; sd?: number; params?: string;
  wmape?: number | null; mape?: number | null; mae?: number | null; bias_pct?: number | null; mase?: number | null; validation_wape?: number | null;
}
export interface LiveModel extends ModelResult {
  wape: number | null; rmse: number; bias: number | null; backtest: number[]; forecast: number[]; sd: number; params: string;
}
export interface SeriesResult {
  error?: string; models: ModelResult[]; best: string; holdout: number;
  seasonal: boolean; seasonalStrength: number; n: number;
  selection_basis?: string; selection_holdout?: number;
}
export const isLive = (m: ModelResult): m is LiveModel => !m.na && Array.isArray(m.forecast);

export interface Scenario {
  preset: string; price: number; elast: number; promo: number; months: number[];
  growth: number; nb: number; nbStart: number; target: number;
}

/** Everything the dashboard needs about the currently selected forecast. */
export interface View {
  s: Series; res: SeriesResult; sel: LiveModel; best: LiveModel; M: number; n: number; H: number;
  fc: number[]; lo: number[]; hi: number[]; prior: number | null; filter: string | null;
  scn: ScenarioResult;
}
export interface ScenarioResult {
  series: number[]; base: number; total: number; steps: number[];
  eff: { price: number; promo: number; growth: number; nb: number }; active: boolean;
}
