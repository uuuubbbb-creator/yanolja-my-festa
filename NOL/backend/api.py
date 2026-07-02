from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from package import (
    COMPANION_TYPES,
    KEYWORDS,
    REGION_OPTIONS,
    generate_packages_from_stage1,
    get_festival_catalog,
    get_origin_options_by_region,
    prepare_stage1_candidates,
)
from finders import get_origin_options_by_region_grouped
from utils import load_all_data

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Startup / Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        logger.info("Loading CSV data...")
        load_all_data()
        logger.info("CSV data loaded successfully.")
    except Exception as e:
        logger.exception("Failed to load CSV data during startup.")
        raise RuntimeError(
            f"서버 시작 중 CSV 데이터 로딩 실패: {str(e)}"
        ) from e

    yield

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Festival Package API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포 시 실제 도메인으로 제한 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class Stage1Request(BaseModel):
    festival_name: str

    origin_region: str
    origin_name: str

    people: int = Field(..., ge=1)

    start_date: str
    end_date: str

    companion_type: str

    keywords: List[str] = Field(..., min_length=0, max_length=3)

    include_items: List[str] = Field(..., min_length=1)


class Stage1InputSummary(BaseModel):
    festival_name: str

    origin_region: str
    origin_name: str

    people: int

    start_date: str
    end_date: str

    companion_type: str

    keywords: List[str]

    include_items: List[str]


class CandidatePriceRange(BaseModel):
    min: int
    max: int


class Stage1ResultModel(BaseModel):
    success: bool

    stage1_input_summary: Optional[Stage1InputSummary] = None

    minimum_budget: Optional[int] = None

    candidate_count: Optional[int] = None

    candidate_price_range: Optional[CandidatePriceRange] = None

    candidate_packages: Optional[List[Dict[str, Any]]] = None

    selected_transport_for_budget: Optional[Dict[str, Any]] = None

    rentcar_unavailable_message: Optional[str] = None

    error: Optional[str] = None


class Stage2FromStage1Request(BaseModel):
    stage1_result: Stage1ResultModel
    budget_max: int = Field(..., gt=0)

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def raise_if_failed(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    package.py 계층에서 success=False 반환 시
    HTTPException으로 변환.
    """

    if result.get("success"):
        return result

    raise HTTPException(
        status_code=400,
        detail=result.get("error", "알 수 없는 오류"),
    )

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

# ---------------------------------------------------------------------------
# Festival APIs
# ---------------------------------------------------------------------------

@app.get("/festivals")
def festivals():
    return {
        "success": True,
        "festivals": get_festival_catalog(),
    }

# ---------------------------------------------------------------------------
# Origin APIs
# ---------------------------------------------------------------------------

@app.get("/origins")
def origins(region: str):
    try:
        origins = get_origin_options_by_region(region)
        grouped = get_origin_options_by_region_grouped(region)

        return {
            "success": True,
            "region": region,
            "origins": origins,
            "grouped": grouped,
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

# ---------------------------------------------------------------------------
# Metadata APIs
# ---------------------------------------------------------------------------

@app.get("/metadata")
def metadata():
    return {
        "success": True,
        "regions": REGION_OPTIONS,
        "keywords": KEYWORDS,
        "companion_types": COMPANION_TYPES,
    }

# ---------------------------------------------------------------------------
# Stage 1
# ---------------------------------------------------------------------------

@app.post("/stage1")
def stage1(payload: Stage1Request):
    """
    1차 후보 생성 API

    역할:
    - 축제 검증
    - 출발지 검증
    - 교통/숙소/렌터카 탐색
    - candidate_packages 생성
    - minimum_budget 계산
    """

    result = prepare_stage1_candidates(
        payload.model_dump()
    )

    return raise_if_failed(result)

# ---------------------------------------------------------------------------
# Stage 2
# ---------------------------------------------------------------------------

@app.post("/stage2/from-stage1")
def stage2_from_stage1(payload: Stage2FromStage1Request):
    """
    실제 운영용 Stage2 API

    흐름:
    stage1 결과를 그대로 전달받아
    budget filtering만 수행.

    중요:
    - Stage1 재계산 없음
    - CSV 재탐색 없음
    - candidate_packages 재사용
    """

    stage1_result = payload.stage1_result.model_dump()

    result = generate_packages_from_stage1(
        stage1_result=stage1_result,
        budget_max=payload.budget_max,
    )

    return raise_if_failed(result)

# ---------------------------------------------------------------------------
# Static Files (must come after all API routes)
# ---------------------------------------------------------------------------

app.mount("/", StaticFiles(directory=BASE_DIR), name="static")

# ---------------------------------------------------------------------------
# Uvicorn Entry
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )