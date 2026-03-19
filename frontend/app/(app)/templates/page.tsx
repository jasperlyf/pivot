'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pin, Star, Search, ArrowUpDown } from 'lucide-react';
import { TEMPLATES } from '@/lib/templates';
import { useApp } from '@/lib/context';

type SortKey = 'default' | 'az' | 'za' | 'pinned' | 'starred';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default',  label: 'Default' },
  { value: 'az',       label: 'A → Z' },
  { value: 'za',       label: 'Z → A' },
  { value: 'pinned',   label: 'Pinned first' },
  { value: 'starred',  label: 'Starred first' },
];

export default function TemplatesPage() {
  const { templatePinned, toggleTemplatePinned, templateFavourites, toggleTemplateFavourite } = useApp();
  const [query, setQuery]   = useState('');
  const [sort, setSort]     = useState<SortKey>('default');

  const filtered = (query.trim()
    ? TEMPLATES.filter((t) => {
        const q = query.toLowerCase();
        return (
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.detail.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
    : [...TEMPLATES]
  ).sort((a, b) => {
    if (sort === 'az') return a.label.localeCompare(b.label);
    if (sort === 'za') return b.label.localeCompare(a.label);
    if (sort === 'pinned') {
      const ap = templatePinned.includes(a.label) ? 0 : 1;
      const bp = templatePinned.includes(b.label) ? 0 : 1;
      return ap - bp;
    }
    if (sort === 'starred') {
      const as = templateFavourites.includes(a.label) ? 0 : templatePinned.includes(a.label) ? 1 : 2;
      const bs = templateFavourites.includes(b.label) ? 0 : templatePinned.includes(b.label) ? 1 : 2;
      return as - bs;
    }
    return 0; // default — preserve original order
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Templates</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pre-built views for exploring, comparing, and analysing financial data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="relative">
            <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="pl-8 pr-7 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Instruction banner */}
      <div className="flex items-start gap-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Pin size={12} />
            </span>
            <span><span className="font-semibold text-slate-700 dark:text-slate-200">Pin</span> — adds the template to your sidebar nav dropdown so you can reach it quickly</span>
          </div>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:block">·</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-400 shrink-0">
              <Star size={12} />
            </span>
            <span><span className="font-semibold text-slate-700 dark:text-slate-200">Star</span> — moves a pinned template to the top of the sidebar dropdown (pin first)</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full py-8 text-center">No templates match &ldquo;{query}&rdquo;</p>
        )}
        {filtered.map((t) => {
          const Icon  = t.icon;
          const isPinned = templatePinned.includes(t.label);
          const isFav    = templateFavourites.includes(t.label);
          return (
            <div
              key={t.label}
              className={`flex flex-col bg-white dark:bg-slate-900 border rounded-xl p-5 hover:shadow-sm transition-all group ${
                isPinned
                  ? 'border-indigo-200 dark:border-indigo-800'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Icon + label + actions */}
              <div className="flex items-start gap-3 mb-3">
                <div className={`p-2.5 rounded-lg ${t.iconBg} shrink-0`}>
                  <Icon size={18} className={t.iconColor} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {/* Star — move to top of sidebar. Only active when pinned */}
                  <button
                    onClick={() => { if (!isPinned) return; toggleTemplateFavourite(t.label); }}
                    title={isFav ? 'Remove from top' : isPinned ? 'Move to top of sidebar' : 'Pin first to use this'}
                    className={`p-1 rounded-md transition-all ${
                      isFav
                        ? 'text-amber-400'
                        : isPinned
                          ? 'text-slate-300 dark:text-slate-600 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                          : 'opacity-0 cursor-not-allowed'
                    }`}
                  >
                    <Star size={13} className={isFav ? 'fill-amber-400' : ''} />
                  </button>
                  {/* Pin — always visible, prominent */}
                  <button
                    onClick={() => toggleTemplatePinned(t.label)}
                    title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      isPinned
                        ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-500'
                    }`}
                  >
                    <Pin size={11} className={isPinned ? 'fill-indigo-200 dark:fill-indigo-900' : ''} />
                    {isPinned ? 'Pinned' : 'Pin'}
                  </button>
                </div>
              </div>

              {/* Detail */}
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                {t.detail}
              </p>

              {/* Tags + CTA */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap gap-1">
                  {t.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <Link
                  href={t.href}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shrink-0 ml-2"
                >
                  Use
                  <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}
