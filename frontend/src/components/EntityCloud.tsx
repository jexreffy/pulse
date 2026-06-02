import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { HourResult } from '../api';

interface Props {
  results: HourResult[];
}

export function EntityCloud({ results }: Props) {
  // Aggregate entity counts across all results
  const counts: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.top_entities ?? []) {
      counts[e.text] = (counts[e.text] ?? 0) + e.count;
    }
  }

  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([text, count]) => ({ text, count }));

  if (data.length === 0) {
    return <p className="empty">No entity data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 80, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a2a" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="text" tick={{ fontSize: 11 }} width={80} />
        <Tooltip />
        <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
