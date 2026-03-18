'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

interface HistoryRow { date: string; asset: string; value: number; category: string; }

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

function ComparePanel({
  api, symbols, label, color, period, interval,
}: { api: string; symbols: string[]; label: string; color: string; period: string; interval: string }) {
  const [asset, setAsset] = useState(symbols[0] ?? '');
  const [data, setData] = useState<HistoryRow[]>([]);

  useEffect(() => { if (symbols[0]) setAsset(symbols[0]); }, [symbols]);

  useEffect(() => {
    if (!asset) return;
    fetch(`${api}/market-data/history?symbols=${asset}&period=${period}&interval=${interval}`)
      .then((r) => r.json())
      .then(setData);
  }, [asset, api, period, interval]);

  const indexed = (() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return [];
    const base = sorted[0].value;
    return sorted.map((r) => ({ date: r.date, value: parseFloat(((r.value / base) * 100).toFixed(2)) }));
  })();

  const ret = indexed.length > 1 ? (indexed[indexed.length - 1].value - 100).toFixed(1) : null;
  const pos = ret !== null && parseFloat(ret) >= 0;

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <select value={asset} onChange={(e) => setAsset(e.target.value)}
          className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={indexed} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip formatter={(v) => [`${v}`, 'Index (base 100)']}
            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      {ret !== null && (
        <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${pos ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {pos ? '+' : ''}{ret}% total return
        </div>
      )}
    </div>
  );
}

export default function ComparisonsPage() {
  const { symbols, dateRange, api } = useApp();
  const [allData, setAllData] = useState<HistoryRow[]>([]);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!symbols.length) return;
    fetch(`${api}/market-data/history?symbols=${symbols.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then(setAllData);
  }, [symbols, dateRange, api]);

  const assets = [...new Set(allData.map((r) => r.asset))];

  const overlayData = (() => {
    const baselines: Record<string, number> = {};
    const byDate = new Map<string, Record<string, number>>();
    for (const r of [...allData].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!baselines[r.asset]) baselines[r.asset] = r.value;
      if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date } as unknown as Record<string, number>);
      byDate.get(r.date)![r.asset] = parseFloat(((r.value / baselines[r.asset]) * 100).toFixed(2));
    }
    return [...byDate.values()];
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Comparisons</h1>
          <p className="text-sm text-slate-500 mt-0.5">All returns indexed to 100 at start of period</p>
        </div>
        <button onClick={() => setOverlay((v) => !v)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            overlay ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
          }`}>
          {overlay ? 'Split view' : 'Overlay all'}
        </button>
      </div>

      {overlay ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">All Assets — Indexed (base 100)</h3>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={overlayData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
              <Legend formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} iconType="circle" iconSize={8} />
              {assets.map((a, i) => (
                <Line key={a} type="monotone" dataKey={a} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex gap-4">
          <ComparePanel api={api} symbols={symbols} label="Asset A" color="#6366f1" period={dateRange.period} interval={dateRange.interval} />
          <ComparePanel api={api} symbols={[...symbols].reverse()} label="Asset B" color="#10b981" period={dateRange.period} interval={dateRange.interval} />
        </div>
      )}
    </div>
  );
}
