'use strict';

// Netlify serverless function — secure proxy to Prospect CRM OData API
// PROSPECT_TOKEN env var is NEVER exposed to the browser

const BASE = 'https://crm-odata-v1.prospect365.com';

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.PROSPECT_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ error: 'PROSPECT_TOKEN is not configured on this deployment' }),
    };
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  try {
    // ProductItems — Sellable=true, Obsolete=0 matches "All Sellable Products"
    let allProducts = [];
    let url = `${BASE}/ProductItems?$filter=Sellable eq true and Obsolete eq 0&$top=1000`;

    for (let page = 0; page < 10 && url; page++) {
      const res = await timedFetch(url, headers, 15000);

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: cors(),
          body: JSON.stringify({
            error:  `Prospect CRM returned HTTP ${res.status}`,
            detail: detail.slice(0, 500),
          }),
        };
      }

      const json  = await res.json();
      const items = Array.isArray(json.value) ? json.value
                  : Array.isArray(json)       ? json : [];
      allProducts = allProducts.concat(items);
      url = json['@odata.nextLink'] || null;
    }

    // Normalise — ProductItems confirmed field names from debug probe
    const products = allProducts.map(p => ({
      name:     p.Description     || '',
      stock:    p.DecimalQuantityAvailable ?? p.QuantityAvailable ?? null,
      category: p.CategoryId      || '',
      sku:      p.ProductItemId   || p.Sku || '',
    }));

    const filtered = products.filter(p => p.name.trim() !== '');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify({
        products: filtered,
        total:    filtered.length,
        entity:   'ProductItems',
        _fields:  allProducts.length > 0 ? Object.keys(allProducts[0]) : [],
        _sample:  allProducts.slice(0, 2),
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function timedFetch(url, headers, ms) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cors() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
}
