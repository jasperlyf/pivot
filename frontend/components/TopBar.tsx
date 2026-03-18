'use client';

import { useApp, DATE_PRESETS } from '@/lib/context';

export default function TopBar() {
  const { globalDateRange, setGlobalDateRange } = useApp();

  return (
    <div className="h-11 flex items-center justify-end px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
      <div className="flex gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setGlobalDateRange(p)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              globalDateRange.label === p.label
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
