const { startOfDay, startOfWeek, startOfMonth, format } = require('date-fns');

function getBucket(date, groupBy) {
  const d = new Date(date);
  switch (groupBy) {
    case 'day':   return format(startOfDay(d), 'yyyy-MM-dd');
    case 'week':  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    case 'month': return format(startOfMonth(d), 'yyyy-MM');
    default:      return format(startOfMonth(d), 'yyyy-MM');
  }
}

function groupRecords(records, groupBy, metric) {
  // Group by (bucket, assetName)
  const buckets = {};

  for (const r of records) {
    const bucket = getBucket(r.date, groupBy);
    const key = `${bucket}__${r.assetName}`;
    if (!buckets[key]) {
      buckets[key] = { date: bucket, asset: r.assetName, category: r.category, values: [] };
    }
    buckets[key].values.push(r.value);
  }

  // Aggregate
  const aggregated = Object.values(buckets).map((b) => {
    let value;
    if (metric === 'sum') {
      value = b.values.reduce((a, v) => a + v, 0);
    } else {
      value = b.values.reduce((a, v) => a + v, 0) / b.values.length;
    }
    return { date: b.date, asset: b.asset, category: b.category, value: parseFloat(value.toFixed(4)) };
  });

  aggregated.sort((a, b) => a.date.localeCompare(b.date));

  // Percentage change per asset
  if (metric === 'change') {
    const byAsset = {};
    for (const row of aggregated) {
      if (!byAsset[row.asset]) byAsset[row.asset] = [];
      byAsset[row.asset].push(row);
    }
    const result = [];
    for (const rows of Object.values(byAsset)) {
      for (let i = 0; i < rows.length; i++) {
        const prev = rows[i - 1]?.value;
        const change = prev != null && prev !== 0
          ? parseFloat((((rows[i].value - prev) / prev) * 100).toFixed(2))
          : null;
        result.push({ ...rows[i], value: change });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  return aggregated;
}

module.exports = { groupRecords };
