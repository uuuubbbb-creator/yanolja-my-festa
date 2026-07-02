from __future__ import annotations

import itertools
import math
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from config import (
    BUDGET_TOP_N,
    COMPANION_TYPES,
    ELLIPSE_EXTRA_KM,
    INCLUDE_ITEMS,
    KEYWORDS,
    LEISURE_DIVERSITY_CAP,
    LEISURE_RADIUS_KM,
    LODGING_DATASETS,
    LODGING_DIVERSITY_CAP,
    LODGING_FACILITY_SCORE,
    LODGING_RADIUS_KM,
    LODGING_TYPE_SCORE,
    PARKING_TOKENS,
    REGION_OPTIONS,
    RENTCAR_RAW_SPECS,
    SPECIAL_BUDGET_MULTIPLIER,
    SPECIAL_TOP_N,
    TRANSPORT_DATASETS,
)
from utils import (
    DataBundle,
    day_kind,
    discount_rate,
    find_column,
    haversine_km,
    haversine_km_vectorized,
    load_all_data,
    min_positive,
    normalize_compact,
    normalize_text,
    parse_float,
    parse_int,
    safe_str_contains,
    stay_dates,
    stay_nights,
    text_join,
)


# ---------------------------------------------------------------------------
# 축제 카탈로그 / 출발지 옵션
# ---------------------------------------------------------------------------

def get_festival_catalog() -> List[Dict[str, Any]]:
    data = load_all_data()
    rows = []
    for _, row in data.festivals.iterrows():
        name = normalize_text(row.get("축제명"))
        start = pd.to_datetime(row.get("개최기간_시작"), errors="coerce")
        end = pd.to_datetime(row.get("개최기간_종료"), errors="coerce")
        if not name or pd.isna(start) or pd.isna(end):
            continue
        first_image_raw = row.get("first_image", "")
        first_image = str(first_image_raw).strip() if first_image_raw and str(first_image_raw).strip() not in ("", "nan", "None") else ""
        detail_url_raw = row.get("f_상세 URL", "")
        detail_url = str(detail_url_raw).strip() if detail_url_raw and str(detail_url_raw).strip() not in ("", "nan", "None") else ""
        rows.append({
            "festival_name": name,
            "start_date": start.strftime("%Y-%m-%d"),
            "end_date": end.strftime("%Y-%m-%d"),
            "province": normalize_text(row.get("개최장소_시도")),
            "city": normalize_text(row.get("개최장소_시군구")),
            "town": normalize_text(row.get("개최장소_읍면동")),
            "addr": normalize_text(row.get("addr1")),
            "first_image": first_image,
            "detail_url": detail_url,
        })
    rows.sort(key=lambda x: (x["start_date"], x["festival_name"]))
    return rows


def get_origin_candidates_by_region(region: str, data: Optional[DataBundle] = None) -> List[str]:
    if data is None:
        data = load_all_data()
    region = normalize_text(region)
    candidates = set()
    for ds_name in TRANSPORT_DATASETS:
        df = getattr(data, ds_name)
        sub = df[df["출발지_광역지자체"].astype(str).map(normalize_text) == region]
        for v in sub["출발지"].dropna().astype(str).tolist():
            nv = normalize_text(v)
            if nv:
                candidates.add(nv)
    return sorted(candidates)


def get_origin_options_by_region(region: str) -> List[str]:
    if normalize_text(region) not in [normalize_text(x) for x in REGION_OPTIONS]:
        return []
    return get_origin_candidates_by_region(region, load_all_data())


# TRANSPORT_DATASETS 각 데이터셋명 → 사용자 표시용 교통수단 레이블 매핑
_DATASET_MODE_LABEL: Dict[str, str] = {
    "ktx":       "KTX",
    "srt":       "SRT",
    "bus":       "고속버스",
    "mugunghwa": "무궁화호·누리로",
}


def get_origin_options_by_region_grouped(region: str) -> Dict[str, List[str]]:
    """
    광역지자체 선택 후 교통수단별 출발지 목록을 반환한다.

    반환 형태:
    {
        "KTX":           ["서울", "수원", ...],
        "SRT":           ["수서", ...],
        "고속버스":       ["동서울", "센트럴시티", ...],
        "무궁화호·누리로": ["서울", "청량리", ...],
    }
    빈 교통수단 키는 포함하지 않는다.
    """
    if normalize_text(region) not in [normalize_text(x) for x in REGION_OPTIONS]:
        return {}

    data = load_all_data()
    region_norm = normalize_text(region)
    result: Dict[str, List[str]] = {}

    for ds_name in TRANSPORT_DATASETS:
        label = _DATASET_MODE_LABEL.get(ds_name, ds_name)
        df = getattr(data, ds_name)
        sub = df[df["출발지_광역지자체"].astype(str).map(normalize_text) == region_norm]
        candidates = sorted({
            normalize_text(v)
            for v in sub["출발지"].dropna().astype(str).tolist()
            if normalize_text(v)
        })
        if candidates:
            result[label] = candidates

    return result


# ---------------------------------------------------------------------------
# 입력값 검증
# ---------------------------------------------------------------------------

def validate_stage1_input(user_input: Dict[str, Any]) -> None:
    required = [
        "festival_name", "origin_region", "origin_name", "people",
        "start_date", "end_date", "companion_type", "keywords", "include_items",
    ]
    missing = [k for k in required if k not in user_input]
    if missing:
        raise ValueError(f"1차 필터링용 필수 입력 누락: {missing}")

    if user_input["companion_type"] not in COMPANION_TYPES:
        raise ValueError("유효하지 않은 동반자 유형입니다.")

    keywords = user_input["keywords"]
    if not isinstance(keywords, list) or len(keywords) > 3:
        raise ValueError("키워드는 0~3개여야 합니다.")
    invalid_keywords = [k for k in keywords if k not in KEYWORDS]
    if invalid_keywords:
        raise ValueError(f"유효하지 않은 키워드: {invalid_keywords}")

    include_items = set(user_input["include_items"])
    if not include_items or not include_items.issubset(INCLUDE_ITEMS):
        raise ValueError("포함 항목이 올바르지 않습니다.")

    people = user_input["people"]
    if not isinstance(people, int) or people < 1:
        raise ValueError("인원은 1 이상 정수여야 합니다.")

    s = pd.to_datetime(user_input["start_date"], errors="coerce")
    e = pd.to_datetime(user_input["end_date"], errors="coerce")
    if pd.isna(s) or pd.isna(e) or e < s:
        raise ValueError("날짜 입력이 올바르지 않습니다.")

    if "숙박" in include_items and stay_nights(user_input["start_date"], user_input["end_date"]) < 1:
        raise ValueError("숙박을 포함하면 종료일은 시작일 다음 날 이상이어야 합니다.")

    if normalize_text(user_input["origin_region"]) not in [normalize_text(x) for x in REGION_OPTIONS]:
        raise ValueError("유효하지 않은 출발지 광역지자체입니다.")


def validate_user_input(user_input: Dict[str, Any]) -> None:
    validate_stage1_input(user_input)
    budget = parse_int(user_input.get("budget_max"))
    if budget is None or budget <= 0:
        raise ValueError("예산 최대금액이 올바르지 않습니다.")


# ---------------------------------------------------------------------------
# 축제 위치 조회
# ---------------------------------------------------------------------------

def find_exact_festival(festival_name: str, data: DataBundle) -> pd.Series:
    matched = data.festivals[
        data.festivals["축제명"].astype(str).map(normalize_text) == normalize_text(festival_name)
    ]
    if matched.empty:
        raise ValueError(f"축제명 100% 일치 실패: {festival_name}")
    return matched.iloc[0]


def validate_festival_dates(festival_row: pd.Series, start_date: str, end_date: str) -> None:
    fs = pd.to_datetime(festival_row["개최기간_시작"], errors="coerce")
    fe = pd.to_datetime(festival_row["개최기간_종료"], errors="coerce")
    us = pd.to_datetime(start_date)
    ue = pd.to_datetime(end_date)
    if pd.notna(fs) and us < fs:
        raise ValueError("선택 시작일이 축제 개최기간보다 빠릅니다.")
    if pd.notna(fe) and ue > fe:
        raise ValueError("선택 종료일이 축제 개최기간보다 늦습니다.")


def get_festival_location(festival_row: pd.Series) -> Dict[str, Any]:
    lat = parse_float(festival_row["mapy"])
    lon = parse_float(festival_row["mapx"])
    if lat is None or lon is None:
        raise ValueError("축제 위경도를 읽지 못했습니다.")

    start_dt = pd.to_datetime(festival_row["개최기간_시작"], errors="coerce")
    end_dt = pd.to_datetime(festival_row["개최기간_종료"], errors="coerce")

    return {
        "festival_name": normalize_text(festival_row["축제명"]),
        "province": normalize_text(festival_row["개최장소_시도"]),
        "city": normalize_text(festival_row["개최장소_시군구"]),
        "town": normalize_text(festival_row["개최장소_읍면동"]),
        "addr": normalize_text(festival_row["addr1"]),
        "lat": lat,
        "lon": lon,
        "start_date": start_dt.strftime("%Y-%m-%d") if pd.notna(start_dt) else "",
        "end_date": end_dt.strftime("%Y-%m-%d") if pd.notna(end_dt) else "",
    }


def validate_origin(region: str, origin_name: str, data: DataBundle) -> None:
    candidates = get_origin_candidates_by_region(region, data)
    normalized_candidates = {normalize_text(x) for x in candidates}
    if normalize_text(origin_name) not in normalized_candidates:
        raise ValueError(f"선택한 출발지가 해당 광역지자체 후보에 없습니다. region={region}, origin={origin_name}")


# ---------------------------------------------------------------------------
# 교통 조회
# ---------------------------------------------------------------------------

def transport_routes_from_df(
    df: pd.DataFrame,
    mode: str,
    origin_region: str,
    origin_name: str,
    festival_loc: Dict[str, Any],
    people: int,
) -> List[Dict[str, Any]]:
    sub = df[
        (df["출발지_광역지자체"].astype(str).map(normalize_text) == normalize_text(origin_region))
        & (df["출발지"].astype(str).map(normalize_text) == normalize_text(origin_name))
    ].copy()

    if sub.empty:
        return []

    fare_cols = [c for c in df.columns if c.startswith("요금")]
    routes = []

    for _, row in sub.iterrows():
        fares = [parse_int(row[c]) for c in fare_cols]
        unit_fare = min_positive(fares)
        if unit_fare is None:
            continue

        dlat = parse_float(row["도착지_위도"])
        dlon = parse_float(row["도착지_경도"])
        if dlat is None or dlon is None:
            continue

        dist = haversine_km(dlat, dlon, festival_loc["lat"], festival_loc["lon"])
        routes.append({
            "mode": mode,
            "origin_name": normalize_text(row["출발지"]),
            "origin_region": normalize_text(row["출발지_광역지자체"]),
            "dest_name": normalize_text(row["도착지"]),
            "dest_region": normalize_text(row["도착지_광역지자체"]),
            "dest_city": normalize_text(row["도착지_기초지자체"]),
            "dest_lat": dlat,
            "dest_lon": dlon,
            "unit_fare": unit_fare,
            "total_fare": unit_fare * people,
            "distance_to_festival_km": round(dist, 3),
        })

    return routes


def find_transport_option(
    origin_region: str,
    origin_name: str,
    festival_loc: Dict[str, Any],
    people: int,
    data: DataBundle,
) -> Optional[Dict[str, Any]]:
    all_routes = []
    for ds_name in TRANSPORT_DATASETS:
        all_routes.extend(
            transport_routes_from_df(
                getattr(data, ds_name),
                ds_name,
                origin_region,
                origin_name,
                festival_loc,
                people,
            )
        )

    if not all_routes:
        return None

    best_by_dest = {}
    for r in all_routes:
        key = (r["dest_name"], r["dest_region"], r["dest_city"])
        prev = best_by_dest.get(key)
        if prev is None or r["unit_fare"] < prev["unit_fare"]:
            best_by_dest[key] = r

    candidates = list(best_by_dest.values())
    candidates.sort(key=lambda x: (x["distance_to_festival_km"], x["unit_fare"], x["mode"]))
    return candidates[0]


# ---------------------------------------------------------------------------
# 렌터카 조회
# ---------------------------------------------------------------------------

def get_rentcar_catalog() -> List[Dict[str, Any]]:
    dedup = {}
    for car_name, capacity, sale_price, regular_price in RENTCAR_RAW_SPECS:
        name = normalize_text(car_name)
        item = {
            "car_name": name,
            "capacity": int(capacity),
            "sale_price": int(sale_price),
            "regular_price": int(regular_price),
            "discount_amount": max(0, int(regular_price) - int(sale_price)),
            "discount_rate": round(discount_rate(int(regular_price), int(sale_price)), 4),
        }
        if name in dedup:
            prev = dedup[name]
            if prev != item:
                raise ValueError(f"렌터카 하드코딩 중복 충돌: {name}")
        else:
            dedup[name] = item
    return list(dedup.values())


def make_rentcar_selection_message(candidates: List[Dict[str, Any]]) -> str:
    return ""


def build_rentcar_group(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    sorted_candidates = sorted(
        candidates,
        key=lambda x: (x["sale_price"], x["regular_price"], -x["capacity"], x["car_name"])
    )
    sale_price = sorted_candidates[0]["sale_price"]
    tied = [x for x in sorted_candidates if x["sale_price"] == sale_price]
    regular_min = tied[0]["regular_price"]
    regular_max = tied[-1]["regular_price"]
    conservative_regular = regular_min

    payload_candidates = []
    for x in tied:
        payload_candidates.append({
            "car_name": x["car_name"],
            "capacity": x["capacity"],
            "sale_price": x["sale_price"],
            "regular_price": x["regular_price"],
            "discount_amount": max(0, x["regular_price"] - x["sale_price"]),
            "discount_rate": round(discount_rate(x["regular_price"], x["sale_price"]), 4),
        })

    note = ""
    if len(tied) > 1 and regular_min != regular_max:
        note = "동일 최저가 차량 간 정가가 달라 절감액/절감율은 최저 정가 기준으로 계산했습니다."

    return {
        "car_name": tied[0]["car_name"] if len(tied) == 1 else " / ".join([x["car_name"] for x in tied]),
        "capacity": tied[0]["capacity"] if len(tied) == 1 else None,
        "candidate_count": len(tied),
        "selection_mode": "single" if len(tied) == 1 else "user_choice",
        "selection_message": make_rentcar_selection_message(tied),
        "selection_note": note,
        "sale_price": sale_price,
        "regular_price": conservative_regular,
        "regular_price_min": regular_min,
        "regular_price_max": regular_max,
        "discount_amount": max(0, conservative_regular - sale_price),
        "discount_rate": round(discount_rate(conservative_regular, sale_price), 4),
        "score": round(100 - sale_price / 1000.0, 3),
        "candidates": payload_candidates,
    }


def find_socar_options(people: int) -> List[Dict[str, Any]]:
    catalog = get_rentcar_catalog()
    feasible = [x for x in catalog if x["capacity"] >= people]
    if not feasible:
        return []
    cheapest_sale = min(x["sale_price"] for x in feasible)
    cheapest_candidates = [x for x in feasible if x["sale_price"] == cheapest_sale]
    cheapest_candidates.sort(key=lambda x: (x["regular_price"], -x["capacity"], x["car_name"]))
    return [build_rentcar_group(cheapest_candidates)]


# ---------------------------------------------------------------------------
# 숙박 조회/스코어링
# ---------------------------------------------------------------------------

def lodging_preference_result(
    row: pd.Series, companion_type: str
) -> Dict[str, Any]:
    """숙소유형 컬럼값 + 시설/서비스 태그를 LODGING_TYPE_SCORE, LODGING_FACILITY_SCORE에
    직접 매핑하여 동반자 가산점을 계산한다.
    숙소유형 가산점과 시설태그 가산점은 모두 합산(소프트필터).

    반환값:
        score                  : float  — 총 가산점
        type_matched_companion : bool      — 숙소유형에서 동반자 점수 발생 여부
        matched_tags           : List[str] — 시설 태그 중 점수 발생 태그 목록
    """
    score = 0.0
    type_matched_companion: bool = False
    matched_tags: List[str] = []

    # ── 1. 숙소유형 가산점 ──────────────────────────────────────
    accom_type = str(row.get("숙소유형", "")).strip()
    type_map = LODGING_TYPE_SCORE.get(accom_type)
    if type_map:
        companion_pts = type_map["companions"].get(companion_type, 0)
        if companion_pts:
            score += companion_pts
            type_matched_companion = True

    # ── 2. 시설/서비스 태그 가산점 ─────────────────────────────
    facility_raw = str(row.get("시설/서비스", ""))
    if facility_raw:
        tags = {t.strip() for t in facility_raw.split(",") if t.strip()}
        for tag in tags:
            tag_map = LODGING_FACILITY_SCORE.get(tag)
            if not tag_map:
                continue
            companion_pts = tag_map["companions"].get(companion_type, 0)
            if companion_pts:
                score += companion_pts
                matched_tags.append(tag)

    return {
        "score": score,
        "type_matched_companion": type_matched_companion,
        "matched_tags": matched_tags,
    }


def lodging_preference_score(row: pd.Series, companion_type: str) -> float:
    """하위호환용 래퍼. 점수만 필요한 호출부에서 사용."""
    return lodging_preference_result(row, companion_type)["score"]


def representative_lodging_unit_price(row: pd.Series) -> Optional[int]:
    return min_positive([
        parse_int(row.get("평일판매가")),
        parse_int(row.get("주말판매가")),
        parse_int(row.get("평일정가")),
        parse_int(row.get("주말정가")),
    ])


def calculate_average_lodging_price_by_region(province: str, city: str, data: DataBundle) -> Optional[int]:
    prices = []
    for ds_name in LODGING_DATASETS:
        df = getattr(data, ds_name)
        sub = df[df["시도명"].astype(str).map(normalize_text) == normalize_text(province)]
        if city:
            city_sub = sub[sub["시군구명"].astype(str).map(normalize_text) == normalize_text(city)]
            if not city_sub.empty:
                sub = city_sub
        for _, row in sub.iterrows():
            p = representative_lodging_unit_price(row)
            if p is not None and p > 0:
                prices.append(p)
    if not prices:
        return None
    return int(sum(prices) / len(prices))


def lodging_price_for_stay(row: pd.Series, start_date: str, end_date: str) -> Tuple[Optional[int], Optional[int]]:
    nights = stay_dates(start_date, end_date)
    if not nights:
        return None, None

    sale_total = 0
    regular_total = 0
    for dt in nights:
        if day_kind(dt) == "weekend":
            sale = parse_int(row.get("주말판매가"))
            regular = parse_int(row.get("주말정가"))
        else:
            sale = parse_int(row.get("평일판매가"))
            regular = parse_int(row.get("평일정가"))
        if sale is None or sale <= 0:
            return None, None
        if regular is None or regular <= 0:
            regular = sale
        sale_total += sale
        regular_total += regular
    return sale_total, regular_total


def score_lodging_row(
    row: pd.Series,
    dataset_type: str,
    user_input: Dict[str, Any],
    festival_loc: Dict[str, Any],
    avg_region_price: Optional[int],
    precomputed_dist: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    lat = parse_float(row.get("위도"))
    lon = parse_float(row.get("경도"))
    if lat is None or lon is None:
        return None

    dist = precomputed_dist if precomputed_dist is not None else haversine_km(lat, lon, festival_loc["lat"], festival_loc["lon"])
    if dist > LODGING_RADIUS_KM:
        return None

    max_people = parse_int(row.get("최대인원"))
    if max_people is not None and max_people < user_input["people"]:
        return None

    if "렌터카" in set(user_input["include_items"]):
        if not safe_str_contains(row.get("시설/서비스", ""), PARKING_TOKENS):
            return None

    sale_price, regular_price = lodging_price_for_stay(
        row, user_input["start_date"], user_input["end_date"]
    )
    if sale_price is None:
        return None

    # 반려동물과 함께 동반자 선택 시: "반려동물 동반 가능" 태그 없으면 하드필터로 제거
    if user_input["companion_type"] == "반려동물과 함께":
        facility_tags = {t.strip() for t in str(row.get("시설/서비스", "")).split(",") if t.strip()}
        if "반려동물 동반 가능" not in facility_tags:
            return None

    score = 0.0
    nights = max(1, stay_nights(user_input["start_date"], user_input["end_date"]))

    # 숙소유형 + 시설/서비스 태그 가산점 — 근거 데이터도 함께 수집
    pref = lodging_preference_result(row, user_input["companion_type"])
    score += pref["score"]
    type_matched_companion: bool = pref["type_matched_companion"]
    matched_tags: List[str] = list(pref["matched_tags"])  # 복사본 (하드필터 태그 추가 예정)

    # 하드필터 통과 근거 태그 — 점수와 무관하게 항상 포함
    if "렌터카" in set(user_input["include_items"]):
        facility_raw = str(row.get("시설/서비스", ""))
        actual_tags = {t.strip() for t in facility_raw.split(",") if t.strip()}
        for tag in actual_tags:
            tag_lower = tag.lower()
            if any(token in tag_lower for token in PARKING_TOKENS):
                if tag not in matched_tags:
                    matched_tags.append(tag)

    if user_input["companion_type"] == "반려동물과 함께":
        if "반려동물 동반 가능" not in matched_tags:
            matched_tags.append("반려동물 동반 가능")

    # 거리 점수
    score += max(0.0, 20.0 - dist * 0.8)

    # 지역 평균가 대비 가격 점수
    if avg_region_price and avg_region_price > 0:
        baseline = avg_region_price * nights
        relative = max(-0.5, min(0.5, (baseline - sale_price) / max(1, baseline)))
        score += relative * 40.0

    rating = parse_float(row.get("후기평점"))
    if rating is not None:
        score += rating * 5.0

    review_count = parse_int(row.get("후기수"))
    if review_count is not None:
        score += min(10.0, math.log10(review_count + 1) * 3.0)

    d_rate = discount_rate(regular_price, sale_price)

    return {
        "dataset_type": dataset_type,
        "name": normalize_text(row.get("숙소명")),
        "room_name": normalize_text(row.get("객실명")),
        "accommodation_type_text": normalize_text(row.get("숙소유형")),
        "lat": lat,
        "lon": lon,
        "distance_to_festival_km": round(dist, 3),
        "province": normalize_text(row.get("시도명")),
        "city": normalize_text(row.get("시군구명")),
        "address": normalize_text(row.get("주소")),
        "sale_price": sale_price,
        "regular_price": regular_price,
        "discount_amount": max(0, regular_price - sale_price),
        "discount_rate": round(d_rate, 4),
        "rating": rating,
        "review_count": review_count,
        "max_people": max_people,
        "facilities": normalize_text(row.get("시설/서비스")),
        "url": normalize_text(row.get("상세페이지url")),
        "image": normalize_text(row.get("대표이미지")),
        "id": normalize_text(row.get("숙소ID")),
        "score": round(score + d_rate * 15.0, 3),
        "type_matched_companion": type_matched_companion,
        "matched_tags": matched_tags,
    }


def find_accommodation_candidates(
    user_input: Dict[str, Any],
    festival_loc: Dict[str, Any],
    data: DataBundle,
) -> List[Dict[str, Any]]:
    avg_price = calculate_average_lodging_price_by_region(festival_loc["province"], festival_loc["city"], data)
    f_lat = festival_loc["lat"]
    f_lon = festival_loc["lon"]
    province = normalize_text(festival_loc["province"])
    candidates = []

    for ds_name in LODGING_DATASETS:
        df = getattr(data, ds_name)

        # 1단계: 시도명으로 1차 필터 (47K → 수천 행 수준)
        if province:
            province_mask = df["시도명"].astype(str).map(normalize_text) == province
            sub = df[province_mask].copy()
        else:
            sub = df.copy()

        if sub.empty:
            continue

        # 2단계: 위도/경도 유효한 행만 추출
        lats_s = sub["위도"].apply(parse_float)
        lons_s = sub["경도"].apply(parse_float)
        valid_mask = lats_s.notna() & lons_s.notna()
        sub = sub[valid_mask].copy()
        if sub.empty:
            continue

        lats_arr = lats_s[valid_mask].values.astype(float)
        lons_arr = lons_s[valid_mask].values.astype(float)

        # 3단계: 벡터화 haversine으로 전체 거리 한 번에 계산
        dists = haversine_km_vectorized(lats_arr, lons_arr, f_lat, f_lon)

        # 4단계: 15km 이내 행만 필터링
        dist_mask = dists <= LODGING_RADIUS_KM
        sub = sub[dist_mask].copy()
        dists_filtered = dists[dist_mask]

        if sub.empty:
            continue

        # 5단계: 15km 이내로 확정된 행만 Python 루프 처리
        for (_, row), dist in zip(sub.iterrows(), dists_filtered):
            item = score_lodging_row(row, ds_name, user_input, festival_loc, avg_price, precomputed_dist=float(dist))
            if item:
                candidates.append(item)

    candidates.sort(key=lambda x: (-x["score"], x["sale_price"], x["distance_to_festival_km"], x["name"]))
    return candidates


# ---------------------------------------------------------------------------
# 레저 조회/스코어링
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 레저 조회/스코어링
# ---------------------------------------------------------------------------

# 사용자가 선택한 레저 대분류(키워드)와 일치하는 상품에 부여하는 압도적 가산점.
# 이 값이 기타 모든 점수(거리+평점+리뷰+할인율)의 현실적 최대합(~67점)을 크게
# 상회해야, 선택 대분류 상품이 항상 비선택 대분류 상품보다 앞에 오도록 보장된다.
LEISURE_CATEGORY_MATCH_BONUS = 100.0


def leisure_text_blob(row: pd.Series, schema: Dict[str, Any]) -> str:
    cols = []
    if schema["name"]:
        cols.append(schema["name"])
    cols.extend(schema["text_cols"])
    return text_join([row.get(c) for c in cols])


def leisure_distance_allowed(
    lat: float,
    lon: float,
    festival_loc: Dict[str, Any],
    lodging: Optional[Dict[str, Any]],
) -> Tuple[bool, float, float, float]:
    d_festival = haversine_km(lat, lon, festival_loc["lat"], festival_loc["lon"])
    if lodging is None:
        return d_festival <= LEISURE_RADIUS_KM, d_festival, d_festival, 0.0

    d_lodge = haversine_km(lat, lon, lodging["lat"], lodging["lon"])
    d_lodge_festival = haversine_km(lodging["lat"], lodging["lon"], festival_loc["lat"], festival_loc["lon"])
    ok = (d_lodge + d_festival) <= (d_lodge_festival + ELLIPSE_EXTRA_KM)
    return ok, min(d_festival, d_lodge), d_festival, d_lodge


def score_leisure_row(
    row: pd.Series,
    schema: Dict[str, Any],
    user_input: Dict[str, Any],
    festival_loc: Dict[str, Any],
    lodging: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not schema["lat"] or not schema["lon"] or not schema["name"]:
        return None

    lat = parse_float(row.get(schema["lat"]))
    lon = parse_float(row.get(schema["lon"]))
    if lat is None or lon is None:
        return None

    allowed, anchor_dist, d_festival, d_lodge = leisure_distance_allowed(lat, lon, festival_loc, lodging)
    if not allowed:
        return None

    unit_sale_price = parse_int(row.get(schema["sale_price"])) if schema["sale_price"] else 0
    unit_regular_price = parse_int(row.get(schema["regular_price"])) if schema["regular_price"] else unit_sale_price
    unit_sale_price = unit_sale_price or 0
    unit_regular_price = unit_regular_price or unit_sale_price

    people = int(user_input["people"])
    sale_price = unit_sale_price * people
    regular_price = unit_regular_price * people

    score = 0.0
    score += max(0.0, 20.0 - anchor_dist * 0.8)

    rating = parse_float(row.get(schema["rating"])) if schema["rating"] else None
    if rating is not None:
        score += rating * 5.0

    review_count = parse_int(row.get(schema["review_count"])) if schema["review_count"] else None
    if review_count is not None:
        score += min(10.0, math.log10(review_count + 1) * 3.0)

    d_rate = discount_rate(regular_price, sale_price)
    score += d_rate * 12.0

    # 선택 대분류(키워드) 일치 시 압도적 가산점 — 소프트 필터링의 핵심
    # keywords가 비어 있으면(미선택) 가산점 없이 거리+평점+할인율만으로 스코어링
    selected_categories = user_input.get("keywords", [])
    cat_col = schema.get("category")
    cat_val = normalize_compact(row.get(cat_col, "")) if cat_col else ""
    category_matched = False
    if selected_categories and cat_col and cat_val:
        for kw in selected_categories:
            if normalize_compact(kw) == cat_val:
                score += LEISURE_CATEGORY_MATCH_BONUS
                category_matched = True
                break

    return {
        "name": normalize_text(row.get(schema["name"])),
        "category": normalize_text(row.get(cat_col)) if cat_col else "",
        "lat": lat,
        "lon": lon,
        "distance_anchor_km": round(anchor_dist, 3),
        "distance_to_festival_km": round(d_festival, 3),
        "distance_to_lodging_km": round(d_lodge, 3),
        "people_applied": people,
        "unit_sale_price": unit_sale_price,
        "unit_regular_price": unit_regular_price,
        "sale_price": sale_price,
        "regular_price": regular_price,
        "discount_amount": max(0, regular_price - sale_price),
        "discount_rate": round(d_rate, 4),
        "rating": rating,
        "review_count": review_count,
        "url": normalize_text(row.get(schema["url"])) if schema["url"] else "",
        "image": normalize_text(row.get(schema["image"])) if schema["image"] else "",
        "id": normalize_text(row.get(schema["id"])) if schema["id"] else "",
        "score": round(score, 3),
        "category_matched": category_matched,
    }


def find_leisure_candidates(
    user_input: Dict[str, Any],
    festival_loc: Dict[str, Any],
    data: DataBundle,
    lodging: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    schema = data.leisure_schema
    items = []
    for _, row in data.leisure.iterrows():
        scored = score_leisure_row(row, schema, user_input, festival_loc, lodging)
        if scored:
            items.append(scored)
    items.sort(key=lambda x: (-x["score"], x["sale_price"], x["name"]))

    # 레저명 기준 중복 제거: 같은 이름 중 점수 가장 높은 1개(정렬 후 첫 번째)만 유지
    seen_names: set = set()
    deduped = []
    for item in items:
        name = item["name"]
        if name not in seen_names:
            seen_names.add(name)
            deduped.append(item)

    return deduped[:10]


# ---------------------------------------------------------------------------
# 패키지 조합 / 중복 제거
# ---------------------------------------------------------------------------

def package_signature(pkg: Dict[str, Any]) -> str:
    transport = pkg.get("transport") or {}
    lodging = pkg.get("lodging") or {}
    rentcar = pkg.get("rentcar") or {}
    leisure = pkg.get("leisure") or []
    leisure_names = sorted([x["name"] for x in leisure])

    rentcar_names = []
    if rentcar:
        candidates = rentcar.get("candidates") or []
        if candidates:
            rentcar_names = sorted([x["car_name"] for x in candidates])
        elif rentcar.get("car_name"):
            rentcar_names = [rentcar["car_name"]]

    return "|".join([
        transport.get("mode", ""),
        transport.get("dest_name", ""),
        lodging.get("name", ""),
        lodging.get("room_name", ""),
        ",".join(rentcar_names),
        *leisure_names,
    ])


def calculate_minimum_budget_from_packages(packages: List[Dict[str, Any]]) -> int:
    if not packages:
        raise ValueError("최소 예산을 계산할 후보 패키지가 없습니다.")
    return int(min(p["total_sale_price"] for p in packages))


def generate_leisure_pairs(leisure_candidates: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if len(leisure_candidates) < 2:
        return []
    return [list(x) for x in itertools.combinations(leisure_candidates, 2)]


def build_package(
    include_items: List[str],
    transport: Optional[Dict[str, Any]],
    lodging: Optional[Dict[str, Any]],
    rentcar: Optional[Dict[str, Any]],
    leisure_items: List[Dict[str, Any]],
    reference_budget: Optional[int] = None,
) -> Dict[str, Any]:
    total_sale = 0
    total_regular = 0
    total_score = 0.0

    if "교통" in include_items and transport:
        total_sale += transport["total_fare"]
        total_regular += transport["total_fare"]
        total_score += max(0.0, 20 - transport["distance_to_festival_km"] * 0.3)

    if "숙박" in include_items and lodging:
        total_sale += lodging["sale_price"]
        total_regular += lodging["regular_price"]
        total_score += lodging["score"]

    if "렌터카" in include_items and rentcar:
        total_sale += rentcar["sale_price"]
        total_regular += rentcar["regular_price"]
        total_score += rentcar["score"]

    if "레저" in include_items:
        for item in leisure_items:
            total_sale += item["sale_price"]
            total_regular += item["regular_price"]
            total_score += item["score"]

    discount_amount = max(0, total_regular - total_sale)
    discount_ratio = discount_amount / total_regular if total_regular > 0 else 0.0

    cost_penalty = 0.0
    if reference_budget is not None and reference_budget > 0:
        cost_penalty = (total_sale / max(1, reference_budget)) * 8.0

    base_score = round(total_score, 3)
    score = round(base_score - cost_penalty, 3)

    pkg = {
        "transport": transport if "교통" in include_items else None,
        "lodging": lodging if "숙박" in include_items else None,
        "rentcar": rentcar if "렌터카" in include_items else None,
        "leisure": leisure_items if "레저" in include_items else [],
        "total_sale_price": int(total_sale),
        "total_regular_price": int(total_regular),
        "total_discount_amount": int(discount_amount),
        "total_discount_rate": round(discount_ratio, 4),
        "base_score": base_score,
        "cost_penalty": round(cost_penalty, 3),
        "score": score,
        "over_budget": None if reference_budget is None else total_sale > reference_budget,
        "special_pass": None if reference_budget is None else (
            reference_budget < total_sale <= int(reference_budget * SPECIAL_BUDGET_MULTIPLIER)
        ),
    }
    pkg["signature"] = package_signature(pkg)
    return pkg


def build_package_combinations(
    user_input: Dict[str, Any],
    festival_loc: Dict[str, Any],
    data: DataBundle,
    transport_option: Optional[Dict[str, Any]],
    lodging_candidates: List[Dict[str, Any]],
    rentcar_candidates: List[Dict[str, Any]],
    reference_budget: Optional[int] = None,
) -> List[Dict[str, Any]]:
    include_items = user_input["include_items"]
    packages = []

    if "숙박" in include_items:
        seen_lodging_ids: set = set()
        lodging_pool = []
        for candidate in lodging_candidates:
            lodging_id = candidate.get("id")
            if lodging_id not in seen_lodging_ids:
                seen_lodging_ids.add(lodging_id)
                lodging_pool.append(candidate)
            if len(lodging_pool) >= 20:
                break
    else:
        lodging_pool = [None]
    rentcar_pool = (rentcar_candidates[:5] if rentcar_candidates else [None]) if "렌터카" in include_items else [None]

    if "레저" in include_items:
        if "숙박" in include_items:
            for lodging in lodging_pool:
                leisure_candidates = find_leisure_candidates(user_input, festival_loc, data, lodging)
                pairs = generate_leisure_pairs(leisure_candidates)
                for pair in pairs:
                    for rentcar in rentcar_pool:
                        packages.append(build_package(
                            include_items, transport_option, lodging, rentcar, pair, reference_budget
                        ))
        else:
            leisure_candidates = find_leisure_candidates(user_input, festival_loc, data, None)
            pairs = generate_leisure_pairs(leisure_candidates)
            for pair in pairs:
                for rentcar in rentcar_pool:
                    packages.append(build_package(
                        include_items, transport_option, None, rentcar, pair, reference_budget
                    ))
    else:
        for lodging in lodging_pool:
            for rentcar in rentcar_pool:
                packages.append(build_package(
                    include_items, transport_option, lodging, rentcar, [], reference_budget
                ))

    return packages


def deduplicate_packages(packages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    best = {}
    for pkg in packages:
        sig = pkg["signature"]
        prev = best.get(sig)
        if prev is None:
            best[sig] = pkg
            continue

        prev_key = (
            prev.get("base_score", prev["score"]),
            -prev["total_sale_price"],
            prev["total_discount_amount"],
        )
        cur_key = (
            pkg.get("base_score", pkg["score"]),
            -pkg["total_sale_price"],
            pkg["total_discount_amount"],
        )
        if cur_key > prev_key:
            best[sig] = pkg

    return list(best.values())


def rerank_packages_for_budget(packages: List[Dict[str, Any]], budget_max: int) -> List[Dict[str, Any]]:
    ranked = []
    for pkg in packages:
        p = dict(pkg)
        cost_penalty = (p["total_sale_price"] / max(1, budget_max)) * 8.0
        p["cost_penalty"] = round(cost_penalty, 3)
        p["score"] = round(p.get("base_score", p["score"]) - cost_penalty, 3)
        p["over_budget"] = p["total_sale_price"] > budget_max
        p["special_pass"] = budget_max < p["total_sale_price"] <= int(budget_max * SPECIAL_BUDGET_MULTIPLIER)
        ranked.append(p)
    return ranked


def _apply_diversity_filter(
    candidates: List[Dict[str, Any]],
    max_count: int,
    lodging_counter: Dict[str, int],
    leisure_counter: Dict[str, int],
) -> List[Dict[str, Any]]:
    """
    score 내림차순 정렬된 candidates를 순회하면서 diversity cap을 적용해
    최대 max_count개의 패키지를 선발한다.

    lodging_counter, leisure_counter는 호출자가 관리하는 카운터 dict로,
    within → special 순서로 이어받아 전체 통합 cap을 구현한다.
    두 dict는 이 함수 내에서 직접 수정된다(in-place).

    cap 규칙:
    - 동일 숙소ID(lodging["id"])가 lodging_counter에서 LODGING_DIVERSITY_CAP 이상이면 skip
    - 동일 레저명이 leisure_counter에서 LEISURE_DIVERSITY_CAP 이상이면 skip
      (pair 내 레저 2개 중 하나라도 cap 초과 시 해당 패키지 skip)
    """
    result = []
    for pkg in candidates:
        if len(result) >= max_count:
            break

        # ── 숙소 cap 검사 ───────────────────────────────────────
        lodging = pkg.get("lodging")
        lodging_id = lodging.get("id") if lodging else None
        if lodging_id and lodging_counter.get(lodging_id, 0) >= LODGING_DIVERSITY_CAP:
            continue

        # ── 레저 cap 검사 ───────────────────────────────────────
        leisure_items = pkg.get("leisure") or []
        leisure_names = [item["name"] for item in leisure_items if item.get("name")]
        if any(leisure_counter.get(name, 0) >= LEISURE_DIVERSITY_CAP for name in leisure_names):
            continue

        # ── 선발 확정 후 카운터 갱신 ────────────────────────────
        if lodging_id:
            lodging_counter[lodging_id] = lodging_counter.get(lodging_id, 0) + 1
        for name in leisure_names:
            leisure_counter[name] = leisure_counter.get(name, 0) + 1

        result.append(pkg)

    return result


def split_budget_and_special(
    packages: List[Dict[str, Any]],
    budget_min: int,
    budget_max: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    ranked = rerank_packages_for_budget(packages, budget_max)

    within_pool = [p for p in ranked if budget_min <= p["total_sale_price"] <= budget_max]
    special_pool = [p for p in ranked if budget_max < p["total_sale_price"] <= int(budget_max * SPECIAL_BUDGET_MULTIPLIER)]

    within_pool.sort(key=lambda x: (-x["score"], x["total_sale_price"], -x["total_discount_amount"]))
    special_pool.sort(key=lambda x: (-x["score"], x["total_sale_price"], -x["total_discount_amount"]))

    # within → special 순서로 카운터를 이어받아 통합 cap 적용
    lodging_counter: Dict[str, int] = {}
    leisure_counter: Dict[str, int] = {}

    within = _apply_diversity_filter(within_pool, BUDGET_TOP_N, lodging_counter, leisure_counter)
    special = _apply_diversity_filter(special_pool, SPECIAL_TOP_N, lodging_counter, leisure_counter)

    return within, special