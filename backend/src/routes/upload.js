const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const prisma = require('../lib/prisma');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function parseRows(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  let rows;

  if (ext === 'csv' || mimetype === 'text/csv') {
    rows = parse(buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
  } else {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet);
  }
  return rows;
}

// POST /upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { datasetName } = req.body;
    if (!datasetName) return res.status(400).json({ error: 'datasetName is required' });

    const rows = parseRows(req.file.buffer, req.file.mimetype, req.file.originalname);

    // Expect columns: date, asset_name, value, category
    const records = rows.map((row) => ({
      date: new Date(row.date),
      assetName: row.asset_name,
      value: parseFloat(row.value),
      category: row.category || 'uncategorized',
    }));

    const dataset = await prisma.dataset.create({
      data: {
        name: datasetName,
        records: { create: records },
      },
      include: { _count: { select: { records: true } } },
    });

    res.status(201).json(dataset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /upload/preview — parse without saving
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
