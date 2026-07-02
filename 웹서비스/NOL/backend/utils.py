from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from config import (
    CSV_FILES,
    FESTIVAL_COLUMNS,
    LODGING_COLUMNS,
    BUS_COLUMNS,
    KTX_COLUMNS,
    MUGUNGHWA_COLUMNS,
    SRT_COLUMNS,
    LEISURE_NAME_ALIASES,
    LEISURE_TEXT_ALIASES,
    LEISURE_PRICE_ALIASES,
    LEISURE_REGULAR_PRICE_ALIASES,
    LEISURE_LAT_ALIASES,
    LEISURE_LON_ALIASES,
    LEISURE_PROVINCE_ALIASES,
    LEISURE_CITY_ALIASES,
    LEISURE_RATING_ALIASES,
    LEISURE_REVIEW_ALIASES,
    LEISURE_URL_ALIASES,
    LEISURE_ID_ALIASES,
    LEISURE_IMAGE_ALIASES,
    LEISURE_CATEGORY_ALIASES,
    LEISURE_SUBCATEGORY_ALIASES,
)


# ---------------------------------------------------------------------------
# 텍스트 정규화
# ---------------------------------------------------------------------------

def normalize_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    s = str(value).replace("\ufeff", "").strip()
    return re.sub(r"\s+", " ", s)


def normalize_compact(value: Any) -> str:
    s = normalize_text(value).lower()
    return re.sub(r"[\s\(\)\[\]\-_/·,\.]", "", s)


# ---------------------------------------------------------------------------
# 파싱 유틸
# ---------------------------------------------------------------------------

def parse_int(value: Any) -> Optional[int]:
    if pd.isna(value):
        return None
    s = str(value).strip()
    if not s:
        return None
    s = re.sub(r"[^\d.\-]", "", s)
    if not s:
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def parse_float(value: Any) -> Optional[float]:
    if pd.isna(value):
        return None
    s = str(value).strip()
    if not s:
        return None
    s = re.sub(r"[^\d.\-]", "", s)
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def min_positive(values: List[Optional[int]]) -> Optional[int]:
    valid = [v for v in values if v is not None and v > 0]
    return min(valid) if valid else None


def text_join(values: List[Any]) -> str:
    return " ".join([normalize_text(v) for v in values if normalize_text(v)])


def safe_str_contains(text: Any, keywords: List[str]) -> bool:
    t = normalize_text(text).lower()
    return any(k.lower() in t for k in keywords)


# ---------------------------------------------------------------------------
# 지리 계산
# ---------------------------------------------------------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_km_vectorized(lats: np.ndarray, lons: np.ndarray, lat2: float, lon2: float) -> np.ndarray:
    """numpy 벡터 연산으로 복수 좌표 → 단일 지점 거리를 한 번에 계산."""
    r = 6371.0
    p1 = np.radians(lats)
    p2 = math.radians(lat2)
    dp = np.radians(lat2 - lats)
    dl = np.radians(lon2 - lons)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * math.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


# ---------------------------------------------------------------------------
# 가격/날짜 유틸
# ---------------------------------------------------------------------------

def discount_rate(regular_price: Optional[int], sale_price: Optional[int]) -> float:
    if not regular_price or regular_price <= 0 or sale_price is None or sale_price < 0:
        return 0.0
    if sale_price > regular_price:
        return 0.0
    return (regular_price - sale_price) / regular_price


def day_kind(dt: pd.Timestamp) -> str:
    return "weekend" if dt.weekday() in (4, 5) else "weekday"


def stay_nights(start_date: str, end_date: str) -> int:
    s = pd.to_datetime(start_date)
    e = pd.to_datetime(end_date)
    return max((e - s).days, 0)


def stay_dates(start_date: str, end_date: str) -> List[pd.Timestamp]:
    s = pd.to_datetime(start_date)
    n = stay_nights(start_date, end_date)
    return [s + pd.Timedelta(days=i) for i in range(n)]


# ---------------------------------------------------------------------------
# DataFrame 유틸
# ---------------------------------------------------------------------------

def normalize_df_strings(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [normalize_text(c) for c in out.columns]
    return out


def resolve_existing_file(candidates: List[str]) -> str:
    for p in candidates:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"파일을 찾을 수 없습니다: {candidates}")


def try_read_csv(path: str, *, header: Optional[int]) -> pd.DataFrame:
    last_error = None
    for enc in ["utf-8-sig", "utf-8"]:
        try:
            return pd.read_csv(path, encoding=enc, header=header)
        except Exception as e:
            last_error = e
    raise RuntimeError(f"CSV 읽기 실패: {path} / {last_error}")


def read_header_csv(path: str, expected_columns: List[str]) -> pd.DataFrame:
    df = normalize_df_strings(try_read_csv(path, header=0))

    if [normalize_text(c) for c in df.columns] == [normalize_text(c) for c in expected_columns]:
        return df

    if len(df.columns) == len(expected_columns) + 1:
        first_col = normalize_compact(df.columns[0])
        if first_col == "" or first_col.startswith("unnamed"):
            df = df.drop(columns=[df.columns[0]])
            if len(df.columns) == len(expected_columns):
                df.columns = expected_columns
                return df

    if len(df.columns) == len(expected_columns):
        df.columns = expected_columns
        return df

    df2 = try_read_csv(path, header=None)
    if df2.shape[1] == len(expected_columns) + 1:
        first_row = [normalize_text(x) for x in df2.iloc[0].tolist()]
        header_candidate = first_row[1:]
        if header_candidate == [normalize_text(c) for c in expected_columns]:
            df2 = df2.iloc[1:, 1:].copy()
            df2.columns = expected_columns
            df2.reset_index(drop=True, inplace=True)
            return normalize_df_strings(df2)

    if df2.shape[1] != len(expected_columns):
        raise ValueError(f"헤더형 CSV 컬럼 수 불일치: {path}")

    df2.columns = expected_columns
    return normalize_df_strings(df2)


def read_noheader_csv(path: str, expected_columns: List[str]) -> pd.DataFrame:
    df = try_read_csv(path, header=None)
    if df.shape[1] != len(expected_columns):
        df2 = normalize_df_strings(try_read_csv(path, header=0))
        if df2.shape[1] == len(expected_columns):
            df2.columns = expected_columns
            return df2
        raise ValueError(f"무헤더 CSV 컬럼 수 불일치: {path}")
    df.columns = expected_columns
    return normalize_df_strings(df)


def find_column(df: pd.DataFrame, aliases: List[str]) -> Optional[str]:
    compact = {normalize_compact(c): c for c in df.columns}
    alias_norms = [normalize_compact(a) for a in aliases]
    for a in alias_norms:
        if a in compact:
            return compact[a]
    for c in df.columns:
        cc = normalize_compact(c)
        if any(a in cc or cc in a for a in alias_norms):
            return c
    return None


def detect_leisure_schema(df: pd.DataFrame) -> Dict[str, Any]:
    text_cols = []
    for key in LEISURE_TEXT_ALIASES:
        c = find_column(df, [key])
        if c and c not in text_cols:
            text_cols.append(c)

    score_cols = []
    for c in df.columns:
        cc = normalize_compact(c)
        if "점수" in cc:
            score_cols.append(c)

    return {
        "name": find_column(df, LEISURE_NAME_ALIASES),
        "sale_price": find_column(df, LEISURE_PRICE_ALIASES),
        "regular_price": find_column(df, LEISURE_REGULAR_PRICE_ALIASES),
        "lat": find_column(df, LEISURE_LAT_ALIASES),
        "lon": find_column(df, LEISURE_LON_ALIASES),
        "province": find_column(df, LEISURE_PROVINCE_ALIASES),
        "city": find_column(df, LEISURE_CITY_ALIASES),
        "rating": find_column(df, LEISURE_RATING_ALIASES),
        "review_count": find_column(df, LEISURE_REVIEW_ALIASES),
        "url": find_column(df, LEISURE_URL_ALIASES),
        "id": find_column(df, LEISURE_ID_ALIASES),
        "image": find_column(df, LEISURE_IMAGE_ALIASES),
        "category": find_column(df, LEISURE_CATEGORY_ALIASES),
        "subcategory": find_column(df, LEISURE_SUBCATEGORY_ALIASES),
        "text_cols": text_cols,
        "score_cols": score_cols,
    }


# ---------------------------------------------------------------------------
# DataBundle + load_all_data
# ---------------------------------------------------------------------------

@dataclass
class DataBundle:
    festivals: pd.DataFrame
    hotel: pd.DataFrame
    motel: pd.DataFrame
    pension: pd.DataFrame
    leisure: pd.DataFrame
    bus: pd.DataFrame
    ktx: pd.DataFrame
    mugunghwa: pd.DataFrame
    srt: pd.DataFrame
    leisure_schema: Dict[str, Any]


@lru_cache(maxsize=1)
def load_all_data() -> DataBundle:
    festivals = read_header_csv(resolve_existing_file(CSV_FILES["festivals"]), FESTIVAL_COLUMNS)
    hotel = read_header_csv(resolve_existing_file(CSV_FILES["hotel"]), LODGING_COLUMNS)
    motel = read_header_csv(resolve_existing_file(CSV_FILES["motel"]), LODGING_COLUMNS)
    pension = read_header_csv(resolve_existing_file(CSV_FILES["pension"]), LODGING_COLUMNS)
    leisure = normalize_df_strings(try_read_csv(resolve_existing_file(CSV_FILES["leisure"]), header=0))
    bus = read_header_csv(resolve_existing_file(CSV_FILES["bus"]), BUS_COLUMNS)
    ktx = read_header_csv(resolve_existing_file(CSV_FILES["ktx"]), KTX_COLUMNS)
    mugunghwa = read_header_csv(resolve_existing_file(CSV_FILES["mugunghwa"]), MUGUNGHWA_COLUMNS)
    srt = read_header_csv(resolve_existing_file(CSV_FILES["srt"]), SRT_COLUMNS)
    leisure_schema = detect_leisure_schema(leisure)

    return DataBundle(
        festivals=festivals,
        hotel=hotel,
        motel=motel,
        pension=pension,
        leisure=leisure,
        bus=bus,
        ktx=ktx,
        mugunghwa=mugunghwa,
        srt=srt,
        leisure_schema=leisure_schema,
    )