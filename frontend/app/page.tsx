"use client";
import { useMemo, useState } from "react";
import { ClarifyQuestion, ClarifyResponse, RecommendResult } from "./api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { marked } from "marked";
import DOMPurify from "dompurify";

const API_BASE = "http://localhost:8000"; // change to Render URL on deploy

export default function Home() {
  const [supplementType, setSupplementType] = useState("오메가3");
  const [budget, setBudget] = useState<string>("");
  const [concerns, setConcerns] = useState("50대 여성, 혈행 개선 및 기억력 저하");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"input" | "clarify" | "loading" | "result">("input");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const canSubmit = useMemo(() => supplementType.trim().length > 0 && concerns.trim().length > 0, [supplementType, concerns]);

  async function startFlow() {
    setLoading(true);
    setStep("loading");
    setStartedAt(Date.now());
    try {
      const res = await fetch(`${API_BASE}/api/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_type: supplementType,
          budget_krw_per_month: budget ? Number(budget) : null,
          target_and_concerns: concerns,
        }),
      });
      const data: ClarifyResponse = await res.json();
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
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_type: supplementType,
          budget_krw_per_month: budget ? Number(budget) : null,
          target_and_concerns: concerns,
          answers: { ...answers, ...extraAnswers },
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
      <Card className="max-w-3xl w-full mx-auto mt-8">
        <CardHeader>
          <CardTitle>맞춤 질문</CardTitle>
          <CardDescription>최적의 추천을 위해 1분만 투자해 주세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <Label>{q.question}</Label>
              {q.kind === "single_choice" && q.options ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((op) => (
                    <Button
                      key={op}
                      variant={local[q.id] === op ? "default" : "outline"}
                      onClick={() => setLocal((prev) => ({ ...prev, [q.id]: op }))}
                    >
                      {op}
                    </Button>
                  ))}
                </div>
              ) : (
                <Input value={local[q.id] ?? ""} onChange={(e) => setLocal((p) => ({ ...p, [q.id]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => doRecommend({})}>건너뛰기</Button>
            <Button onClick={() => { setAnswers((a) => ({ ...a, ...local })); doRecommend(local); }}>다음</Button>
          </div>
        </CardContent>
      </Card>
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
    return (
      <div className="max-w-4xl mx-auto mt-8 space-y-4">
        {startedAt && (
          <div className="text-sm text-muted-foreground">의사결정 시간: {Math.round((Date.now() - startedAt)/1000)}초</div>
        )}
        {result.ranked.map((r) => (
          <Card key={r.rank}>
            <CardHeader>
              <CardTitle>
                {r.rank}위: {r.product.product_name} {r.product.brand ? `· ${r.product.brand}` : ""}
              </CardTitle>
              <CardDescription>
                {r.summary || `점수: ${r.score.toFixed(3)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">핵심 스펙</div>
                <ul className="text-sm list-disc pl-5">
                  {typeof r.product.epa_mg === 'number' && <li>EPA: {r.product.epa_mg} mg</li>}
                  {typeof r.product.dha_mg === 'number' && <li>DHA: {r.product.dha_mg} mg</li>}
                  {typeof r.product.price_per_month_krw === 'number' && <li>월 가격: {r.product.price_per_month_krw?.toLocaleString()}원</li>}
                  {r.product.daily_dose && <li>권장 섭취: {r.product.daily_dose}</li>}
                </ul>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">후기 요약</div>
                <ul className="text-sm list-disc pl-5">
                  {r.insight?.pros?.slice(0, 3).map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
                {r.insight?.cons?.length ? (
                  <div className="mt-2 text-xs text-muted-foreground">주의: {r.insight.cons.slice(0,2).join(', ')}</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                {r.product.purchase_url && (
                  <Button asChild>
                    <a href={r.product.purchase_url} target="_blank" rel="noreferrer">구매하기</a>
                  </Button>
                )}
                <div className="text-xs text-muted-foreground">
                  브랜드 신뢰도: {r.insight?.brand_trust_score_0to100 ?? "-"} · 후기 만족도: {r.insight?.review_sentiment_0to100 ?? "-"}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {finalAdviceHtml && (
          <Card>
            <CardHeader>
              <CardTitle>최종 조언</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose" dangerouslySetInnerHTML={{ __html: finalAdviceHtml }} />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => { setStep("input"); setResult(null); }}>처음으로</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">AI 영양제 비서 (MVP)</h1>
      <p className="text-sm text-muted-foreground mt-1">입력은 3칸, 추가 질문은 최대 2개로 최소화했습니다.</p>

      {step === "input" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>최소 입력으로 시작하고, 필요한 경우에만 질문합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
              <Label>영양제 종류</Label>
              <Input placeholder="예: 오메가3" value={supplementType} onChange={(e) => setSupplementType(e.target.value)} />
            </div>
            <div className="col-span-1">
              <Label>희망 가격대 (월)</Label>
              <Input type="number" inputMode="numeric" placeholder="예: 20000" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div className="col-span-1 md:col-span-2">
              <Label>복용 대상 및 핵심 고민</Label>
              <Textarea rows={3} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
            </div>
            <div className="col-span-1 md:col-span-2 flex justify-end">
              <Button disabled={!canSubmit} onClick={startFlow}>추천 받기</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "clarify" && <ClarifyView />}

      {step === "loading" && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {step === "result" && <ResultView />}
    </main>
  );
}
