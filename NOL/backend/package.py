from __future__ import annotations

from typing import Any, Dict, List, Optional

from config import (
    BUDGET_TOP_N,
    ELLIPSE_EXTRA_KM,
    LEISURE_RADIUS_KM,
    LODGING_RADIUS_KM,
    SPECIAL_BUDGET_MULTIPLIER,
    SPECIAL_TOP_N,
)
from finders import (
    build_package_combinations,
    calculate_minimum_budget_from_packages,
    deduplicate_packages,
    find_accommodation_candidates,
    find_leisure_candidates,
    find_socar_options,
    find_transport_option,
    find_exact_festival,
    get_festival_location,
    split_budget_and_special,
    validate_festival_dates,
    validate_origin,
    validate_stage1_input,
    validate_user_input,
)
from utils import (
    DataBundle,
    load_all_data,
    parse_int,
)

# app.py가 직접 import하는 심볼들을 여기서 re-export
from config import COMPANION_TYPES, KEYWORDS, REGION_OPTIONS  # noqa: F401
from finders import get_festival_catalog, get_origin_options_by_region  # noqa: F401


# ---------------------------------------------------------------------------
# simplify_package
# ---------------------------------------------------------------------------

def _simplify_lodging(lo: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """lodging 객체에서 프론트 필요 필드만 추출. 근거 필드 포함."""
    if lo is None:
        return None
    return {
        "dataset_type":            lo.get("dataset_type"),
        "name":                    lo.get("name"),
        "room_name":               lo.get("room_name"),
        "accommodation_type_text": lo.get("accommodation_type_text"),
        "lat":                     lo.get("lat"),
        "lon":                     lo.get("lon"),
        "distance_to_festival_km": lo.get("distance_to_festival_km"),
        "province":                lo.get("province"),
        "city":                    lo.get("city"),
        "address":                 lo.get("address"),
        "sale_price":              lo.get("sale_price"),
        "regular_price":           lo.get("regular_price"),
        "discount_amount":         lo.get("discount_amount"),
        "discount_rate":           lo.get("discount_rate"),
        "rating":                  lo.get("rating"),
        "review_count":            lo.get("review_count"),
        "max_people":              lo.get("max_people"),
        "facilities":              lo.get("facilities"),
        "url":                     lo.get("url"),
        "image":                   lo.get("image"),
        "id":                      lo.get("id"),
        "score":                   lo.get("score"),
        # 추천 근거 필드
        "type_matched_keywords":   lo.get("type_matched_keywords", []),
        "type_matched_companion":  lo.get("type_matched_companion", False),
        "matched_tags":            lo.get("matched_tags", []),
    }


def _simplify_leisure_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """leisure 항목에서 프론트 필요 필드만 추출. 근거 필드 포함."""
    return {
        "name":                    item.get("name"),
        "lat":                     item.get("lat"),
        "lon":                     item.get("lon"),
        "distance_anchor_km":      item.get("distance_anchor_km"),
        "distance_to_festival_km": item.get("distance_to_festival_km"),
        "distance_to_lodging_km":  item.get("distance_to_lodging_km"),
        "people_applied":          item.get("people_applied"),
        "unit_sale_price":         item.get("unit_sale_price"),
        "unit_regular_price":      item.get("unit_regular_price"),
        "sale_price":              item.get("sale_price"),
        "regular_price":           item.get("regular_price"),
        "discount_amount":         item.get("discount_amount"),
        "discount_rate":           item.get("discount_rate"),
        "rating":                  item.get("rating"),
        "review_count":            item.get("review_count"),
        "url":                     item.get("url"),
        "image":                   item.get("image"),
        "id":                      item.get("id"),
        "score":                   item.get("score"),
        "category":                item.get("category", ""),
        "category_matched":        item.get("category_matched", False),
    }


def simplify_package(pkg: Dict[str, Any], idx: int) -> Dict[str, Any]:
    leisure_raw = pkg.get("leisure") or []
    return {
        "package_id":           f"PKG-{idx:03d}",
        "score":                pkg["score"],
        "total_regular_price":  pkg["total_regular_price"],
        "total_sale_price":     pkg["total_sale_price"],
        "total_discount_amount":pkg["total_discount_amount"],
        "total_discount_rate":  pkg["total_discount_rate"],
        "transport":            pkg["transport"],
        "lodging":              _simplify_lodging(pkg.get("lodging")),
        "rentcar":              pkg["rentcar"],
        "leisure":              [_simplify_leisure_item(i) for i in leisure_raw],
    }


# ---------------------------------------------------------------------------
# Stage 1
# ---------------------------------------------------------------------------

def prepare_stage1_candidates_from_loaded_data(user_input: Dict[str, Any], data: DataBundle) -> Dict[str, Any]:
    validate_stage1_input(user_input)

    festival_row = find_exact_festival(user_input["festival_name"], data)
    validate_festival_dates(festival_row, user_input["start_date"], user_input["end_date"])
    festival_loc = get_festival_location(festival_row)

    validate_origin(user_input["origin_region"], user_input["origin_name"], data)

    transport_option = None
    if "교통" in set(user_input["include_items"]):
        transport_option = find_transport_option(
            user_input["origin_region"],
            user_input["origin_name"],
            festival_loc,
            user_input["people"],
            data,
        )
        if transport_option is None:
            return {
                "success": False,
                "error": "선택한 출발지에서 축제 인근 도착지까지 직통 교통편을 찾지 못했습니다.",
                "stage1_input_summary": user_input,
            }

    lodging_candidates = []
    if "숙박" in set(user_input["include_items"]):
        lodging_candidates = find_accommodation_candidates(user_input, festival_loc, data)
        if not lodging_candidates:
            return {
                "success": False,
                "error": "축제 반경 15km 이내에서 조건에 맞는 숙소 후보를 찾지 못했습니다.",
                "selected_transport_for_budget": transport_option,
                "stage1_input_summary": user_input,
            }

    rentcar_candidates = []
    rentcar_unavailable_message = None
    if "렌터카" in set(user_input["include_items"]):
        rentcar_candidates = find_socar_options(user_input["people"])
        if not rentcar_candidates:
            rentcar_unavailable_message = (
                f"현재 등록된 모든 차종의 최대 정원은 11명입니다. "
                f"입력하신 {user_input['people']}명 규모의 렌터카는 직접 문의 바랍니다."
            )

    packages = build_package_combinations(
        user_input=user_input,
        festival_loc=festival_loc,
        data=data,
        transport_option=transport_option,
        lodging_candidates=lodging_candidates,
        rentcar_candidates=rentcar_candidates,
        reference_budget=None,
    )

    packages = deduplicate_packages(packages)
    if not packages:
        return {
            "success": False,
            "error": "1차 필터링 결과 조건에 맞는 패키지 후보를 생성하지 못했습니다.",
            "selected_transport_for_budget": transport_option,
            "stage1_input_summary": user_input,
        }

    packages.sort(key=lambda x: (x["total_sale_price"], -x.get("base_score", x["score"]), -x["total_discount_amount"]))

    minimum_budget = calculate_minimum_budget_from_packages(packages)
    maximum_candidate_price = max(p["total_sale_price"] for p in packages)
    cheapest_pkg = min(packages, key=lambda x: x["total_sale_price"])

    return {
        "success": True,
        "stage1_input_summary": {
            "festival_name": festival_loc["festival_name"],
            "origin_region": user_input["origin_region"],
            "origin_name": user_input["origin_name"],
            "people": user_input["people"],
            "start_date": user_input["start_date"],
            "end_date": user_input["end_date"],
            "companion_type": user_input["companion_type"],
            "keywords": user_input["keywords"],
            "include_items": user_input["include_items"],
        },
        "festival_loc": festival_loc,
        "selected_transport_for_budget": transport_option,
        "minimum_budget": int(minimum_budget),
        "candidate_count": len(packages),
        "candidate_price_range": {
            "min": int(minimum_budget),
            "max": int(maximum_candidate_price),
        },
        "cheapest_candidate": simplify_package(cheapest_pkg, 1),
        "candidate_packages": packages,
        "rentcar_unavailable_message": rentcar_unavailable_message,
    }


def prepare_stage1_candidates(user_input: Dict[str, Any]) -> Dict[str, Any]:
    return prepare_stage1_candidates_from_loaded_data(user_input, load_all_data())


# ---------------------------------------------------------------------------
# Stage 2
# ---------------------------------------------------------------------------

def format_stage2_response(stage1_result: Dict[str, Any], budget_max: int) -> Dict[str, Any]:
    budget_min = int(stage1_result["minimum_budget"])
    packages = stage1_result["candidate_packages"]
    within_budget, special_pass = split_budget_and_special(packages, budget_min, budget_max)

    input_summary = dict(stage1_result["stage1_input_summary"])
    input_summary["budget_min"] = budget_min
    input_summary["budget_max"] = int(budget_max)

    return {
        "success": True,
        "input_summary": input_summary,
        "minimum_budget": budget_min,
        "maximum_budget": int(budget_max),
        "selected_transport_for_budget": stage1_result["selected_transport_for_budget"],
        "within_budget": [simplify_package(p, i + 1) for i, p in enumerate(within_budget)],
        "special_pass": [simplify_package(p, i + 1) for i, p in enumerate(special_pass)],
        "rentcar_unavailable_message": stage1_result.get("rentcar_unavailable_message"),
        "meta": {
            "candidate_count_before_budget": int(stage1_result["candidate_count"]),
            "candidate_price_min": int(stage1_result["candidate_price_range"]["min"]),
            "candidate_price_max": int(stage1_result["candidate_price_range"]["max"]),
            "within_budget_count": len(within_budget),
            "special_pass_count": len(special_pass),
            "budget_top_n": BUDGET_TOP_N,
            "special_top_n": SPECIAL_TOP_N,
            "special_budget_multiplier": SPECIAL_BUDGET_MULTIPLIER,
            "lodging_radius_km": LODGING_RADIUS_KM,
            "leisure_radius_km": LEISURE_RADIUS_KM,
            "ellipse_extra_km": ELLIPSE_EXTRA_KM,
        },
    }


def generate_packages_from_stage1(stage1_result: Dict[str, Any], budget_max: int) -> Dict[str, Any]:
    budget = parse_int(budget_max)
    if budget is None or budget <= 0:
        return {"success": False, "error": "예산 최대금액이 올바르지 않습니다."}

    if not stage1_result.get("success"):
        return stage1_result

    if "candidate_packages" not in stage1_result or not stage1_result["candidate_packages"]:
        return {"success": False, "error": "1차 필터링 후보 데이터가 없습니다."}

    minimum_budget = int(stage1_result["minimum_budget"])
    if budget < minimum_budget:
        return {
            "success": False,
            "error": f"최대 예산은 최소 예산({minimum_budget:,}원) 이상이어야 합니다.",
            "minimum_budget": minimum_budget,
        }

    return format_stage2_response(stage1_result, int(budget))


def generate_packages(user_input: Dict[str, Any]) -> Dict[str, Any]:
    validate_user_input(user_input)
    stage1_input = {
        "festival_name": user_input["festival_name"],
        "origin_region": user_input["origin_region"],
        "origin_name": user_input["origin_name"],
        "people": user_input["people"],
        "start_date": user_input["start_date"],
        "end_date": user_input["end_date"],
        "companion_type": user_input["companion_type"],
        "keywords": user_input["keywords"],
        "include_items": user_input["include_items"],
    }
    stage1_result = prepare_stage1_candidates(stage1_input)
    if not stage1_result.get("success"):
        return stage1_result
    return generate_packages_from_stage1(stage1_result, user_input["budget_max"])


# ---------------------------------------------------------------------------
# 진입점 (직접 실행 시)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sample_input = {
        "festival_name": "2026 서울무형문화축제",
        "origin_region": "경상북도",
        "origin_name": "경주",
        "people": 2,
        "start_date": "2026-09-12",
        "end_date": "2026-09-13",
        "budget_max": 500000,
        "companion_type": "연인과 여행",
        "keywords": ["문화예술", "호캉스"],
        "include_items": ["교통", "숙박", "렌터카", "레저"],
    }

    from pprint import pprint
    pprint(generate_packages(sample_input))