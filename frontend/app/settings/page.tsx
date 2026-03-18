'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [currency, setCurrency] = useState('USD');
  const [metric, setMetric] = useState('avg');
  const [groupBy, setGroupBy] = useState('month');
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure your dashboard preferences</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5">
        <Row label="Currency" desc="Display currency for price values">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option>SGD</option>
          </select>
        </Row>
        <Row label="Default metric" desc="Starting aggregation for new charts">
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="avg">Average</option>
            <option value="sum">Sum</option>
            <option value="change">% Change</option>
          </select>
        </Row>
        <Row label="Default group by" desc="Starting time granularity">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Row>
      </div>

      <button onClick={save}
        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
          saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}>
        {saved && <Check size={14} />}
        {saved ? 'Saved' : 'Save preferences'}
      </button>
    </div>
  );
}
