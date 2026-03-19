import { BarChart2, GitCompare, FileText, PieChart, Layers, RefreshCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface TemplateDefinition {
  href: string;
  label: string;
  description: string;
  detail: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  tags: string[];
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    href: '/explore',
    label: 'Watchlist',
    description: 'Single-asset deep dive',
    detail: 'Search any ticker to view its full price history, key stats, volume, 52-week range, and top holdings. Perfect for researching an asset before adding it to a strategy.',
    icon: BarChart2,
    iconBg: 'bg-blue-50 dark:bg-blue-950',
    iconColor: 'text-blue-600 dark:text-blue-400',
    tags: ['Research', 'Single asset'],
  },
  {
    href: '/comparisons',
    label: 'Comparison Tool',
    description: 'Multi-asset overlay chart',
    detail: 'Plot multiple assets on the same normalised chart to compare relative performance over any time range. Supports stocks, ETFs, crypto, and custom indices.',
    icon: GitCompare,
    iconBg: 'bg-violet-50 dark:bg-violet-950',
    iconColor: 'text-violet-600 dark:text-violet-400',
    tags: ['Comparison', 'Multi-asset'],
  },
  {
    href: '/portfolio-simulator',
    label: 'Portfolio Simulator',
    description: 'Simulate a saved portfolio with real money',
    detail: 'Select any saved portfolio, enter an initial investment amount, and see how it would have performed across 1W, 1M, 3M, 6M, 1Y, 2Y, and 5Y periods — with end value, total return, CAGR, volatility, and max drawdown.',
    icon: PieChart,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    tags: ['Simulation', 'Portfolio', 'Returns'],
  },
  {
    href: '/index-simulator',
    label: 'Index Simulator',
    description: 'Simulate a custom-weighted index',
    detail: 'Build a custom index by assigning weights to any combination of assets, then compare its performance against a benchmark. See annualised return, volatility, Sharpe ratio, and max drawdown.',
    icon: Layers,
    iconBg: 'bg-indigo-50 dark:bg-indigo-950',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    tags: ['Simulation', 'Index', 'Custom weights'],
  },
  {
    href: '/pdf-viewer',
    label: 'PDF Viewer',
    description: 'View workspace documents in browser',
    detail: 'Open any PDF uploaded to a workspace and view it directly in the browser. Supports zoom in/out and fullscreen mode — no downloads needed.',
    icon: FileText,
    iconBg: 'bg-orange-50 dark:bg-orange-950',
    iconColor: 'text-orange-600 dark:text-orange-400',
    tags: ['Documents', 'PDF'],
  },
  {
    href: '/msci-rebalance',
    label: 'MSCI Rebalance Analyzer',
    description: 'Parse and compare MSCI index rebalances',
    detail: 'Upload official MSCI rebalance announcement PDFs to extract additions and deletions per country. View geographic shift, search any security, and compare two rebalances side-by-side to spot recurring patterns.',
    icon: RefreshCcw,
    iconBg: 'bg-sky-50 dark:bg-sky-950',
    iconColor: 'text-sky-600 dark:text-sky-400',
    tags: ['MSCI', 'Index', 'Rebalance', 'Institutional'],
  },
];
