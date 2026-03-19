'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, LayoutTemplate, FileText, Paperclip, Pencil, Check, X, Trash2, Upload, ExternalLink, ListTodo, Plus, MonitorPlay, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';
import { TEMPLATES } from '@/lib/templates';

type Tab = 'templates' | 'documents' | 'tasks' | 'notes';
const DEFAULT_TAB_ORDER: Tab[] = ['templates', 'documents', 'tasks', 'notes'];

interface WorkspaceTask {
  id: string;
  content: string;
  completed: boolean;
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
  const { user, presentationMode, presentationWorkspaceId, enterPresentation, exitPresentation } = useApp();
  const router = useRouter();
  const supabase = createClient();
  const isPresenting = presentationMode && presentationWorkspaceId === id;

  const [workspace,  setWorkspace]  = useState<Workspace | null>(null);
  const [tab,        setTab]        = useState<Tab>('templates');
  const [tabOrder,   setTabOrder]   = useState<Tab[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_TAB_ORDER;
    try {
      const saved = localStorage.getItem(`tabOrder:${id}`);
      if (saved) return JSON.parse(saved) as Tab[];
    } catch {}
    return DEFAULT_TAB_ORDER;
  });
  const dragTab = useRef<Tab | null>(null);

  // Tasks
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

  // Templates
  const [selectedTemplates,  setSelectedTemplates]  = useState<string[]>([]);
  const [templateQuery,      setTemplateQuery]       = useState('');

  // Notes
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  // Documents
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: ws }, { data: tk }, { data: tpl }, { data: nt }, { data: dc }] = await Promise.all([
      supabase.from('workspaces').select('id, name, updated_at').eq('id', id).single(),
      supabase.from('workspace_tasks').select('*').eq('workspace_id', id).order('created_at', { ascending: true }),
      supabase.from('workspace_template_selections').select('hrefs').eq('workspace_id', id).single(),
      supabase.from('workspace_notes').select('content').eq('workspace_id', id).single(),
      supabase.from('workspace_documents').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
    ]);

    if (!ws) { router.push('/workspace'); return; }

    setWorkspace(ws);
    setTasks(tk ?? []);
    setSelectedTemplates(tpl?.hrefs ?? TEMPLATES.map((t) => t.href));
    setNotes(nt?.content ?? '');
    setDocs(dc ?? []);
    setLoading(false);
  }, [id, user]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Tasks ────────────────────────────────────────────────────────────────

  async function addTask() {
    const content = newTaskText.trim();
    if (!content) return;
    setAddingTask(true);
    const { data } = await supabase
      .from('workspace_tasks')
      .insert({ workspace_id: id, content, completed: false })
      .select()
      .single();
    if (data) setTasks((t) => [...t, data]);
    setNewTaskText('');
    setAddingTask(false);
    taskInputRef.current?.focus();
  }

  async function toggleTask(taskId: string, completed: boolean) {
    setTasks((t) => t.map((x) => x.id === taskId ? { ...x, completed } : x));
    await supabase.from('workspace_tasks').update({ completed }).eq('id', taskId);
  }

  async function deleteTask(taskId: string) {
    setTasks((t) => t.filter((x) => x.id !== taskId));
    await supabase.from('workspace_tasks').delete().eq('id', taskId);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async function toggleTemplate(href: string) {
    const next = selectedTemplates.includes(href)
      ? selectedTemplates.filter((h) => h !== href)
      : [...selectedTemplates, href];
    setSelectedTemplates(next);
    // Upsert into DB
    const { data: existing } = await supabase
      .from('workspace_template_selections')
      .select('workspace_id')
      .eq('workspace_id', id)
      .single();
    if (existing) {
      await supabase.from('workspace_template_selections').update({ hrefs: next }).eq('workspace_id', id);
    } else {
      await supabase.from('workspace_template_selections').insert({ workspace_id: id, hrefs: next });
    }
  }

  // ── Notes ────────────────────────────────────────────────────────────────

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
      await supabase.from('workspace_notes').insert({ workspace_id: id, content: notes });
    }
    await supabase.from('workspaces').update({ updated_at: new Date().toISOString() }).eq('id', id);
    setNotesDirty(false);
    setNotesSaving(false);
  }

  // ── Documents ────────────────────────────────────────────────────────────

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

  // ── Workspace rename ─────────────────────────────────────────────────────

  async function renameWorkspace() {
    if (!renameDraft.trim()) return;
    await supabase
      .from('workspaces')
      .update({ name: renameDraft.trim(), updated_at: new Date().toISOString() })
      .eq('id', id);
    setWorkspace((w) => w ? { ...w, name: renameDraft.trim() } : w);
    setRenamingWorkspace(false);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const pendingCount = tasks.filter((t) => !t.completed).length;

  const TAB_META: Record<Tab, { label: string; icon: React.ElementType }> = {
    templates: { label: 'Templates', icon: LayoutTemplate },
    documents: { label: 'Documents', icon: Paperclip },
    tasks:     { label: 'Tasks',     icon: ListTodo },
    notes:     { label: 'Notes',     icon: FileText },
  };

  function onDragStart(key: Tab) { dragTab.current = key; }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(targetKey: Tab) {
    const src = dragTab.current;
    if (!src || src === targetKey) return;
    setTabOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(src);
      const to   = next.indexOf(targetKey);
      next.splice(from, 1);
      next.splice(to, 0, src);
      localStorage.setItem(`tabOrder:${id}`, JSON.stringify(next));
      return next;
    });
    dragTab.current = null;
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="h-10 w-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="space-y-1">
        <button
          onClick={() => router.push('/workspace')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors mb-2"
        >
          <ArrowLeft size={13} />
          All workspaces
        </button>

        <div className="flex items-center justify-between gap-4">
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

        {/* Present / Exit toggle */}
        {isPresenting ? (
          <button
            onClick={exitPresentation}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
          >
            <X size={12} /> Exit presentation
          </button>
        ) : (
          <button
            onClick={() => enterPresentation(id, workspace.name, selectedTemplates)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <MonitorPlay size={13} /> Present
          </button>
        )}
        </div>
      </div>

      {/* Tabs — draggable to reorder */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabOrder.map((key) => {
          const { label, icon: Icon } = TAB_META[key];
          return (
          <button
            key={key}
            draggable
            onDragStart={() => onDragStart(key)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(key)}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-grab active:cursor-grabbing select-none ${
              tab === key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {label}
            {key === 'tasks' && pendingCount > 0 && (
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full px-1.5 py-0.5 leading-none">
                {pendingCount}
              </span>
            )}
            {key === 'templates' && selectedTemplates.length > 0 && (
              <span className="text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full px-1.5 py-0.5 leading-none">
                {selectedTemplates.length}
              </span>
            )}
          </button>
        );
        })}
      </div>

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          {/* Add task input */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
            <Plus size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              ref={taskInputRef}
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Add a task…"
              disabled={addingTask}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none"
            />
            {newTaskText.trim() && (
              <button
                onClick={addTask}
                disabled={addingTask}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            )}
          </div>

          {/* Task list */}
          {tasks.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-600">
              <ListTodo size={36} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm">No tasks yet</p>
              <p className="text-xs mt-1 opacity-70">Type above and press Enter to add one</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  {/* Circle checkbox */}
                  <button
                    onClick={() => toggleTask(task.id, !task.completed)}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                      task.completed
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500'
                    }`}
                  >
                    {task.completed && <Check size={10} className="text-white" strokeWidth={3} />}
                  </button>

                  {/* Task text */}
                  <span className={`flex-1 text-sm transition-all ${
                    task.completed
                      ? 'line-through text-slate-400 dark:text-slate-600'
                      : 'text-slate-800 dark:text-slate-100'
                  }`}>
                    {task.content}
                  </span>

                  {/* Delete — hover only */}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-1 text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {tasks.length > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-600">
              {tasks.filter((t) => t.completed).length} of {tasks.length} completed
            </p>
          )}
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Select the templates to include in presentation mode for this workspace.
            </p>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                placeholder="Search templates…"
                className="pl-7 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {TEMPLATES.filter((tpl) => {
              const q = templateQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                tpl.label.toLowerCase().includes(q) ||
                tpl.description.toLowerCase().includes(q) ||
                tpl.tags.some((tag) => tag.toLowerCase().includes(q))
              );
            }).map((tpl) => {
              const Icon = tpl.icon;
              const selected = selectedTemplates.includes(tpl.href);
              return (
                <button
                  key={tpl.href}
                  onClick={() => toggleTemplate(tpl.href)}
                  className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
                    selected
                      ? 'bg-indigo-50 dark:bg-indigo-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tpl.iconBg}`}>
                    <Icon size={16} className={tpl.iconColor} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>
                      {tpl.label}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{tpl.description}</p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {tpl.tags.map((tag) => (
                        <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {selected && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
            {templateQuery.trim() && !TEMPLATES.some((tpl) => {
              const q = templateQuery.trim().toLowerCase();
              return tpl.label.toLowerCase().includes(q) || tpl.description.toLowerCase().includes(q) || tpl.tags.some((tag) => tag.toLowerCase().includes(q));
            }) && (
              <p className="text-xs text-slate-400 text-center py-6">No templates match &ldquo;{templateQuery}&rdquo;</p>
            )}
          </div>
          {selectedTemplates.length > 0 && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              {selectedTemplates.length} template{selectedTemplates.length > 1 ? 's' : ''} selected for presentation mode
            </p>
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
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">PDF, images, CSV — any file type</p>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <X size={12} /> {uploadError}
            </p>
          )}

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
