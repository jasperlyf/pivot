const express = require('express');
const multer  = require('multer');
const pdfParse = require('pdf-parse');
const { randomUUID } = require('crypto');
const supabase = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── MSCI PDF Parser ────────────────────────────────────────────────────────────
function parseMsciPdf(text) {
  const lines = text.split('\n');
  const trimmed = lines.map((l) => l.trim());

  // Announcement date — first non-empty line typically "Geneva, November 05, 2025"
  let announcementDate = null;
  for (const l of trimmed) {
    if (!l) continue;
    const m = l.match(/\b(\w+\s+\d{1,2},\s*\d{4})\b/);
    if (m) { announcementDate = m[1]; break; }
  }

  // Effective date — "close of November 24, 2025"
  let effectiveDate = null;
  let title = 'MSCI Rebalance';
  for (const l of trimmed) {
    if (/close of/i.test(l)) {
      const m = l.match(/\b(\w+\s+\d{1,2},\s*\d{4})\b/);
      if (m) effectiveDate = m[1];
    }
    if (/^MSCI .+ INDEXES$/i.test(l)) title = l;
  }

  // ── Country summary table ──
  const summaryIdx = trimmed.findIndex((l) => /SUMMARY PER COUNTRY/i.test(l));
  const summary = {};
  const SKIP = new Set(['country', 'nb of', 'securities', 'added', 'deleted']);
  if (summaryIdx >= 0) {
    for (let i = summaryIdx + 1; i < trimmed.length; i++) {
      const l = trimmed[i];
      if (/^MSCI .+ INDEX$/i.test(l)) break;
      // "UNITED KINGDOM  13  10" or "USA  75  44"
      const m = l.match(/^([A-Z][A-Z\s&]+?)\s{2,}(\d+)\s+(\d+)\s*$/);
      if (m) {
        const country = m[1].trim();
        if (!SKIP.has(country.toLowerCase())) {
          summary[country] = { added: parseInt(m[2]), deleted: parseInt(m[3]) };
        }
      }
    }
  }

  // ── Per-index entries ──
  const entries = [];
  let currentCountry = null;
  let inAddDel = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t   = raw.trim();

    // New index section
    const idxMatch = t.match(/^MSCI ([A-Z][A-Z\s]+?) INDEX$/);
    if (idxMatch) {
      currentCountry = idxMatch[1].trim();
      inAddDel = false;
      continue;
    }
    if (!currentCountry) continue;

    // "Additions   Deletions" header line
    if (/^Additions\s+Deletions$/i.test(t)) { inAddDel = true; continue; }
    if (!inAddDel || !t) continue;

    // Skip page footers / copyright
    if (/^Page \d+/i.test(t) || /^© MSCI/i.test(t)) continue;
    // Skip repeating "MSCI … INDEXES" title on new pages
    if (/^MSCI .+ INDEXES$/i.test(t)) continue;
    // Skip "Additions" or "Deletions" labels that appear alone (page breaks)
    if (/^(Additions|Deletions)$/i.test(t)) continue;

    // Leading whitespace ≥ 3 chars → deletion-only (right column, no corresponding addition)
    const leadLen = raw.match(/^(\s*)/)[1].length;
    if (leadLen >= 3 && t !== 'None') {
      entries.push({ country: currentCountry, security_name: t, action: 'deleted' });
      continue;
    }

    if (t === 'None') continue;

    // Split on 3+ spaces to separate left (addition) and right (deletion) columns
    const cols = t.split(/\s{3,}/).map((c) => c.trim()).filter((c) => c && c !== 'None');
    if (cols.length >= 2) {
      entries.push({ country: currentCountry, security_name: cols[0], action: 'added' });
      entries.push({ country: currentCountry, security_name: cols[1], action: 'deleted' });
    } else if (cols.length === 1) {
      // Addition only — no corresponding deletion
      entries.push({ country: currentCountry, security_name: cols[0], action: 'added' });
    }
  }

  return { title, announcementDate, effectiveDate, summary, entries };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /msci/parse — parse PDF, return structured preview (no save)
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (ext !== 'pdf') return res.status(400).json({ error: 'Only PDF files are supported' });

    const data   = await pdfParse(req.file.buffer);
    const result = parseMsciPdf(data.text);

    if (!result.entries.length) {
      return res.status(422).json({
        error: 'Could not detect MSCI rebalance data in this PDF. ' +
               'Make sure it is an official MSCI rebalance announcement PDF.',
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /msci/rebalances — list user's saved rebalances
router.get('/rebalances', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('msci_rebalances')
    .select('id, title, announcement_date, effective_date, created_at')
    .eq('user_id', req.userId)
    .order('effective_date', { ascending: false, nullsFirst: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// POST /msci/rebalances — save a parsed rebalance
router.post('/rebalances', requireAuth, async (req, res) => {
  const { title, announcementDate, effectiveDate, entries } = req.body;
  if (!entries?.length) return res.status(400).json({ error: 'No entries to save' });

  const rebalanceId = randomUUID();
  const toDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  };

  const { error: rbErr } = await supabase.from('msci_rebalances').insert({
    id: rebalanceId,
    user_id: req.userId,
    title: title || 'MSCI Rebalance',
    announcement_date: toDate(announcementDate),
    effective_date:    toDate(effectiveDate),
  });
  if (rbErr) return res.status(500).json({ error: rbErr.message });

  const { error: entErr } = await supabase.from('msci_rebalance_entries').insert(
    entries.map((e) => ({
      id: randomUUID(),
      rebalance_id: rebalanceId,
      country: e.country,
      security_name: e.security_name,
      action: e.action,
    }))
  );
  if (entErr) return res.status(500).json({ error: entErr.message });

  res.status(201).json({ id: rebalanceId });
});

// GET /msci/rebalances/:id — full rebalance with entries
router.get('/rebalances/:id', requireAuth, async (req, res) => {
  const { data: rb, error } = await supabase
    .from('msci_rebalances')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single();
  if (error || !rb) return res.status(404).json({ error: 'Not found' });

  const { data: entries } = await supabase
    .from('msci_rebalance_entries')
    .select('country, security_name, action')
    .eq('rebalance_id', req.params.id)
    .order('country');

  res.json({ ...rb, entries: entries ?? [] });
});

// DELETE /msci/rebalances/:id
router.delete('/rebalances/:id', requireAuth, async (req, res) => {
  await supabase
    .from('msci_rebalances')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId);
  res.status(204).send();
});

module.exports = router;
