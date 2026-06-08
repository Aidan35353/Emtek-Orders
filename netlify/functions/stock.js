'use strict';

// Netlify serverless function — secure proxy to Prospect CRM OData API
// PROSPECT_TOKEN env var is NEVER exposed to the browser

const BASE = 'https://crm-odata-v1.prospect365.com';

const CANDIDATE_ENTITIES = [
  'Inventories',       // Prospect365 standard product/stock entity
  'ProductItems',      // alternate product entity
  'StockByWarehouses', // stock-level view
  'StockByBins',
  'Products',
  'StockItems',
];

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
    // ── Step 1: read OData service root to discover entity names ─────────
    let availableEntities = [];
    try {
      const rootRes = await timedFetch(`${BASE}/`, headers, 8000);
      if (rootRes.ok) {
        const rootJson = await rootRes.json();
        availableEntities = (rootJson.value || [])
          .map(e => e.name || e.Name || e.url || e.URL)
          .filter(Boolean);
      }
    } catch (_) {}

    // ── Step 2: if root gave us names, try those first; else try candidates
    const toTry = availableEntities.length
      ? [...availableEntities, ...CANDIDATE_ENTITIES.filter(c => !availableEntities.includes(c))]
      : CANDIDATE_ENTITIES;

    let entity = null;
    for (const candidate of toTry) {
      try {
        const probe = await timedFetch(`${BASE}/${candidate}?$top=1`, headers, 6000);
        if (probe.ok) { entity = candidate; break; }
      } catch (_) {}
    }

    // ── Step 3: nothing matched — return the entity list so we can debug ─
    if (!entity) {
      return {
        statusCode: 404,
        headers: cors(),
        body: JSON.stringify({
          error: 'Could not find a product entity in Prospect CRM',
          availableEntities,          // shown on-screen in the portal
          tried: CANDIDATE_ENTITIES,
        }),
      };
    }

    // ── Step 4: fetch all records with OData pagination ───────────────────
    let allProducts = [];
    let url = `${BASE}/${entity}?$top=1000`;

    for (let page = 0; page < 10 && url; page++) {
      const res = await timedFetch(url, headers, 15000);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: cors(),
          body: JSON.stringify({
            error: `Prospect CRM returned HTTP ${res.status}`,
            entity, detail: detail.slice(0, 500),
          }),
        };
      }
      const json  = await res.json();
      const items = Array.isArray(json.value) ? json.value
                  : Array.isArray(json)       ? json : [];
      allProducts = allProducts.concat(items);
      url = json['@odata.nextLink'] || null;
    }

    // ── Step 5: normalise field names ─────────────────────────────────────
    const products = allProducts.map(p => ({
      // Prospect365 Inventories entity uses StockDescription / StockCode
      name: p.StockDescription || p.Description || p.Name       ||
            p.ProductName      || p.ItemDescription || p.description ||
            p.name             || p.productName  || '',
      stock: pick(p, [
        'FreeStock','QuantityInStock','StockQuantity','QtyOnHand',
        'StockLevel','QuantityOnHand','FreeStockLevel','AvailableQty',
        'Stock','Quantity','CurrentStock','AvailableStock',
        'freeStock','stockLevel','quantityOnHand',
      ]),
      category: p.GroupDescription  || p.StockGroup   || p.ProductGroup  ||
                p.CategoryDescription || p.Group      || p.Category      ||
                p.groupDescription  || p.category     || '',
      sku: p.StockCode  || p.Reference || p.ItemCode  || p.SKU   ||
           p.Code       || p.ProductCode || p.reference || p.sku  ||
           p.code       || p.productCode || '',
    }));

    const filtered = products.filter(p => p.name.trim() !== '');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify({
        products: filtered,
        total: filtered.length,
        entity,
        _fields:  allProducts.length > 0 ? Object.keys(allProducts[0]) : [],
        // First 3 raw records so we can identify the correct field names
        _sample:  allProducts.slice(0, 3),
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

function pick(obj, keys) {
  for (const k of keys) { if (obj[k] != null) return obj[k]; }
  return null;
}

function cors() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
}
