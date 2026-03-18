'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface PivotRow { date: string; asset: string; category: string; value: number; }

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80, h = 28, pad = 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const color = positive ? '#10b981' : '#ef4444';

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fmt(v: number) {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(2)}`;
}

const CATEGORY_STYLE: Record<string, string> = {
  crypto:    'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  equity:    'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300',
  commodity: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
  bond:      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

type SortKey = 'asset' | 'category' | 'latest' | 'change' | 'changePct';

export default function DataTable({ data }: { data: PivotRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Build one row per asset
  const assetMap = new Map<string, { dates: string[]; values: number[]; category: string }>();
  for (const row of data) {
    if (!assetMap.has(row.asset)) assetMap.set(row.asset, { dates: [], values: [], category: row.category });
    assetMap.get(row.asset)!.dates.push(row.date);
    assetMap.get(row.asset)!.values.push(row.value);
  }

  const rows = [...assetMap.entries()].map(([asset, { dates, values, category }]) => {
    // Sort by date
    const sorted = dates.map((d, i) => ({ d, v: values[i] })).sort((a, b) => a.d.localeCompare(b.d));
    const sortedValues = sorted.map((x) => x.v);
    const first = sortedValues[0];
    const latest = sortedValues[sortedValues.length - 1];
    const change = latest - first;
    const changePct = parseFloat(((change / first) * 100).toFixed(2));
    return { asset, category, sortedValues, latest, change, changePct };
  });

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : <ChevronDown size={12} className="opacity-20" />;

  const cols: { key: SortKey; label: string; align?: string }[] = [
    { key: 'asset',     label: 'Asset'    },
    { key: 'category',  label: 'Category' },
    { key: 'latest',    label: 'Price',   align: 'right' },
    { key: 'changePct', label: '% Return', align: 'right' },
    { key: 'change',    label: 'Change',  align: 'right' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Asset Summary</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{rows.length} assets · {data.length} data points</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              {cols.map(({ key, label, align }) => (
                <th
                  key={key}
                  onClick={() => toggle(key)}
                  className={`px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300 ${align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                    {label}<SortIcon col={key} />
                  </span>
                </th>
              ))}
              <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const pos = row.changePct >= 0;
              return (
                <tr key={row.asset} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">{row.asset}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLE[row.category] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{fmt(row.latest)}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {pos ? '+' : ''}{row.changePct}%
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums text-xs ${pos ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {pos ? '+' : ''}{fmt(row.change)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Sparkline values={row.sortedValues} positive={pos} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
