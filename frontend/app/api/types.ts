export type ClarifyInput = {
  supplement_type: string;
  budget_krw_per_month?: number | null;
  target_and_concerns: string;
};

export type ClarifyQuestion = {
  id: string;
  question: string;
  kind: 'text' | 'single_choice';
  options?: string[];
};

export type ClarifyResponse = {
  questions: ClarifyQuestion[];
};

export type RecommendInput = ClarifyInput & {
  answers: JSONRecord;
};

export type Product = {
  product_name: string;
  brand?: string | null;
  key_ingredient?: string | null;
  ingredient_amount?: number | null;
  ingredient_unit?: string | null;
  price_per_month_krw?: number | null;
  capsule_type?: string | null;
  capsule_count?: number | null;
  daily_dose?: string | null;
  purchase_url?: string | null;
};

export type ProductInsight = {
  product_name: string;
  pros: string[];
  cons: string[];
  brand_trust_score_0to100?: number | null;
  brand_trust_summary_kr?: string | null;
  review_sentiment_0to100?: number | null;
  review_summary_kr?: string | null;
  safety_flags: string[];
  notes?: string | null;
};

export type RankedProduct = {
  rank: number;
  product: Product;
  insight?: ProductInsight | null;
  score: number;
  summary?: string | null;
};

export type RecommendResult = {
  ranked: RankedProduct[];
  final_advice_markdown?: string | null;
};

// Generic JSON value types to avoid `any` for dynamic answer maps
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };
export type JSONRecord = Record<string, JSONValue>;

