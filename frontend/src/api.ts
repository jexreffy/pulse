const BASE = import.meta.env.DEV ? '/api' : '/api';

export interface HourResult {
  date: string;
  sk: string;
  run_id: string;
  hour: string;
  article_count: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  mixed_pct: number;
  top_entities: { text: string; count: number }[];
  aggregated_at: string;
}

export interface RunEntry {
  date: string;
  sk: string;
  run_id: string;
  hour: string;
  article_count: number;
  status: string;
  completed_at: string;
}

export interface Article {
  article_id: string;
  title: string;
  url: string;
  sentiment: string;
  sentiment_scores: { positive: number; negative: number; neutral: number; mixed: number };
  entities: { text: string; type: string; score: number }[];
}

export async function getResults(): Promise<HourResult[]> {
  const res = await fetch(`${BASE}/results`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function getRuns(): Promise<RunEntry[]> {
  const res = await fetch(`${BASE}/runs`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.runs ?? [];
}

export async function getArticles(runId: string): Promise<Article[]> {
  const res = await fetch(`${BASE}/articles/${runId}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.articles ?? [];
}
