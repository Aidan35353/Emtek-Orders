'use strict';

// Temporary debug — visit /.netlify/functions/analytics-debug
// DELETE once analytics page is confirmed working

const BASE = 'https://crm-odata-v1.prospect365.com';

exports.handler = async function () {
  const token = process.env.PROSPECT_TOKEN;
  if (!token) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ERROR: PROSPECT_TOKEN not set' };
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let out = '=== PROSPECT CRM — ANALYTICS ENTITY PROBE ===\n\n';

  const candidates = [
    'Orders', 'OrderSearch', 'SalesOrders', 'SalesOrderSearch',
    'Invoices', 'InvoiceSearch', 'InvoiceLines',
    'Accounts', 'AccountSearch', 'Companies', 'CompanySearch',
    'Contacts', 'ContactSearch',
    'Opportunities', 'OpportunitySearch',
    'Activities', 'ActivitySearch',
    'OrderLines', 'SalesOrderLines',
    'CustomerOrders', 'CustomerInvoices',
  ];

  for (const c of candidates) {
    try {
      const r = await fetch(`${BASE}/${c}?$top=2`, { headers });
      out += `${c}: HTTP ${r.status}`;
      if (r.ok) {
        const j = await r.json();
        const items = Array.isArray(j.value) ? j.value : (Array.isArray(j) ? j : []);
        out += ` — ${items.length} sample records`;
        if (items.length > 0) {
          out += `\n  FIELDS: ${Object.keys(items[0]).join(', ')}`;
          out += `\n  RECORD 1: ${JSON.stringify(items[0])}`;
        }
      } else {
        const txt = await r.text().catch(() => '');
        out += ` — ${txt.slice(0, 150)}`;
      }
      out += '\n\n';
    } catch (e) {
      out += `${c}: ERROR — ${e.message}\n\n`;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: out,
  };
};
