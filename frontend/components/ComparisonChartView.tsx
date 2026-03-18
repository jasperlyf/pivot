'use client';

import { useState, useEffect } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

interface ViewConfig {
  symbols?: string[];
  period?: string;
  interval?: string;
  mode?: string;
}

interface HistoryRow { date: string; asset: string; value: number; }
interface CustomIndex { id: string; name: string; holdings: { symbol: string; weight: number }[]; }

export default function ComparisonChartView({ config }: { config: ViewConfig }) {
  const { api, user } = useApp();
  const supabase = createClient();

  const initPreset = DATE_PRESETS.find(
    (p) => p.period === config.period && p.interval === config.interval
  ) ?? DATE_PRESETS[3];

  const [dateRange, setDateRange] = useState<DateRange>(initPreset);
  const [mode, setMode] = useState<'price' | 'pct'>(config.mode === 'price' ? 'price' : 'pct');
  const [data, setData] = useState<HistoryRow[]>([]);
  const [customIndexes, setCustomIndexes] = useState<CustomIndex[]>([]);
  const [loading, setLoading] = useState(false);

  const allSlots = config.symbols?.filter(Boolean) ?? [];
  const idxSlots = allSlots.filter((s) => s.startsWith('idx:'));
  const regularSlots = allSlots.filter((s) => !s.startsWith('idx:'));

  // Fetch custom index definitions from Supabase
  useEffect(() => {
    if (!idxSlots.length || !user) return;
    const ids = idxSlots.map((s) => s.slice(4));
    supabase
      .from('custom_indexes')
      .select('id, name, index_holdings(asset_symbol, weight)')
      .in('id', ids)
      .then(({ data: rows }) => {
        if (!rows) return;
        setCustomIndexes(rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          holdings: (r.index_holdings ?? []).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })),
        })));
      });
  }, [idxSlots.join(','), user]); // eslint-disable-line

  // All symbols needed: regular slots + component symbols from custom indexes
  const componentSymbols = customIndexes.flatMap((idx) => idx.holdings.map((h) => h.symbol));
  const allNeededSymbols = [...new Set([...regularSlots, ...componentSymbols])];

  // Fetch history for all needed symbols
  useEffect(() => {
    if (!allNeededSymbols.length) return;
    // Wait for custom index definitions to load before fetching
    if (idxSlots.length > 0 && customIndexes.length === 0) return;
    setLoading(true);
    fetch(`${api}/market-data/history?symbols=${allNeededSymbols.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [allNeededSymbols.join(','), dateRange, api, customIndexes.length]); // eslint-disable-line

  // Build history map per symbol
  const historyMap: Record<string, { date: string; value: number }[]> = {};
  for (const r of data) {
    if (!historyMap[r.asset]) historyMap[r.asset] = [];
    historyMap[r.asset].push({ date: r.date, value: r.value });
  }

  // Display label for a slot
  const labelFor = (slot: string) => {
    if (slot.startsWith('idx:')) {
      return customIndexes.find((i) => i.id === slot.slice(4))?.name ?? 'Custom Index';
    }
    return slot;
  };

  const chartData = (() => {
    const sorted = [...data]
      .filter((r) => regularSlots.includes(r.asset))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (mode === 'price') {
      const m = new Map<string, Record<string, number>>();
      for (const r of sorted) {
        if (!m.has(r.date)) m.set(r.date, { date: r.date } as unknown as Record<string, number>);
        m.get(r.date)![r.asset] = r.value;
      }
      return [...m.values()];
    }

    // % return mode
    const base: Record<string, number> = {};
    const m = new Map<string, Record<string, number>>();
    for (const r of sorted) {
      if (!base[r.asset]) base[r.asset] = r.value;
      if (!m.has(r.date)) m.set(r.date, { date: r.date } as unknown as Record<string, number>);
      m.get(r.date)![r.asset] = parseFloat(((r.value / base[r.asset]) * 100).toFixed(2));
    }

    // Compute weighted return series for each custom index
    for (const slot of idxSlots) {
      const idx = customIndexes.find((i) => i.id === slot.slice(4));
      if (!idx) continue;
      const label = idx.name;
      const filled = idx.holdings.filter((h) => historyMap[h.symbol]?.length > 0);
      if (!filled.length) continue;

      const dateSets = filled.map((h) => new Set(historyMap[h.symbol].map((p) => p.date)));
      const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
      const totalW = filled.reduce((s, h) => s + h.weight, 0);
      if (!totalW || !commonDates.length) continue;

      const bases: Record<string, number> = {};
      for (const h of filled) {
        bases[h.symbol] = historyMap[h.symbol].find((p) => p.date === commonDates[0])?.value ?? 1;
      }

      for (const date of commonDates) {
        if (!m.has(date)) m.set(date, { date } as unknown as Record<string, number>);
        const val = filled.reduce((sum, h) => {
          const pt = historyMap[h.symbol].find((p) => p.date === date);
          return sum + (h.weight / totalW) * ((pt?.value ?? bases[h.symbol]) / bases[h.symbol]) * 100;
        }, 0);
        m.get(date)![label] = parseFloat(val.toFixed(2));
      }
    }

    return [...m.values()];
  })();

  // Return badges
  const returns: Record<string, number | null> = {};
  if (mode === 'pct' && chartData.length > 1) {
    for (const slot of allSlots) {
      const key = labelFor(slot);
      const last = [...chartData].reverse().find((d) => d[key] != null)?.[key] as number | undefined;
      returns[slot] = last != null ? parseFloat((last - 100).toFixed(1)) : null;
    }
  }

  if (!allSlots.length) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">No symbols in this view.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDateRange(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                dateRange.label === p.label
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode('pct')}
            className={`px-3 py-1.5 transition-colors ${mode === 'pct' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            % Return
          </button>
          <button
            onClick={() => setMode('price')}
            className={`px-3 py-1.5 transition-colors ${mode === 'price' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            Price
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className={`transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={mode === 'price' ? 60 : 40}
              tickFormatter={mode === 'price' ? (v) => `$${Number(v).toLocaleString()}` : (v) => `${v}`}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
              formatter={(v, name) =>
                mode === 'price'
                  ? [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, name]
                  : [`${v}`, name]
              }
            />
            <Legend
              formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>}
              iconType="circle"
              iconSize={8}
            />
            {allSlots.map((slot, i) => (
              <Line
                key={slot}
                type="monotone"
                dataKey={labelFor(slot)}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                animationDuration={400}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Return badges */}
        {mode === 'pct' && Object.keys(returns).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {allSlots.map((slot, i) => {
              const ret = returns[slot];
              if (ret == null) return null;
              const pos = ret >= 0;
              return (
                <span
                  key={slot}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    pos ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700' : 'bg-rose-50 dark:bg-rose-950 text-rose-700'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {labelFor(slot)} {pos ? '+' : ''}{ret}%
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
