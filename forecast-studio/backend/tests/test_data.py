from app.data import build_series, parse_date, parse_number
import math
import pandas as pd


def test_invalid_dates_are_not_rolled_into_next_month():
    assert parse_date('2024-02-30') is None
    assert parse_date('2024-02-29').day == 29
    assert parse_date('2024-01-01bad') is None
    assert parse_date('January 1, 2024').month == 1


def test_numeric_parser_rejects_python_only_number_formats():
    assert math.isnan(parse_number('1_000'))
    assert math.isnan(parse_number('0x10'))
    assert math.isnan(parse_number('Infinity'))
    assert parse_number('1e3') == 1000


def test_missing_periods_and_category_filters():
    df = pd.DataFrame({'Date': ['2024-01-01', '2024-03-01', '2024-03-01'],
                       'Sales': ['₹1,200', '50', '100'], 'Product': ['Chair', 'Chair', 'Desk']})
    result = build_series(df, 'Date', 'Sales', filters={'Product': 'Chair'})
    assert result['values'] == [1200., 0., 50.]
    assert result['dates'] == ['2024-01-01', '2024-02-01', '2024-03-01']


def test_weekly_buckets_start_on_monday():
    df = pd.DataFrame({'Date': ['2024-01-07', '2024-01-08'], 'Sales': [1, 2]})
    result = build_series(df, 'Date', 'Sales', 'week')
    assert result['dates'] == ['2024-01-01', '2024-01-08']
    assert result['values'] == [1., 2.]
