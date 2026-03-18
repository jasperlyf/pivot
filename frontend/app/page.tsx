'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import KPICard from '@/components/KPICard';
import MainChart from '@/components/MainChart';
import { BreakdownBar, BreakdownPie } from '@/components/BreakdownCharts';
import DataTable from '@/components/DataTable';

interface Quote {
  symbol: string; name: string; category: string;
  price: number; change: number; changePct: number; prevClose: number;
}

interface HistoryRow { date: string; asset: string; name: string; category: string; value: number; }

export default function Dashboard() {
  const { symbols, dateRange, api } = useApp();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbols.length) return;
    const sym = symbols.join(',');
    fetch(`${api}/market-data/quotes?symbols=${sym}`)
      .then((r) => r.json())
      .then(setQuotes)
      .catch(() => {});
  }, [symbols, api]);

  useEffect(() => {
    if (!symbols.length) return;
    setLoading(true);
    const sym = symbols.join(',');
    fetch(`${api}/market-data/history?symbols=${sym}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbols, dateRange, api]);

  // KPI cards from live quotes — show top 4
  const topQuotes = quotes.slice(0, 4);

  const fmt = (price: number) =>
    price >= 1000
      ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${price.toFixed(2)}`;

  const colorMap = ['indigo', 'emerald', 'amber', 'rose'] as const;

  if (loading && !history.length) return (
    <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
      Loading market data…
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards — live quotes */}
      {topQuotes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {topQuotes.map((q, i) => (
            <KPICard
              key={q.symbol}
              title={q.name}
              value={fmt(q.price)}
              change={q.changePct}
              subtitle="Today"
              color={colorMap[i % 4]}
            />
          ))}
        </div>
      )}

      {/* Main chart */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-80 text-slate-400 text-sm shadow-sm">
          Fetching {dateRange.label} data…
        </div>
      ) : (
        <MainChart data={history} />
      )}

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
