const express = require('express');
const supabase = require('../lib/prisma');
const { groupRecords } = require('../lib/pivotLogic');

const router = express.Router();

// GET /pivot-data
// Query params: dataset_id, group_by (day|week|month), metric (sum|avg|change), asset, category
router.get('/', async (req, res) => {
  try {
    const { dataset_id, group_by = 'month', metric = 'avg', asset, category } = req.query;

    if (!dataset_id) return res.status(400).json({ error: 'dataset_id is required' });

    let query = supabase
      .from('records')
      .select('*')
      .eq('dataset_id', dataset_id)
      .order('date', { ascending: true });

    if (asset) query = query.eq('asset_name', asset);
    if (category) query = query.eq('category', category);

    const { data: records, error } = await query;
    if (error) throw error;

    // Remap snake_case to camelCase for pivotLogic compatibility
    const mapped = records.map(r => ({
      ...r,
      datasetId: r.dataset_id,
      assetName: r.asset_name,
    }));

    const grouped = groupRecords(mapped, group_by, metric);
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
