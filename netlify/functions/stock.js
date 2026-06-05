'use strict';

// Netlify serverless function — secure proxy to Prospect CRM OData API
// PROSPECT_TOKEN env var is NEVER exposed to the browser

const BASE = 'https://crm-odata-v1.prospect365.com';

// Entity names to try in order — Prospect365 accounts vary
const CANDIDATE_ENTITIES = [
  'Products',
  'StockItems',
  'Product',
  'CatalogueItems',
  'ProductCatalogueItems',
  'Items',
  'Inventory',
  'InventoryItems',
  'StockLevels',
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

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept:        'application/json',
  };

  try {
    // ── Step 1: discover which entity set exists ──────────────────────────
    let entity = null;

    for (const candidate of CANDIDATE_ENTITIES) {
      const probe = await timedFetch(`${BASE}/${candidate}?$top=1`, headers, 8000);
      if (probe.ok) { entity = candidate; break; }
    }

    // ── Step 2: if nothing matched, fetch the OData root to help debug ────
    if (!entity) {
      let rootInfo = null;
      try {
        const rootRes = await timedFetch(`${BASE}/`, headers, 8000);
        if (rootRes.ok) rootInfo = await rootRes.json();
      } catch (_) {}

      return {
        statusCode: 404,
        headers: cors(),
        body: JSON.stringify({
          error: 'Could not find a product entity in Prospect CRM',
          tried: CANDIDATE_ENTITIES,
          // Return whatever the OData root lists so we can find the right name
          availableEntities: rootInfo
            ? (rootInfo.value || []).map(e => e.name || e.Name || e.url || e.URL)
            : null,
        }),
      };
    }

    // ── Step 3: fetch all records (follow OData pagination) ───────────────
    let allProducts = [];
    let url = `${BASE}/${entity}?$top=1000&$orderby=Description`;

    for (let page = 0; page < 10 && url; page++) {
      const res = await timedFetch(url, headers, 15000);

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: cors(),
          body: JSON.stringify({
            error:  `Prospect CRM returned HTTP ${res.status}`,
            entity,
            detail: detail.slice(0, 500),
          }),
        };
      }

      const json  = await res.json();
      const items = Array.isArray(json.value) ? json.value
                  : Array.isArray(json)       ? json
                  : [];
      allProducts = allProducts.concat(items);
      url = json['@odata.nextLink'] || null;
    }

    // ── Step 4: normalise field names ─────────────────────────────────────
    const products = allProducts.map(p => ({
      name: p.Description      || p.Name          || p.ProductName  ||
            p.description      || p.name          || p.productName  || '',

      stock: pick(p, [
        'FreeStock', 'StockLevel', 'QuantityOnHand', 'FreeStockLevel',
        'Stock',     'Quantity',   'freeStock',       'stockLevel',
        'quantityOnHand', 'CurrentStock', 'AvailableStock',
      ]),

      category: p.GroupDescription    || p.CategoryDescription || p.ProductGroup  ||
                p.Group               || p.Category            || p.groupDescription ||
                p.categoryDescription || p.productGroup        || p.group         || '',

      sku: p.Reference || p.SKU    || p.Code       || p.ProductCode ||
           p.reference || p.sku    || p.code       || p.productCode || '',
    }));

    const filtered = products.filter(p => p.name.trim() !== '');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify({
        products: filtered,
        total:    filtered.length,
        entity,                                              // which entity we used
        _fields:  allProducts.length > 0 ? Object.keys(allProducts[0]) : [],
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

// fetch with AbortController timeout
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
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
  }
  return null;
}

function cors() {
  return {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}
