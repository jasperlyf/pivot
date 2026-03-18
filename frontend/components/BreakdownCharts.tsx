'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface PivotRow { date: string; asset: string; category: string; value: number; }

const COLORS: Record<string, string> = {
  SPY:  '#6366f1',
  ACWI: '#10b981',
  BTC:  '#f59e0b',
  ETH:  '#8b5cf6',
  equity: '#6366f1',
  crypto: '#f59e0b',
};

const sharedAxis = {
  tick: { fill: '#94a3b8', fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

function fmt(v: number) {
  if (v >= 10000) return `$${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

interface BreakdownProps { data: PivotRow[]; }

export function BreakdownBar({ data }: BreakdownProps) {
  const byAsset: Record<string, number[]> = {};
  for (const r of data) {
    byAsset[r.asset] = byAsset[r.asset] ?? [];
    byAsset[r.asset].push(r.value);
  }
  const chartData = Object.entries(byAsset).map(([asset, vals]) => ({
    asset,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">Average Price by Asset</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Mean monthly closing price</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis dataKey="asset" {...sharedAxis} />
          <YAxis {...sharedAxis} tickFormatter={fmt} width={60} />
          <Tooltip
            formatter={(v) => [fmt(Number(v)), 'Avg price']}
            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
          />
          <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.asset} fill={COLORS[entry.asset] ?? '#6366f1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownPie({ data }: BreakdownProps) {
  const byCat: Record<string, number> = {};
  for (const r of data) {
    byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  }
  const chartData = Object.entries(byCat).map(([name, value]) => ({ name, value }));
  const total = chartData.reduce((s, r) => s + r.value, 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">Market Share</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Data points by category</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name"
            cx="50%" cy="50%" innerRadius={50} outerRadius={75}
            paddingAngle={3}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name] ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [`${((Number(v) / total) * 100).toFixed(0)}% (${v} pts)`, '']}
            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
          />
          <Legend
            formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400 capitalize">{v}</span>}
            iconType="circle" iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
