import { useEffect, useState } from 'react';
import { SentimentChart } from './components/SentimentChart';
import { EntityCloud } from './components/EntityCloud';
import { PipelineRuns } from './components/PipelineRuns';
import { getResults, getRuns, getArticles } from './api';
import type { HourResult, RunEntry, Article } from './api';
import './App.css';

export default function App() {
  const [results, setResults] = useState<HourResult[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getResults(), getRuns()])
      .then(([r, ru]) => { setResults(r); setRuns(ru); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectRun = async (runId: string) => {
    setSelectedRunId(runId);
    try {
      const a = await getArticles(runId);
      setArticles(a);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>📡 Pulse</h1>
        <p className="subtitle">HackerNews sentiment pipeline — powered by AWS Step Functions + Comprehend</p>
      </header>

      {loading && <div className="loading">Loading pipeline data…</div>}
      {error && <div className="error-banner">Error: {error}</div>}

      {!loading && (
        <>
          <section className="panel">
            <h2>Sentiment Over Time</h2>
            <SentimentChart results={results} />
          </section>

          <section className="panel">
            <h2>Top Entities (last 7 days)</h2>
            <EntityCloud results={results} />
          </section>

          <section className="panel">
            <h2>Pipeline Runs</h2>
            <PipelineRuns runs={runs} onSelectRun={handleSelectRun} selectedRunId={selectedRunId} />
          </section>

          {selectedRunId && articles.length > 0 && (
            <section className="panel">
              <h2>Articles — {selectedRunId.slice(0, 8)}…</h2>
              <div className="articles">
                {articles
                  .sort((a, b) => {
                    const order = ['NEGATIVE', 'POSITIVE', 'MIXED', 'NEUTRAL'];
                    return order.indexOf(a.sentiment) - order.indexOf(b.sentiment);
                  })
                  .map((a) => (
                    <div key={a.article_id} className={`article-card sentiment-${a.sentiment.toLowerCase()}`}>
                      <a href={a.url || '#'} target="_blank" rel="noreferrer">{a.title}</a>
                      <div className="article-meta">
                        <span className="badge">{a.sentiment}</span>
                        {a.entities.slice(0, 3).map((e) => (
                          <span key={e.text} className="entity-tag">{e.text}</span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer>
        <a href="https://github.com/jexreffy/pulse" target="_blank" rel="noreferrer">GitHub</a>
        {' · '}AWS CDK · Lambda (Python 3.12) · Step Functions · SQS · Comprehend · DynamoDB
      </footer>
    </div>
  );
}
