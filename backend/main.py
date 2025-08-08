from __future__ import annotations

import json
import math
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

# Google Gemini SDK
from google import genai


load_dotenv(find_dotenv())

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")

if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not found in environment")
if not PERPLEXITY_API_KEY:
    raise RuntimeError("PERPLEXITY_API_KEY not found in environment")


app = FastAPI(title="Always AI Supplement Assistant MVP")

# Allow local dev for Next.js and potential vercel preview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClarifyInput(BaseModel):
    supplement_type: str = Field(..., description="예: 오메가3, 종합비타민 등")
    budget_krw_per_month: Optional[int] = Field(None, description="월 예산, KRW")
    target_and_concerns: str = Field(..., description="복용 대상 및 핵심 고민")


class ClarifyQuestion(BaseModel):
    id: str
    question: str
    kind: str = Field("text", description="text | single_choice")
    options: Optional[List[str]] = None


class ClarifyResponse(BaseModel):
    questions: List[ClarifyQuestion]


class RecommendInput(ClarifyInput):
    answers: Dict[str, Any] = Field(default_factory=dict)
    products: Optional[List[Product]] = None


class Product(BaseModel):
    product_name: str
    brand: Optional[str] = None
    # Generic ingredient fields so we can support any supplement type
    key_ingredient: Optional[str] = None
    ingredient_amount: Optional[float] = None  # numeric value only
    ingredient_unit: Optional[str] = None      # mg | mcg | IU | CFU | etc
    price_per_month_krw: Optional[int] = None
    capsule_type: Optional[str] = None
    capsule_count: Optional[int] = None
    daily_dose: Optional[str] = None
    purchase_url: Optional[str] = None


class ProductInsight(BaseModel):
    product_name: str
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    brand_trust_score_0to100: Optional[int] = None
    review_sentiment_0to100: Optional[int] = None
    safety_flags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    brand_trust_summary_kr: Optional[str] = None
    review_summary_kr: Optional[str] = None


class RankedProduct(BaseModel):
    rank: int
    product: Product
    insight: Optional[ProductInsight]
    score: float
    summary: Optional[str] = None


class RecommendResult(BaseModel):
    ranked: List[RankedProduct]
    final_advice_markdown: Optional[str] = None


def _new_gemini_client() -> genai.Client:
    # google-genai SDK automatically reads env var
    client = genai.Client(api_key=GOOGLE_API_KEY)
    return client


async def call_perplexity_json(prompt: str) -> Dict[str, Any]:
    """Call Perplexity chat API and parse JSON from the response content.

    The prompt should instruct the model to return bare JSON. We still defensively
    extract the largest JSON object present.
    """

    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": "Be precise and concise. Return ONLY strict minified JSON with no code fences."},
            {"role": "user", "content": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post("https://api.perplexity.ai/chat/completions", headers=headers, json=body)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Perplexity error: {resp.text[:500]}")
        data = resp.json()

    try:
        content = data["choices"][0]["message"]["content"]
    except Exception:
        raise HTTPException(status_code=502, detail="Perplexity response parsing failed")

    # Find JSON object
    match = re.search(r"\{[\s\S]*\}$", content.strip())
    if not match:
        # try to find first and last braces
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_str = content[start : end + 1]
        else:
            raise HTTPException(status_code=502, detail="Perplexity did not return JSON")
    else:
        json_str = match.group(0)

    try:
        return json.loads(json_str)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid JSON from Perplexity: {e}")


def normalize(values: List[Optional[float]]) -> List[float]:
    cleaned = [v for v in values if v is not None and not math.isnan(v)]
    if not cleaned:
        return [0.0 for _ in values]
    min_v, max_v = min(cleaned), max(cleaned)
    if math.isclose(min_v, max_v):
        return [1.0 if v is not None else 0.0 for v in values]
    return [((v - min_v) / (max_v - min_v)) if v is not None else 0.0 for v in values]


def infer_weights(answers: Dict[str, Any]) -> Tuple[float, float, float]:
    """Return weights for value, trust, reviews as a tuple that sums ~1.0."""
    pref = str(answers.get("preference", "balanced")).lower()
    if "가성비" in pref or "value" in pref:
        return 0.5, 0.3, 0.2
    if "신뢰" in pref or "trust" in pref or "브랜드" in pref:
        return 0.25, 0.5, 0.25
    return 0.34, 0.33, 0.33


def parse_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        s = str(value).replace(",", "").strip()
        return float(s)
    except Exception:
        return None


@app.post("/api/clarify", response_model=ClarifyResponse)
async def clarify(payload: ClarifyInput) -> ClarifyResponse:
    """Ask Gemini for 1-3 clarifying questions to improve recommendation quality."""
    instructions = (
        "반드시 최소 1개, 최대 3개의 Clarifying 질문을 한국어로 생성하세요.\n"
        "질문은 사용자의 입력(영양제 종류, 예산, 대상/고민)에서 불명확하거나 결정 품질에 중요한 부분을 보완하도록 하세요.\n"
        "각 질문은 text 또는 single_choice로 구성하되, single_choice에도 자유서술 보강을 허용한다는 메시지를 포함하세요(예: '선택 후 필요시 아래에 자세히 적어주세요').\n"
        "가능하면 한 질문은 선호도(가성비 vs 원료/브랜드 신뢰)이며, 나머지는 안전성/복용 맥락(동복용 약, 알레르기, 선호 원료형태 등)을 다루세요.\n"
        "JSON만 출력하세요."
    )

    prompt = {
        "supplement_type": payload.supplement_type,
        "budget_krw_per_month": payload.budget_krw_per_month,
        "target_and_concerns": payload.target_and_concerns,
        "instructions": instructions,
        "output_schema": {
            "questions": [
                {
                    "id": "string",
                    "question": "string",
                    "kind": "text | single_choice",
                    "options": ["string"],
                }
            ]
        },
    }

    client = _new_gemini_client()
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=(
            "다음 데이터를 참고하여 Clarifying 질문을 한국어로 설계하고, JSON만 출력하세요.\n"
            + json.dumps(prompt, ensure_ascii=False)
        ),
    )

    text = (res.text or "").strip()
    try:
        data = json.loads(text)
        raw_questions = data.get("questions", [])
    except Exception:
        raw_questions = []

    questions: List[ClarifyQuestion] = []
    # enforce 1-3
    max_q = 3
    if not raw_questions:
        raw_questions = [
            {
                "id": "q1",
                "question": "혹시 현재 복용 중인 약/영양제가 있다면 알려주세요. 알레르기나 피하고 싶은 원료가 있나요?",
                "kind": "text",
            }
        ]
    for i, q in enumerate(raw_questions[:max_q]):
        questions.append(
            ClarifyQuestion(
                id=str(q.get("id", f"q{i+1}")),
                question=str(q.get("question", "")).strip(),
                kind=str(q.get("kind", "text")),
                options=q.get("options"),
            )
        )

    return ClarifyResponse(questions=questions)


class SearchResponse(BaseModel):
    products: List[Product]


@app.post("/api/search_products", response_model=SearchResponse)
async def search_products(payload: ClarifyInput) -> SearchResponse:
    """Return initial 10 products table fast for loading view."""
    query = (
        f"한국 시장 기준 '{payload.supplement_type}' 대표 제품 10개를 추천용으로 선정. "
        "아래 JSON 스키마로만 출력: {\n"
        "  \"products\": [ {\"product_name\": str, \"brand\": str, \"key_ingredient\": str|null, \"ingredient_amount\": number|null, \"ingredient_unit\": str|null, "
        "  \"price_per_month_krw\": int|null, \"capsule_type\": str|null, \"capsule_count\": int|null, \"daily_dose\": str|null, \"purchase_url\": str|null } ]\n}"
        "\n주의: 수치는 숫자만, 단위는 별도 필드(ingredient_unit)에 표기. 한국에서 구매 가능 제품 위주."
    )

    data = await call_perplexity_json(query)
    products_raw = data.get("products") or data.get("items") or []
    products: List[Product] = []
    for item in products_raw:
        try:
            products.append(Product(**item))
        except Exception:
            products.append(
                Product(
                    product_name=str(item.get("product_name") or item.get("name") or "unknown"),
                    brand=(item.get("brand") and str(item.get("brand"))) or None,
                    key_ingredient=(item.get("key_ingredient") and str(item.get("key_ingredient"))) or None,
                    ingredient_amount=parse_float(item.get("ingredient_amount")),
                    ingredient_unit=(item.get("ingredient_unit") and str(item.get("ingredient_unit"))) or None,
                    price_per_month_krw=int(str(item.get("price_per_month_krw")).replace(",", ""))
                    if str(item.get("price_per_month_krw")).replace("_", "").replace(",", "").isdigit()
                    else None,
                    capsule_type=item.get("capsule_type"),
                    capsule_count=int(item.get("capsule_count")) if str(item.get("capsule_count")).isdigit() else None,
                    daily_dose=item.get("daily_dose"),
                    purchase_url=item.get("purchase_url"),
                )
            )
    return SearchResponse(products=products)


@app.post("/api/recommend", response_model=RecommendResult)
async def recommend(payload: RecommendInput) -> RecommendResult:
    # Step 3: fetch 10 products from Perplexity as JSON
    if payload.products:
        products_raw = [p.model_dump() if isinstance(p, Product) else p for p in payload.products]
    else:
        query = (
            f"한국 시장 기준 '{payload.supplement_type}' 대표 제품 10개를 추천용으로 선정. "
            "아래 JSON 스키마로만 출력: {\n"
            "  \"products\": [ {\"product_name\": str, \"brand\": str, \"key_ingredient\": str|null, \"ingredient_amount\": number|null, \"ingredient_unit\": str|null, "
            "  \"price_per_month_krw\": int|null, \"capsule_type\": str|null, \"capsule_count\": int|null, \"daily_dose\": str|null, \"purchase_url\": str|null } ]\n}"
            "\n주의: 수치는 숫자만, 단위는 별도 필드(ingredient_unit). 한국에서 구매 가능 제품 위주."
        )
        data = await call_perplexity_json(query)
        products_raw = data.get("products") or data.get("items") or []

    products: List[Product] = []
    for item in products_raw:
        try:
            products.append(Product(**item))
        except Exception:
            # attempt soft conversions
            products.append(
                Product(
                    product_name=str(item.get("product_name") or item.get("name") or "unknown"),
                    brand=(item.get("brand") and str(item.get("brand"))) or None,
                    epa_mg=int(item.get("epa_mg")) if str(item.get("epa_mg")).isdigit() else None,
                    dha_mg=int(item.get("dha_mg")) if str(item.get("dha_mg")).isdigit() else None,
                    price_per_month_krw=int(item.get("price_per_month_krw"))
                    if str(item.get("price_per_month_krw")).replace("_", "").replace(",", "").isdigit()
                    else None,
                    capsule_type=item.get("capsule_type"),
                    capsule_count=
                    int(item.get("capsule_count")) if str(item.get("capsule_count")).isdigit() else None,
                    daily_dose=item.get("daily_dose"),
                    purchase_url=item.get("purchase_url"),
                )
            )

    if not products:
        raise HTTPException(status_code=502, detail="제품 목록 수집 실패")

    # Step 4: filter and rank to top3
    budget = payload.budget_krw_per_month or None
    if budget:
        products = [p for p in products if not p.price_per_month_krw or p.price_per_month_krw <= budget]
        if not products:
            # if filtered all out, keep original
            products = [Product(**item) for item in products_raw[:10]] if products_raw else []

    value_w, trust_w, reviews_w = infer_weights(payload.answers)

    potency_vals = []
    price_vals = []
    for p in products:
        potency = p.ingredient_amount or 0.0
        potency_vals.append(potency)
        price_vals.append(float(p.price_per_month_krw) if p.price_per_month_krw else None)

    potency_norm = normalize(potency_vals)
    # Lower price is better: invert normalized price
    price_norm_raw = normalize([v if v is not None else 0.0 for v in price_vals])
    price_norm = [1.0 - v if price_vals[i] is not None else 0.5 for i, v in enumerate(price_norm_raw)]

    # Step 5: qualitative insights for the top N (preliminary top by potency/price)
    prelim_scores = [0.7 * potency_norm[i] + 0.3 * price_norm[i] for i in range(len(products))]
    prelim_indices = sorted(range(len(products)), key=lambda i: prelim_scores[i], reverse=True)[:3]
    top3 = [products[i] for i in prelim_indices]

    # Fetch qualitative info from Perplexity
    names = ", ".join([p.product_name for p in top3])
    qual_prompt = (
        "다음 제품들에 대해 한국 실사용 후기와 브랜드 신뢰도(언론/소비자원/공식 인증/제조 이력 등) 자료를 종합해 JSON만 출력.\n"
        f"사용자 프로필/고민/답변을 반영해 문장 요약을 맞춤화하세요: {json.dumps({'target_and_concerns': payload.target_and_concerns, 'answers': payload.answers}, ensure_ascii=False)}\n"
        f"제품: {names}.\n"
        "스키마: {\n  \"insights\": [ { \"product_name\": str, \"pros\": [str], \"cons\": [str], \"brand_trust_score_0to100\": int, \"review_sentiment_0to100\": int, \"safety_flags\": [str], \"brand_trust_summary_kr\": str, \"review_summary_kr\": str, \"notes\": str|null } ]\n}"
    )

    insights_json = await call_perplexity_json(qual_prompt)
    insights_map: Dict[str, ProductInsight] = {}
    for it in insights_json.get("insights", []):
        try:
            ins = ProductInsight(**it)
            insights_map[ins.product_name] = ins
        except Exception:
            continue

    # Combine and compute final ranking
    trust_vals = []
    review_vals = []
    for p in products:
        ins = insights_map.get(p.product_name)
        trust_vals.append(float(ins.brand_trust_score_0to100) if ins and ins.brand_trust_score_0to100 is not None else None)
        review_vals.append(float(ins.review_sentiment_0to100) if ins and ins.review_sentiment_0to100 is not None else None)

    trust_norm = normalize(trust_vals)
    review_norm = normalize(review_vals)

    final_scores = []
    for i, p in enumerate(products):
        score = (
            value_w * (0.6 * price_norm[i] + 0.4 * potency_norm[i])
            + trust_w * trust_norm[i]
            + reviews_w * review_norm[i]
        )
        final_scores.append(score)

    ranked_indices = sorted(range(len(products)), key=lambda i: final_scores[i], reverse=True)[:3]
    ranked_products = [products[i] for i in ranked_indices]

    # Step 6: ask Gemini to synthesize concise Korean summaries
    rank_payload = {
        "user": payload.model_dump(),
        "ranked": [
            {
                "rank": idx + 1,
                "product": rp.model_dump(),
                "insight": insights_map.get(rp.product_name).model_dump() if insights_map.get(rp.product_name) else None,
                "score": round(final_scores[ranked_indices[idx]], 4),
            }
            for idx, rp in enumerate(ranked_products)
        ],
    }

    client = _new_gemini_client()
    res = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=(
            "한국 35~50세 여성의 구매 맥락에 맞춰 아래 데이터를 바탕으로 각 제품의 핵심 스펙과 추천 이유를 2-3줄로 간결 요약하세요.\n"
            "포맷: JSON { ranked: [ { rank, summary_kr } ], final_advice_markdown }\n"
            + json.dumps(rank_payload, ensure_ascii=False)
        ),
    )

    summary_text = (res.text or "").strip()
    summaries: Dict[int, str] = {}
    final_advice_markdown: Optional[str] = None
    try:
        j = json.loads(summary_text)
        for item in j.get("ranked", []):
            summaries[int(item.get("rank"))] = str(item.get("summary_kr", "")).strip()
        final_advice_markdown = j.get("final_advice_markdown")
    except Exception:
        # fallback: no structured summaries
        pass

    ranked: List[RankedProduct] = []
    for idx, rp in enumerate(ranked_products, start=1):
        ranked.append(
            RankedProduct(
                rank=idx,
                product=rp,
                insight=insights_map.get(rp.product_name),
                score=round(final_scores[ranked_indices[idx - 1]], 4),
                summary=summaries.get(idx),
            )
        )

    return RecommendResult(ranked=ranked, final_advice_markdown=final_advice_markdown)


@app.get("/healthz")
async def healthz():
    return {"ok": True}

