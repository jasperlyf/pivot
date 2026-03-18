'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Database, BarChart2, GitCompare, Settings,
  TrendingUp, PanelLeftClose, PanelLeftOpen, LogOut, PieChart, Layers,
} from 'lucide-react';
import { useApp } from '@/lib/context';

const nav = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/explore',      label: 'Explore',      icon: BarChart2 },
  { href: '/comparisons',  label: 'Comparisons',  icon: GitCompare },
  { href: '/portfolio',      label: 'Simulator',    icon: PieChart },
  { href: '/index-builder',  label: 'Index Lab',    icon: Layers },
  { href: '/data-sources',   label: 'Data Sources', icon: Database },
  { href: '/settings',     label: 'Settings',     icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { user, signOut } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-56'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-all duration-200`}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
              <TrendingUp size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Pivot</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md p-1.5 transition-colors ${collapsed ? 'mx-auto' : ''}`}
        >
          {collapsed
            ? <PanelLeftOpen size={15} strokeWidth={1.75} />
            : <PanelLeftClose size={15} strokeWidth={1.75} />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className={`p-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5 ${collapsed ? '' : 'px-3'}`}>
        {!collapsed && user && (
          <p className="text-[11px] text-slate-400 dark:text-slate-600 truncate px-2.5 pt-1">{user.email}</p>
        )}

        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={15} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
