'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import {
  FolderOpen, Paperclip, Plus, GitCompare,
  Star, BarChart2, Activity,
  Layers, PieChart, Upload,
} from 'lucide-react';

interface WorkspaceSummary {
  id: string;
  name: string;
  updated_at: string;
  view_count: number;
  pinned: boolean;
}

interface ActivityItem {
  id: string;
  type: 'workspace_created' | 'document_uploaded';
  label: string;
  sub: string;
  href: string;
  date: string;
}

interface Stats {
  indexes: number;
  portfolios: number;
  datasets: number;
}

export default function Home() {
  const { user } = useApp();
  const router = useRouter();
  const supabase = createClient();

  const [stats, setStats]       = useState<Stats>({ indexes: 0, portfolios: 0, datasets: 0 });
  const [pinned, setPinned]     = useState<WorkspaceSummary[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]); // eslint-disable-line

  async function load() {
    setLoading(true);

    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name, updated_at, pinned, created_at')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (!workspaces) { setLoading(false); return; }

    const wsIds = workspaces.map((w) => w.id);
    const wsMap = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

    const [
      { count: totalIndexes },
      { count: totalPortfolios },
      wsWithCounts,
      { data: recentDocs },
    ] = await Promise.all([
      supabase
        .from('custom_indexes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id),
      supabase
        .from('portfolios')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id),
      Promise.all(
        workspaces.map(async (w) => {
          const { count } = await supabase
            .from('workspace_documents')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', w.id);
          return { ...w, view_count: count ?? 0 };
        })
      ),
      wsIds.length
        ? supabase
            .from('workspace_documents')
            .select('id, name, created_at, workspace_id')
            .in('workspace_id', wsIds)
            .order('created_at', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),
    ]);

    // Build activity feed from all event types
    const items: ActivityItem[] = [
      ...workspaces.map((w) => ({
        id: `ws-${w.id}`,
        type: 'workspace_created' as const,
        label: `Created workspace "${w.name}"`,
        sub: '',
        href: `/workspace/${w.id}`,
        date: w.created_at,
      })),
      ...(recentDocs ?? []).map((d) => ({
        id: `doc-${d.id}`,
        type: 'document_uploaded' as const,
        label: `Uploaded "${d.name}"`,
        sub: wsMap[d.workspace_id] ?? '',
        href: `/workspace/${d.workspace_id}`,
        date: d.created_at,
      })),
    ].filter((i) => i.date && !isNaN(new Date(i.date).getTime()))
     .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
     .slice(0, 20);

    setStats({ indexes: totalIndexes ?? 0, portfolios: totalPortfolios ?? 0, datasets: 0 });
    setPinned(wsWithCounts.filter((w) => w.pinned));
    setActivity(items);
    setLoading(false);
  }

  async function togglePin(ws: WorkspaceSummary) {
    const next = !ws.pinned;
    await supabase.from('workspaces').update({ pinned: next }).eq('id', ws.id);
    const updated = { ...ws, pinned: next };
    if (next) {
      setPinned((p) => [...p, updated]);
    } else {
      setPinned((p) => p.filter((w) => w.id !== ws.id));
    }
  }

  function fmtDate(d: string) {
    if (!d) return '—';
    const ms = new Date(d).getTime();
    if (isNaN(ms)) return '—';
    const diffMins  = Math.floor((Date.now() - ms) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);
    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)   return `${diffDays}d ago`;
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const activityConfig = {
    workspace_created: { icon: FolderOpen, bg: 'bg-indigo-50 dark:bg-indigo-950', color: 'text-indigo-500' },
    document_uploaded: { icon: Paperclip,  bg: 'bg-amber-50 dark:bg-amber-950',   color: 'text-amber-500'  },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Home</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your financial workspace overview</p>
      </div>

      {/* Favourite Workspaces */}
      {(loading || pinned.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star size={13} className="fill-amber-400 text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Favourite Workspaces</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pinned.map((w) => (
                <div key={w.id} className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl overflow-hidden group">
                  <button
                    onClick={() => router.push(`/workspace/${w.id}`)}
                    className="w-full text-left px-4 py-3.5 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{w.name}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Paperclip size={10} />{w.view_count} doc{w.view_count !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  <div className="flex items-center justify-end px-3 py-1.5 border-t border-amber-100 dark:border-amber-900/30">
                    <button
                      onClick={() => togglePin(w)}
                      className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                      <Star size={11} className="fill-amber-400" /> Unpin
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Saved Indexes',    value: stats.indexes,    icon: Layers,   color: 'text-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-950', href: '/library/index' },
          { label: 'Saved Portfolios', value: stats.portfolios, icon: PieChart, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950', href: '/library/portfolio' },
          { label: 'Total Datasets',   value: stats.datasets,   icon: Upload,   color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950', href: '/library/dataset' },
        ].map(({ label, value, icon: Icon, color, bg, href }) => (
          <button
            key={label}
            onClick={() => router.push(href)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex items-center gap-4 text-left hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={16} className={color} />
            </div>
            <div>
              {loading
                ? <div className="h-5 w-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-1" />
                : <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-none">{value}</p>
              }
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity Log */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Activity</h2>
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-600 gap-2">
              <Activity size={28} className="opacity-30" />
              <p className="text-xs">No activity yet.</p>
              <button
                onClick={() => router.push('/workspace')}
                className="mt-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                Create your first workspace →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {activity.map((item) => {
                const { icon: Icon, bg, color } = activityConfig[item.type];
                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(item.href)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
                  >
                    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon size={13} className={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                        {item.label}
                      </p>
                      {item.sub && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{item.sub}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{fmtDate(item.date)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Quick Actions</h2>
            </div>
            <div className="p-3 space-y-1">
              <button
                onClick={() => router.push('/workspace')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                  <Plus size={13} className="text-indigo-500" />
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">New Workspace</span>
              </button>
              <button
                onClick={() => router.push('/comparisons')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                  <GitCompare size={13} className="text-emerald-500" />
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">New Comparison</span>
              </button>
              <button
                onClick={() => router.push('/workspace')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
                  <Paperclip size={13} className="text-amber-500" />
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Upload Document</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
