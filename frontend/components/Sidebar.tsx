'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Database, BarChart2, GitCompare, Settings, TrendingUp,
} from 'lucide-react';

const nav = [
  { href: '/',              label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/explore',       label: 'Explore',      icon: BarChart2 },
  { href: '/comparisons',   label: 'Comparisons',  icon: GitCompare },
  { href: '/data-sources',  label: 'Data Sources', icon: Database },
  { href: '/settings',      label: 'Settings',     icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-5 border-b border-slate-200">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <TrendingUp size={14} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-slate-900 tracking-tight">Pivot</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        <p className="text-xs text-slate-400">Data stored securely in your workspace</p>
      </div>
    </aside>
  );
}
