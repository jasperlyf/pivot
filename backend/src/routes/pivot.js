const express = require('express');
const prisma = require('../lib/prisma');
const { groupRecords } = require('../lib/pivotLogic');

const router = express.Router();

// GET /pivot-data
// Query params: dataset_id, group_by (day|week|month), metric (sum|avg|change), asset, category
router.get('/', async (req, res) => {
  try {
    const { dataset_id, group_by = 'month', metric = 'avg', asset, category } = req.query;

    if (!dataset_id) return res.status(400).json({ error: 'dataset_id is required' });

    const where = { datasetId: dataset_id };
    if (asset) where.assetName = asset;
    if (category) where.category = category;

    const records = await prisma.record.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const grouped = groupRecords(records, group_by, metric);
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
