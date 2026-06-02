import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { HourResult } from '../api';

interface Props {
  results: HourResult[];
}

export function SentimentChart({ results }: Props) {
  const data = [...results]
    .sort((a, b) => `${a.date}${a.sk}`.localeCompare(`${b.date}${b.sk}`))
    .map((r) => ({
      label: `${r.date} ${r.sk.replace('hour#', '')}:00`,
      positive: r.positive_pct,
      negative: r.negative_pct,
      neutral: r.neutral_pct,
    }));

  if (data.length === 0) {
    return <p className="empty">No sentiment data yet — pipeline runs hourly.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a2a" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis unit="%" tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
        <Legend />
        <Line type="monotone" dataKey="positive" stroke="#4ade80" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="negative" stroke="#f87171" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="neutral" stroke="#94a3b8" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
