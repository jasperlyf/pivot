'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, ZoomIn, ZoomOut, Maximize2, Minimize2,
  ChevronDown, FolderOpen, Paperclip, AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

interface Workspace { id: string; name: string; }
interface Doc { id: string; name: string; url: string; }

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200];

export default function PdfViewerPage() {
  const { user, presentationMode, presentationWorkspaceId } = useApp();
  const supabase = createClient();
  const viewerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<Workspace | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Load workspaces on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from('workspaces')
      .select('id, name')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const list = data ?? [];
        setWorkspaces(list);
        // Auto-select the active presentation workspace
        if (presentationMode && presentationWorkspaceId) {
          const ws = list.find((w) => w.id === presentationWorkspaceId) ?? null;
          if (ws) setSelectedWs(ws);
        }
      });
  }, [user]); // eslint-disable-line

  // Load docs when workspace changes
  useEffect(() => {
    if (!selectedWs) { setDocs([]); setSelectedDoc(null); return; }
    setLoadingDocs(true);
    setSelectedDoc(null);
    supabase
      .from('workspace_documents')
      .select('id, name, url')
      .eq('workspace_id', selectedWs.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs(data ?? []);
        setLoadingDocs(false);
      });
  }, [selectedWs]); // eslint-disable-line

  // Track fullscreen changes from Escape key / browser button
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_STEPS.indexOf(z);
      const next = idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : z;
      if (next !== z) setIframeKey((k) => k + 1);
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_STEPS.indexOf(z);
      const next = idx > 0 ? ZOOM_STEPS[idx - 1] : z;
      if (next !== z) setIframeKey((k) => k + 1);
      return next;
    });
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const isPdf = selectedDoc?.name.toLowerCase().endsWith('.pdf') ?? false;
  const pdfSrc = selectedDoc ? `${selectedDoc.url}#toolbar=0&zoom=${zoom}` : null;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">PDF Viewer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          View uploaded workspace documents in browser
        </p>
      </div>

      {/* Selectors row */}
      <div className="flex flex-wrap gap-3">
        {/* Workspace selector — hidden in presentation mode (locked to presentation workspace) */}
        {!presentationMode && (
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
              <FolderOpen size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedWs?.id ?? ''}
                onChange={(e) => {
                  const ws = workspaces.find((w) => w.id === e.target.value) ?? null;
                  setSelectedWs(ws);
                }}
                className="text-sm text-slate-700 dark:text-slate-200 bg-transparent focus:outline-none pr-6 cursor-pointer"
              >
                <option value="">Select workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="text-slate-400 shrink-0 pointer-events-none absolute right-3" />
            </div>
          </div>
        )}
        {presentationMode && selectedWs && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg">
            <FolderOpen size={14} className="text-indigo-500 shrink-0" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selectedWs.name}</span>
          </div>
        )}

        {/* Document selector */}
        <div className="relative">
          <div className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border rounded-lg transition-colors ${
            !selectedWs ? 'border-slate-100 dark:border-slate-800 opacity-50' : 'border-slate-200 dark:border-slate-700'
          }`}>
            <Paperclip size={14} className="text-slate-400 shrink-0" />
            <select
              value={selectedDoc?.id ?? ''}
              disabled={!selectedWs || loadingDocs}
              onChange={(e) => {
                const doc = docs.find((d) => d.id === e.target.value) ?? null;
                setSelectedDoc(doc);
                setZoom(100);
                setIframeKey((k) => k + 1);
              }}
              className="text-sm text-slate-700 dark:text-slate-200 bg-transparent focus:outline-none pr-6 cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="">
                {loadingDocs ? 'Loading…' : docs.length === 0 && selectedWs ? 'No documents' : 'Select document…'}
              </option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="text-slate-400 shrink-0 pointer-events-none absolute right-3" />
          </div>
        </div>
      </div>

      {/* Viewer area */}
      <div
        ref={viewerRef}
        className={`flex flex-col flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''
        }`}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* File name */}
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
              {selectedDoc ? selectedDoc.name : 'No document selected'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Zoom out */}
            <button
              onClick={zoomOut}
              disabled={!selectedDoc || ZOOM_STEPS.indexOf(zoom) === 0}
              title="Zoom out"
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomOut size={15} />
            </button>

            {/* Zoom level */}
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-12 text-center tabular-nums">
              {zoom}%
            </span>

            {/* Zoom in */}
            <button
              onClick={zoomIn}
              disabled={!selectedDoc || ZOOM_STEPS.indexOf(zoom) === ZOOM_STEPS.length - 1}
              title="Zoom in"
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomIn size={15} />
            </button>

            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              disabled={!selectedDoc}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 relative">
          {!selectedDoc ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-3">
              <FileText size={48} strokeWidth={1.25} className="opacity-30" />
              <div className="text-center">
                <p className="text-sm font-medium">No document selected</p>
                <p className="text-xs mt-1 text-slate-400 dark:text-slate-600">
                  Choose a workspace and document above to view it here
                </p>
              </div>
            </div>
          ) : !isPdf ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-3">
              <AlertCircle size={40} strokeWidth={1.25} className="opacity-40 text-amber-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Not a PDF file</p>
                <p className="text-xs mt-1">
                  This viewer supports PDF files only.{' '}
                  <a
                    href={selectedDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline"
                  >
                    Open file directly
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={pdfSrc!}
              title={selectedDoc.name}
              className="w-full h-full border-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}
