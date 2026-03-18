'use client';

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';

interface AssetStats {
  symbol: string;
  periodsCovered: string[];
  annualisedReturn: Record<string, number | null>;
  annualisedVolatility: Record<string, number | null>;
  sharpeRatio: Record<string, number | null>;
  maxDrawdown: Record<string, number | null>;
  beta: Record<string, number | null>;
}

function pct(n: number, decimals = 1) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(decimals)}%`;
}

function generateInsights(stats: AssetStats[], period: string): string[] {
  const available = stats.filter((s) => s.annualisedReturn[period] != null && s.periodsCovered.includes(period));
  if (!available.length) return [];
  const insights: string[] = [];

  // Best vs worst performer
  if (available.length >= 2) {
    const sorted = [...available].sort((a, b) => (b.annualisedReturn[period] ?? 0) - (a.annualisedReturn[period] ?? 0));
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const diff = ((best.annualisedReturn[period] ?? 0) - (worst.annualisedReturn[period] ?? 0)) * 100;
    if (diff > 0.5) {
      insights.push(`${best.symbol} outperforming ${worst.symbol} by +${diff.toFixed(1)}% ann. return over ${period}`);
    }
  }

  // Highest volatility (only surface if notably high)
  const byVol = [...available]
    .filter((s) => s.annualisedVolatility[period] != null)
    .sort((a, b) => (b.annualisedVolatility[period] ?? 0) - (a.annualisedVolatility[period] ?? 0));
  if (byVol.length >= 2) {
    const top = byVol[0];
    const vol = (top.annualisedVolatility[period]! * 100).toFixed(1);
    insights.push(`${top.symbol} is the most volatile at ${vol}% ann. volatility over ${period}`);
  }

  // Best risk-adjusted return (Sharpe)
  const bySharpe = [...available]
    .filter((s) => s.sharpeRatio[period] != null && s.sharpeRatio[period]! > 0)
    .sort((a, b) => (b.sharpeRatio[period] ?? 0) - (a.sharpeRatio[period] ?? 0));
  if (bySharpe.length > 0) {
    const top = bySharpe[0];
    insights.push(`${top.symbol} has the best risk-adjusted return (Sharpe ${top.sharpeRatio[period]!.toFixed(2)}) over ${period}`);
  }

  // Worst drawdown warning
  const byDD = [...available]
    .filter((s) => s.maxDrawdown[period] != null && s.maxDrawdown[period]! < -0.1)
    .sort((a, b) => (a.maxDrawdown[period] ?? 0) - (b.maxDrawdown[period] ?? 0));
  if (byDD.length > 0) {
    const worst = byDD[0];
    insights.push(`${worst.symbol} had a max drawdown of ${pct(worst.maxDrawdown[period]!, 1)} over ${period}`);
  }

  // High beta warning (if any non-SPY asset has beta > 1.5)
  const highBeta = available.filter((s) => s.symbol !== 'SPY' && (s.beta[period] ?? 0) > 1.5);
  if (highBeta.length > 0) {
    const top = highBeta.sort((a, b) => (b.beta[period] ?? 0) - (a.beta[period] ?? 0))[0];
    insights.push(`${top.symbol} has a beta of ${top.beta[period]!.toFixed(2)}× vs SPY — high market sensitivity`);
  }

  return insights.slice(0, 4); // cap at 4 insights
}

interface Props {
  symbols: string[];
  api: string;
  period?: string; // '1Y' | '3Y' | '5Y'
}

export default function SmartInsights({ symbols, api, period = '1Y' }: Props) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const symKey = symbols.slice().sort().join(',');

  useEffect(() => {
    if (!symbols.length) { setInsights([]); return; }
    setLoading(true);
    fetch(`${api}/market-data/stats?symbols=${symbols.join(',')}`)
      .then((r) => r.json())
      .then((data: AssetStats[]) => {
        setInsights(generateInsights(data, period));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symKey, api, period]); // eslint-disable-line

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 animate-pulse">
        <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 shrink-0" />
        <div className="flex gap-2 flex-1 flex-wrap">
          {[120, 180, 140].map((w, i) => (
            <div key={i} className="h-5 rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: w }} />
          ))}
        </div>
      </div>
    );
  }

  if (!insights.length) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700">
      <Lightbulb size={14} className="text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {insights.map((text, i) => (
          <span key={i} className="text-xs text-indigo-700 dark:text-slate-300 leading-relaxed">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
