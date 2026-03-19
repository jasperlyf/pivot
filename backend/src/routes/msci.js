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

    // Stop at disclaimer / legal section — nothing below is security data
    if (/^Notice and Disclaimer/i.test(t)) break;

    // Skip page footers, repeating titles, standalone column headers
    if (/^Page \d+/i.test(t)) continue;
    if (/^MSCI .+ INDEXES$/i.test(t)) continue;
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

  return { title, announcementDate, effectiveDate, summary, entries: entries.filter((e) => isValidEntry(e.security_name)) };
}

// ── Entry cleaner — strips disclaimer / footer lines from security name lists ──
const DISCLAIMER_RE = /^[•·©▪]|^Notice and Disclaimer|^Page \d+|\b(the information|may not be|permission|contained in|licensors|informational purposes|not be used to create|derivative works|rebalancing|risk model|past performance|does not guarantee|requires a license|relied on|substitute for the skill|advisors and\/or)\b/i;
function isValidEntry(security_name) {
  if (!security_name || typeof security_name !== 'string') return false;
  if (security_name.length > 80) return false;
  if (DISCLAIMER_RE.test(security_name)) return false;
  return true;
}

const MSCI_BASE       = 'https://app2.msci.com';
const MSCI_INDEX_PAGE = `${MSCI_BASE}/eqb/gimi/stdindex/index_review.html`;
const MSCI_DATES_CSV  = `${MSCI_BASE}/eqb/pressreleases/archive/ir_dates.csv`;
const FETCH_HEADERS   = { 'User-Agent': 'Mozilla/5.0 (compatible; PivotApp/1.0)' };

// ── Tier URL builder ─────────────────────────────────────────────────────────
const TIER_URLS = {
  standard: (c) => `${MSCI_BASE}/eqb/gimi/stdindex/MSCI_${c}_STPublicList.pdf`,
  smallcap:  (c) => `${MSCI_BASE}/eqb/gimi/smallcap/MSCI_${c}_SCPublicList.pdf`,
  microcap:  (c) => `${MSCI_BASE}/eqb/gimi/stdindex/MSCI_${c}_MicroPublicList.pdf`,
  chinaa:    (c) => `${MSCI_BASE}/eqb/gimi/stdindex/MSCI_${c}_ChinaAPublicList_EN.pdf`,
};

const TIER_LABELS = {
  standard: 'Standard',
  smallcap: 'Small Cap',
  microcap: 'Micro Cap',
  chinaa:   'China A',
};

// Extract MSCI period code (e.g. "Feb26") from a PDF URL
function extractPeriodCode(url) {
  const m = url.match(/MSCI_([A-Za-z]{3}\d{2})_/);
  return m ? m[1] : null;
}

// Identify which tier a URL belongs to
function extractIndexType(url) {
  if (/_STPublicList\.pdf/i.test(url))       return 'standard';
  if (/_SCPublicList\.pdf/i.test(url))        return 'smallcap';
  if (/_MicroPublicList\.pdf/i.test(url))     return 'microcap';
  if (/_ChinaAPublicList/i.test(url))         return 'chinaa';
  if (/_OVCPublicList\.pdf/i.test(url))       return 'overseas_china';
  return null;
}

// ── Effective dates parser ───────────────────────────────────────────────────
function parseEffectiveDates(csvText) {
  const lines = csvText.split('\n');
  const dates = [];
  let inBody = false;
  let headerSkipped = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#BOD')) { inBody = true; continue; }
    if (line.startsWith('#EOD')) break;
    if (!inBody || !line) continue;

    // Extract first CSV field (everything before trailing commas), strip outer quotes
    const firstField = line.split(/,(?=[,\s]*$)/)[0]
      .replace(/^"+|"+$/g, '')
      .replace(/""/g, '"')
      .trim();

    const parts = firstField.split('|').map((p) => p.replace(/^"+|"+$/g, '').trim());
    if (parts.length < 4) continue;
    const [quarter, , announcementRaw, effectiveRaw] = parts;
    if (!quarter || quarter.toLowerCase() === 'quarter') {
      if (!headerSkipped) { headerSkipped = true; } // skip header row
      continue;
    }

    const toISO = (s) => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };
    const announcementDate = toISO(announcementRaw);
    const effectiveDate    = toISO(effectiveRaw);
    if (!announcementDate || !effectiveDate) continue;

    dates.push({ quarter: quarter.replace(/"/g, '').trim(), announcementDate, effectiveDate });
  }
  return dates;
}

// ── Document browser parser ──────────────────────────────────────────────────
function parseDocumentList(html) {
  const groups = [];
  const sections = html.split(/<b>/i).slice(1);
  for (const section of sections) {
    const titleMatch = section.match(/^([^<]+)<\/b>/i);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;

    const docs = [];
    const periodCodes = new Set();
    const availableTiers = new Set();

    const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(section)) !== null) {
      const href  = m[1].trim();
      const label = m[2].trim();
      if (!href.endsWith('.pdf')) continue;

      const url        = href.startsWith('http') ? href : `${MSCI_BASE}${href}`;
      const periodCode = extractPeriodCode(url);
      const indexType  = extractIndexType(url);
      const parseable  = /additions.{0,10}deletions/i.test(label);

      if (periodCode) periodCodes.add(periodCode);
      if (parseable && indexType) availableTiers.add(indexType);

      docs.push({ label, url, parseable, indexType, periodCode });
    }

    if (docs.length > 0) {
      const periodCode = periodCodes.size === 1 ? [...periodCodes][0] : null;
      groups.push({
        title,
        docs,
        periodCode,
        // Tiers that are parseable for this period (can be multi-loaded)
        availableTiers: [...availableTiers],
      });
    }
  }
  return groups;
}

// ── Cross-tier analysis ──────────────────────────────────────────────────────
function crossTierAnalysis(tiers) {
  // Hierarchy: standard > smallcap > microcap > chinaa
  const HIERARCHY = ['standard', 'smallcap', 'microcap', 'chinaa'];
  const norm = (s) => s.toLowerCase().trim();

  // Build per-tier sets
  const sets = {};
  for (const [tier, result] of Object.entries(tiers)) {
    if (!result) continue;
    sets[tier] = {
      added:   new Map(result.entries.filter((e) => e.action === 'added').map((e) => [norm(e.security_name), e])),
      deleted: new Map(result.entries.filter((e) => e.action === 'deleted').map((e) => [norm(e.security_name), e])),
    };
  }

  const movements = [];
  const seen = new Set(); // avoid double-counting

  for (let i = 0; i < HIERARCHY.length; i++) {
    const upper = HIERARCHY[i];
    if (!sets[upper]) continue;
    for (let j = i + 1; j < HIERARCHY.length; j++) {
      const lower = HIERARCHY[j];
      if (!sets[lower]) continue;

      // Demotion: deleted from upper + added to lower
      for (const [key, entry] of sets[upper].deleted) {
        if (sets[lower].added.has(key) && !seen.has(`${key}-move`)) {
          seen.add(`${key}-move`);
          movements.push({ security_name: entry.security_name, country: entry.country, type: 'demotion', from: upper, to: lower });
        }
      }
      // Promotion: deleted from lower + added to upper
      for (const [key, entry] of sets[lower].deleted) {
        if (sets[upper].added.has(key) && !seen.has(`${key}-move`)) {
          seen.add(`${key}-move`);
          movements.push({ security_name: entry.security_name, country: entry.country, type: 'promotion', from: lower, to: upper });
        }
      }
    }
  }

  // True exits from MSCI universe: deleted from Standard, not added anywhere
  const allAdded = new Map();
  for (const [tier, s] of Object.entries(sets)) {
    if (tier !== 'standard') for (const [k, e] of s.added) allAdded.set(k, e);
  }
  const trueExits = [];
  if (sets.standard) {
    for (const [key, entry] of sets.standard.deleted) {
      if (!allAdded.has(key)) trueExits.push({ security_name: entry.security_name, country: entry.country });
    }
  }

  // Brand new to MSCI universe: added to Standard, not deleted from anywhere lower
  const allDeleted = new Map();
  for (const [tier, s] of Object.entries(sets)) {
    if (tier !== 'standard') for (const [k, e] of s.deleted) allDeleted.set(k, e);
  }
  const newToUniverse = [];
  if (sets.standard) {
    for (const [key, entry] of sets.standard.added) {
      if (!allDeleted.has(key)) newToUniverse.push({ security_name: entry.security_name, country: entry.country });
    }
  }

  return { movements, trueExits, newToUniverse };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /msci/documents — browse available MSCI rebalance documents (no auth needed)
router.get('/documents', async (req, res) => {
  try {
    const r = await fetch(MSCI_INDEX_PAGE, { headers: FETCH_HEADERS });
    if (!r.ok) return res.status(502).json({ error: 'Could not reach MSCI website' });
    const html = await r.text();
    const groups = parseDocumentList(html);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /msci/dates — upcoming index review announcement + effective dates
router.get('/dates', async (req, res) => {
  try {
    const r = await fetch(MSCI_DATES_CSV, { headers: FETCH_HEADERS });
    if (!r.ok) return res.status(502).json({ error: 'Could not reach MSCI website' });
    const csv = await r.text();
    const dates = parseEffectiveDates(csv);
    res.json(dates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /msci/fetch-multi — fetch all available tiers for a period and return cross-tier analysis
router.post('/fetch-multi', async (req, res) => {
  try {
    const { periodCode } = req.body;
    if (!periodCode || !/^[A-Za-z]{3}\d{2}$/.test(periodCode)) {
      return res.status(400).json({ error: 'Invalid periodCode (expected e.g. "Feb26")' });
    }

    // Fetch all tiers in parallel; silently skip missing ones
    const tierEntries = await Promise.all(
      Object.entries(TIER_URLS).map(async ([tier, buildUrl]) => {
        try {
          const url = buildUrl(periodCode);
          const r   = await fetch(url, { headers: FETCH_HEADERS });
          if (!r.ok) return [tier, null];
          const buffer = Buffer.from(await r.arrayBuffer());
          const { text } = await pdfParse(buffer);
          const parsed = parseMsciPdf(text);
          return [tier, parsed.entries.length > 0 ? { ...parsed, tierLabel: TIER_LABELS[tier] } : null];
        } catch {
          return [tier, null];
        }
      })
    );

    const tiers = Object.fromEntries(tierEntries.filter(([, v]) => v !== null));
    if (Object.keys(tiers).length === 0) {
      return res.status(422).json({ error: `No rebalance data found for period "${periodCode}"` });
    }

    const analysis = crossTierAnalysis(tiers);
    res.json({ periodCode, tiers, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /msci/fetch-parse — fetch a PDF from MSCI by URL and parse it (no save)
router.post('/fetch-parse', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    // Only allow MSCI domains
    if (!url.startsWith('https://app2.msci.com/') && !url.startsWith('https://www.msci.com/')) {
      return res.status(400).json({ error: 'Only MSCI URLs are allowed' });
    }
    const r = await fetch(url, { headers: FETCH_HEADERS });
    if (!r.ok) return res.status(502).json({ error: `Failed to fetch PDF: ${r.status}` });
    const buffer = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buffer);
    const result = parseMsciPdf(data.text);
    if (!result.entries.length) {
      return res.status(422).json({
        error: 'Could not detect MSCI rebalance data in this PDF.',
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// GET /msci/security-tracker?q= — search a security name across all saved rebalances
router.get('/security-tracker', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });

  const { data: rebalances, error: rbErr } = await supabase
    .from('msci_rebalances')
    .select('id, title, announcement_date, effective_date')
    .eq('user_id', req.userId)
    .order('effective_date', { ascending: true, nullsFirst: false });
  if (rbErr) return res.status(500).json({ error: rbErr.message });
  if (!rebalances?.length) return res.json([]);

  const rebalanceMap = Object.fromEntries(rebalances.map((r) => [r.id, r]));

  const { data: entries, error: entErr } = await supabase
    .from('msci_rebalance_entries')
    .select('rebalance_id, country, security_name, action')
    .in('rebalance_id', rebalances.map((r) => r.id))
    .ilike('security_name', `%${q}%`);
  if (entErr) return res.status(500).json({ error: entErr.message });

  // Group by normalised security name
  const grouped = {};
  for (const e of entries ?? []) {
    const key = e.security_name.toLowerCase();
    if (!grouped[key]) grouped[key] = { security_name: e.security_name, country: e.country, appearances: [] };
    const rb = rebalanceMap[e.rebalance_id];
    if (!rb) continue;
    grouped[key].appearances.push({
      rebalance_id: e.rebalance_id,
      title: rb.title,
      announcement_date: rb.announcement_date,
      effective_date: rb.effective_date,
      action: e.action,
    });
  }

  const results = Object.values(grouped).map((g) => ({
    ...g,
    appearances: g.appearances.sort((a, b) =>
      (a.effective_date ?? '').localeCompare(b.effective_date ?? '')),
  }));

  res.json(results);
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

  res.json({ ...rb, entries: (entries ?? []).filter((e) => isValidEntry(e.security_name)) });
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
