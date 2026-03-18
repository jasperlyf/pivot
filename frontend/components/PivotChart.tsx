'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface PivotRow {
  date: string;
  asset: string;
  category: string;
  value: number;
}

interface Props {
  data: PivotRow[];
  metric: string;
}

const COLORS: Record<string, string> = {
  SPY:  '#60a5fa',
  ACWI: '#34d399',
  BTC:  '#f59e0b',
  ETH:  '#a78bfa',
};

function formatValue(value: number, metric: string) {
  if (metric === 'change') return `${value.toFixed(2)}%`;
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${value.toFixed(2)}`;
}

export default function PivotChart({ data, metric }: Props) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-80 text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
      No data
    </div>
  );

  // Pivot: rows keyed by date, columns by asset
  const assets = [...new Set(data.map((r) => r.asset))];
  const byDate = new Map<string, Record<string, number>>();

  for (const row of data) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date } as Record<string, number>);
    byDate.get(row.date)![row.asset] = row.value;
  }

  const chartData = [...byDate.values()].sort((a, b) => (a.date > b.date ? 1 : -1));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickFormatter={(v) => formatValue(v, metric)}
            width={72}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#f9fafb' }}
            formatter={(v: number) => formatValue(v, metric)}
          />
          <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 13 }} />
          {assets.map((a) => (
            <Line
              key={a}
              type="monotone"
              dataKey={a}
              stroke={COLORS[a] ?? '#e5e7eb'}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
