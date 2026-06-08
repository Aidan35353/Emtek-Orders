'use strict';

// Temporary debug function — visit /.netlify/functions/stock-debug in browser
// DELETE this file once the stock page is working correctly

const BASE = 'https://crm-odata-v1.prospect365.com';

exports.handler = async function () {
  const token = process.env.PROSPECT_TOKEN;
  if (!token) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ERROR: PROSPECT_TOKEN not set' };
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let out = '=== ALL SELLABLE PRODUCTS (ProductItems, Sellable=true, Obsolete=0) ===\n\n';

  try {
    let allItems = [];
    let url = `${BASE}/ProductItems?$filter=Sellable eq true and Obsolete eq 0&$top=1000`;

    for (let page = 0; page < 10 && url; page++) {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        out += `HTTP ${r.status} — ${await r.text().catch(() => '')}`;
        break;
      }
      const j = await r.json();
      const items = Array.isArray(j.value) ? j.value : (Array.isArray(j) ? j : []);
      allItems = allItems.concat(items);
      url = j['@odata.nextLink'] || null;
    }

    out += `Total products returned: ${allItems.length}\n\n`;
    out += 'SKU | Description | Category | DecimalQuantityAvailable\n';
    out += '----+-------------+----------+-------------------------\n';
    for (const p of allItems) {
      out += `${p.ProductItemId || ''} | ${p.Description || ''} | ${p.CategoryId || ''} | ${p.DecimalQuantityAvailable ?? p.QuantityAvailable ?? 'n/a'}\n`;
    }

  } catch (e) {
    out += `ERROR: ${e.message}`;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: out,
  };
};
