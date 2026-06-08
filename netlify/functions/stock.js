'use strict';

// Netlify serverless function — secure proxy to Prospect CRM OData API
// PROSPECT_TOKEN env var is NEVER exposed to the browser

const BASE = 'https://crm-odata-v1.prospect365.com';

// Specific stock/product entities to try — in priority order
const CANDIDATE_ENTITIES = [
  'Inventories',       // Prospect365 standard inventory entity
  'InventorySearch',   // Prospect365 inventory search/query view
  'ProductItems',      // alternate product entity
  'ProductItemSearch', // product item search view
  'StockByWarehouses', // stock-level view
  'StockByBins',
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
    // ── Find the right entity — try candidates in order ───────────────────
    let entity = null;
    const probeResults = {};

    for (const candidate of CANDIDATE_ENTITIES) {
      try {
        const probe = await timedFetch(`${BASE}/${candidate}?$top=1`, headers, 8000);
        probeResults[candidate] = probe.status;
        if (probe.ok) { entity = candidate; break; }
      } catch (e) {
        probeResults[candidate] = 'timeout/error';
      }
    }

    if (!entity) {
      return {
        statusCode: 404,
        headers: cors(),
        body: JSON.stringify({
          error: 'Could not find a stock entity in Prospect CRM',
          probeResults,
        }),
      };
    }

    // ── Fetch all records with OData pagination ───────────────────────────
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

    // ── Normalise field names ─────────────────────────────────────────────
    // Prospect365 Inventories uses StockDescription / StockCode / FreeStock
    const products = allProducts.map(p => ({
      name: p.StockDescription || p.Description    || p.Name         ||
            p.ProductName      || p.ItemDescription || p.description  ||
            p.name             || p.productName     || '',

      stock: pick(p, [
        'FreeStock','QuantityInStock','StockQuantity','QtyOnHand',
        'StockLevel','QuantityOnHand','FreeStockLevel','AvailableQty',
        'Stock','Quantity','CurrentStock','AvailableStock',
      ]),

      category: p.GroupDescription   || p.StockGroup      || p.ProductGroup     ||
                p.CategoryDescription || p.Group          || p.Category         ||
                p.groupDescription   || p.category        || '',

      sku: p.StockCode   || p.Reference   || p.ItemCode    || p.SKU   ||
           p.Code        || p.ProductCode || p.reference   || p.sku   ||
           p.code        || p.productCode || '',
    }));

    const filtered = products.filter(p => p.name.trim() !== '');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify({
        products: filtered,
        total:    filtered.length,
        entity,
        _fields:  allProducts.length > 0 ? Object.keys(allProducts[0]) : [],
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
