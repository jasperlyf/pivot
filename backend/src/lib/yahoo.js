/**
 * Yahoo Finance auth + fetch helper.
 * Fetches cookie + crumb once, caches for 1 hour.
 * Serialises concurrent auth requests so only one crumb fetch ever runs at a time.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

let _cookie  = null;
let _crumb   = null;
let _expiry  = 0;
let _pending = null; // single in-flight auth promise — prevents concurrent crumb fetches

async function getAuth() {
  if (_crumb && Date.now() < _expiry) return { cookie: _cookie, crumb: _crumb };
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      // Step 1 — get Yahoo cookie
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
      });
      const rawCookies = cookieRes.headers.getSetCookie
        ? cookieRes.headers.getSetCookie()
        : [(cookieRes.headers.get('set-cookie') || '')];
      _cookie = rawCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');

      // Step 2 — get crumb using the cookie
      const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...BROWSER_HEADERS, Cookie: _cookie },
      });
      if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);
      _crumb  = (await crumbRes.text()).trim();
      _expiry = Date.now() + 3_600_000; // 1 hour
      console.log('[yahoo] Auth refreshed — crumb OK');
      return { cookie: _cookie, crumb: _crumb };
    } finally {
      _pending = null;
    }
  })();

  return _pending;
}

/**
 * Fetch a Yahoo Finance API URL with cookie + crumb injected.
 * Automatically retries once if auth is stale (401/403).
 */
async function yfFetch(url) {
  const doRequest = async () => {
    const { cookie, crumb } = await getAuth();
    const sep = url.includes('?') ? '&' : '?';
    return fetch(`${url}${sep}crumb=${encodeURIComponent(crumb)}`, {
      headers: { ...BROWSER_HEADERS, Cookie: cookie },
    });
  };

  let res = await doRequest();

  // Stale crumb — invalidate and retry once
  if (res.status === 401 || res.status === 403) {
    _crumb = null; _expiry = 0;
    res = await doRequest();
  }

  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}: ${url}`);
  return res.json();
}

module.exports = { yfFetch, getAuth };
