"use client";
import { useMemo, useState } from "react";
import { ClarifyQuestion, ClarifyResponse, RecommendResult, Product } from "./api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Backend base URL
// In production (Vercel), set NEXT_PUBLIC_API_BASE to your Render URL, e.g. https://your-app.onrender.com
// For local dev, it falls back to http://localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function Home() {
  const [supplementType, setSupplementType] = useState("오메가‑3 지방산");
  const [isCustomSupplement, setIsCustomSupplement] = useState(false);
  const [customSupplementType, setCustomSupplementType] = useState("");
  const [budget, setBudget] = useState<number>(30000);
  const [concerns, setConcerns] = useState("50대 여성, 혈행 개선 및 기억력 저하");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"input" | "clarify" | "loading" | "result">("input");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [initialProducts, setInitialProducts] = useState<Product[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const supplementOptions = [
    "종합비타민",
    "유산균", 
    "오메가‑3",
    "비타민 C",
    "칼슘",
    "비타민 A",
    "홍삼",
    "기타"
  ];

  const formatBudget = (value: number) => {
    if (value >= 100000) return `${(value / 10000).toFixed(0)}만원`;
    return `${value.toLocaleString()}원`;
  };

  const getSelectedSupplementType = () => {
    return isCustomSupplement ? customSupplementType : supplementType;
  };

  const canSubmit = useMemo(() => {
    const selectedType = getSelectedSupplementType();
    return selectedType.trim().length > 0 && concerns.trim().length > 0;
  }, [supplementType, isCustomSupplement, customSupplementType, concerns]);

  async function startFlow() {
    setLoading(true);
    setStep("loading");
    setStartedAt(Date.now());
    try {
      // kick off product search in parallel to show table during loading
      const selectedType = getSelectedSupplementType();
      const searchPromise = fetch(`${API_BASE}/api/search_products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_type: selectedType,
          budget_krw_per_month: budget,
          target_and_concerns: concerns,
        }),
      }).then(r => r.json()).catch(() => null);

      const res = await fetch(`${API_BASE}/api/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_type: selectedType,
          budget_krw_per_month: budget,
          target_and_concerns: concerns,
        }),
      });
      const data: ClarifyResponse = await res.json();
      const searchData = await searchPromise;
      if (searchData?.products) setInitialProducts(searchData.products);
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setStep("clarify");
      } else {
        await doRecommend({});
      }
    } catch (e) {
      console.error(e);
      setStep("input");
    } finally {
      setLoading(false);
    }
  }

  async function doRecommend(extraAnswers: Record<string, any>) {
    setLoading(true);
    setStep("loading");
    try {
      const selectedType = getSelectedSupplementType();
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_type: selectedType,
          budget_krw_per_month: budget,
          target_and_concerns: concerns,
          answers: { ...answers, ...extraAnswers },
          products: initialProducts ?? undefined,
        }),
      });
      const data: RecommendResult = await res.json();
      setResult(data);
      setStep("result");
    } catch (e) {
      console.error(e);
      setStep("input");
    } finally {
      setLoading(false);
    }
  }

  function ClarifyView() {
    const [local, setLocal] = useState<Record<string, any>>({});
  return (
      <div className="max-w-3xl mx-auto animate-slide-up px-4 sm:px-0">
        <Card className="card-gradient shadow-medium border-border/50">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">추가 맞춤 질문</CardTitle>
            <CardDescription className="text-base">
              더 정확한 추천을 위해 몇 가지 질문에 답해주세요. 건너뛰셔도 됩니다.
            </CardDescription>
        </CardHeader>
          <CardContent className="space-y-6">
            {questions.map((q, index) => (
              <div key={q.id} className="space-y-3 p-4 rounded-lg bg-muted/30">
                <Label className="text-base font-medium flex items-center space-x-2">
                  <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">{index + 1}</span>
                  </span>
                  <span>{q.question}</span>
                </Label>
              {q.kind === "single_choice" && q.options ? (
                  <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((op) => (
                      <Button
                        key={op}
                        variant={local[q.id] === op ? "default" : "outline"}
                        onClick={() => setLocal((prev) => ({ ...prev, [q.id]: op }))}
                          className="h-10"
                      >
                        {op}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                      placeholder="추가 설명이 있으시면 자유롭게 적어주세요 (선택사항)"
                    value={local[`${q.id}__text`] ?? ""}
                    onChange={(e) => setLocal((p) => ({ ...p, [`${q.id}__text`]: e.target.value }))}
                    rows={2}
                      className="text-base"
                    />
                  </div>
                ) : (
                  <Input 
                    value={local[q.id] ?? ""} 
                    onChange={(e) => setLocal((p) => ({ ...p, [q.id]: e.target.value }))} 
                    className="h-12 text-base"
                    placeholder="답변을 입력해주세요"
                  />
              )}
            </div>
          ))}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => doRecommend({})}
                className="h-12 text-base flex-1"
              >
                건너뛰기
              </Button>
              <Button 
                onClick={() => { setAnswers((a) => ({ ...a, ...local })); doRecommend(local); }}
                className="h-12 text-base flex-1 shadow-soft"
              >
                🎯 맞춤 분석 완료
              </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    );
  }

  function ResultView() {
    if (!result) return null;
    const finalAdviceHtml = useMemo(() => {
      if (!result?.final_advice_markdown) return null;
      const raw = marked.parse(result.final_advice_markdown);
      // @ts-ignore DOMPurify typings
      return DOMPurify.sanitize(String(raw));
    }, [result?.final_advice_markdown]);

    const getRankBadgeColor = (rank: number) => {
      switch (rank) {
        case 1: return "bg-yellow-500 text-white";
        case 2: return "bg-gray-400 text-white";
        case 3: return "bg-amber-600 text-white";
        default: return "bg-primary text-primary-foreground";
      }
    };

    const getTrustLevel = (score: number) => {
      if (score >= 80) return { level: "매우 높음", color: "text-success" };
      if (score >= 60) return { level: "높음", color: "text-info" };
      if (score >= 40) return { level: "보통", color: "text-warning" };
      return { level: "낮음", color: "text-destructive" };
    };

    return (
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-fade-in px-4 sm:px-0">
        {/* Header with timing */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-gradient">
            맞춤 추천 결과
          </h2>
        {startedAt && (
            <p className="text-muted-foreground">
              ⚡ 분석 완료 시간: {Math.round((Date.now() - startedAt)/1000)}초
            </p>
          )}
        </div>

        {/* Results */}
        <div className="space-y-6">
          {result.ranked.map((r, index) => (
            <Card key={r.rank} className={`card-gradient shadow-medium border-border/50 overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${index === 0 ? 'ring-2 ring-primary/20' : ''}`}>
              <CardHeader className="relative pb-4">
                                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${getRankBadgeColor(r.rank)}`}>
                      {r.rank}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl leading-tight">
                        {r.product.product_name}
              </CardTitle>
                      {r.product.brand && (
                        <p className="text-muted-foreground mt-1">{r.product.brand}</p>
                      )}
                      {index === 0 && (
                        <span className="inline-block mt-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                          🏆 최고 추천
                        </span>
                      )}
                    </div>
                  </div>
                                      <div className="text-left sm:text-right">
                    <div className="text-2xl font-bold text-primary">
                      {Math.round(r.score * 100)}점
                    </div>
                    <div className="text-xs text-muted-foreground">AI 추천 점수</div>
                  </div>
                </div>
                {r.summary && (
                  <CardDescription className="mt-3 text-base leading-relaxed bg-muted/30 p-3 rounded-lg">
                    {r.summary}
              </CardDescription>
                )}
            </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {/* 핵심 스펙 */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center space-x-2">
                      <span className="w-4 h-4 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="w-2 h-2 bg-primary rounded-full"></span>
                      </span>
                      <span>핵심 스펙</span>
                    </h4>
                    <div className="space-y-2">
                  {r.product.key_ingredient && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <span className="text-sm text-muted-foreground">주요 성분</span>
                          <span className="text-sm font-medium">
                            {r.product.key_ingredient} {r.product.ingredient_amount} {r.product.ingredient_unit}
                          </span>
                        </div>
                      )}
                      {typeof r.product.price_per_month_krw === 'number' && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <span className="text-sm text-muted-foreground">월 비용</span>
                          <span className="text-sm font-bold text-primary">
                            {r.product.price_per_month_krw.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {r.product.daily_dose && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <span className="text-sm text-muted-foreground">권장 섭취</span>
                          <span className="text-sm font-medium">{r.product.daily_dose}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 후기 및 평가 */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center space-x-2">
                      <span className="w-4 h-4 bg-success/20 rounded-full flex items-center justify-center">
                        <span className="w-2 h-2 bg-success rounded-full"></span>
                      </span>
                      <span>사용자 후기</span>
                    </h4>
                    <div className="space-y-2">
                      {r.insight?.pros?.slice(0, 3).map((pro, i) => (
                        <div key={i} className="flex items-start space-x-2 p-2 bg-success/5 rounded">
                          <span className="text-success text-xs">✓</span>
                          <span className="text-sm">{pro}</span>
              </div>
                      ))}
                {r.insight?.cons?.length ? (
                        <div className="p-2 bg-warning/5 rounded border border-warning/20">
                          <div className="text-xs text-warning font-medium mb-1">주의사항</div>
                          <div className="text-xs text-muted-foreground">
                            {r.insight.cons.slice(0,2).join(', ')}
                          </div>
                        </div>
                ) : null}
                    </div>
                  </div>

                  {/* 신뢰도 및 구매 */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center space-x-2">
                      <span className="w-4 h-4 bg-info/20 rounded-full flex items-center justify-center">
                        <span className="w-2 h-2 bg-info rounded-full"></span>
                      </span>
                      <span>신뢰도</span>
                    </h4>
                    <div className="space-y-3">
                      {r.insight?.brand_trust_score_0to100 && (
                        <div className="p-3 bg-muted/30 rounded">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-muted-foreground">브랜드 신뢰도</span>
                            <span className={`text-sm font-bold ${getTrustLevel(r.insight.brand_trust_score_0to100).color}`}>
                              {getTrustLevel(r.insight.brand_trust_score_0to100).level}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-destructive via-warning to-success h-2 rounded-full transition-all"
                              style={{ width: `${r.insight.brand_trust_score_0to100}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {r.insight.brand_trust_score_0to100}/100점
                          </div>
                        </div>
                      )}
                      
                      {r.insight?.review_sentiment_0to100 && (
                        <div className="p-3 bg-muted/30 rounded">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-muted-foreground">후기 만족도</span>
                            <span className={`text-sm font-bold ${getTrustLevel(r.insight.review_sentiment_0to100).color}`}>
                              {getTrustLevel(r.insight.review_sentiment_0to100).level}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-destructive via-warning to-success h-2 rounded-full transition-all"
                              style={{ width: `${r.insight.review_sentiment_0to100}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {r.insight.review_sentiment_0to100}/100점
                          </div>
              </div>
                      )}

                {r.product.purchase_url && (
                        <Button asChild className="w-full h-12 text-base font-semibold shadow-soft">
                          <a href={r.product.purchase_url} target="_blank" rel="noreferrer">
                            🛒 구매하러 가기
                          </a>
                  </Button>
                )}
                    </div>
                  </div>
                </div>

                {r.insight?.brand_trust_summary_kr && (
                  <div className="mt-4 p-4 bg-info/5 rounded-lg border border-info/20">
                    <h5 className="text-sm font-medium text-info mb-2">💡 브랜드 신뢰도 분석</h5>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {r.insight.brand_trust_summary_kr}
                    </p>
              </div>
                )}
            </CardContent>
          </Card>
        ))}

        </div>

        {finalAdviceHtml && (
          <Card className="card-gradient shadow-medium border-border/50">
            <CardHeader>
              <CardTitle className="text-xl flex items-center space-x-2">
                <span className="w-6 h-6 bg-success/20 rounded-full flex items-center justify-center">
                  <span className="text-success text-sm">💡</span>
                </span>
                <span>전문가 최종 조언</span>
              </CardTitle>
              <CardDescription>
                AI가 분석한 개인 맞춤 건강 조언입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none bg-muted/20 p-4 rounded-lg" dangerouslySetInnerHTML={{ __html: finalAdviceHtml }} />
            </CardContent>
          </Card>
        )}

        {initialProducts && (
          <details className="group">
            <summary className="cursor-pointer">
              <Card className="card-gradient shadow-soft border-border/30 group-open:shadow-medium transition-all">
            <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <span className="w-6 h-6 bg-info/20 rounded-full flex items-center justify-center">
                        <span className="text-info text-sm">📊</span>
                      </span>
                      <span>분석 대상 후보 제품들</span>
                      <span className="bg-info/10 text-info px-2 py-1 rounded-full text-xs">
                        {initialProducts.length}개
                      </span>
                    </span>
                    <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                  </CardTitle>
                  <CardDescription>
                    AI가 추천 결과를 도출하기 위해 분석한 모든 후보 제품들입니다
                  </CardDescription>
            </CardHeader>
              </Card>
            </summary>
            <Card className="mt-4 card-gradient shadow-medium border-border/50">
              <CardContent className="pt-6">
              <div className="overflow-x-auto">
                  <table className="w-full">
                  <thead className="text-left">
                      <tr className="border-b border-border/50">
                        <th className="py-3 pr-4 font-medium text-sm">제품명</th>
                        <th className="py-3 pr-4 font-medium text-sm">브랜드</th>
                        <th className="py-3 pr-4 font-medium text-sm">주요 성분</th>
                        <th className="py-3 pr-4 font-medium text-sm">월 가격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialProducts.slice(0,10).map((p, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3 pr-4 font-medium text-sm">{p.product_name}</td>
                          <td className="py-3 pr-4 text-muted-foreground text-sm">{p.brand ?? '-'}</td>
                          <td className="py-3 pr-4 text-sm">
                            {p.key_ingredient ? (
                              <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                                {p.key_ingredient} {p.ingredient_amount ?? ''} {p.ingredient_unit ?? ''}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-3 pr-4 text-sm">
                            {typeof p.price_per_month_krw === 'number' ? (
                              <span className="font-medium">{p.price_per_month_krw.toLocaleString()}원</span>
                            ) : '-'}
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-4 pt-8">
          <Button 
            variant="outline" 
            onClick={() => { 
              setStep("input"); 
              setResult(null); 
              setQuestions([]); 
              setAnswers({}); 
              setInitialProducts(null);
              setIsCustomSupplement(false);
              setCustomSupplementType("");
              setSupplementType("오메가‑3 지방산");
              setBudget(30000);
            }}
            className="h-12 text-base flex-1"
          >
            🔄 새로운 추천 받기
          </Button>
          <Button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="h-12 text-base flex-1 shadow-soft"
          >
            ⬆️ 맨 위로 이동
          </Button>
        </div>
    </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-border/40 glass-effect sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => { 
                setStep("input"); 
                setResult(null); 
                setQuestions([]); 
                setAnswers({}); 
                setInitialProducts(null);
                setIsCustomSupplement(false);
                setCustomSupplementType("");
                setSupplementType("오메가‑3 지방산");
                setBudget(30000);
              }}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-soft">
                <span className="text-primary-foreground font-bold text-lg">AI</span>
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-gradient hover:scale-105 transition-transform">AI 영양제 비서</h1>
                <p className="text-xs text-muted-foreground">AI 기반 맞춤형 영양제 추천</p>
              </div>
            </button>
            <div className="flex items-center gap-1.5 md:gap-6">
              <div className="flex items-center space-x-1 md:space-x-2 bg-success/10 px-2 md:px-3 py-1.5 md:py-2 rounded-full border border-success/20 shadow-sm hover:bg-success/15 transition-colors">
                <svg className="w-3 h-3 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs md:text-sm font-medium text-success">AI 검증완료</span>
              </div>
              <div className="flex items-center space-x-1 md:space-x-2 bg-info/10 px-2 md:px-3 py-1.5 md:py-2 rounded-full border border-info/20 shadow-sm hover:bg-info/15 transition-colors">
                <svg className="w-3 h-3 text-info" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span className="text-xs md:text-sm font-medium text-info">개인맞춤</span>
              </div>
              <div className="flex items-center space-x-1 md:space-x-2 bg-warning/10 px-2 md:px-3 py-1.5 md:py-2 rounded-full border border-warning/20 shadow-sm hover:bg-warning/15 transition-colors">
                <svg className="w-3 h-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span className="text-xs md:text-sm font-medium text-warning">1분 분석</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fade-in">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
            당신에게 <span className="text-gradient">최적의 영양제</span>를 찾아드립니다
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            AI 기반 분석으로 개인의 건강 상태와 목표에 맞는 영양제를 추천해드립니다. 
            <br></br>
            간단한 정보 입력만으로 전문가 수준의 추천을 받아보세요.
            
          </p>
        </div>

      {step === "input" && (
        <div className="max-w-2xl mx-auto animate-slide-up px-4 sm:px-0">
          <Card className="card-gradient shadow-medium border-border/50">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">기본 정보 입력</CardTitle>
              <CardDescription className="text-base">
                1분만 투자하시면 AI가 분석해서 최적의 영양제를 추천해드립니다.
              </CardDescription>
          </CardHeader>
                        <CardContent className="space-y-8">
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center space-x-2">
                  <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">1</span>
                  </span>
                  <span>어떤 영양제를 찾고 계신가요?</span>
                </Label>
                
                {/* 영양제 메뉴 바 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {supplementOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        if (option === "기타") {
                          setIsCustomSupplement(true);
                          setSupplementType("");
                        } else {
                          setIsCustomSupplement(false);
                          setSupplementType(option);
                          setCustomSupplementType("");
                        }
                      }}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all duration-200 ${
                        (option === "기타" && isCustomSupplement) || 
                        (option !== "기타" && !isCustomSupplement && supplementType === option)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                
                {/* 기타 선택 시 직접 입력 */}
                {isCustomSupplement && (
                  <div className="animate-slide-up">
                    <Input 
                      placeholder="찾고 계시는 영양제를 직접 입력해주세요" 
                      value={customSupplementType} 
                      onChange={(e) => setCustomSupplementType(e.target.value)}
                      className="h-12 text-base"
                      autoFocus
                    />
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center space-x-2">
                  <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">2</span>
                  </span>
                  <span>월 예산</span>
                </Label>
                
                {/* 예산 슬라이더 */}
                <div className="space-y-3">
                  <div className="text-center">
                    <span className="text-2xl font-bold text-primary">{formatBudget(budget)}</span>
                    <span className="text-sm text-muted-foreground ml-2">/ 월</span>
                  </div>
                  
                  <div className="relative">
                    <input
                      type="range"
                      min="10000"
                      max="100000"
                      step="5000"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                      className="w-full h-3 bg-muted rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(99 102 241) 0%, rgb(99 102 241) ${((budget - 10000) / (100000 - 10000)) * 100}%, rgb(241 245 249) ${((budget - 10000) / (100000 - 10000)) * 100}%, rgb(241 245 249) 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>1만원</span>
                      <span>4만원</span>
                      <span>7만원</span>
                      <span>10만원</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-left">
                    💡 예산에 맞는 최적의 가성비 제품을 추천해드립니다
                  </p>
            </div>
            </div>
              
              <div className="space-y-2">
                <Label className="text-base font-medium flex items-center space-x-2">
                  <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">3</span>
                  </span>
                  <span>복용 대상과 개선하고 싶은 건강 고민</span>
                </Label>
                <Textarea 
                  rows={4} 
                  placeholder="예: 50대 여성, 혈행 개선 및 기억력 저하가 걱정됨. 무릎 관절도 아프기 시작함."
                  value={concerns} 
                  onChange={(e) => setConcerns(e.target.value)}
                  className="text-base resize-none"
                />
                <p className="text-sm text-muted-foreground">
                  💡 나이, 성별, 건강 상태, 개선하고 싶은 부분을 자세히 적어주실수록 더 정확한 추천이 가능합니다.
                </p>
            </div>
              
              <div className="pt-4">
                <Button 
                  disabled={!canSubmit} 
                  onClick={startFlow}
                  className="w-full h-12 text-base font-semibold shadow-soft"
                  size="lg"
                >
                  🔍 AI 분석 시작하기
                </Button>
                <p className="text-center text-sm text-muted-foreground mt-3">
                  평균 분석 시간: 30초 내외
                </p>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {step === "clarify" && <ClarifyView />}

      {step === "loading" && (
        <div className="max-w-4xl mx-auto animate-fade-in px-4 sm:px-0">
          <Card className="card-gradient shadow-medium border-border/50">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl flex items-center justify-center space-x-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span>AI가 분석 중입니다</span>
              </CardTitle>
              <CardDescription className="text-base">
                전 세계 영양제 데이터베이스에서 최적의 제품을 찾고 있습니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                  <span className="text-sm">제품 데이터 수집 완료</span>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                  <div className="w-2 h-2 bg-warning rounded-full animate-pulse"></div>
                  <span className="text-sm">성분 및 효능 분석 중...</span>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                  <span className="text-sm text-muted-foreground">개인 맞춤 점수 계산 대기 중</span>
                </div>
              </div>

            {!initialProducts && (
                <div className="space-y-3">
                  <div className="text-center text-muted-foreground">후보 제품 검색 중...</div>
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-6 w-3/4 mx-auto" />
                  </div>
              </div>
            )}

            {initialProducts && (
                <div className="space-y-3 animate-scale-in">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span className="font-medium">발견된 후보 제품들</span>
                    <span className="bg-success/10 text-success px-2 py-1 rounded-full text-xs">
                      {initialProducts.length}개
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left">
                        <tr className="border-b border-border/50">
                          <th className="py-3 pr-4 font-medium">제품명</th>
                          <th className="py-3 pr-4 font-medium">브랜드</th>
                          <th className="py-3 pr-4 font-medium">주요 성분</th>
                          <th className="py-3 pr-4 font-medium">월 가격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialProducts.slice(0,10).map((p, i) => (
                          <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="py-3 pr-4 font-medium">{p.product_name}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{p.brand ?? '-'}</td>
                            <td className="py-3 pr-4">
                              {p.key_ingredient ? (
                                <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                                  {p.key_ingredient} {p.ingredient_amount ?? ''} {p.ingredient_unit ?? ''}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-3 pr-4">
                              {typeof p.price_per_month_krw === 'number' ? (
                                <span className="font-medium">{p.price_per_month_krw.toLocaleString()}원</span>
                              ) : '-'}
                            </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </div>
              </div>
            )}
            </CardContent>
          </Card>
        </div>
      )}

      {step === "result" && <ResultView />}
    </main>
    </div>
  );
}
