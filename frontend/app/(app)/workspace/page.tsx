'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderOpen, Clock, Eye, ArrowRight, X, Star, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  view_count: number;
}

export default function WorkspacePage() {
  const { user } = useApp();
  const router = useRouter();
  const supabase = createClient();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('workspaces')
      .select('id, name, created_at, updated_at, pinned')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (data) {
      const withCounts = await Promise.all(
        data.map(async (w) => {
          const { count } = await supabase
            .from('workspace_views')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', w.id);
          return { ...w, view_count: count ?? 0 };
        })
      );
      setWorkspaces(withCounts.sort((a, b) => Number(b.pinned) - Number(a.pinned)));
    }
    setLoading(false);
  }

  async function createWorkspace() {
    if (!newName.trim() || !user) return;
    setSaving(true);
    const { data } = await supabase
      .from('workspaces')
      .insert({ name: newName.trim(), user_id: user.id })
      .select()
      .single();
    setSaving(false);
    if (data) {
      setNewName('');
      setCreating(false);
      router.push(`/workspace/${data.id}`);
    }
  }

  async function deleteWorkspace(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('workspaces').delete().eq('id', id);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setConfirmDeleteId(null);
  }

  async function togglePin(w: Workspace, e: React.MouseEvent) {
    e.stopPropagation();
    const next = !w.pinned;
    setWorkspaces((prev) =>
      prev.map((ws) => ws.id === w.id ? { ...ws, pinned: next } : ws)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    );
    await supabase.from('workspaces').update({ pinned: next }).eq('id', w.id);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Workspaces</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Organise your analyses and presentations
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={15} strokeWidth={2.5} />
          New Workspace
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">New workspace</p>
            <button
              onClick={() => { setCreating(false); setNewName(''); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={15} />
            </button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Q2 Client Review"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createWorkspace();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={createWorkspace}
              disabled={!newName.trim() || saving}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="text-center py-24 text-slate-400 dark:text-slate-600">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No workspaces yet.</p>
          <p className="text-xs mt-1">Create one to start organising your analyses.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`flex items-center bg-white dark:bg-slate-900 border rounded-xl hover:shadow-sm transition-all group ${
                w.pinned
                  ? 'border-amber-200 dark:border-amber-800'
                  : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
              }`}
            >
              <button
                onClick={() => router.push(`/workspace/${w.id}`)}
                className="flex-1 text-left px-5 py-4 min-w-0"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {w.pinned && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />}
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{w.name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Eye size={11} />
                        {w.view_count} view{w.view_count !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={11} />
                        Updated {fmtDate(w.updated_at)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={15} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors shrink-0 ml-3" />
                </div>
              </button>
              <button
                onClick={(e) => togglePin(w, e)}
                title={w.pinned ? 'Unpin' : 'Pin to favourites'}
                className={`p-3 rounded-lg transition-all ${
                  w.pinned
                    ? 'text-amber-400 hover:text-amber-500'
                    : 'text-slate-200 dark:text-slate-700 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                }`}
              >
                <Star size={14} className={w.pinned ? 'fill-amber-400' : ''} />
              </button>

              {confirmDeleteId === w.id ? (
                <div className="flex items-center gap-1 pr-3" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Delete?</span>
                  <button
                    onClick={(e) => deleteWorkspace(w.id, e)}
                    className="px-2.5 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                    className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(w.id); }}
                  title="Delete workspace"
                  className="p-3 mr-1 rounded-lg text-slate-200 dark:text-slate-700 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
