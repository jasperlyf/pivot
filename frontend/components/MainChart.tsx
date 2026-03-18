'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

interface PivotRow { date: string; asset: string; value: number; }

interface Props { data: PivotRow[]; loading?: boolean; }

const COLOR_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

type ChartType = 'line' | 'bar';
type ViewMode  = 'price' | 'pct';

function fmtPrice(v: number) {
  if (v >= 10000) return `$${(v / 1000).toFixed(0)}k`;
  if (v >= 1000)  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label, mode }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-sm">
      <p className="text-slate-500 dark:text-slate-400 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-600 dark:text-slate-400">{p.dataKey}</span>
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'pct' ? `${p.value}` : fmtPrice(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function MainChart({ data, loading = false }: Props) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [viewMode,  setViewMode]  = useState<ViewMode>('pct');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (data.length) setUpdatedAt(new Date());
  }, [data]);

  const safeData = Array.isArray(data) ? data : [];

  const assets = [...new Set(safeData.map((r) => r.asset))];

  // Build chart data
  const chartData = (() => {
    const sorted = [...safeData].sort((a, b) => a.date.localeCompare(b.date));
    if (viewMode === 'price') {
      const byDate = new Map<string, Record<string, number>>();
      for (const row of sorted) {
        if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date } as unknown as Record<string, number>);
        byDate.get(row.date)![row.asset] = row.value;
      }
      return [...byDate.values()];
    }
    // % mode: index to 100
    const baselines: Record<string, number> = {};
    const byDate = new Map<string, Record<string, number>>();
    for (const row of sorted) {
      if (!baselines[row.asset]) baselines[row.asset] = row.value;
      if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date } as unknown as Record<string, number>);
      byDate.get(row.date)![row.asset] = parseFloat(((row.value / baselines[row.asset]) * 100).toFixed(2));
    }
    return [...byDate.values()];
  })();

  if (!data.length) return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center h-80 text-slate-400 dark:text-slate-500 text-sm shadow-sm dark:shadow-none">
      No data available
    </div>
  );

  const sharedAxis = {
    tick: { fill: '#94a3b8', fontSize: 11 },
    axisLine: false as const,
    tickLine: false as const,
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Price History</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {viewMode === 'pct' ? 'Indexed to 100 at start of period' : 'Raw closing prices'}
            {updatedAt && (
              <span className="ml-2 text-slate-300 dark:text-slate-600">
                · Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Price / % toggle */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setViewMode('pct')}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'pct' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              % Return
            </button>
            <button
              onClick={() => setViewMode('price')}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'price' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              Price
            </button>
          </div>
          {/* Line / Bar toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(['line', 'bar'] as ChartType[]).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                  chartType === t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`px-2 pb-4 transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
        <ResponsiveContainer width="100%" height={320}>
          {chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" {...sharedAxis} interval="preserveStartEnd" />
              <YAxis
                {...sharedAxis}
                tickFormatter={viewMode === 'price' ? fmtPrice : (v) => `${v}`}
                width={viewMode === 'price' ? 64 : 44}
              />
              <Tooltip content={<CustomTooltip mode={viewMode} />} />
              <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} iconType="circle" iconSize={8} />
              {assets.map((a, i) => (
                <Line key={a} type="monotone" dataKey={a}
                  stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]} strokeWidth={2}
                  dot={false} connectNulls activeDot={{ r: 4 }}
                  animationDuration={400} animationEasing="ease-out"
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" {...sharedAxis} interval="preserveStartEnd" />
              <YAxis
                {...sharedAxis}
                tickFormatter={viewMode === 'price' ? fmtPrice : (v) => `${v}`}
                width={viewMode === 'price' ? 64 : 44}
              />
              <Tooltip content={<CustomTooltip mode={viewMode} />} />
              <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} iconType="circle" iconSize={8} />
              {assets.map((a, i) => (
                <Bar key={a} dataKey={a} fill={COLOR_PALETTE[i % COLOR_PALETTE.length]} radius={[2, 2, 0, 0]}
                  animationDuration={400} animationEasing="ease-out" />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
