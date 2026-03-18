'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import MainChart from '@/components/MainChart';

interface PivotRow { date: string; asset: string; category: string; value: number; }

const GROUP_OPTIONS = [{ v: 'day', l: 'Day' }, { v: 'week', l: 'Week' }, { v: 'month', l: 'Month' }];
const METRIC_OPTIONS = [{ v: 'avg', l: 'Average' }, { v: 'sum', l: 'Sum' }, { v: 'change', l: '% Change' }];
const CATEGORY_OPTIONS = [{ v: '', l: 'All' }, { v: 'equity', l: 'Equity' }, { v: 'crypto', l: 'Crypto' }];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
    }`}>{label}</button>
  );
}

export default function ExplorePage() {
  const { selectedId, api } = useApp();
  const [groupBy, setGroupBy] = useState('month');
  const [metric, setMetric] = useState('avg');
  const [category, setCategory] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [allAssets, setAllAssets] = useState<string[]>([]);
  const [data, setData] = useState<PivotRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all assets on mount
  useEffect(() => {
    if (!selectedId) return;
    fetch(`${api}/pivot-data?dataset_id=${selectedId}&group_by=month&metric=avg`)
      .then((r) => r.json())
      .then((d: PivotRow[]) => {
        const assets = [...new Set(d.map((r) => r.asset))];
        setAllAssets(assets);
        setSelectedAssets(assets);
      });
  }, [selectedId, api]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    const params = new URLSearchParams({ dataset_id: selectedId, group_by: groupBy, metric });
    if (category) params.append('category', category);
    fetch(`${api}/pivot-data?${params}`)
      .then((r) => r.json())
      .then((d: PivotRow[]) => {
        setData(selectedAssets.length ? d.filter((r) => selectedAssets.includes(r.asset)) : d);
        setLoading(false);
      });
  }, [selectedId, groupBy, metric, category, api]);

  const filtered = selectedAssets.length ? data.filter((r) => selectedAssets.includes(r.asset)) : data;

  const toggleAsset = (a: string) =>
    setSelectedAssets((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel */}
      <div className="w-56 shrink-0 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Group by</p>
            <div className="flex flex-col gap-1.5">
              {GROUP_OPTIONS.map(({ v, l }) => (
                <Chip key={v} label={l} active={groupBy === v} onClick={() => setGroupBy(v)} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metric</p>
            <div className="flex flex-col gap-1.5">
              {METRIC_OPTIONS.map(({ v, l }) => (
                <Chip key={v} label={l} active={metric === v} onClick={() => setMetric(v)} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Category</p>
            <div className="flex flex-col gap-1.5">
              {CATEGORY_OPTIONS.map(({ v, l }) => (
                <Chip key={v} label={l} active={category === v} onClick={() => setCategory(v)} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Assets</p>
            <div className="flex flex-col gap-1.5">
              {allAssets.map((a) => (
                <Chip key={a} label={a} active={selectedAssets.includes(a)} onClick={() => toggleAsset(a)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart panel */}
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Explore</h1>
          <p className="text-sm text-slate-500 mt-0.5">Click controls to update chart instantly</p>
        </div>
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-80 text-slate-400 text-sm shadow-sm">Loading…</div>
        ) : (
          <MainChart data={filtered} />
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 text-xs text-slate-500 flex gap-6">
          <span><span className="font-semibold text-slate-700">{filtered.length}</span> data points</span>
          <span><span className="font-semibold text-slate-700">{[...new Set(filtered.map(r => r.asset))].length}</span> assets</span>
          <span><span className="font-semibold text-slate-700">{[...new Set(filtered.map(r => r.date))].length}</span> periods</span>
        </div>
      </div>
    </div>
  );
}
