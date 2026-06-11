'use strict';

// ── Helpers ────────────────────────────────────────────────
const gbp = (v, dp = 0) =>
  '£' + Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });

const gbpK = (v) => {
  const n = Number(v || 0);
  if (n >= 1000000) return '£' + (n / 1000000).toFixed(2) + 'm';
  if (n >= 1000)    return '£' + Math.round(n / 1000) + 'k';
  return gbp(n);
};

const pct = (v, dp = 1, forceSign = false) => {
  const n = Number(v || 0);
  return (forceSign && n > 0 ? '+' : '') + n.toFixed(dp) + '%';
};

const yoyBadge = (y) => {
  if (y === null || y === undefined) return '<span class="badge badge-new">NEW</span>';
  const cls = y > 0 ? 'change-up' : y < 0 ? 'change-down' : 'change-flat';
  const arrow = y > 0 ? '▲' : y < 0 ? '▼' : '–';
  return `<span class="${cls}">${arrow} ${Math.abs(y).toFixed(1)}%</span>`;
};

const statusBadge = (s) => {
  if (!s) return '';
  if (s.includes('Active')) return '<span class="status-dot green"></span><span class="badge badge-active">Active</span>';
  if (s.includes('Watch'))  return '<span class="status-dot yellow"></span><span class="badge badge-watch">Watch</span>';
  if (s.includes('At Risk') || s.includes('Risk')) return '<span class="status-dot red"></span><span class="badge badge-risk">At Risk</span>';
  return `<span class="badge badge-inactive">${s}</span>`;
};

const daysBadge = (d) => {
  const n = Number(d);
  if (n >= 90)  return `<span class="days-badge critical">${n}d</span>`;
  if (n >= 60)  return `<span class="days-badge high">${n}d</span>`;
  if (n >= 30)  return `<span class="days-badge medium">${n}d</span>`;
  return `<span class="days-badge low">${n}d</span>`;
};

const segBadge = (seg) => {
  if (!seg) return '';
  if (seg.includes('A')) return '<span class="badge seg-a">A</span>';
  if (seg.includes('B')) return '<span class="badge seg-b">B</span>';
  if (seg.includes('C')) return '<span class="badge seg-c">C</span>';
  return '<span class="badge seg-d">D</span>';
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun'];
const CHART_COLORS = { amber:'#e8b84b', teal:'#2a9d8f', coral:'#e76f51', sky:'#4cc9f0', green:'#52b788', blue:'#4f6ef7', navy:'#1a1a2e' };

// ── EXECUTIVE DASHBOARD ────────────────────────────────────

function renderExecKpis() {
  const k = EXEC_KPIS;
  const revChange = ((k.revenue - k.rev_2025) / k.rev_2025 * 100).toFixed(1);
  const ordChange = ((k.orders - k.orders_2025) / k.orders_2025 * 100).toFixed(1);
  const accChange = ((k.accounts - k.accounts_2025) / k.accounts_2025 * 100).toFixed(1);

  document.getElementById('execKpiRow').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">${gbpK(k.revenue)}</div>
      <div class="kpi-sub">2025: ${gbpK(k.rev_2025)}</div>
      <span class="kpi-delta up">▲ ${revChange}%</span>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-label">Total Orders</div>
      <div class="kpi-value">${k.orders.toLocaleString()}</div>
      <div class="kpi-sub">2025: ${k.orders_2025}</div>
      <span class="kpi-delta up">▲ ${ordChange}%</span>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Active Accounts</div>
      <div class="kpi-value">${k.accounts}</div>
      <div class="kpi-sub">2025: ${k.accounts_2025}</div>
      <span class="kpi-delta up">▲ ${accChange}%</span>
    </div>
    <div class="kpi-card sky">
      <div class="kpi-label">Avg Order Value</div>
      <div class="kpi-value">${gbp(k.avg_order)}</div>
      <div class="kpi-sub">2025: £1,976 (−4%)</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">YoY Growth</div>
      <div class="kpi-value">+${k.yoy_pct}%</div>
      <div class="kpi-sub">Like-for-like Jan–10 Jun</div>
    </div>
  `;
}

function renderMonthlyRevenueChart() {
  const ctx = document.getElementById('monthlyRevenueChart').getContext('2d');
  const grad26 = ctx.createLinearGradient(0, 0, 0, 320);
  grad26.addColorStop(0, 'rgba(232,184,75,0.35)');
  grad26.addColorStop(1, 'rgba(232,184,75,0)');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: '2026',
          data: MONTHLY_REVENUE.y2026.map(v => Math.round(v / 1000)),
          backgroundColor: '#e8b84b',
          borderRadius: 6,
          order: 1,
        },
        {
          label: '2025',
          data: MONTHLY_REVENUE.y2025.map(v => Math.round(v / 1000)),
          backgroundColor: 'rgba(26,26,46,0.25)',
          borderRadius: 6,
          order: 2,
        },
        {
          label: 'YoY %',
          data: MONTHLY_REVENUE.yoy_pct,
          type: 'line',
          borderColor: '#2a9d8f',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointBackgroundColor: '#2a9d8f',
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'y2',
          order: 0,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'YoY %') return `YoY: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}%`;
              return `${ctx.dataset.label}: £${ctx.parsed.y}k`;
            }
          }
        }
      },
      scales: {
        y:  { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => '£' + v + 'k' } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: v => v + '%' } },
        x:  { grid: { display: false } }
      }
    }
  });
}

function renderSegmentChart() {
  const ctx = document.getElementById('segmentChart').getContext('2d');
  const colors = ['#e8b84b', '#2a9d8f', '#4f6ef7', '#9aa3b2'];
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: SEGMENT_DATA.map(s => s.label),
      datasets: [
        { label: '2026', data: SEGMENT_DATA.map(s => Math.round(s.rev2026/1000)), backgroundColor: colors, borderRadius: 6 },
        { label: '2025', data: SEGMENT_DATA.map(s => Math.round(s.rev2025/1000)), backgroundColor: colors.map(c => c + '55'), borderRadius: 6 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: £${c.parsed.y}k` } }
      },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => '£' + v + 'k' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderSegmentTable() {
  const total = SEGMENT_DATA.reduce((s, d) => s + d.rev2026, 0);
  const tbody = document.querySelector('#segmentTable tbody');
  tbody.innerHTML = SEGMENT_DATA.map(d => {
    const avg = d.accounts ? d.rev2026 / d.accounts : 0;
    const share = total ? (d.rev2026 / total * 100) : 0;
    return `
      <tr>
        <td class="fw-700">${d.seg}</td>
        <td class="num">${d.accounts}</td>
        <td class="num fw-700">${gbp(d.rev2026)}</td>
        <td class="num">${gbp(avg)}</td>
        <td class="num">${share.toFixed(1)}%</td>
        <td class="num">${gbp(d.rev2025)}</td>
        <td class="num">${yoyBadge(d.yoy)}</td>
      </tr>
    `;
  }).join('');
}

// ── ALL ACCOUNTS ───────────────────────────────────────────

let _acctFilter = 'all';
let _acctSortCol = 'rank';
let _acctSortDir = 'asc';

function renderAccountKpis() {
  const total = ACCOUNTS_DATA.reduce((s, a) => s + a.revenue_2026, 0);
  const active = ACCOUNTS_DATA.filter(a => a.status.includes('Active')).length;
  const watch  = ACCOUNTS_DATA.filter(a => a.status.includes('Watch')).length;
  const risk   = ACCOUNTS_DATA.filter(a => a.status.includes('Risk')).length;
  const total25 = ACCOUNTS_DATA.reduce((s, a) => s + a.revenue_2025, 0);

  document.getElementById('accountKpiRow').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Accounts</div>
      <div class="kpi-value">${ACCOUNTS_DATA.length}</div>
      <div class="kpi-sub">All tracked accounts</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-label">2026 Revenue</div>
      <div class="kpi-value">${gbpK(total)}</div>
      <div class="kpi-sub">2025: ${gbpK(total25)}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Active</div>
      <div class="kpi-value">${active}</div>
      <div class="kpi-sub">Ordered recently</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">Watch</div>
      <div class="kpi-value">${watch}</div>
      <div class="kpi-sub">Declining or slowing</div>
    </div>
    <div class="kpi-card coral">
      <div class="kpi-label">At Risk</div>
      <div class="kpi-value">${risk}</div>
      <div class="kpi-sub">30+ days inactive</div>
    </div>
  `;
}

function renderAccountsTable() {
  let data = [...ACCOUNTS_DATA];

  // Filter
  if (_acctFilter === 'active') data = data.filter(a => a.status.includes('Active'));
  else if (_acctFilter === 'watch') data = data.filter(a => a.status.includes('Watch'));
  else if (_acctFilter === 'atrisk') data = data.filter(a => a.status.includes('Risk'));

  // Sort
  if (_acctSortCol !== 'rank') {
    data.sort((a, b) => {
      let av = a[_acctSortCol], bv = b[_acctSortCol];
      if (typeof av === 'number') { /* numeric */ }
      else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
      return _acctSortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }

  const tbody = document.querySelector('#accountsTable tbody');
  tbody.innerHTML = data.map((a, i) => {
    const rank = _acctSortCol === 'rank' ? a.rank : i + 1;
    const yoyClass = a.yoy_pct > 0 ? 'change-up' : a.yoy_pct < 0 ? 'change-down' : 'change-flat';
    const yoyArrow = a.yoy_pct > 0 ? '▲' : a.yoy_pct < 0 ? '▼' : '–';
    return `
      <tr>
        <td class="muted">${rank}</td>
        <td class="fw-700">${a.name}</td>
        <td>${segBadge(a.segment)} <span class="seg-label">${a.segment.replace(/^[A-D] - /,'')}</span></td>
        <td class="num">${a.orders}</td>
        <td class="num fw-700">${gbp(a.revenue_2026)}</td>
        <td class="num">${gbp(a.avg_order)}</td>
        <td class="num">${gbp(a.revenue_2025)}</td>
        <td class="num"><span class="${yoyClass}">${yoyArrow} ${Math.abs(a.yoy_pct).toFixed(1)}%</span></td>
        <td class="num">${daysBadge(a.days_since)}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>
    `;
  }).join('');
}

function initAccountFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _acctFilter = btn.dataset.filter;
      renderAccountsTable();
    });
  });
}

function initAccountSort() {
  document.querySelectorAll('#accountsTable th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_acctSortCol === col) { _acctSortDir = _acctSortDir === 'asc' ? 'desc' : 'asc'; }
      else { _acctSortCol = col; _acctSortDir = col === 'name' ? 'asc' : 'desc'; }
      document.querySelectorAll('#accountsTable th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
      th.classList.add(_acctSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderAccountsTable();
    });
  });
}

// ── ACCOUNT PLANS ──────────────────────────────────────────

function renderAccountPlans() {
  const grid = document.getElementById('plansGrid');

  grid.innerHTML = ACCOUNT_PLANS_DATA.map((p, idx) => {
    const statusClass = p.status.includes('Active') ? 'plan-active' :
                        p.status.includes('Watch')  ? 'plan-watch'  : 'plan-risk';
    const statusLabel = p.status.includes('Active') ? '🟢 Active' :
                        p.status.includes('Watch')  ? '🟡 Watch'  : '🔴 At Risk';

    const flagsHtml = (p.flags || []).map(f => {
      const emoji = f.slice(0, 2);
      const text  = f.slice(2).trim();
      return `<div class="plan-flag"><span class="flag-icon">${emoji}</span><span class="flag-text">${text}</span></div>`;
    }).join('');

    const hasMonthly = p.monthly && p.monthly.some(v => v > 0);
    const maxM = hasMonthly ? Math.max(...p.monthly) : 1;

    const miniChart = hasMonthly ? `
      <div class="mini-bars">
        ${p.monthly.map((v, i) => {
          const h = maxM > 0 ? Math.max((v / maxM) * 100, v > 0 ? 8 : 0) : 0;
          return `<div class="mini-bar-col">
            <div class="mini-bar ${statusClass.replace('plan-','bar-')}" style="height:${h}%" title="${MONTHS[i]}: ${v > 0 ? gbp(v) : '—'}"></div>
            <div class="mini-label">${MONTHS[i]}</div>
          </div>`;
        }).join('')}
      </div>
    ` : `<div class="mini-bars-empty">No monthly breakdown available</div>`;

    const yoyStr = p.yoy_pct !== null && p.yoy_pct !== undefined
      ? yoyBadge(p.yoy_pct)
      : '<span class="badge badge-new">NEW</span>';

    return `
      <div class="plan-card ${statusClass}">
        <div class="plan-card-header">
          <div class="plan-rank">#${idx + 1}</div>
          <div class="plan-name-block">
            <div class="plan-name">${p.name}</div>
            <div class="plan-meta">${p.segment} · ${statusLabel}</div>
          </div>
          <div class="plan-rev">${p.rev2026}</div>
        </div>

        <div class="plan-metrics">
          <div class="plan-metric">
            <span class="pm-label">2025 Rev</span>
            <span class="pm-value">${p.rev2025}</span>
          </div>
          <div class="plan-metric">
            <span class="pm-label">YoY</span>
            <span class="pm-value">${yoyStr}</span>
          </div>
          <div class="plan-metric">
            <span class="pm-label">Orders</span>
            <span class="pm-value">${p.orders}</span>
          </div>
          <div class="plan-metric">
            <span class="pm-label">Avg Order</span>
            <span class="pm-value">${p.avg_order}</span>
          </div>
          <div class="plan-metric">
            <span class="pm-label">Days Since Last</span>
            <span class="pm-value">${daysBadge(p.days_since)}</span>
          </div>
          <div class="plan-metric">
            <span class="pm-label">Customer Since</span>
            <span class="pm-value">${p.since}</span>
          </div>
        </div>

        <div class="plan-chart-section">
          <div class="plan-chart-label">Monthly Revenue (Jan – Jun 2026)</div>
          ${miniChart}
        </div>

        <div class="plan-flags">${flagsHtml}</div>
      </div>
    `;
  }).join('');
}

// ── MONTHLY TRENDS ─────────────────────────────────────────

function renderTrendsOverviewChart() {
  const ctx = document.getElementById('trendsOverviewChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: '2026',
          data: MONTHLY_REVENUE.y2026.map(v => Math.round(v / 1000)),
          borderColor: '#e8b84b',
          backgroundColor: 'rgba(232,184,75,0.15)',
          borderWidth: 2.5,
          pointBackgroundColor: '#e8b84b',
          pointRadius: 5,
          tension: 0.35,
          fill: true,
        },
        {
          label: '2025',
          data: MONTHLY_REVENUE.y2025.map(v => Math.round(v / 1000)),
          borderColor: '#2a9d8f',
          backgroundColor: 'rgba(42,157,143,0.1)',
          borderWidth: 2,
          borderDash: [5, 3],
          pointBackgroundColor: '#2a9d8f',
          pointRadius: 4,
          tension: 0.35,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: £${c.parsed.y}k` } }
      },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => '£' + v + 'k' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderTrendsTable() {
  // Find global max for heatmap scale
  const allVals = MONTHLY_TRENDS_DATA.flatMap(r => [r.jan, r.feb, r.mar, r.apr, r.may, r.jun]).filter(v => v > 0);
  const globalMax = Math.max(...allVals);

  const heatCell = (v) => {
    if (!v || v === 0) return '<td class="num heat-zero">—</td>';
    const intensity = Math.min(v / globalMax, 1);
    const alpha = 0.08 + intensity * 0.55;
    return `<td class="num heat-cell" style="background:rgba(232,184,75,${alpha.toFixed(2)})">${gbp(v)}</td>`;
  };

  const tbody = document.querySelector('#trendsTable tbody');
  tbody.innerHTML = MONTHLY_TRENDS_DATA.map((r, i) => {
    const yoyHtml = r.yoy_pct !== null && r.yoy_pct !== undefined
      ? yoyBadge(r.yoy_pct)
      : '<span class="badge badge-new">NEW</span>';
    return `
      <tr>
        <td class="muted">${i + 1}</td>
        <td class="fw-700">${r.name}</td>
        ${heatCell(r.jan)}
        ${heatCell(r.feb)}
        ${heatCell(r.mar)}
        ${heatCell(r.apr)}
        ${heatCell(r.may)}
        ${heatCell(r.jun)}
        <td class="num fw-700">${gbp(r.total_2026)}</td>
        <td class="num">${r.total_2025 > 0 ? gbp(r.total_2025) : '—'}</td>
        <td class="num">${yoyHtml}</td>
      </tr>
    `;
  }).join('');
}

// ── AT RISK ACCOUNTS ───────────────────────────────────────

function renderRiskKpis() {
  const data = AT_RISK_DATA;
  const totalRev = data.reduce((s, r) => s + r.revenue, 0);
  const critical = data.filter(r => r.days >= 90).length;
  const high     = data.filter(r => r.days >= 60 && r.days < 90).length;
  const avgDays  = data.length ? Math.round(data.reduce((s, r) => s + r.days, 0) / data.length) : 0;
  const maxDays  = data.length ? Math.max(...data.map(r => r.days)) : 0;

  document.getElementById('riskKpiRow').innerHTML = `
    <div class="kpi-card coral">
      <div class="kpi-label">At Risk Accounts</div>
      <div class="kpi-value">${data.length}</div>
      <div class="kpi-sub">30+ days inactive, £3k+ spend</div>
    </div>
    <div class="kpi-card coral">
      <div class="kpi-label">Revenue at Stake</div>
      <div class="kpi-value">${gbpK(totalRev)}</div>
      <div class="kpi-sub">Combined 2026 YTD</div>
    </div>
    <div class="kpi-card coral">
      <div class="kpi-label">Critical (90+ days)</div>
      <div class="kpi-value">${critical}</div>
      <div class="kpi-sub">Escalate immediately</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">High (60–89 days)</div>
      <div class="kpi-value">${high}</div>
      <div class="kpi-sub">Senior AM contact this week</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Longest Gap</div>
      <div class="kpi-value">${maxDays}d</div>
      <div class="kpi-sub">Avg: ${avgDays} days inactive</div>
    </div>
  `;
}

function renderRiskTable() {
  const sorted = [...AT_RISK_DATA].sort((a, b) => b.days - a.days);
  const tbody = document.querySelector('#riskTable tbody');
  tbody.innerHTML = sorted.map((r, i) => {
    const urgencyClass = r.days >= 90 ? 'urgency-critical' :
                         r.days >= 60 ? 'urgency-high' :
                         r.days >= 30 ? 'urgency-medium' : '';
    const actionBold = r.action.includes('CRITICAL') || r.action.includes('URGENT');
    return `
      <tr class="${urgencyClass}">
        <td class="muted">${i + 1}</td>
        <td class="fw-700">${r.name}</td>
        <td class="num fw-700">${gbp(r.revenue)}</td>
        <td class="num">${r.orders}</td>
        <td class="num">${daysBadge(r.days)}</td>
        <td>${segBadge(r.segment)} <span class="seg-label">${r.segment.replace(/^[A-D] - /,'')}</span></td>
        <td class="${actionBold ? 'action-urgent' : 'action-normal'}">${r.action}</td>
      </tr>
    `;
  }).join('');
}

// ── TAB NAVIGATION ─────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ── BOOTSTRAP ─────────────────────────────────────────────

function init() {
  document.getElementById('reportDate').textContent =
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Executive
  renderExecKpis();
  renderMonthlyRevenueChart();
  renderSegmentChart();
  renderSegmentTable();

  // All Accounts
  renderAccountKpis();
  renderAccountsTable();
  initAccountFilters();
  initAccountSort();

  // Account Plans
  renderAccountPlans();

  // Monthly Trends
  renderTrendsOverviewChart();
  renderTrendsTable();

  // At Risk
  renderRiskKpis();
  renderRiskTable();

  // Tabs
  initTabs();

  document.getElementById('loadingOverlay').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);
