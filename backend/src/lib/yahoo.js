/**
 * Yahoo Finance auth helper — extracts cookie + crumb from the Yahoo Finance
 * page HTML instead of hitting the dedicated /getcrumb endpoint (which gets
 * 429'd on cloud/server IPs). Caches for 1 hour. Serialises concurrent auth
 * requests so only one fetch ever runs at a time.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

let _cookie  = null;
let _crumb   = null;
let _expiry  = 0;
let _pending = null; // serialise concurrent auth — only one in-flight at a time

function extractCookies(res) {
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [(res.headers.get('set-cookie') || '')];
  return raw.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function getAuth() {
  if (_crumb && Date.now() < _expiry) return { cookie: _cookie, crumb: _crumb };
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      // Fetch the Yahoo Finance quote page — sets required cookies AND embeds crumb in HTML
      const pageRes = await fetch('https://finance.yahoo.com/quote/SPY/', {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
      });

      _cookie = extractCookies(pageRes);

      const html = await pageRes.text();

      // Crumb is embedded in a JSON blob: {"crumb":"xxxxxxxx"}
      const match = html.match(/"crumb"\s*:\s*"([^"\\]{5,20})"/);
      if (match) {
        _crumb  = match[1].replace(/\\u002F/g, '/');
        _expiry = Date.now() + 3_600_000;
        console.log('[yahoo] Auth OK — crumb from page HTML');
        return { cookie: _cookie, crumb: _crumb };
      }

      // Fallback: try getcrumb endpoint with the cookies we got from the page
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...API_HEADERS, Cookie: _cookie },
      });
      if (crumbRes.ok) {
        _crumb  = (await crumbRes.text()).trim();
        _expiry = Date.now() + 3_600_000;
        console.log('[yahoo] Auth OK — crumb from getcrumb endpoint');
        return { cookie: _cookie, crumb: _crumb };
      }

      throw new Error(`Could not obtain Yahoo Finance crumb (getcrumb: ${crumbRes.status})`);
    } finally {
      _pending = null;
    }
  })();

  return _pending;
}

/**
 * Fetch a Yahoo Finance API URL with cookie + crumb injected.
 * Retries once if the crumb is stale (401/403).
 */
async function yfFetch(url) {
  const doRequest = async () => {
    const { cookie, crumb } = await getAuth();
    const sep = url.includes('?') ? '&' : '?';
    return fetch(`${url}${sep}crumb=${encodeURIComponent(crumb)}`, {
      headers: { ...API_HEADERS, Cookie: cookie },
    });
  };

  let res = await doRequest();

  if (res.status === 401 || res.status === 403) {
    // Stale — force re-auth and retry once
    _crumb = null; _expiry = 0;
    res = await doRequest();
  }

  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}: ${url}`);
  return res.json();
}

module.exports = { yfFetch, getAuth };
