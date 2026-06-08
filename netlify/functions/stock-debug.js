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
  let out = '';

  const candidates = [
    'Inventories', 'InventorySearch', 'ProductItems', 'ProductItemSearch',
    'StockByWarehouses', 'StockByBins',
  ];

  out += '=== ENTITY PROBE ===\n';
  for (const c of candidates) {
    try {
      const r = await fetch(`${BASE}/${c}?$top=2`, { headers });
      out += `\n${c}: HTTP ${r.status}`;
      if (r.ok) {
        const j = await r.json();
        const items = Array.isArray(j.value) ? j.value : (Array.isArray(j) ? j : []);
        out += ` — ${items.length} records`;
        if (items.length > 0) {
          out += `\n  FIELDS: ${Object.keys(items[0]).join(', ')}`;
          out += `\n  RECORD 1: ${JSON.stringify(items[0])}`;
          if (items[1]) out += `\n  RECORD 2: ${JSON.stringify(items[1])}`;
        }
      } else {
        const txt = await r.text().catch(() => '');
        out += `\n  DETAIL: ${txt.slice(0, 200)}`;
      }
    } catch (e) {
      out += `\n${c}: ERROR — ${e.message}`;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: out,
  };
};
