import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

export default function KPICard({ title, value, change, subtitle, color = 'indigo' }: Props) {
  const colorMap = {
    indigo: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600',
    amber: 'bg-amber-50 dark:bg-amber-950 text-amber-600',
    rose: 'bg-rose-50 dark:bg-rose-950 text-rose-600',
  };

  const positive = change !== undefined && change > 0;
  const negative = change !== undefined && change < 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm dark:shadow-none">
      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {change !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            positive ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' :
            negative ? 'bg-rose-50 dark:bg-rose-950 text-rose-600' :
            'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            {positive ? <TrendingUp size={11} /> : negative ? <TrendingDown size={11} /> : <Minus size={11} />}
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>}
      </div>
    </div>
  );
}
