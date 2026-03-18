'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import KPICard from '@/components/KPICard';
import MainChart from '@/components/MainChart';
import { BreakdownBar, BreakdownPie } from '@/components/BreakdownCharts';
import DataTable from '@/components/DataTable';

interface PivotRow { date: string; asset: string; category: string; value: number; }

export default function Dashboard() {
  const { selectedId, api } = useApp();
  const [data, setData] = useState<PivotRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`${api}/pivot-data?dataset_id=${selectedId}&group_by=month&metric=avg`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [selectedId, api]);

  // Compute KPIs from data
  const assets = [...new Set(data.map((r) => r.asset))];

  function latestValue(asset: string) {
    const rows = data.filter((r) => r.asset === asset).sort((a, b) => b.date.localeCompare(a.date));
    return rows[0]?.value ?? 0;
  }

  function totalReturn(asset: string) {
    const rows = data.filter((r) => r.asset === asset).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2) return 0;
    return ((rows[rows.length - 1].value - rows[0].value) / rows[0].value) * 100;
  }

  const bestAsset = assets.reduce((best, a) => totalReturn(a) > totalReturn(best) ? a : best, assets[0] ?? '');
  const worstAsset = assets.reduce((worst, a) => totalReturn(a) < totalReturn(worst) ? a : worst, assets[0] ?? '');

  const kpis = [
    {
      title: 'Best Performer',
      value: bestAsset || '—',
      change: bestAsset ? totalReturn(bestAsset) : undefined,
      subtitle: '2021 → 2024',
      color: 'emerald' as const,
    },
    {
      title: 'S&P 500 (SPY)',
      value: latestValue('SPY') ? `$${latestValue('SPY').toFixed(2)}` : '—',
      change: totalReturn('SPY') || undefined,
      subtitle: 'Dec 2024',
      color: 'indigo' as const,
    },
    {
      title: 'Bitcoin (BTC)',
      value: latestValue('BTC') ? `$${latestValue('BTC').toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—',
      change: totalReturn('BTC') || undefined,
      subtitle: 'Dec 2024',
      color: 'amber' as const,
    },
    {
      title: 'Worst Performer',
      value: worstAsset || '—',
      change: worstAsset ? totalReturn(worstAsset) : undefined,
      subtitle: '2021 → 2024',
      color: 'rose' as const,
    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
      Loading data…
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => <KPICard key={k.title} {...k} />)}
      </div>

      {/* Main chart */}
      <MainChart data={data} />

      {/* Breakdowns + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownBar data={data} />
        <BreakdownPie data={data} />
      </div>

      <DataTable data={data} />
    </div>
  );
}
