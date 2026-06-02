import type { RunEntry } from '../api';

interface Props {
  runs: RunEntry[];
  onSelectRun: (runId: string) => void;
  selectedRunId: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: '#4ade80',
  FAILED: '#f87171',
  RUNNING: '#fbbf24',
};

export function PipelineRuns({ runs, onSelectRun, selectedRunId }: Props) {
  if (runs.length === 0) {
    return <p className="empty">No pipeline runs yet.</p>;
  }

  return (
    <table className="runs-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Hour</th>
          <th>Articles</th>
          <th>Status</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr
            key={run.run_id}
            onClick={() => onSelectRun(run.run_id)}
            className={selectedRunId === run.run_id ? 'selected' : ''}
            style={{ cursor: 'pointer' }}
          >
            <td>{run.date}</td>
            <td>{run.hour}:00</td>
            <td>{run.article_count}</td>
            <td>
              <span style={{ color: STATUS_COLOR[run.status] ?? '#94a3b8' }}>
                {run.status}
              </span>
            </td>
            <td>{run.completed_at ? new Date(run.completed_at).toLocaleTimeString() : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
