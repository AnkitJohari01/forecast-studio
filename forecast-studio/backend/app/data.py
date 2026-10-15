"""CSV aggregation matching frontend/src/lib/data.ts for both UIs."""
import calendar
from datetime import datetime, timedelta
import math
import re
import numpy as np
import pandas as pd

MONTHS = {name.lower(): i for i, name in enumerate(calendar.month_abbr) if name}


def parse_number(value):
    if value is None or pd.isna(value):
        return math.nan
    if isinstance(value, (int, float, np.number)):
        return float(value)
    text = re.sub(r'[₹$€£,\s]', '', str(value).strip())
    if text.startswith('(') and text.endswith(')'):
        text = '-' + text[1:-1]
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?', text, re.I):
        return math.nan
    try:
        return float(text) if text else math.nan
    except ValueError:
        return math.nan


def day_first(values):
    for value in values:
        m = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}', str(value).strip())
        if m:
            if int(m[1]) > 12:
                return True
            if int(m[2]) > 12:
                return False
    return True


def parse_date(value, dayfirst=True):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return datetime(value.year, value.month, value.day)
    text = str(value).strip()
    try:
        if re.fullmatch(r'\d{5}(\.\d+)?', text):
            serial = float(text)
            return datetime(1899, 12, 30) + timedelta(days=math.floor(serial)) if 20000 < serial < 80000 else None
        m = re.fullmatch(r'(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?', text)
        if m:
            year, month, day = int(m[1]), int(m[2]), int(m[3] or 1)
        else:
            m = re.fullmatch(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})', text)
            if m:
                a, b, year = map(int, m.groups())
                day, month = (a, b) if a > 12 or (b <= 12 and dayfirst) else (b, a)
            else:
                m = re.fullmatch(r'([A-Za-z]{3,9})[\s\-/.,\x27]*(\d{2,4})', text)
                if m:
                    month, year, day = MONTHS.get(m[1][:3].lower()), int(m[2]), 1
                else:
                    m = re.fullmatch(r'(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,\x27]*(\d{2,4})', text)
                    if m:
                        day, month, year = int(m[1]), MONTHS.get(m[2][:3].lower()), int(m[3])
                    else:
                        m = re.fullmatch(r'([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})', text)
                        if not m:
                            return None
                        month, day, year = MONTHS.get(m[1][:3].lower()), int(m[2]), int(m[3])
            if year < 100:
                year += 2000
        if not 1900 <= year <= 2200:
            return None
        return datetime(year, month, day)
    except (ValueError, TypeError, OverflowError):
        return None


class DataPreprocessor:
    def detect_date_column(self, df):
        candidates = []
        for col in df.columns:
            values = df[col].head(400).dropna().tolist()
            named = bool(re.search(r'date|month|period|week|day|time', str(col), re.I))
            if not values or (not named and all(re.fullmatch(r'-?\d+(\.\d+)?', str(v).strip()) for v in values)):
                continue
            first = day_first(df[col].tolist())
            if sum(parse_date(v, first) is not None for v in values) / len(values) > .8:
                candidates.append(col)
        return next((c for c in candidates if re.search('date', c, re.I)), candidates[0] if candidates else None)

    def suggest_target_column(self, df, date_col=None):
        date_col = date_col or self.detect_date_column(df)
        candidates = []
        for col in df.columns:
            if col == date_col:
                continue
            values = df[col].head(400).dropna().tolist()
            if values and sum(math.isfinite(parse_number(v)) for v in values) / len(values) > .9:
                candidates.append(col)
        return next((c for c in candidates if re.search(r'revenue|sales|amount|value|total|net', c, re.I)), candidates[0] if candidates else None)


def build_series(df, date_col, target_col, freq='month', filters=None):
    if freq not in ('month', 'week'):
        raise ValueError('Select monthly or weekly time grain')
    for col in (date_col, target_col):
        if col not in df.columns:
            raise ValueError(f'Selected column {col!r} is not in the CSV')
    filters = filters or {}
    if not isinstance(filters, dict) or any(c not in df.columns or isinstance(v, (dict, list)) for c, v in filters.items()):
        raise ValueError('Every filter must name an existing column and a single value')
    first = day_first(df[date_col].tolist())
    dates = [parse_date(v, first) for v in df[date_col]]
    valid = [d for d in dates if d is not None]
    if not valid:
        raise ValueError('Selected date column has no valid dates')
    epoch = datetime(1970, 1, 1)

    def index(d):
        return d.year * 12 + d.month - 1 if freq == 'month' else ((d - epoch).days + 3) // 7

    def period_date(i):
        return datetime(i // 12, i % 12 + 1, 1) if freq == 'month' else epoch + timedelta(days=i * 7 - 3)

    lo, hi, partial = index(min(valid)), index(max(valid)), False
    last = max(valid)
    if len({d.day for d in valid}) > 3:
        incomplete = last.day < calendar.monthrange(last.year, last.month)[1] - 2 if freq == 'month' else last.weekday() not in (5, 6)
        if incomplete:
            hi -= 1
            partial = True
    lo = max(lo, hi - (240 if freq == 'month' else 520))
    if hi < lo:
        raise ValueError('No complete periods are available for forecasting')
    y = [0.] * (hi - lo + 1)
    values = df[target_col].tolist()
    filter_columns = {c: df[c].astype(str).tolist() for c in filters}
    skipped = 0
    for row, (d, value) in enumerate(zip(dates, values)):
        number = parse_number(value)
        if d is None or not math.isfinite(number):
            skipped += 1
            continue
        if any(filter_columns[c][row] != str(v) for c, v in filters.items()):
            continue
        position = index(d) - lo
        if 0 <= position < len(y):
            y[position] += number
    trim = 0
    while trim < len(y) - 1 and y[trim] == 0:
        trim += 1
    y, lo = y[trim:], lo + trim
    return {'dates': [period_date(i).strftime('%Y-%m-%d') for i in range(lo, hi + 1)],
            'values': y, 'partial': partial, 'skipped_rows': skipped}
