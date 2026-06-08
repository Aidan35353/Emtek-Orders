'use strict';

// Temporary debug function — visit /.netlify/functions/stock-debug in browser
// DELETE this file once the stock page is working correctly

const BASE = 'https://crm-odata-v1.prospect365.com';

exports.handler = async function (event) {
  const token = process.env.PROSPECT_TOKEN;
  if (!token) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ERROR: PROSPECT_TOKEN not set' };
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let out = '';

  // 1. Fetch OData root
  out += '=== ODATA ROOT ===\n';
  try {
    const r = await fetch(`${BASE}/`, { headers });
    out += `Status: ${r.status}\n`;
    const j = await r.json();
    out += JSON.stringify(j, null, 2) + '\n\n';
  } catch (e) {
    out += 'Error: ' + e.message + '\n\n';
  }

  // 2. Try a few entity names and show first record of each that responds
  const candidates = ['Products','StockItems','CatalogueItems','Items','Inventory','Parts','SalesItems'];
  out += '=== ENTITY PROBE ===\n';
  for (const c of candidates) {
    try {
      const r = await fetch(`${BASE}/${c}?$top=2`, { headers });
      out += `${c}: HTTP ${r.status}`;
      if (r.ok) {
        const j = await r.json();
        const items = j.value || j;
        out += ` — ${Array.isArray(items) ? items.length : '?'} records returned`;
        if (Array.isArray(items) && items.length > 0) {
          out += '\n  FIELDS: ' + Object.keys(items[0]).join(', ');
          out += '\n  RECORD 1: ' + JSON.stringify(items[0]);
          if (items[1]) out += '\n  RECORD 2: ' + JSON.stringify(items[1]);
        }
      }
      out += '\n';
    } catch (e) {
      out += `${c}: Error — ${e.message}\n`;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: out,
  };
};
