'use client';

import { useState, useEffect } from 'react';
import { Check, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useApp, UserSettings } from '@/lib/context';

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 gap-4">
      <div className="shrink-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        {desc && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings } = useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  const handleTheme = (t: 'light' | 'dark') => {
    setTheme(t);
    saveSettings({ theme: t });
  };

  const handleSave = (patch: Partial<UserSettings>) => {
    saveSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure your dashboard preferences</p>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none px-5">
        <Row label="Appearance" desc="Choose between light and dark theme">
          {mounted ? (
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
              <button
                onClick={() => handleTheme('light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  !isDark ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Sun size={12} /> Light
              </button>
              <button
                onClick={() => handleTheme('dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  isDark ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Moon size={12} /> Dark
              </button>
            </div>
          ) : (
            <div className="h-7 w-28 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          )}
        </Row>
      </div>

      {/* Other preferences */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none px-5">
        <Row label="Currency" desc="Display currency for price values">
          <select value={settings.currency} onChange={(e) => handleSave({ currency: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option>SGD</option>
          </select>
        </Row>
        <Row label="Default metric" desc="Starting aggregation for new charts">
          <select value={settings.metric} onChange={(e) => handleSave({ metric: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="avg">Average</option>
            <option value="sum">Sum</option>
            <option value="change">% Change</option>
          </select>
        </Row>
        <Row label="Default group by" desc="Starting time granularity">
          <select value={settings.groupBy} onChange={(e) => handleSave({ groupBy: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Row>
      </div>

      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          <Check size={14} /> Settings saved
        </p>
      )}
    </div>
  );
}
