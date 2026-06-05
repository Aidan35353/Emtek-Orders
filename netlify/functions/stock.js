'use strict';

// Netlify serverless function — secure proxy to Prospect CRM OData API
// PROSPECT_TOKEN env var is NEVER exposed to the browser

exports.handler = async function (event) {
  // Only allow GET
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

  try {
    let allProducts = [];
    // OData endpoint — fetch up to 2,000 products across paginated responses
    let url = 'https://crm-odata-v1.prospect365.com/Products?$top=1000&$orderby=Description';

    for (let page = 0; page < 10 && url; page++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let res;
      try {
        res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept:        'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

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
      // OData wraps results in { value: [...] }; some APIs return a plain array
      const items = Array.isArray(json.value) ? json.value
                  : Array.isArray(json)       ? json
                  : [];
      allProducts = allProducts.concat(items);

      // Follow OData nextLink for pagination
      url = json['@odata.nextLink'] || null;
    }

    // ── Normalise field names ───────────────────────────────────────────────
    // Prospect CRM field names are not always predictable — try every known
    // variant and fall back gracefully so the page always renders something.
    const products = allProducts.map(p => ({
      name: p.Description         || p.Name             || p.ProductName    ||
            p.description         || p.name             || p.productName    || '',

      stock: pick(p, [
        'FreeStock', 'StockLevel', 'QuantityOnHand', 'FreeStockLevel',
        'Stock',     'Quantity',   'freeStock',       'stockLevel',
        'quantityOnHand',
      ]),

      category: p.GroupDescription    || p.CategoryDescription || p.ProductGroup     ||
                p.Group               || p.Category            || p.groupDescription ||
                p.categoryDescription || p.productGroup        || p.group            || '',

      sku: p.Reference   || p.SKU         || p.Code        || p.ProductCode  ||
           p.reference   || p.sku         || p.code        || p.productCode  || '',
    }));

    // Filter out records with no name at all (blank spacers, etc.)
    const filtered = products.filter(p => p.name.trim() !== '');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify({
        products: filtered,
        total:    filtered.length,
        // _fields lets us debug field mapping if stock/category appear empty
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

// Pull first non-null value from a list of candidate field names
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
