const express = require('express');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'GLD'];

const SYMBOL_META = {
  'SPY':     { name: 'S&P 500 ETF',       category: 'equity' },
  'QQQ':     { name: 'NASDAQ 100 ETF',    category: 'equity' },
  'ACWI':    { name: 'World Index ETF',   category: 'equity' },
  'DIA':     { name: 'Dow Jones ETF',     category: 'equity' },
  'IWM':     { name: 'Russell 2000 ETF',  category: 'equity' },
  'EEM':     { name: 'Emerging Markets',  category: 'equity' },
  'BTC-USD': { name: 'Bitcoin',           category: 'crypto' },
  'ETH-USD': { name: 'Ethereum',          category: 'crypto' },
  'GLD':     { name: 'Gold ETF',          category: 'commodity' },
  'USO':     { name: 'Oil ETF',           category: 'commodity' },
  'TLT':     { name: 'Long-term Bonds',   category: 'bond' },
};

// GET /market-data/history?symbols=SPY,QQQ&period=2y&interval=1mo
router.get('/history', async (req, res) => {
  try {
    const symbols = (req.query.symbols || DEFAULT_SYMBOLS.join(',')).split(',').map(s => s.trim().toUpperCase());
    const period  = req.query.period   || '2y';
    const interval = req.query.interval || '1mo';

    const results = await Promise.all(
      symbols.map((symbol) =>
        cached(`history:${symbol}:${period}:${interval}`, () =>
          yahooFinance.chart(symbol, { period1: periodToDate(period), interval })
            .then((r) => {
              const quotes = r.quotes ?? [];
              return quotes
                .filter((q) => q.close != null)
                .map((q) => ({
                  date: q.date.toISOString().slice(0, 10),
                  asset: symbol,
                  name: SYMBOL_META[symbol]?.name ?? symbol,
                  category: SYMBOL_META[symbol]?.category ?? 'equity',
                  value: parseFloat(q.close.toFixed(2)),
                }));
            })
        )
      )
    );

    res.json(results.flat());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /market-data/quotes?symbols=SPY,QQQ
router.get('/quotes', async (req, res) => {
  try {
    const symbols = (req.query.symbols || DEFAULT_SYMBOLS.join(',')).split(',').map(s => s.trim().toUpperCase());

    const results = await Promise.all(
      symbols.map((symbol) =>
        cached(`quote:${symbol}`, () =>
          yahooFinance.quoteSummary(symbol, { modules: ['price'] })
            .then((r) => {
              const p = r.price;
              return {
                symbol,
                name: SYMBOL_META[symbol]?.name ?? p?.shortName ?? symbol,
                category: SYMBOL_META[symbol]?.category ?? 'equity',
                price: p?.regularMarketPrice ?? null,
                change: p?.regularMarketChange ?? null,
                changePct: p?.regularMarketChangePercent != null
                  ? parseFloat((p.regularMarketChangePercent * 100).toFixed(2))
                  : null,
                prevClose: p?.regularMarketPreviousClose ?? null,
                currency: p?.currency ?? 'USD',
              };
            })
        )
      )
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /market-data/search?q=apple
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q is required' });
    const results = await yahooFinance.search(q, { newsCount: 0 });
    const quotes = (results.quotes ?? []).slice(0, 8).map((r) => ({
      symbol: r.symbol,
      name: r.shortname ?? r.longname ?? r.symbol,
      type: r.quoteType,
      exchange: r.exchDisp,
    }));
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helpers
function periodToDate(period) {
  const n = parseInt(period);
  const unit = period.slice(-1);
  const d = new Date();
  if (unit === 'd') d.setDate(d.getDate() - n);
  else if (unit === 'w') d.setDate(d.getDate() - n * 7);
  else if (unit === 'm') d.setMonth(d.getMonth() - n);
  else if (unit === 'y') d.setFullYear(d.getFullYear() - n);
  return d;
}

module.exports = router;
