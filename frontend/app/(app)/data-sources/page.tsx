'use client';

import { useEffect, useState, useRef } from 'react';
import { useApp } from '@/lib/context';
import { Upload, FileText, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  created_at: string;
  records: { count: number }[];
}

export default function DataSourcesPage() {
  const { api } = useApp();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [datasetName, setDatasetName] = useState('');

  const load = () =>
    fetch(`${api}/datasets`)
      .then((r) => r.json())
      .then(setDatasets);

  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    if (!datasetName.trim()) { setStatus({ type: 'error', msg: 'Enter a dataset name first' }); return; }
    setUploading(true);
    setStatus(null);
    const form = new FormData();
    form.append('file', file);
    form.append('datasetName', datasetName);
    try {
      const r = await fetch(`${api}/upload`, { method: 'POST', body: form });
      if (!r.ok) throw new Error((await r.json()).error);
      setStatus({ type: 'success', msg: 'Dataset uploaded successfully' });
      setDatasetName('');
      load();
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const remove = async (id: string) => {
    await fetch(`${api}/datasets/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Data Sources</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Upload CSV or Excel files to analyze</p>
      </div>

      {/* Upload zone */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-6 space-y-4">
        <input
          placeholder="Dataset name (e.g. Q1 2025 Sales)"
          value={datasetName}
          onChange={(e) => setDatasetName(e.target.value)}
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
              : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Upload className="mx-auto mb-3 text-slate-400 dark:text-slate-500" size={28} />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {uploading ? 'Uploading…' : 'Drop a file or click to browse'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">CSV or Excel (.xlsx) — date, asset_name, value, category columns</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>

        {status && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            status.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
          }`}>
            {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {status.msg}
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          Data is stored securely in your workspace
        </p>
      </div>

      {/* Dataset list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Datasets</h2>
        </div>
        {datasets.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No datasets yet</div>
        ) : (
          <ul>
            {datasets.map((d, i) => (
              <li key={d.id} className={`flex items-center justify-between px-5 py-3.5 ${i < datasets.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-950 rounded-lg flex items-center justify-center">
                    <FileText size={14} className="text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{d.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {d.records?.[0]?.count ?? 0} rows · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button onClick={() => remove(d.id)}
                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
