'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

interface PivotRow { date: string; asset: string; value: number; }

interface Props { data: PivotRow[]; }

const COLORS: Record<string, string> = {
  SPY:  '#6366f1',
  ACWI: '#10b981',
  BTC:  '#f59e0b',
  ETH:  '#8b5cf6',
};

const ASSET_LABELS: Record<string, string> = {
  SPY: 'S&P 500 ETF',
  ACWI: 'World Index ETF',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
};

type ChartType = 'line' | 'bar';

function fmt(v: number) {
  if (v >= 10000) return `$${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="text-slate-500 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-600">{ASSET_LABELS[p.dataKey] ?? p.dataKey}</span>
          </span>
          <span className="font-semibold text-slate-900">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function MainChart({ data }: Props) {
  const [chartType, setChartType] = useState<ChartType>('line');

  const assets = [...new Set(data.map((r) => r.asset))];
  const byDate = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date } as unknown as Record<string, number>);
    byDate.get(row.date)![row.asset] = row.value;
  }
  const chartData = [...byDate.values()].sort((a, b) => (a.date > b.date ? 1 : -1));

  if (!data.length) return (
    <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-80 text-slate-400 text-sm shadow-sm">
      No data — select a dataset above
    </div>
  );

  const sharedAxis = {
    tick: { fill: '#94a3b8', fontSize: 11 },
    axisLine: false,
    tickLine: false,
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Price History</h2>
          <p className="text-xs text-slate-400 mt-0.5">Monthly closing prices</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['line', 'bar'] as ChartType[]).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                chartType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={320}>
          {chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" {...sharedAxis} interval={5} />
              <YAxis {...sharedAxis} tickFormatter={fmt} width={64} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(v) => <span className="text-xs text-slate-600">{ASSET_LABELS[v] ?? v}</span>}
                iconType="circle" iconSize={8}
              />
              {assets.map((a) => (
                <Line key={a} type="monotone" dataKey={a}
                  stroke={COLORS[a] ?? '#6366f1'} strokeWidth={2}
                  dot={false} connectNulls activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" {...sharedAxis} interval={5} />
              <YAxis {...sharedAxis} tickFormatter={fmt} width={64} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(v) => <span className="text-xs text-slate-600">{ASSET_LABELS[v] ?? v}</span>}
                iconType="circle" iconSize={8}
              />
              {assets.map((a) => (
                <Bar key={a} dataKey={a} fill={COLORS[a] ?? '#6366f1'} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
