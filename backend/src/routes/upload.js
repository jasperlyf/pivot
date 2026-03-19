const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const { randomUUID } = require('crypto');
const supabase = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function parseRows(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  if (ext === 'csv' || mimetype === 'text/csv') {
    return parse(buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
}

// POST /upload
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { datasetName } = req.body;
    if (!datasetName) return res.status(400).json({ error: 'datasetName is required' });

    const rows = parseRows(req.file.buffer, req.file.mimetype, req.file.originalname);
    const datasetId = randomUUID();

    const { data: dataset, error: dsError } = await supabase
      .from('datasets')
      .insert({ id: datasetId, name: datasetName, user_id: req.userId })
      .select()
      .single();
    if (dsError) throw dsError;

    const records = rows.map((row) => ({
      id: randomUUID(),
      dataset_id: datasetId,
      date: new Date(row.date).toISOString(),
      asset_name: row.asset_name,
      value: parseFloat(row.value),
      category: row.category || 'uncategorized',
    }));

    const { error: recError } = await supabase.from('records').insert(records);
    if (recError) throw recError;

    res.status(201).json({ ...dataset, record_count: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /upload/preview — parse without saving (no auth needed)
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rows = parseRows(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ rows: rows.slice(0, 20), total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
