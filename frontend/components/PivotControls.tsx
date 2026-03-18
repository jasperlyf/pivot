'use client';

interface Props {
  groupBy: string; setGroupBy: (v: string) => void;
  metric: string;  setMetric:  (v: string) => void;
  asset: string;   setAsset:   (v: string) => void;
  category: string; setCategory: (v: string) => void;
  assets: string[];
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm min-w-[120px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function PivotControls({ groupBy, setGroupBy, metric, setMetric, asset, setAsset, category, setCategory, assets }: Props) {
  return (
    <div className="flex flex-wrap gap-4 bg-gray-900 rounded-xl p-4 border border-gray-800">
      <Select
        label="Group by"
        value={groupBy}
        onChange={setGroupBy}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <Select
        label="Metric"
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'avg', label: 'Average' },
          { value: 'sum', label: 'Sum' },
          { value: 'change', label: '% Change' },
        ]}
      />
      <Select
        label="Asset"
        value={asset}
        onChange={setAsset}
        options={[{ value: '', label: 'All assets' }, ...assets.map((a) => ({ value: a, label: a }))]}
      />
      <Select
        label="Category"
        value={category}
        onChange={setCategory}
        options={[
          { value: '', label: 'All categories' },
          { value: 'equity', label: 'Equity' },
          { value: 'crypto', label: 'Crypto' },
        ]}
      />
    </div>
  );
}
