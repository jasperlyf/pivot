const express = require('express');
const { yfFetch, getAuth } = require('../lib/yahoo');

const router = express.Router();

// Simple in-memory cache — { key: { data, expiresAt } }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);
  return fn().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
    return data;
  });
}

const SYMBOL_META = {
  'SPY':     { name: 'S&P 500 ETF',      category: 'equity' },
  'QQQ':     { name: 'NASDAQ 100 ETF',   category: 'equity' },
  'ACWI':    { name: 'World Index ETF',  category: 'equity' },
  'DIA':     { name: 'Dow Jones ETF',    category: 'equity' },
  'IWM':     { name: 'Russell 2000 ETF', category: 'equity' },
  'EEM':     { name: 'Emerging Markets', category: 'equity' },
  'BTC-USD': { name: 'Bitcoin',          category: 'crypto' },
  'ETH-USD': { name: 'Ethereum',         category: 'crypto' },
  'GLD':     { name: 'Gold ETF',         category: 'commodity' },
  'USO':     { name: 'Oil ETF',          category: 'commodity' },
  'TLT':     { name: 'Long-term Bonds',  category: 'bond' },
};

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'GLD'];

function periodToDate(period) {
  const n    = parseInt(period);
  const unit = period.slice(-1);
  const d    = new Date();
  if (unit === 'd') d.setDate(d.getDate() - n);
  else if (unit === 'w') d.setDate(d.getDate() - n * 7);
  else if (unit === 'm') d.setMonth(d.getMonth() - n);
  else if (unit === 'y') d.setFullYear(d.getFullYear() - n);
  return Math.floor(d.getTime() / 1000);
}

// ── GET /market-data/quotes ────────────────────────────────────────────────────
router.get('/quotes', async (req, res) => {
  try {
    const symbols = (req.query.symbols || DEFAULT_SYMBOLS.join(',')).split(',').map((s) => s.trim().toUpperCase());

    const data = await cached(`quotes:${symbols.join(',')}`, () =>
      yfFetch(`https://query1.finance.yahoo.com/v8/finance/quote?symbols=${symbols.join(',')}`)
        .then((json) => {
          const results = json?.quoteResponse?.result ?? [];
          return symbols.map((symbol) => {
            const q = results.find((r) => r.symbol === symbol);
            if (!q) return {
              symbol, name: SYMBOL_META[symbol]?.name ?? symbol,
              category: SYMBOL_META[symbol]?.category ?? 'equity',
              price: null, change: null, changePct: null, prevClose: null,
              open: null, dayHigh: null, dayLow: null, volume: null,
              avgVolume: null, marketCap: null, week52High: null, week52Low: null,
              expenseRatio: null, currency: 'USD', error: 'No data',
            };
            return {
              symbol,
              name:        SYMBOL_META[symbol]?.name ?? q.shortName ?? symbol,
              category:    SYMBOL_META[symbol]?.category ?? 'equity',
              price:       q.regularMarketPrice ?? null,
              change:      q.regularMarketChange != null ? parseFloat(q.regularMarketChange.toFixed(4)) : null,
              changePct:   q.regularMarketChangePercent != null ? parseFloat((q.regularMarketChangePercent * 100).toFixed(2)) : null,
              prevClose:   q.regularMarketPreviousClose ?? null,
              open:        q.regularMarketOpen ?? null,
              dayHigh:     q.regularMarketDayHigh ?? null,
              dayLow:      q.regularMarketDayLow ?? null,
              volume:      q.regularMarketVolume ?? null,
              avgVolume:   q.averageDailyVolume3Month ?? null,
              marketCap:   q.marketCap ?? null,
              week52High:  q.fiftyTwoWeekHigh ?? null,
              week52Low:   q.fiftyTwoWeekLow ?? null,
              expenseRatio: null, // fetched separately if needed
              currency:    q.currency ?? 'USD',
            };
          });
        })
    );

    res.json(data);
  } catch (err) {
    console.error('[quotes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /market-data/history ───────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const symbols  = (req.query.symbols || DEFAULT_SYMBOLS.join(',')).split(',').map((s) => s.trim().toUpperCase());
    const period   = req.query.period   || '2y';
    const interval = req.query.interval || '1mo';
    const period1  = periodToDate(period);
    const period2  = Math.floor(Date.now() / 1000);

    const results = await Promise.all(
      symbols.map((symbol) =>
        cached(`history:${symbol}:${period}:${interval}`, () =>
          yfFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}`)
            .then((json) => {
              const result    = json?.chart?.result?.[0];
              if (!result) return [];
              const timestamps = result.timestamp ?? [];
              const closes     = result.indicators?.quote?.[0]?.close ?? [];
              return timestamps
                .map((ts, i) => ({ ts, close: closes[i] }))
                .filter(({ close }) => close != null)
                .map(({ ts, close }) => ({
                  date:     new Date(ts * 1000).toISOString().slice(0, 10),
                  asset:    symbol,
                  name:     SYMBOL_META[symbol]?.name ?? symbol,
                  category: SYMBOL_META[symbol]?.category ?? 'equity',
                  value:    parseFloat(close.toFixed(2)),
                }));
            })
        )
      )
    );

    res.json(results.flat());
  } catch (err) {
    console.error('[history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /market-data/search ────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q is required' });

    const data = await yfFetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`);
    const quotes = (data?.quotes ?? []).slice(0, 8).map((r) => ({
      symbol:   r.symbol,
      name:     r.shortname ?? r.longname ?? r.symbol,
      type:     r.quoteType,
      exchange: r.exchDisp,
    }));
    res.json(quotes);
  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /market-data/holdings ──────────────────────────────────────────────────
router.get('/holdings', async (req, res) => {
  try {
    const symbol = (req.query.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });

    const data = await cached(`holdings:${symbol}`, () =>
      yfFetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings`)
        .then((json) => {
          const th = json?.quoteSummary?.result?.[0]?.topHoldings;
          if (!th) return { symbol, holdings: [] };
          return {
            symbol,
            holdings: (th.holdings ?? []).map((h) => ({
              symbol: h.symbol,
              name:   h.holdingName,
              pct:    h.holdingPercent != null ? parseFloat((h.holdingPercent * 100).toFixed(2)) : null,
            })),
            equityPct: th.stockPosition != null ? parseFloat((th.stockPosition * 100).toFixed(2)) : null,
            bondPct:   th.bondPosition  != null ? parseFloat((th.bondPosition  * 100).toFixed(2)) : null,
            cashPct:   th.cashPosition  != null ? parseFloat((th.cashPosition  * 100).toFixed(2)) : null,
          };
        })
    );

    res.json(data);
  } catch (err) {
    res.json({ symbol: (req.query.symbol || '').toUpperCase(), holdings: [] });
  }
});

// ── GET /market-data/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols required' });

    const period1 = periodToDate('5y');
    const period2 = Math.floor(Date.now() / 1000);

    const fetchPrices = (symbol) =>
      cached(`stats:${symbol}`, () =>
        yfFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1mo`)
          .then((json) => {
            const result     = json?.chart?.result?.[0];
            if (!result) return [];
            const timestamps = result.timestamp ?? [];
            const closes     = result.indicators?.quote?.[0]?.close ?? [];
            return timestamps
              .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 7), close: closes[i] }))
              .filter((r) => r.close != null)
              .sort((a, b) => a.date.localeCompare(b.date));
          })
      );

    const allSymbols = symbols.includes('SPY') ? symbols : [...symbols, 'SPY'];
    const priceMap   = {};
    await Promise.all(allSymbols.map(async (sym) => {
      try { priceMap[sym] = await fetchPrices(sym); }
      catch { priceMap[sym] = []; }
    }));

    const spyPrices = priceMap['SPY'] ?? [];
    const windows   = { '1Y': 13, '3Y': 37, '5Y': 61 };

    const results = symbols.map((symbol) => {
      const prices = priceMap[symbol] ?? [];
      if (prices.length < 6) return { symbol, dataPoints: prices.length, periodsCovered: [] };

      const closes = prices.map((p) => p.close);
      const periodsCovered = Object.entries(windows).filter(([, n]) => closes.length >= n).map(([label]) => label);
      const out = { symbol, dataPoints: closes.length, periodsCovered,
        annualisedReturn: {}, annualisedVolatility: {}, sharpeRatio: {},
        maxDrawdown: {}, beta: {}, calmarRatio: {} };

      for (const [label, n] of Object.entries(windows)) {
        if (closes.length < n) continue;
        const slice      = closes.slice(-n);
        const years      = (n - 1) / 12;
        const monthlyRet = slice.slice(1).map((v, i) => (v - slice[i]) / slice[i]);
        const annRet     = Math.pow(slice[slice.length - 1] / slice[0], 1 / years) - 1;
        const mean       = monthlyRet.reduce((a, b) => a + b, 0) / monthlyRet.length;
        const variance   = monthlyRet.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (monthlyRet.length - 1);
        const annVol     = Math.sqrt(variance) * Math.sqrt(12);
        const rfMonthly  = Math.pow(1.045, 1 / 12) - 1;
        const excess     = monthlyRet.map((r) => r - rfMonthly);
        const exMean     = excess.reduce((a, b) => a + b, 0) / excess.length;
        const exVar      = excess.reduce((a, b) => a + Math.pow(b - exMean, 2), 0) / (excess.length - 1);
        const sharpe     = annVol > 0 ? (exMean / Math.sqrt(exVar)) * Math.sqrt(12) : null;
        let peak = slice[0], maxDD = 0;
        for (const p of slice) { if (p > peak) peak = p; const dd = (p - peak) / peak; if (dd < maxDD) maxDD = dd; }

        let beta = symbol === 'SPY' ? 1.0 : null;
        if (symbol !== 'SPY' && spyPrices.length >= n) {
          const spySlice = spyPrices.slice(-n);
          const symDates = new Set(prices.slice(-n).map((p) => p.date));
          const aligned  = spySlice.filter((p) => symDates.has(p.date));
          if (aligned.length >= n - 2) {
            const spyRet        = aligned.slice(1).map((v, i) => (v.close - aligned[i].close) / aligned[i].close);
            const symRetAligned = monthlyRet.slice(monthlyRet.length - spyRet.length);
            if (spyRet.length > 2) {
              const symMean = symRetAligned.reduce((a, b) => a + b, 0) / symRetAligned.length;
              const spyMean = spyRet.reduce((a, b) => a + b, 0) / spyRet.length;
              const cov     = symRetAligned.reduce((a, r, i) => a + (r - symMean) * (spyRet[i] - spyMean), 0) / (spyRet.length - 1);
              const spyVar  = spyRet.reduce((a, r) => a + Math.pow(r - spyMean, 2), 0) / (spyRet.length - 1);
              beta = spyVar > 0 ? cov / spyVar : null;
            }
          }
        }

        const r4 = (v) => v != null ? parseFloat(v.toFixed(4)) : null;
        out.annualisedReturn[label]     = r4(annRet);
        out.annualisedVolatility[label] = r4(annVol);
        out.sharpeRatio[label]          = r4(sharpe);
        out.maxDrawdown[label]          = r4(maxDD);
        out.beta[label]                 = r4(beta);
        out.calmarRatio[label]          = r4(maxDD !== 0 ? annRet / Math.abs(maxDD) : null);
      }
      return out;
    });

    res.json(results);
  } catch (err) {
    console.error('[stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pre-warm auth on module load so the first real request doesn't race
getAuth().catch((e) => console.warn('[yahoo] Pre-warm failed:', e.message));

module.exports = router;
