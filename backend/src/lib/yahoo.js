/**
 * Yahoo Finance API helper — no auth required.
 * Uses the v8/finance/chart and v1/finance/search endpoints which
 * work without cookies or crumb on both local and cloud (Render) servers.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function yfFetch(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}: ${url}`);
  return res.json();
}

module.exports = { yfFetch };
