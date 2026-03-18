'use client';

import { useEffect, useState } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import MainChart from '@/components/MainChart';
import { BreakdownBar, BreakdownPie } from '@/components/BreakdownCharts';
import DataTable from '@/components/DataTable';
import SmartInsights from '@/components/SmartInsights';
import { Star, Settings2 } from 'lucide-react';
import Link from 'next/link';
import TickerTape from '@/components/TickerTape';

interface HistoryRow { date: string; asset: string; name: string; category: string; value: number; }

const DATA_PACKS = [
  { label: 'Global Indices', symbols: ['SPY', 'ACWI', 'EEM', 'DIA'] },
  { label: 'Tech Growth',    symbols: ['QQQ', 'NVDA', 'TSLA', 'MSFT'] },
  { label: 'Crypto Basket',  symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'] },
  { label: 'Macro',          symbols: ['GLD', 'TLT', 'DXY'] },
];

export default function Dashboard() {
  const { symbols, setSymbols, api } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[3]);
  const [history, setHistory]     = useState<HistoryRow[]>([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!symbols.length) return;
    setLoading(true);
    fetch(`${api}/market-data/history?symbols=${symbols.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbols, dateRange, api]);

  if (!symbols.length) return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <Star size={28} className="text-slate-200 dark:text-slate-700" />
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No favourites yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Load a preset or go to <Link href="/settings" className="text-indigo-500 hover:underline">Settings</Link> to add assets.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {DATA_PACKS.map((pack) => (
          <button key={pack.label} onClick={() => setSymbols(pack.symbols)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm">
            {pack.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 mb-2">
        <TickerTape />
      </div>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Star size={11} className="fill-amber-400 text-amber-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{symbols.length} favourite{symbols.length !== 1 ? 's' : ''}: {symbols.join(', ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setDateRange(preset)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  dateRange.label === preset.label
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Link href="/settings"
            className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Manage favourites">
            <Settings2 size={14} />
          </Link>
        </div>
      </div>

      {/* Data pack presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Load pack:</span>
        {DATA_PACKS.map((pack) => {
          const active = pack.symbols.every((s) => symbols.includes(s)) && symbols.length === pack.symbols.length;
          return (
            <button key={pack.label} onClick={() => setSymbols(pack.symbols)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}>
              {pack.label}
            </button>
          );
        })}
      </div>

      {/* Smart insights */}
      {symbols.length >= 1 && (
        <SmartInsights
          symbols={symbols}
          api={api}
          period={['3Y', '5Y'].includes(dateRange.label) ? dateRange.label : '1Y'}
        />
      )}

      {/* Price history chart */}
      <MainChart data={history} loading={loading} />

      {/* Breakdowns */}
      {history.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownBar data={history} />
            <BreakdownPie data={history} />
          </div>
          <DataTable data={history} />
        </>
      )}
    </div>
  );
}
