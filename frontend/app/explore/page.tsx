'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import MainChart from '@/components/MainChart';

interface HistoryRow { date: string; asset: string; name: string; category: string; value: number; }

const INTERVALS = [
  { label: 'Daily',   value: '1d'  },
  { label: 'Weekly',  value: '1wk' },
  { label: 'Monthly', value: '1mo' },
];

const CATEGORIES = [
  { label: 'All',       value: '' },
  { label: 'Equity',    value: 'equity' },
  { label: 'Crypto',    value: 'crypto' },
  { label: 'Commodity', value: 'commodity' },
];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
    }`}>{label}</button>
  );
}

export default function ExplorePage() {
  const { symbols, dateRange, api } = useApp();
  const [interval, setIntervalVal] = useState('1mo');
  const [category, setCategory] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [allData, setAllData] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedAssets(symbols);
  }, [symbols]);

  useEffect(() => {
    if (!symbols.length) return;
    setLoading(true);
    fetch(`${api}/market-data/history?symbols=${symbols.join(',')}&period=${dateRange.period}&interval=${interval}`)
      .then((r) => r.json())
      .then((d) => { setAllData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbols, dateRange, interval, api]);

  const filtered = allData.filter((r) => {
    if (selectedAssets.length && !selectedAssets.includes(r.asset)) return false;
    if (category && r.category !== category) return false;
    return true;
  });

  const toggleAsset = (a: string) =>
    setSelectedAssets((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);

  const uniqueAssets = [...new Set(allData.map((r) => r.asset))];

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel */}
      <div className="w-52 shrink-0 space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Interval</p>
            <div className="flex flex-col gap-1.5">
              {INTERVALS.map(({ label, value }) => (
                <Chip key={value} label={label} active={interval === value} onClick={() => setIntervalVal(value)} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Category</p>
            <div className="flex flex-col gap-1.5">
              {CATEGORIES.map(({ label, value }) => (
                <Chip key={value} label={label} active={category === value} onClick={() => setCategory(value)} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Assets</p>
            <div className="flex flex-col gap-1.5">
              {uniqueAssets.map((a) => (
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
