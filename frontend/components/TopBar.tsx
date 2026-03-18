'use client';

import { useRouter } from 'next/navigation';
import { Upload, ChevronDown } from 'lucide-react';
import { useApp } from '@/lib/context';

export default function TopBar() {
  const { datasets, selectedId, setSelectedId } = useApp();
  const router = useRouter();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      {/* Dataset selector */}
      <div className="relative flex items-center gap-2">
        <span className="text-sm text-slate-500">Dataset</span>
        <div className="relative">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={() => router.push('/data-sources')}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
      >
        <Upload size={14} />
        Upload Data
      </button>
    </header>
  );
}
