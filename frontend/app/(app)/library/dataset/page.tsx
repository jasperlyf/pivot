'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import { Eye, Trash2, Database, Plus } from 'lucide-react';

interface LibraryDataset {
  id: string;
  name: string;
  createdAt: string;
  recordCount: number;
  categories: string[];
}

function fmtDate(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

const CATEGORY_COLORS: Record<string, string> = {
  equity: '#6366f1', bond: '#10b981', crypto: '#f59e0b',
  fx: '#8b5cf6', macro: '#06b6d4', other: '#94a3b8',
};

export default function LibraryDatasetPage() {
  const { user } = useApp();
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<LibraryDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadItems() {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('datasets')
      .select('id, name, created_at, records(id, category)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setItems((data ?? []).map((ds: any) => {
          const records: any[] = ds.records ?? [];
          const cats = [...new Set(records.map((r: any) => r.category).filter(Boolean))] as string[];
          return { id: ds.id, name: ds.name, createdAt: ds.created_at, recordCount: records.length, categories: cats };
        }));
        setLoading(false);
      });
  }

  useEffect(() => { loadItems(); }, [user]); // eslint-disable-line

  async function handleDelete(id: string) {
    if (!confirm('Delete this dataset? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('datasets').delete().eq('id', id).eq('user_id', user!.id);
    setDeletingId(null);
    loadItems();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Datasets</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Uploaded datasets available across Builder tools</p>
        </div>
        <button
          onClick={() => router.push('/data-sources')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
        >
          <Plus size={13} /> Upload Dataset
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
          <Database size={44} strokeWidth={1.25} className="opacity-25" />
          <p className="text-sm">No datasets uploaded yet</p>
          <button onClick={() => router.push('/data-sources')} className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">
            Upload your first dataset →
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">

              {/* Name + meta */}
              <div className="min-w-0 w-44 shrink-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{fmtDate(item.createdAt)}</p>
              </div>

              {/* Category tags */}
              <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                {item.categories.length === 0 ? (
                  <span className="text-xs text-slate-400">No categories</span>
                ) : item.categories.map((cat) => {
                  const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other;
                  return (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md capitalize"
                      style={{ backgroundColor: color + '18', color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {cat}
                    </span>
                  );
                })}
              </div>

              {/* Record count */}
              <span className="shrink-0 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                {item.recordCount.toLocaleString()} rows
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => router.push('/data-sources')}
                  title="View"
                  className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                >
                  <Eye size={14} />
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
          ))}
        </div>
      )}
    </div>
  );
}
