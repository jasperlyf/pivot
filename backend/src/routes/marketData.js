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

    const results = await Promise.allSettled(
      symbols.map((symbol) =>
        cached(`quote:${symbol}`, () =>
          yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail', 'defaultKeyStatistics'] })
            .then((r) => {
              const p  = r.price;
              const sd = r.summaryDetail;
              const ks = r.defaultKeyStatistics;
              return {
                symbol,
                name:        SYMBOL_META[symbol]?.name ?? p?.shortName ?? symbol,
                category:    SYMBOL_META[symbol]?.category ?? 'equity',
                price:       p?.regularMarketPrice ?? null,
                change:      p?.regularMarketChange ?? null,
                changePct:   p?.regularMarketChangePercent != null
                               ? parseFloat((p.regularMarketChangePercent * 100).toFixed(2))
                               : null,
                prevClose:   p?.regularMarketPreviousClose ?? null,
                open:        p?.regularMarketOpen ?? null,
                dayHigh:     p?.regularMarketDayHigh ?? null,
                dayLow:      p?.regularMarketDayLow ?? null,
                volume:      p?.regularMarketVolume ?? null,
                avgVolume:   sd?.averageVolume ?? null,
                marketCap:   p?.marketCap ?? null,
                week52High:  sd?.fiftyTwoWeekHigh ?? null,
                week52Low:   sd?.fiftyTwoWeekLow ?? null,
                expenseRatio: ks?.annualReportExpenseRatio != null
                               ? parseFloat((ks.annualReportExpenseRatio * 100).toFixed(2))
                               : null,
                currency:    p?.currency ?? 'USD',
              };
            })
        )
      )
    );

    const rows = results.map((r, i) => {
      const symbol = symbols[i];
      if (r.status === 'fulfilled') return r.value;
      return {
        symbol,
        name:     SYMBOL_META[symbol]?.name ?? symbol,
        category: SYMBOL_META[symbol]?.category ?? 'equity',
        price: null,
        change: null,
        changePct: null,
        prevClose: null,
        open: null,
        dayHigh: null,
        dayLow: null,
        volume: null,
        avgVolume: null,
        marketCap: null,
        week52High: null,
        week52Low: null,
        expenseRatio: null,
        currency: 'USD',
        error: r.reason?.message ?? 'Quote fetch failed',
      };
    });

    res.json(rows);
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

// GET /market-data/holdings?symbol=SPY
router.get('/holdings', async (req, res) => {
  try {
    const symbol = (req.query.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });

    const data = await cached(`holdings:${symbol}`, () =>
      yahooFinance.quoteSummary(symbol, { modules: ['topHoldings'] })
        .then((r) => {
          const th = r.topHoldings;
          if (!th) return null;
          return {
            symbol,
            holdings: (th.holdings ?? []).map((h) => ({
              symbol: h.symbol,
              name: h.holdingName,
              pct: h.holdingPercent != null ? parseFloat((h.holdingPercent * 100).toFixed(2)) : null,
            })),
            equityPct: th.stockPosition != null ? parseFloat((th.stockPosition * 100).toFixed(2)) : null,
            bondPct: th.bondPosition != null ? parseFloat((th.bondPosition * 100).toFixed(2)) : null,
            cashPct: th.cashPosition != null ? parseFloat((th.cashPosition * 100).toFixed(2)) : null,
          };
        })
    );

    if (!data) return res.json({ symbol, holdings: [] });
    res.json(data);
  } catch (err) {
    // Many symbols (stocks, crypto) have no topHoldings — return empty gracefully
    res.json({ symbol: (req.query.symbol || '').toUpperCase(), holdings: [] });
  }
});

// GET /market-data/stats?symbols=ACWI,EFA,EEM,SPY
router.get('/stats', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols required' });

    // Always fetch SPY for beta baseline
    const fetchPrices = async (symbol) => {
      return cached(`stats:${symbol}`, () =>
        yahooFinance.chart(symbol, { period1: periodToDate('5y'), interval: '1mo' })
          .then(r => {
            const rows = (r.quotes ?? [])
              .filter(q => q.close != null)
              .sort((a, b) => a.date - b.date);
            return rows.map(q => ({ date: q.date.toISOString().slice(0, 7), close: q.close }));
          })
      );
    };

    const allSymbols = symbols.includes('SPY') ? symbols : [...symbols, 'SPY'];
    const priceMap = {};
    await Promise.all(allSymbols.map(async sym => {
      try { priceMap[sym] = await fetchPrices(sym); }
      catch (e) { priceMap[sym] = []; }
    }));

    const spyPrices = priceMap['SPY'] ?? [];

    const results = symbols.map(symbol => {
      const prices = priceMap[symbol] ?? [];
      if (prices.length < 6) return { symbol, dataPoints: prices.length, periodsCovered: [] };

      const closes = prices.map(p => p.close);
      const dates  = prices.map(p => p.date);
      const windows = { '1Y': 13, '3Y': 37, '5Y': 61 };
      const periodsCovered = Object.entries(windows)
        .filter(([, n]) => closes.length >= n).map(([label]) => label);

      const out = { symbol, dataPoints: closes.length, periodsCovered,
        annualisedReturn: {}, annualisedVolatility: {}, sharpeRatio: {},
        maxDrawdown: {}, beta: {}, calmarRatio: {} };

      for (const [label, n] of Object.entries(windows)) {
        if (closes.length < n) continue;
        const slice = closes.slice(-n);
        const years = (n - 1) / 12;
        const monthlyRet = slice.slice(1).map((v, i) => (v - slice[i]) / slice[i]);
        const annRet = Math.pow(slice[slice.length - 1] / slice[0], 1 / years) - 1;
        const mean = monthlyRet.reduce((a, b) => a + b, 0) / monthlyRet.length;
        const variance = monthlyRet.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (monthlyRet.length - 1);
        const stdDev = Math.sqrt(variance);
        const annVol = stdDev * Math.sqrt(12);

        const rfMonthly = Math.pow(1.045, 1 / 12) - 1;
        const excess = monthlyRet.map(r => r - rfMonthly);
        const exMean = excess.reduce((a, b) => a + b, 0) / excess.length;
        const exVar  = excess.reduce((a, b) => a + Math.pow(b - exMean, 2), 0) / (excess.length - 1);
        const sharpe = annVol > 0 ? (exMean / Math.sqrt(exVar)) * Math.sqrt(12) : null;

        let peak = slice[0], maxDD = 0;
        for (const p of slice) {
          if (p > peak) peak = p;
          const dd = (p - peak) / peak;
          if (dd < maxDD) maxDD = dd;
        }

        // Beta vs SPY — align by date
        let beta = symbol === 'SPY' ? 1.0 : null;
        if (symbol !== 'SPY' && spyPrices.length >= n) {
          const spySlice = spyPrices.slice(-n);
          const symDates = new Set(prices.slice(-n).map(p => p.date));
          const aligned  = spySlice.filter(p => symDates.has(p.date));
          if (aligned.length >= n - 2) {
            const spyRet = aligned.slice(1).map((v, i) => (v.close - aligned[i].close) / aligned[i].close);
            const symRetAligned = monthlyRet.slice(monthlyRet.length - spyRet.length);
            if (spyRet.length > 2) {
              const symMean = symRetAligned.reduce((a, b) => a + b, 0) / symRetAligned.length;
              const spyMean = spyRet.reduce((a, b) => a + b, 0) / spyRet.length;
              const cov = symRetAligned.reduce((a, r, i) => a + (r - symMean) * (spyRet[i] - spyMean), 0) / (spyRet.length - 1);
              const spyVar = spyRet.reduce((a, r) => a + Math.pow(r - spyMean, 2), 0) / (spyRet.length - 1);
              beta = spyVar > 0 ? cov / spyVar : null;
            }
          }
        }

        const calmar = maxDD !== 0 ? annRet / Math.abs(maxDD) : null;

        const r4 = v => v != null ? parseFloat(v.toFixed(4)) : null;
        out.annualisedReturn[label]     = r4(annRet);
        out.annualisedVolatility[label] = r4(annVol);
        out.sharpeRatio[label]          = r4(sharpe);
        out.maxDrawdown[label]          = r4(maxDD);
        out.beta[label]                 = r4(beta);
        out.calmarRatio[label]          = r4(calmar);
      }
      return out;
    });

    res.json(results);
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
