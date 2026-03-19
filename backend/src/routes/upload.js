const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { randomUUID } = require('crypto');
const supabase = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Date patterns: 2024-01-15 | 15/01/2024 | Jan 15 2024 | 15 Jan 2024 | January 15, 2024
const DATE_RE = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+\w{3,9}\s+\d{4}|\w{3,9}\s+\d{1,2},?\s+\d{4})\b/;

async function parsePdfRows(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  // Detect MSCI rebalance PDFs and give actionable guidance
  if (/MSCI\s+(WORLD|EM|ACWI|FRONTIER|EUROPE|USA|GLOBAL)/i.test(text) &&
      /(addition|deletion|rebalance|index review)/i.test(text)) {
    throw new Error(
      'This looks like an MSCI rebalance PDF. Use the MSCI Rebalance Analyzer template to parse it — ' +
      'it extracts additions, deletions, and country breakdowns automatically.'
    );
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Detect header row containing "date"
  let colNames = null;
  for (const line of lines) {
    if (/\bdate\b/i.test(line)) {
      const parts = line.split(/\t|\s{2,}/).map((p) => p.trim().toLowerCase()).filter(Boolean);
      if (parts.length >= 2) { colNames = parts; break; }
    }
  }

  const nameColIdx = colNames
    ? colNames.findIndex((c) => /asset|name|security|ticker|symbol|fund|instrument/i.test(c))
    : -1;
  const valueColIdx = colNames
    ? colNames.findIndex((c) => /value|price|amount|close|nav|return|px/i.test(c))
    : -1;
  const catColIdx = colNames
    ? colNames.findIndex((c) => /category|type|class|sector|group/i.test(c))
    : -1;

  const rows = [];
  for (const line of lines) {
    const dateMatch = DATE_RE.exec(line);
    if (!dateMatch) continue;
    const date = new Date(dateMatch[1]);
    if (isNaN(date.getTime())) continue;

    const parts = line.split(/\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    const numbers = (line.match(/[-$£€]?[\d,]+\.?\d*/g) || [])
      .map((n) => parseFloat(n.replace(/[$£€,]/g, '')))
      .filter((n) => !isNaN(n));

    // Best-effort column extraction
    const assetName =
      nameColIdx >= 0 && parts[nameColIdx]
        ? parts[nameColIdx]
        : parts.find((p) => !/^\d/.test(p) && p.length > 1 && p !== dateMatch[1]) || 'Unknown';

    // Prefer value column; fall back to largest-looking number that isn't a year
    const value =
      valueColIdx >= 0 && parts[valueColIdx]
        ? parseFloat(parts[valueColIdx].replace(/[$£€,]/g, ''))
        : numbers.find((n) => n < 1_000_000_000 && n !== date.getFullYear()) ?? NaN;

    if (isNaN(value)) continue;

    const category =
      catColIdx >= 0 && parts[catColIdx] ? parts[catColIdx] : 'uncategorized';

    rows.push({
      date: date.toISOString().split('T')[0],
      asset_name: assetName.replace(/[^\w\s\-\.]/g, '').trim() || 'Unknown',
      value,
      category,
    });
  }

  if (!rows.length) {
    throw new Error(
      'No structured data found in PDF. The PDF must contain a table with date and value columns. ' +
      'For best results, export your data as CSV instead.'
    );
  }
  return rows;
}

async function parseRows(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  if (ext === 'pdf' || mimetype === 'application/pdf') {
    return parsePdfRows(buffer);
  }
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
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { datasetName } = req.body;
    if (!datasetName) return res.status(400).json({ error: 'datasetName is required' });

    const rows = await parseRows(req.file.buffer, req.file.mimetype, req.file.originalname);
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
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rows = await parseRows(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ rows: rows.slice(0, 20), total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
