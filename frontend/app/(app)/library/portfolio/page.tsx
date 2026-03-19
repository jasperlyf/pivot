'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import { Eye, Pencil, Trash2, BriefcaseBusiness, Plus } from 'lucide-react';

interface Holding { symbol: string; weight: number; }
interface LibraryPortfolio {
  id: string;
  name: string;
  updatedAt: string;
  holdings: Holding[];
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

function fmtDate(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function LibraryPortfolioPage() {
  const { user } = useApp();
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<LibraryPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadItems() {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('portfolios')
      .select('id, name, updated_at, portfolio_assets(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setItems((data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updated_at,
          holdings: (p.portfolio_assets as any[])
            .sort((a, b) => b.weight - a.weight)
            .map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })),
        })));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadItems(); }, [user]); // eslint-disable-line

  async function handleDelete(id: string) {
    if (!confirm('Delete this portfolio? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('portfolios').delete().eq('id', id);
    setDeletingId(null);
    loadItems();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Portfolios</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Saved portfolios from the Portfolio Builder</p>
        </div>
        <button
          onClick={() => router.push('/portfolio')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
        >
          <Plus size={13} /> New Portfolio
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-slate-400 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          Loading…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 dark:text-slate-600">
          <BriefcaseBusiness size={44} strokeWidth={1.25} className="opacity-25" />
          <p className="text-sm">No saved portfolios yet</p>
          <button onClick={() => router.push('/portfolio')} className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">
            Create your first portfolio →
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {items.map((item) => {
            const totalWeight = item.holdings.reduce((s, h) => s + h.weight, 0);
            return (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">

                {/* Name + meta */}
                <div className="min-w-0 w-44 shrink-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{fmtDate(item.updatedAt)}</p>
                </div>

                {/* Holdings pills + bar */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {item.holdings.length === 0 ? (
                      <span className="text-xs text-slate-400">No holdings</span>
                    ) : item.holdings.map((h, i) => {
                      const pct = totalWeight > 0 ? ((h.weight / totalWeight) * 100).toFixed(1) : h.weight.toFixed(1);
                      return (
                        <span
                          key={h.symbol}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: COLORS[i % COLORS.length] + '18', color: COLORS[i % COLORS.length] }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {h.symbol}
                          <span className="opacity-70">{pct}%</span>
                        </span>
                      );
                    })}
                  </div>
                  {item.holdings.length > 0 && totalWeight > 0 && (
                    <div className="flex h-1 rounded-full overflow-hidden gap-px w-full max-w-xs">
                      {item.holdings.map((h, i) => (
                        <div key={h.symbol} style={{ width: `${(h.weight / totalWeight) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Asset count */}
                <span className="shrink-0 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                  {item.holdings.length} assets
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => router.push(`/portfolio-simulator?portfolio_id=${item.id}`)}
                    title="Simulate"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => router.push(`/portfolio?id=${item.id}`)}
                    title="Edit"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    title="Delete"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
