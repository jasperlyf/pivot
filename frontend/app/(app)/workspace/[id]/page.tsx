'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, FileText, Paperclip, Pencil, Check, X, Trash2, ChevronDown, ChevronUp, Upload, ExternalLink } from 'lucide-react';
import ComparisonChartView from '@/components/ComparisonChartView';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

type Tab = 'views' | 'notes' | 'documents';

interface WorkspaceView {
  id: string;
  name: string;
  config: {
    symbols?: string[];
    period?: string;
    interval?: string;
    mode?: string;
  };
  created_at: string;
}

interface WorkspaceDoc {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

interface Workspace {
  id: string;
  name: string;
  updated_at: string;
}

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const router = useRouter();
  const supabase = createClient();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>('views');
  const [views, setViews] = useState<WorkspaceView[]>([]);
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [expandedView, setExpandedView] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: ws }, { data: vws }, { data: nt }, { data: dc }] = await Promise.all([
      supabase.from('workspaces').select('id, name, updated_at').eq('id', id).single(),
      supabase.from('workspace_views').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
      supabase.from('workspace_notes').select('content').eq('workspace_id', id).single(),
      supabase.from('workspace_documents').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
    ]);

    if (!ws) { router.push('/workspace'); return; }

    setWorkspace(ws);
    setViews(vws ?? []);
    setNotes(nt?.content ?? '');
    setDocs(dc ?? []);
    setLoading(false);
  }, [id, user]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  async function saveNotes() {
    if (!notesDirty) return;
    setNotesSaving(true);
    const { data: existing } = await supabase
      .from('workspace_notes')
      .select('id')
      .eq('workspace_id', id)
      .single();

    if (existing) {
      await supabase
        .from('workspace_notes')
        .update({ content: notes, updated_at: new Date().toISOString() })
        .eq('workspace_id', id);
    } else {
      await supabase
        .from('workspace_notes')
        .insert({ workspace_id: id, content: notes });
    }

    await supabase
      .from('workspaces')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    setNotesDirty(false);
    setNotesSaving(false);
  }

  async function deleteView(viewId: string) {
    await supabase.from('workspace_views').delete().eq('id', viewId);
    setViews((v) => v.filter((x) => x.id !== viewId));
  }

  async function renameWorkspace() {
    if (!renameDraft.trim()) return;
    await supabase
      .from('workspaces')
      .update({ name: renameDraft.trim(), updated_at: new Date().toISOString() })
      .eq('id', id);
    setWorkspace((w) => w ? { ...w, name: renameDraft.trim() } : w);
    setRenamingWorkspace(false);
  }

  async function uploadDocument(file: File) {
    if (!user) return;
    setUploading(true);
    setUploadError('');
    const path = `${user.id}/${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('workspace-documents').upload(path, file);
    if (error) { setUploadError(error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('workspace-documents').getPublicUrl(path);
    const { data: doc } = await supabase
      .from('workspace_documents')
      .insert({ workspace_id: id, name: file.name, url: publicUrl })
      .select()
      .single();
    if (doc) setDocs((d) => [doc, ...d]);
    await supabase.from('workspaces').update({ updated_at: new Date().toISOString() }).eq('id', id);
    setUploading(false);
  }

  async function deleteDocument(docId: string, url: string) {
    const marker = '/object/public/workspace-documents/';
    const path = url.includes(marker) ? url.split(marker)[1] : null;
    if (path) await supabase.storage.from('workspace-documents').remove([decodeURIComponent(path)]);
    await supabase.from('workspace_documents').delete().eq('id', docId);
    setDocs((d) => d.filter((doc) => doc.id !== docId));
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'views', label: 'Views', icon: Eye },
    { key: 'notes', label: 'Notes', icon: FileText },
    { key: 'documents', label: 'Documents', icon: Paperclip },
  ];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="h-10 w-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + title */}
      <div className="space-y-1">
        <button
          onClick={() => router.push('/workspace')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors mb-2"
        >
          <ArrowLeft size={13} />
          All workspaces
        </button>

        <div className="flex items-center gap-2">
          {renamingWorkspace ? (
            <>
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameWorkspace();
                  if (e.key === 'Escape') setRenamingWorkspace(false);
                }}
                className="text-xl font-semibold bg-transparent border-b-2 border-indigo-500 text-slate-800 dark:text-slate-100 focus:outline-none"
              />
              <button onClick={renameWorkspace} className="text-emerald-500 hover:text-emerald-600">
                <Check size={16} />
              </button>
              <button onClick={() => setRenamingWorkspace(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{workspace.name}</h1>
              <button
                onClick={() => { setRenameDraft(workspace.name); setRenamingWorkspace(true); }}
                className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
              >
                <Pencil size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {label}
            {key === 'views' && views.length > 0 && (
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full px-1.5 py-0.5 leading-none">
                {views.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Views tab */}
      {tab === 'views' && (
        <div>
          {views.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-600">
              <Eye size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No saved views yet.</p>
              <p className="text-xs mt-1">
                Go to{' '}
                <button
                  onClick={() => router.push('/comparisons')}
                  className="text-indigo-500 hover:underline"
                >
                  Comparisons
                </button>{' '}
                and save a view into this workspace.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {views.map((view) => {
                const isExpanded = expandedView === view.id;
                return (
                  <div
                    key={view.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    {/* View header — always visible */}
                    <div className="flex items-center justify-between px-5 py-4 gap-4">
                      <button
                        onClick={() => setExpandedView(isExpanded ? null : view.id)}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{view.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {view.config.symbols?.map((s) => (
                              <span key={s} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-md">
                                {s}
                              </span>
                            ))}
                            {view.config.period && (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs rounded-md">
                                {view.config.period.toUpperCase()}
                              </span>
                            )}
                            {view.config.mode && (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs rounded-md capitalize">
                                {view.config.mode === 'pct' ? '% Return' : 'Price'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-slate-400 dark:text-slate-600">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </button>
                      <button
                        onClick={() => deleteView(view.id)}
                        title="Delete view"
                        className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Live chart — shown when expanded */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4">
                        <ComparisonChartView config={view.config} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <div className="space-y-3">
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            placeholder="Write your notes, investment thesis, or talking points here…"
            rows={16}
            className="w-full px-4 py-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={saveNotes}
              disabled={!notesDirty || notesSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {notesSaving ? 'Saving…' : 'Save notes'}
            </button>
            {!notesDirty && !notesSaving && notes && (
              <span className="text-xs text-slate-400 dark:text-slate-600 flex items-center gap-1">
                <Check size={12} className="text-emerald-500" /> Saved
              </span>
            )}
          </div>
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {/* Upload area */}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) uploadDocument(file);
            }}
            className={`border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors cursor-pointer ${
              uploading
                ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 cursor-default'
                : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ''; }}
            />
            {uploading ? (
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Uploading…</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
                  <Upload size={18} className="text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">PDF, images, CSV — any file type</p>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <X size={12} /> {uploadError}
            </p>
          )}

          {/* Document list */}
          {docs.length === 0 ? (
            <p className="text-center text-xs text-slate-400 dark:text-slate-600 py-4">
              No documents yet — upload one above.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Paperclip size={13} className="text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">{fmtDate(doc.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                    >
                      <ExternalLink size={12} />
                      Open
                    </a>
                    <button
                      onClick={() => deleteDocument(doc.id, doc.url)}
                      className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
