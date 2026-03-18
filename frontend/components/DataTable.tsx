'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface PivotRow { date: string; asset: string; category: string; value: number; }

type SortKey = keyof PivotRow;

function fmt(v: number) {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(2)}`;
}

export default function DataTable({ data }: { data: PivotRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };
  const setDir = setSortDir;

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'number' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.ceil(sorted.length / pageSize);

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : <ChevronDown size={12} className="opacity-30" />;

  const cols: { key: SortKey; label: string }[] = [
    { key: 'date',     label: 'Date'     },
    { key: 'asset',    label: 'Asset'    },
    { key: 'category', label: 'Category' },
    { key: 'value',    label: 'Price'    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-slate-900">Raw Data</h3>
        <p className="text-xs text-slate-400 mt-0.5">{data.length} records</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50">
              {cols.map(({ key, label }) => (
                <th key={key}
                  onClick={() => toggle(key)}
                  className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700"
                >
                  <span className="flex items-center gap-1">{label}<SortIcon col={key} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-2.5 text-slate-600 font-mono text-xs">{row.date}</td>
                <td className="px-5 py-2.5 font-semibold text-slate-900">{row.asset}</td>
                <td className="px-5 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.category === 'crypto' ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'
                  }`}>{row.category}</span>
                </td>
                <td className="px-5 py-2.5 font-semibold text-slate-900 tabular-nums">{fmt(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">Page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-xs rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-xs rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
