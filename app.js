'use strict';

// Global error handler — shows any crash as a visible message instead of blank screen
window.addEventListener('error', function (e) {
  console.error('App error:', e.message, e.filename, e.lineno);
  try {
    document.getElementById('loadingOverlay').classList.add('hidden');
    var ls = document.getElementById('loginScreen');
    ls.classList.remove('hidden');
    var le = document.getElementById('loginError');
    le.textContent = 'App error: ' + e.message;
    le.classList.remove('hidden');
  } catch (_) {}
});

// ===================== SUPABASE =====================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON); // single client: auth + realtime

// ===================== DIRECT REST API =====================
// Bypasses the Supabase JS client entirely — raw fetch with anon key, identical to curl
const API = SUPABASE_URL + '/rest/v1';

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res  = await fetch(API + path, opts);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  let data;
  try { data = JSON.parse(text); } catch (e) { return text; }
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || 'HTTP ' + res.status);
  return data;
}

function withTimeout(promise, ms = 12000) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })
  ]).finally(() => clearTimeout(t));
}

// ===================== CONSTANTS =====================
const PIPELINE_STAGES = ['Sale', 'Order Picked', 'Dispatched', 'Invoice', 'Completed'];

const HERO_CONTENT = {
  'dashboard': {
    left:  { label: 'DASHBOARD',    sub: 'All active orders',              headline: 'Live Overview'    },
    right: { label: 'DISPATCH',     sub: 'Track and manage',               headline: 'Operations View'  },
  },
  'new-order': {
    left:  { label: 'NEW ORDER',    sub: 'Complete all fields below',       headline: 'Order Entry'      },
    right: { label: 'SALES',        sub: 'Submit for operations dispatch',  headline: 'Fast Processing'  },
  },
  'pipeline': {
    left:  { label: 'CM PIPELINE',  sub: 'Construction materials only',     headline: 'Stage Tracker'    },
    right: { label: 'WORKFLOW',     sub: 'Sale through to invoice',         headline: 'Track & Advance'  },
  },
  'sales': {
    left:  { label: 'SALES',        sub: 'Monthly performance',             headline: 'Sales Dashboard'  },
    right: { label: 'ANALYTICS',    sub: 'Progress vs target',              headline: 'Pallet Tracker'   },
  },
  'stock': {
    left:  { label: 'STOCK',        sub: 'Live from Prospect CRM',          headline: 'Stock Levels'     },
    right: { label: 'INVENTORY',    sub: 'Real-time product availability',  headline: 'Live Overview'    },
  },
};
const SAFETY_PRODUCTS = ['Polymer Barrier', 'Steel Barrier', 'Bollard', 'Rack Guard', 'Column Protector'];

// Products shown on the New Order form — the only ones we track on the Stock page
const STOCK_PRODUCTS = [
  // Construction Materials
  // prospectName = exact Description field value in Prospect CRM
  { name: 'IRR 6mm',             category: 'Construction Materials', prospectName: 'Ultracrete IRR Instant Road Repair 25kg Tubs 6mm' },
  { name: 'IRR 10mm',            category: 'Construction Materials', prospectName: 'Ultracrete Instant Road Repair 25kg Tub 10mm' },
  { name: 'M60F',                category: 'Construction Materials' },
  { name: 'Tough Patch Tubs',    category: 'Construction Materials', prospectName: 'Ultracrete ToughPatch Tubs - 25kg Tubs' },
  { name: 'Tough Patch Bags',    category: 'Construction Materials', prospectName: 'Ultracrete ToughPatch Bags - 25kg' },
  { name: 'QC10F',               category: 'Construction Materials' },
  { name: 'M90',                 category: 'Construction Materials' },
  { name: 'FP Smooth Grey',      category: 'Construction Materials', prospectName: 'Ultrascape Flowpoint Rapid Set Grout Smooth' },
  { name: 'FP Grey',             category: 'Construction Materials', prospectName: 'Ultrascape Flowpoint Rapid Set Grout-NATURAL-25kg Bag' },
  { name: 'FP Smooth Limestone', category: 'Construction Materials', prospectName: 'Ultrascape Flowpoint Limestone Smooth' },
  { name: 'FP Smooth Charcoal',  category: 'Construction Materials', prospectName: 'Ultrascape Flowpoint Charcoal Smooth Rapid Set G - 25kg Bags' },
  { name: 'FP Limestone',        category: 'Construction Materials' },
  { name: 'FP Charcoal',         category: 'Construction Materials', prospectName: 'Ultrascape Flowpoint Rapid Set Grout-CHARCOAL-25kg bag' },
  { name: 'FP Premium',          category: 'Construction Materials' },
  { name: 'ProPrime',            category: 'Construction Materials', prospectName: 'Ultrascape Pro-Prime Slurry Primer - 20Kg' },
  { name: 'Slipbond',            category: 'Construction Materials', prospectName: 'Ultrascape Vertical Stone and Brick Slip Adhesive 20kg Bag' },
  { name: 'Cempoint',            category: 'Construction Materials' },
  { name: 'Instaband Eco',       category: 'Construction Materials' },
  { name: 'Instaline White',     category: 'Construction Materials' },
  { name: 'Instaline Yellow',    category: 'Construction Materials' },
  { name: 'SCJ',                 category: 'Construction Materials' },
  // Safety Barriers
  { name: 'Polymer Barrier',     category: 'Safety Barriers' },
  { name: 'Steel Barrier',       category: 'Safety Barriers' },
  { name: 'Bollard',             category: 'Safety Barriers' },
  { name: 'Rack Guard',          category: 'Safety Barriers' },
  { name: 'Column Protector',    category: 'Safety Barriers' },
];
const STAGE_NOTIFY = {
  'Sale':         { role: 'operations', msg: o => `New order ${o.id} from ${o.customer_name} — ready to pick` },
  'Order Picked': { role: 'operations', msg: o => `${o.id} picked — ready to dispatch` },
  'Dispatched':   { role: 'accounts',   msg: o => `${o.id} dispatched to ${o.customer_name} — ready to invoice` },
  'Invoice':      { role: 'accounts',   msg: o => `${o.id} ready to invoice — action required` },
  'Completed':    { role: 'sales',      msg: o => `${o.id} invoice complete — order closed` },
};

// ===================== STATE =====================
let orders          = [];
let notifList       = [];
let currentUser     = null;
let authUser        = null;
let activeModal     = null;
let realtimeChannel = null;

// ===================== LOADING =====================
const loadingOverlay = document.getElementById('loadingOverlay');
function showLoading(msg = 'Loading...') {
  loadingOverlay.querySelector('.loading-text').textContent = msg;
  loadingOverlay.classList.remove('hidden');
}
function hideLoading() { loadingOverlay.classList.add('hidden'); }

// ===================== AUTH =====================
const loginScreen = document.getElementById('loginScreen');
const loginForm   = document.getElementById('loginForm');
const loginError  = document.getElementById('loginError');

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  loginError.classList.add('hidden');
  loginForm.reset();
  Object.values(views).forEach(v => v.classList.add('hidden'));
}
function hideLoginScreen() { loginScreen.classList.add('hidden'); }

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = loginForm.querySelector('button[type="submit"]');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  loginError.classList.add('hidden');
  const { error } = await db.auth.signInWithPassword({ email, password });
  btn.textContent = 'SIGN IN';
  btn.disabled = false;
  if (error) {
    loginError.textContent = 'Incorrect email or password — try again';
    loginError.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => db.auth.signOut());

// ===================== PROFILE =====================
const profileSetup = document.getElementById('profileSetup');
const profileForm  = document.getElementById('profileForm');

async function loadProfile(user) {
  const meta = user.user_metadata;
  if (meta && meta.full_name && meta.role) {
    currentUser = { id: user.id, email: user.email, full_name: meta.full_name, role: meta.role };
    document.getElementById('navUserName').textContent =
      `${meta.full_name} · ${meta.role.charAt(0).toUpperCase() + meta.role.slice(1)}`;
    return true;
  }
  const stored = localStorage.getItem('emtek_profile_' + user.id);
  if (stored) {
    const { full_name, role } = JSON.parse(stored);
    currentUser = { id: user.id, email: user.email, full_name, role };
    document.getElementById('navUserName').textContent =
      `${full_name} · ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    return true;
  }
  return false;
}

profileForm.addEventListener('submit', async e => {
  e.preventDefault();
  const full_name = document.getElementById('profileName').value.trim();
  const role      = document.getElementById('profileRole').value;
  const btn       = profileForm.querySelector('button[type="submit"]');
  btn.textContent = 'Saving...';
  btn.disabled    = true;
  localStorage.setItem('emtek_profile_' + authUser.id, JSON.stringify({ full_name, role }));
  btn.textContent = 'SAVE & CONTINUE';
  btn.disabled    = false;
  db.auth.updateUser({ data: { full_name, role } }).catch(() => {});
  profileSetup.classList.add('hidden');
  await loadProfile(authUser);
  showView('dashboard');
  loadAllData();
  subscribeRealtime();
});

// ===================== NOTIFICATIONS =====================
async function fetchNotifications() {
  if (!currentUser) return;
  try {
    const data = await withTimeout(
      api('GET', `/notifications?target_role=eq.${currentUser.role}&order=created_at.desc&limit=20`)
    );
    notifList = Array.isArray(data) ? data : [];
    renderNotifBell();
  } catch (err) {
    console.warn('Notifications unavailable:', err.message);
  }
}

async function createNotification(order, stage) {
  const rule = STAGE_NOTIFY[stage];
  if (!rule) return;
  try {
    await api('POST', '/notifications', {
      target_role: rule.role,
      message:     rule.msg(order),
      order_id:    order.id,
    });
  } catch (err) { console.warn('Notification failed:', err.message); }
}

function renderNotifBell() {
  if (!currentUser) return;
  const unread  = notifList.filter(n => !n.read_by.includes(currentUser.id));
  const countEl = document.getElementById('notifCount');
  countEl.textContent = unread.length;
  countEl.classList.toggle('hidden', unread.length === 0);
  renderNotifDropdown();
}

function renderNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (!notifList.length) {
    dropdown.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  dropdown.innerHTML = notifList.map(n => {
    const unread = !n.read_by.includes(currentUser.id);
    const time   = new Date(n.created_at).toLocaleDateString('en-IE',
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="notif-item ${unread ? 'unread' : ''}" data-id="${n.id}" data-order="${n.order_id || ''}">
      <div class="notif-msg">${n.message}</div>
      <div class="notif-time">${time}</div>
    </div>`;
  }).join('');
  dropdown.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notifId = Number(item.dataset.id);
      const orderId = item.dataset.order;
      const notif   = notifList.find(n => n.id === notifId);
      if (notif && !notif.read_by.includes(currentUser.id)) {
        const newReadBy = [...notif.read_by, currentUser.id];
        api('PATCH', `/notifications?id=eq.${notifId}`, { read_by: newReadBy }).catch(() => {});
        notif.read_by = newReadBy;
        renderNotifBell();
      }
      document.getElementById('notifDropdown').classList.add('hidden');
      if (orderId) openModal(orderId);
    });
  });
}

const notifBell     = document.getElementById('notifBell');
const notifDropdown = document.getElementById('notifDropdown');
notifBell.addEventListener('click', e => { e.stopPropagation(); notifDropdown.classList.toggle('hidden'); });
document.addEventListener('click', () => notifDropdown.classList.add('hidden'));

// ===================== VIEWS =====================
const views   = {
  dashboard:   document.getElementById('view-dashboard'),
  'new-order': document.getElementById('view-new-order'),
  pipeline:    document.getElementById('view-pipeline'),
  sales:       document.getElementById('view-sales'),
  stock:       document.getElementById('view-stock'),
};
const navBtns = document.querySelectorAll('.nav-btn[data-view]');

function updateHero(name) {
  const c = HERO_CONTENT[name] || HERO_CONTENT['dashboard'];
  document.getElementById('heroLeftLabel').textContent    = c.left.label;
  document.getElementById('heroLeftSub').textContent      = c.left.sub;
  document.getElementById('heroLeftHeadline').textContent = c.left.headline;
  document.getElementById('heroRightLabel').textContent   = c.right.label;
  document.getElementById('heroRightSub').textContent     = c.right.sub;
  document.getElementById('heroRightHeadline').textContent = c.right.headline;
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  if (views[name]) views[name].classList.remove('hidden');
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  updateHero(name);
  if (name === 'dashboard') renderDashboard();
  if (name === 'pipeline')  renderPipeline();
  if (name === 'sales')     renderSalesDashboard();
  if (name === 'stock')     fetchStock();
}
navBtns.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
document.getElementById('heroPanelLeft').addEventListener('click',  () => showView('new-order'));
document.getElementById('heroPanelRight').addEventListener('click', () => showView('dashboard'));

// ===================== FETCH DATA =====================
async function fetchOrders() {
  try {
    const data = await withTimeout(api('GET', '/orders?order=created_at.desc'));
    orders = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('fetchOrders failed:', err.message);
    orders = orders.length ? orders : [];
  }
  renderDashboard();
  renderPipeline();
  renderSalesDashboard();
  updatePendingBadge();
}

async function loadAllData() {
  fetchOrders();
  fetchNotifications();
}

// ===================== REALTIME =====================
function subscribeRealtime() {
  if (realtimeChannel) { db.removeChannel(realtimeChannel); realtimeChannel = null; }
  realtimeChannel = db.channel('app-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrders(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
      if (currentUser && payload.new.target_role === currentUser.role) {
        notifList.unshift(payload.new);
        if (notifList.length > 20) notifList.pop();
        renderNotifBell();
        showToast(payload.new.message, 'success');
      }
    })
    .subscribe();
}

// ===================== ORDER FORM =====================
let itemIndex = 1;
const ITEM_OPTIONS_HTML = `
  <option value="">Select category...</option>
  <optgroup label="Construction Materials">
    <option value="IRR 6mm">IRR 6mm</option>
    <option value="IRR 10mm">IRR 10mm</option>
    <option value="M60F">M60F</option>
    <option value="Tough Patch">Tough Patch</option>
    <option value="QC10F">QC10F</option>
    <option value="M90">M90</option>
    <option value="FP Smooth Grey">FP Smooth Grey</option>
    <option value="FP Grey">FP Grey</option>
    <option value="FP Smooth Limestone">FP Smooth Limestone</option>
    <option value="FP Smooth Charcoal">FP Smooth Charcoal</option>
    <option value="FP Limestone">FP Limestone</option>
    <option value="FP Charcoal">FP Charcoal</option>
    <option value="FP Premium">FP Premium</option>
    <option value="ProPrime">ProPrime</option>
    <option value="Slipbond">Slipbond</option>
    <option value="Cempoint">Cempoint</option>
    <option value="Instaband Eco">Instaband Eco</option>
    <option value="Instaline White">Instaline White</option>
    <option value="Instaline Yellow">Instaline Yellow</option>
    <option value="SCJ">SCJ</option>
  </optgroup>
  <optgroup label="Safety Barriers">
    <option value="Polymer Barrier">Polymer Barrier</option>
    <option value="Steel Barrier">Steel Barrier</option>
    <option value="Bollard">Bollard</option>
    <option value="Rack Guard">Rack Guard</option>
    <option value="Column Protector">Column Protector</option>
  </optgroup>`;

document.getElementById('addItemBtn').addEventListener('click', () => {
  const container = document.getElementById('orderItems');
  const row       = document.createElement('div');
  row.className   = 'order-item-row';
  row.dataset.index = itemIndex++;
  row.innerHTML = `
    <div class="item-fields">
      <div class="form-group"><label>Category *</label>
        <select class="item-category" required>${ITEM_OPTIONS_HTML}</select></div>
      <div class="form-group"><label>Product / SKU *</label>
        <input type="text" class="item-product" placeholder="e.g. Sikaflex-291" required /></div>
      <div class="form-group item-qty"><label>Qty *</label>
        <input type="number" class="item-quantity" placeholder="1" min="1" required /></div>
      <div class="form-group item-unit"><label>Unit</label>
        <select class="item-unit-select">
          <option value="Tubs">Tubs</option>
          <option value="Bags">Bags</option>
          <option value="Unit">Unit</option>
        </select></div>
    </div>
    <button type="button" class="remove-item-btn" title="Remove item">✕</button>`;
  container.appendChild(row);
  row.querySelector('.remove-item-btn').addEventListener('click', () => { row.remove(); updateRemoveButtons(); });
  updateRemoveButtons();
});

function updateRemoveButtons() {
  const rows = document.querySelectorAll('.order-item-row');
  rows.forEach(r => r.querySelector('.remove-item-btn').classList.toggle('hidden', rows.length === 1));
}
document.querySelector('.order-item-row .remove-item-btn').addEventListener('click', function () {
  this.closest('.order-item-row').remove();
  updateRemoveButtons();
});

document.getElementById('orderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const items = [];
  document.querySelectorAll('.order-item-row').forEach(row => {
    const cat  = row.querySelector('.item-category').value;
    const prod = row.querySelector('.item-product').value.trim();
    const qty  = row.querySelector('.item-quantity').value;
    const unit = row.querySelector('.item-unit-select').value;
    if (cat && prod && qty) items.push({ category: cat, product: prod, quantity: Number(qty), unit });
  });
  if (!items.length) { showToast('Add at least one item', 'error'); return; }

  showLoading('Submitting order...');

  // Get next order ID
  let orderId;
  try {
    orderId = await withTimeout(api('POST', '/rpc/next_order_id'));
    if (!orderId) throw new Error('No ID returned');
  } catch (err) {
    hideLoading();
    console.error('next_order_id failed:', err);
    showToast('Failed to generate order ID', 'error');
    return;
  }

  const order = {
    id:               orderId,
    customer_name:    document.getElementById('customerName').value.trim(),
    contact_number:   document.getElementById('contactNumber').value.trim(),
    delivery_address: document.getElementById('deliveryAddress').value.trim(),
    items,
    required_date:    document.getElementById('requiredDate').value || null,
    priority:         document.getElementById('priority').value,
    notes:            document.getElementById('orderNotes').value.trim(),
    sales_rep:        document.getElementById('salesRep').value.trim(),
    status:           'Pending',
    pipeline_stage:   'Sale',
  };

  try {
    await withTimeout(api('POST', '/orders', order));
  } catch (err) {
    hideLoading();
    console.error('order insert failed:', err);
    showToast('Failed to submit order: ' + err.message, 'error');
    return;
  }

  // Notify operations (non-blocking)
  if (items.some(i => !SAFETY_PRODUCTS.includes(i.category))) {
    createNotification(order, 'Sale');
  }

  hideLoading();
  showToast(`Order ${orderId} submitted ✓`, 'success');
  e.target.reset();
  document.querySelectorAll('.order-item-row').forEach((r, i) => { if (i > 0) r.remove(); });
  updateRemoveButtons();
  setTimeout(() => showView('dashboard'), 800);
});

// ===================== DASHBOARD =====================
function getFilteredOrders() {
  const search   = document.getElementById('searchInput').value.toLowerCase();
  const priority = document.getElementById('filterPriority').value;
  const category = document.getElementById('filterCategory').value;
  return orders.filter(o => {
    const text = [o.id, o.customer_name, o.delivery_address, o.sales_rep,
      ...o.items.map(i => i.product + ' ' + i.category)].join(' ').toLowerCase();
    const matchSearch   = !search   || text.includes(search);
    const matchPriority = !priority || o.priority === priority;
    const matchCategory = !category || o.items.some(i => {
      const isCM = !SAFETY_PRODUCTS.includes(i.category);
      return category === 'Construction Materials' ? isCM : !isCM;
    });
    return matchSearch && matchPriority && matchCategory;
  });
}

// For CM orders the dashboard status is always derived from pipeline_stage
// so it stays in sync even if the stored status field is stale
function effectiveStatus(order) {
  if (isCMOrder(order)) {
    return STAGE_TO_STATUS[order.pipeline_stage || 'Sale'] || order.status;
  }
  return order.status;
}

function renderDashboard() {
  const filtered = getFilteredOrders();
  const byStatus = { Pending: [], Ready: [], Dispatched: [] };
  filtered.forEach(o => {
    const s = effectiveStatus(o);
    if (byStatus[s]) byStatus[s].push(o);
  });

  document.getElementById('statTotal').textContent      = filtered.length;
  document.getElementById('statPending').textContent    = byStatus.Pending.length;
  document.getElementById('statReady').textContent      = byStatus.Ready.length;
  document.getElementById('statDispatched').textContent = byStatus.Dispatched.length;
  document.getElementById('countPending').textContent   = byStatus.Pending.length;
  document.getElementById('countReady').textContent     = byStatus.Ready.length;
  document.getElementById('countDispatched').textContent = byStatus.Dispatched.length;
  updatePendingBadge();

  ['Pending', 'Ready', 'Dispatched'].forEach(status => {
    const col = document.getElementById('col-' + status.toLowerCase());
    col.innerHTML = '';
    if (!byStatus[status].length) {
      col.innerHTML = `<div class="empty-col">No ${status.toLowerCase()} orders</div>`;
      return;
    }
    byStatus[status].forEach(order => col.appendChild(buildCard(order)));
  });
}

function updatePendingBadge() {
  document.getElementById('pendingBadge').textContent =
    orders.filter(o => effectiveStatus(o) === 'Pending').length + ' Pending';
}

function buildCard(order) {
  const card  = document.createElement('div');
  card.className = 'order-card';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = order.required_date ? new Date(order.required_date + 'T00:00:00') : null;
  const overdue = due && due < today && order.status !== 'Dispatched';
  if (overdue) card.classList.add('overdue-flag');
  const dateStr   = due ? due.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const itemChips = order.items.slice(0, 3).map(i => `<span>${i.quantity} ${i.unit} ${i.product}</span>`).join('');
  const more      = order.items.length > 3 ? `<span>+${order.items.length - 3} more</span>` : '';
  card.innerHTML = `
    <div class="card-top">
      <span class="card-order-id">${order.id}</span>
      <span class="priority-badge priority-${order.priority}">${order.priority}</span>
    </div>
    <div class="card-customer">${order.customer_name}</div>
    <div class="card-address">${order.delivery_address}</div>
    <div class="card-items-summary">${itemChips}${more}</div>
    <div class="card-footer">
      <span class="card-date">${overdue ? 'OVERDUE · ' : ''}${dateStr}</span>
      <span class="card-rep">${order.sales_rep}</span>
    </div>`;
  card.addEventListener('click', () => openModal(order.id));
  return card;
}

['searchInput', 'filterPriority', 'filterCategory'].forEach(id =>
  document.getElementById(id).addEventListener('input', renderDashboard)
);

// ===================== PIPELINE =====================
function isCMOrder(order) {
  return order.items.some(i => !SAFETY_PRODUCTS.includes(i.category));
}

function renderPipeline() {
  const cmOrders = orders.filter(isCMOrder);
  // Display stages — 'Completed' folds into the Invoice column, no separate column needed
  ['Sale', 'Order Picked', 'Dispatched', 'Invoice'].forEach(stage => {
    const id      = stage.toLowerCase().replace(/ /g, '-');
    const col     = document.getElementById('pipe-' + id);
    const countEl = document.getElementById('pipe-count-' + id);
    // Invoice column shows both Invoice (pending) and Completed orders
    const stageOrders = stage === 'Invoice'
      ? cmOrders.filter(o => ['Invoice', 'Completed'].includes(o.pipeline_stage || 'Sale'))
      : cmOrders.filter(o => (o.pipeline_stage || 'Sale') === stage);
    // Count only shows pending invoices (not yet completed)
    if (countEl) countEl.textContent = stage === 'Invoice'
      ? cmOrders.filter(o => (o.pipeline_stage || 'Sale') === 'Invoice').length
      : stageOrders.length;
    if (!col) return;
    col.innerHTML = '';
    if (!stageOrders.length) { col.innerHTML = '<div class="empty-col">No orders</div>'; return; }
    stageOrders.forEach(order => col.appendChild(buildPipelineCard(order, order.pipeline_stage || 'Sale')));
  });
}

function buildPipelineCard(order, stage) {
  const card     = document.createElement('div');
  card.className = 'order-card' + (stage === 'Completed' ? ' card-completed' : '');
  const due      = order.required_date ? new Date(order.required_date + 'T00:00:00') : null;
  const dateStr  = due ? due.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '—';
  const chips    = order.items.slice(0, 2).map(i => `<span>${i.quantity} ${i.unit} ${i.category}</span>`).join('');

  // Determine the action button / badge
  let actionHTML;
  if (stage === 'Completed') {
    actionHTML = '<div class="stage-complete invoice-done">Invoice Complete</div>';
  } else if (stage === 'Invoice') {
    actionHTML = `<button class="btn-advance btn-complete-invoice" data-id="${order.id}">Mark Invoice Complete</button>`;
  } else {
    const stageIdx  = PIPELINE_STAGES.indexOf(stage);
    const nextStage = PIPELINE_STAGES[stageIdx + 1];
    actionHTML = `<button class="btn-advance" data-id="${order.id}" data-next="${nextStage}">→ Mark as ${nextStage}</button>`;
  }

  card.innerHTML = `
    <div class="card-top">
      <span class="card-order-id">${order.id}</span>
      <span class="priority-badge priority-${order.priority}">${order.priority}</span>
    </div>
    <div class="card-customer">${order.customer_name}</div>
    <div class="card-items-summary">${chips}</div>
    <div class="card-footer">
      <span class="card-date">${dateStr}</span>
      <span class="card-rep">${order.sales_rep}</span>
    </div>
    ${actionHTML}`;

  card.querySelector('.btn-advance')?.addEventListener('click', e => {
    e.stopPropagation();
    const next = e.currentTarget.dataset.next || 'Completed';
    advancePipelineStage(order.id, next);
  });
  card.querySelector('.btn-complete-invoice')?.addEventListener('click', e => {
    e.stopPropagation();
    advancePipelineStage(order.id, 'Completed');
  });
  card.addEventListener('click', () => openModal(order.id));
  return card;
}

// Maps CM pipeline stage → dashboard status automatically
const STAGE_TO_STATUS = {
  'Sale':         'Pending',
  'Order Picked': 'Ready',
  'Dispatched':   'Dispatched',
  'Invoice':      'Dispatched',
  'Completed':    'Dispatched',
};

async function advancePipelineStage(orderId, nextStage) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  const newStatus = STAGE_TO_STATUS[nextStage] || order.status;
  try {
    await api('PATCH', '/orders?id=eq.' + orderId, {
      pipeline_stage: nextStage,
      status:         newStatus,
    });
    order.pipeline_stage = nextStage;
    order.status         = newStatus;
    renderPipeline();
    renderDashboard();
    updatePendingBadge();
    createNotification(order, nextStage);
    showToast(orderId + ' → ' + nextStage, 'success');
  } catch (err) {
    showToast('Failed to update stage', 'error');
    console.error(err);
  }
}

// ===================== PALLET CHART =====================
let palletChartInstance = null;
let palletTarget = parseInt(localStorage.getItem('emtek_pallet_target') || '250', 10);

// Sync the input field with the stored target (runs after DOM ready)
(function initTargetInput() {
  const inp = document.getElementById('palletTargetInput');
  if (inp) inp.value = palletTarget;
})();

document.getElementById('setTargetBtn').addEventListener('click', () => {
  const inp = document.getElementById('palletTargetInput');
  const val = parseInt(inp.value, 10);
  if (!val || val < 1) { showToast('Enter a valid target', 'error'); return; }
  palletTarget = val;
  localStorage.setItem('emtek_pallet_target', val);
  renderPalletChart();
  showToast('Target updated to ' + val + ' pallets', 'success');
});

// Also trigger on Enter key in the input
document.getElementById('palletTargetInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('setTargetBtn').click();
});

// ── Month navigation (always the 1st of the viewed month) ──
let chartMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

document.getElementById('chartPrevBtn').addEventListener('click', () => {
  chartMonthDate = new Date(chartMonthDate.getFullYear(), chartMonthDate.getMonth() - 1, 1);
  renderPalletChart();
});
document.getElementById('chartNextBtn').addEventListener('click', () => {
  const n = new Date();
  if (chartMonthDate.getFullYear() === n.getFullYear() && chartMonthDate.getMonth() === n.getMonth()) return;
  chartMonthDate = new Date(chartMonthDate.getFullYear(), chartMonthDate.getMonth() + 1, 1);
  renderPalletChart();
});

function calcOrderPallets(order) {
  let bags = 0, tubs = 0;
  (order.items || []).forEach(item => {
    const qty = Number(item.quantity) || 0;
    if      (item.unit === 'Bags') bags += qty;
    else if (item.unit === 'Tubs') tubs += qty;
  });
  return bags / 56 + tubs / 52;
}

function getWorkingDaysInMonth(year, month) {
  // Returns array of YYYY-MM-DD strings for Mon–Fri in the given month
  const days        = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
    }
  }
  return days;
}

function localDateStr(dateInput) {
  // Returns YYYY-MM-DD in local time (not UTC) to avoid overnight off-by-one
  const d = new Date(dateInput);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function renderPalletChart() {
  const now          = new Date();
  const year         = chartMonthDate.getFullYear();
  const month        = chartMonthDate.getMonth();
  const isCurrentMon = year === now.getFullYear() && month === now.getMonth();

  // Past months show the full month; current month stops at today
  const viewEndStr = isCurrentMon
    ? localDateStr(now)
    : localDateStr(new Date(year, month + 1, 0));

  // Enable / disable the next arrow
  const nextBtn = document.getElementById('chartNextBtn');
  if (nextBtn) nextBtn.disabled = isCurrentMon;

  // Month name for title
  const monthName = chartMonthDate.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' });
  const titleEl   = document.getElementById('chartTitle');
  if (titleEl) titleEl.textContent = monthName + ' Pallets — Progress vs Target';

  // Sync target sub-label
  const pctSub = document.getElementById('kpi-pct-sub');
  if (pctSub) pctSub.textContent = 'target: ' + palletTarget;

  // Dispatched CM orders for this calendar month
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0, 23, 59, 59);
  const dispatched = orders.filter(o =>
    isCMOrder(o) &&
    ['Dispatched', 'Invoice', 'Completed'].includes(o.pipeline_stage || 'Sale') &&
    new Date(o.created_at) >= monthStart &&
    new Date(o.created_at) <= monthEnd
  );

  // Aggregate pallets by local date
  const dailyPallets = {};
  dispatched.forEach(o => {
    const key = localDateStr(o.created_at);
    dailyPallets[key] = (dailyPallets[key] || 0) + calcOrderPallets(o);
  });

  // Working day scaffolding
  const allWorkingDays  = getWorkingDaysInMonth(year, month);
  const doneWorkingDays = allWorkingDays.filter(d => d <= viewEndStr);
  const totalWD         = allWorkingDays.length;
  const doneWD          = doneWorkingDays.length;
  const remainingWD     = isCurrentMon ? totalWD - doneWD : 0;

  // Cumulative actual (null for future days so the line stops cleanly)
  let cumulative = 0;
  const actualData = allWorkingDays.map(day => {
    if (day <= viewEndStr) {
      cumulative += dailyPallets[day] || 0;
      return parseFloat(cumulative.toFixed(2));
    }
    return null;
  });
  const mtd = cumulative;

  // Straight target ramp across all working days
  const targetData = allWorkingDays.map((_, i) =>
    parseFloat((palletTarget / totalWD * (i + 1)).toFixed(2))
  );

  // KPI calculations
  const pct       = palletTarget > 0 ? mtd / palletTarget * 100 : 0;
  const pace      = doneWD > 0 ? mtd / doneWD : 0;
  const surplus   = mtd - palletTarget;
  const reqPerDay = remainingWD > 0 && surplus < 0 ? (-surplus) / remainingWD : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-mtd',     fmt(mtd));
  set('kpi-mtd-sub', isCurrentMon ? 'pallets · ' + doneWD + ' days' : 'pallets · full month');
  set('kpi-pct',     fmt(pct) + '%');
  set('kpi-pace',    fmt(pace));

  const pctEl = document.getElementById('kpi-pct');
  if (pctEl) pctEl.style.color = pct >= 100 ? 'var(--green)' : pct >= 75 ? '#E0A800' : 'var(--red)';

  // 3rd KPI: Required/Day for live month, Surplus/Shortfall for completed months
  const reqLabelEl = document.getElementById('kpi-req')
    ?.closest('.kpi-card')?.querySelector('.kpi-label');
  const reqEl = document.getElementById('kpi-req');

  if (!isCurrentMon) {
    // Completed month — show final result vs target
    if (reqLabelEl) reqLabelEl.textContent = surplus >= 0 ? 'Surplus' : 'Shortfall';
    if (surplus >= 0) {
      set('kpi-req',     '+' + fmt(surplus));
      set('kpi-req-sub', 'above target');
      if (reqEl) reqEl.style.color = 'var(--green)';
    } else {
      set('kpi-req',     fmt(Math.abs(surplus)));
      set('kpi-req-sub', 'below target');
      if (reqEl) reqEl.style.color = 'var(--red)';
    }
  } else {
    // Current month — show what pace is needed
    if (reqLabelEl) reqLabelEl.textContent = 'Required / Day';
    if (surplus >= 0) {
      set('kpi-req',     '0');
      set('kpi-req-sub', 'target met · +' + fmt(surplus) + ' surplus');
      if (reqEl) reqEl.style.color = 'var(--green)';
    } else {
      set('kpi-req',     fmt(reqPerDay));
      set('kpi-req-sub', remainingWD + ' days remaining');
      if (reqEl) reqEl.style.color = reqPerDay > pace * 1.35 ? 'var(--red)' : 'var(--dark)';
    }
  }

  // Footer note
  const footerEl = document.getElementById('chartFooter');
  if (footerEl) {
    if (isCurrentMon) {
      const projected = doneWD > 0 ? pace * totalWD : 0;
      const projPct   = palletTarget > 0 ? (projected / palletTarget * 100).toFixed(0) : 0;
      footerEl.textContent =
        'Working days: ' + totalWD + ' in ' + monthName +
        ' · ' + doneWD + ' done, ' + remainingWD + ' remaining' +
        ' · At current pace ' + fmt(pace) + '/day → projected ' +
        fmt(projected) + ' pallets (' + projPct + '% of target)';
    } else {
      footerEl.textContent =
        monthName + ' final: ' + fmt(mtd) + ' pallets dispatched' +
        ' · Target was ' + palletTarget +
        ' · ' + (surplus >= 0
          ? '+' + fmt(surplus) + ' above target'
          : fmt(Math.abs(surplus)) + ' below target') +
        ' (' + fmt(pct) + '%)' +
        ' · ' + totalWD + ' working days';
    }
  }

  // ── Chart.js ──
  const canvas = document.getElementById('palletChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (palletChartInstance) { palletChartInstance.destroy(); palletChartInstance = null; }

  const ctx      = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 320);
  gradient.addColorStop(0, 'rgba(0,131,201,0.28)');
  gradient.addColorStop(1, 'rgba(0,131,201,0.02)');

  const labels = allWorkingDays.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  });

  // Find index of last non-null point so we can highlight it
  const lastActualIdx = actualData.reduce((acc, v, i) => v !== null ? i : acc, -1);

  palletChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Target (' + palletTarget + ')',
          data: targetData,
          borderColor:  '#FFC000',
          borderWidth:  2,
          borderDash:   [8, 5],
          pointRadius:  0,
          fill:         false,
          tension:      0,
          order:        2,
        },
        {
          label: isCurrentMon ? 'Actual cumulative' : 'Final cumulative',
          data: actualData,
          borderColor:      '#0083C9',
          borderWidth:      2.5,
          backgroundColor:  gradient,
          fill:             true,
          tension:          0.25,
          spanGaps:         false,
          pointRadius:      (ctx2) => ctx2.dataIndex === lastActualIdx ? 6 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0083C9',
          pointBorderColor:     '#fff',
          pointBorderWidth:     2,
          order:            1,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align:    'start',
          labels: {
            usePointStyle: true,
            pointStyle:    'line',
            boxWidth:      32,
            font: { family: "'Segoe UI', Arial, sans-serif", size: 12, weight: '600' },
            color:         '#6B7280',
            padding:       20,
          },
        },
        tooltip: {
          backgroundColor: '#1A1A1A',
          titleFont: { size: 12, weight: '700', family: "'Segoe UI', Arial, sans-serif" },
          bodyFont:  { size: 12, family: "'Segoe UI', Arial, sans-serif" },
          padding:    12,
          cornerRadius: 6,
          callbacks: {
            label: ctx2 => {
              const v = ctx2.parsed.y;
              if (v === null || v === undefined) return null;
              return '  ' + ctx2.dataset.label + ': ' + parseFloat(v).toFixed(1);
            },
          },
        },
      },
      scales: {
        x: {
          grid:   { color: 'rgba(0,0,0,0.04)', drawTicks: false },
          border: { display: false },
          ticks: {
            color:        '#6B7280',
            font:         { size: 11, family: "'Segoe UI', Arial, sans-serif" },
            maxRotation:  0,
            autoSkip:     true,
            maxTicksLimit: 12,
            padding:       6,
          },
        },
        y: {
          grid:   { color: 'rgba(0,0,0,0.05)', drawTicks: false },
          border: { display: false },
          beginAtZero: true,
          ticks: {
            color: '#6B7280',
            font:  { size: 11, family: "'Segoe UI', Arial, sans-serif" },
            padding: 8,
          },
          title: {
            display: true,
            text:    'Cumulative pallets',
            font:    { size: 11, weight: '600', family: "'Segoe UI', Arial, sans-serif" },
            color:   '#9CA3AF',
          },
        },
      },
    },
  });
}

// ===================== SALES DASHBOARD =====================
let salesDateFilter = 'month'; // 'week' | 'month' | 'all'

function getSalesFilteredOrders() {
  const cmOrders = orders.filter(isCMOrder);
  if (salesDateFilter === 'all') return cmOrders;
  const now   = new Date();
  if (salesDateFilter === 'week') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const day = now.getDay();
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); // back to Monday
    return cmOrders.filter(o => new Date(o.created_at) >= start);
  }
  if (salesDateFilter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return cmOrders.filter(o => new Date(o.created_at) >= start);
  }
  return cmOrders;
}

function fmt(n) { return n % 1 === 0 ? n.toString() : n.toFixed(1); }

function renderSalesDashboard() {
  const filtered = getSalesFilteredOrders();

  // Dispatched = Dispatched + Invoice + Completed stages
  const dispatched = filtered.filter(o =>
    ['Dispatched', 'Invoice', 'Completed'].includes(o.pipeline_stage || 'Sale')
  );
  // Invoiced = Invoice + Completed stages
  const invoiced = filtered.filter(o =>
    ['Invoice', 'Completed'].includes(o.pipeline_stage || 'Sale')
  );

  // Tally bags and tubs across all dispatched order items
  let totalBags = 0;
  let totalTubs = 0;
  const productMap = {}; // key = product name → { category, bags, tubs, units }

  dispatched.forEach(order => {
    order.items.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const key = (item.product || item.category).trim();
      if (!productMap[key]) productMap[key] = { category: item.category, bags: 0, tubs: 0, units: 0 };
      if      (item.unit === 'Bags')  { totalBags += qty; productMap[key].bags  += qty; }
      else if (item.unit === 'Tubs')  { totalTubs += qty; productMap[key].tubs  += qty; }
      else                            {                    productMap[key].units += qty; }
    });
  });

  const bagPallets   = totalBags / 56;
  const tubPallets   = totalTubs / 52;
  const totalPallets = bagPallets + tubPallets;

  // Update headline stats
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('sales-stat-dispatched',  dispatched.length);
  set('sales-stat-invoiced',    invoiced.length);
  set('sales-total-pallets',    fmt(totalPallets));
  set('sales-stat-bag-pallets', fmt(bagPallets));
  set('sales-total-bags',       totalBags);
  set('sales-stat-tub-pallets', fmt(tubPallets));
  set('sales-total-tubs',       totalTubs);

  // Product breakdown table
  const tbody = document.getElementById('sales-product-tbody');
  if (!tbody) return;
  const rows = Object.entries(productMap)
    .map(([name, d]) => ({
      name, category: d.category, bags: d.bags, tubs: d.tubs, units: d.units,
      pallets: d.bags / 56 + d.tubs / 52,
    }))
    .sort((a, b) => (b.bags + b.tubs + b.units) - (a.bags + a.tubs + a.units));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="sales-table-empty">No dispatched orders in this period</td></tr>';
  } else {
    tbody.innerHTML = rows.map(p => {
      const qtyParts = [];
      if (p.bags)  qtyParts.push(`<strong>${p.bags}</strong> Bags`);
      if (p.tubs)  qtyParts.push(`<strong>${p.tubs}</strong> Tubs`);
      if (p.units) qtyParts.push(`<strong>${p.units}</strong> Units`);
      const palletsStr = p.pallets > 0 ? fmt(p.pallets) : '—';
      return `<tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="cat-chip">${p.category}</span></td>
        <td>${qtyParts.join(', ') || '—'}</td>
        <td class="pallet-cell">${palletsStr}</td>
      </tr>`;
    }).join('');
  }

  // Render the progress chart only when the Sales view is active
  if (views.sales && !views.sales.classList.contains('hidden')) {
    renderPalletChart();
  }
}

// Sales date filter buttons
document.querySelectorAll('.sales-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    salesDateFilter = btn.dataset.period;
    document.querySelectorAll('.sales-filter-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    renderSalesDashboard();
  });
});

// ===================== MODAL =====================
function openModal(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  activeModal = orderId;
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const due     = order.required_date ? new Date(order.required_date + 'T00:00:00') : null;
  const overdue = due && due < today && order.status !== 'Dispatched';
  const statusColor = { Pending: '#0083C9', Ready: '#FFC000', Dispatched: '#1A1A1A' };
  document.getElementById('modalHeader').style.borderBottom =
    '3px solid ' + (statusColor[order.status] || '#E1E4E8');
  document.getElementById('modalTitle').textContent = `${order.id} — ${order.customer_name}`;

  const dateStr    = due ? due.toLocaleDateString('en-IE',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Not specified';
  const createdStr = new Date(order.created_at).toLocaleDateString('en-IE',
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const itemRows   = order.items.map(i =>
    `<tr><td>${i.category}</td><td><strong>${i.product}</strong></td>
     <td style="text-align:center"><strong>${i.quantity}</strong></td><td>${i.unit}</td></tr>`).join('');
  const pipeStage  = isCMOrder(order)
    ? `<div class="modal-field"><span class="modal-field-label">Pipeline Stage</span>
       <span class="modal-field-value"><span class="pipeline-stage-badge">
       ${order.pipeline_stage || 'Sale'}</span></span></div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-section">
      <div class="modal-section-title">Customer Details</div>
      <div class="modal-field"><span class="modal-field-label">Customer</span>
        <span class="modal-field-value">${order.customer_name}</span></div>
      ${order.contact_number
        ? `<div class="modal-field"><span class="modal-field-label">Contact</span>
           <span class="modal-field-value">${order.contact_number}</span></div>` : ''}
      <div class="modal-field"><span class="modal-field-label">Delivery Address</span>
        <span class="modal-field-value">${order.delivery_address}</span></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Order Items</div>
      <table class="modal-items-table">
        <thead><tr><th>Category</th><th>Product</th><th>Qty</th><th>Unit</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Details</div>
      <div class="modal-field"><span class="modal-field-label">Required Date</span>
        <span class="modal-field-value" ${overdue ? 'style="color:#E03E3E;font-weight:800"' : ''}>
        ${overdue ? '⚠ OVERDUE · ' : ''}${dateStr}</span></div>
      <div class="modal-field"><span class="modal-field-label">Priority</span>
        <span class="modal-field-value"><span class="priority-badge priority-${order.priority}">
        ${order.priority}</span></span></div>
      <div class="modal-field"><span class="modal-field-label">Status</span>
        <span class="modal-field-value"><strong>${order.status}</strong></span></div>
      ${pipeStage}
      <div class="modal-field"><span class="modal-field-label">Sales Rep</span>
        <span class="modal-field-value">${order.sales_rep}</span></div>
      <div class="modal-field"><span class="modal-field-label">Submitted</span>
        <span class="modal-field-value">${createdStr}</span></div>
    </div>
    ${order.notes
      ? `<div class="modal-section"><div class="modal-section-title">Notes</div>
         <div class="modal-notes">${order.notes}</div></div>` : ''}`;

  const footer = document.getElementById('modalFooter');
  footer.innerHTML = '';
  const cm = isCMOrder(order);
  if (cm) {
    // CM orders: status is driven automatically by the pipeline — no manual buttons
    const stageLabel = document.createElement('div');
    stageLabel.className = 'modal-cm-note';
    stageLabel.textContent = 'Status updates automatically via the CM Pipeline';
    footer.appendChild(stageLabel);
  } else {
    // Safety Barrier orders: manual status buttons
    if (order.status === 'Pending')
      addModalBtn(footer, '📦 Mark Ready to Dispatch', 'to-ready',    () => updateStatus(orderId, 'Ready'));
    if (order.status === 'Ready') {
      addModalBtn(footer, '↩ Back to Pending',        'to-pending',  () => updateStatus(orderId, 'Pending'));
      addModalBtn(footer, '🚚 Mark as Dispatched',    'to-dispatch', () => updateStatus(orderId, 'Dispatched'));
    }
    if (order.status === 'Dispatched')
      addModalBtn(footer, '↩ Back to Ready', 'to-ready', () => updateStatus(orderId, 'Ready'));
  }
  addModalBtn(footer, 'Delete Order', 'btn-delete', () => deleteOrder(orderId));
  document.getElementById('orderModal').classList.remove('hidden');
}

function addModalBtn(footer, text, cls, fn) {
  const btn = document.createElement('button');
  btn.className   = 'btn-status ' + cls;
  btn.textContent = text;
  btn.addEventListener('click', fn);
  footer.appendChild(btn);
}

function closeModal() { document.getElementById('orderModal').classList.add('hidden'); activeModal = null; }
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('orderModal').addEventListener('click', e => {
  if (e.target === document.getElementById('orderModal')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ===================== ORDER ACTIONS =====================
async function updateStatus(orderId, newStatus) {
  closeModal();
  try {
    await api('PATCH', '/orders?id=eq.' + orderId, { status: newStatus });
    const order = orders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    renderDashboard();
    renderPipeline();
    updatePendingBadge();
    const msgs = { Ready: 'Ready to Dispatch', Dispatched: 'Dispatched', Pending: 'Back to Pending' };
    showToast(orderId + ' — ' + msgs[newStatus], 'success');
  } catch (err) {
    showToast('Failed to update status', 'error');
    console.error(err);
  }
}

async function deleteOrder(orderId) {
  if (!confirm('Delete order ' + orderId + '? This cannot be undone.')) return;
  closeModal();
  try {
    await api('DELETE', '/orders?id=eq.' + orderId);
    orders = orders.filter(o => o.id !== orderId);
    renderDashboard();
    renderPipeline();
    updatePendingBadge();
    showToast('Order ' + orderId + ' deleted', 'warning');
  } catch (err) {
    showToast('Failed to delete order', 'error');
    console.error(err);
  }
}

// ===================== EXPORT CSV =====================
document.getElementById('exportBtn').addEventListener('click', () => {
  const filtered = getFilteredOrders();
  if (!filtered.length) { showToast('No orders to export', 'error'); return; }
  const rows = [['Order ID','Customer','Contact','Address','Items','Required Date','Priority','Status','Pipeline Stage','Sales Rep','Notes','Created']];
  filtered.forEach(o => {
    const itemsStr = o.items.map(i => `${i.quantity} ${i.unit} ${i.product} (${i.category})`).join('; ');
    rows.push([o.id, o.customer_name, o.contact_number, o.delivery_address, itemsStr,
      o.required_date, o.priority, o.status, o.pipeline_stage || 'Sale', o.sales_rep, o.notes,
      new Date(o.created_at).toLocaleDateString('en-IE')]);
  });
  const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'),
    { href: url, download: 'emtek-orders-' + new Date().toISOString().slice(0, 10) + '.csv' });
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported ' + filtered.length + ' orders', 'success');
});

// Clear All removed — use Export CSV to back up data instead

// ===================== TOAST =====================
let toastTimer;
function showToast(msg, type = '') {
  const toast    = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = 'toast' + (type ? ' ' + type : '');
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ===================== STOCK PAGE =====================
let stockData        = [];   // raw list from Prospect CRM
let stockFetching    = false;
let stockLastFetched = null;

const STOCK_LOW_THRESHOLD = 20; // below this = "Low Stock"

// Return stock status for a level value
function stockStatus(level) {
  if (level === null || level === undefined) return 'none';
  const n = Number(level);
  if (isNaN(n) || n <= 0)          return 'out';
  if (n < STOCK_LOW_THRESHOLD)     return 'low';
  return 'in';
}

// Match each of our known products against whatever Prospect CRM returned.
// Uses progressively looser matching so slight name differences still resolve.
function matchStockToProducts(crmProducts) {
  return STOCK_PRODUCTS.map(known => {
    let match;
    if (known.prospectName) {
      // Exact match against confirmed Prospect Description value
      const pn = known.prospectName.toLowerCase();
      match = crmProducts.find(p => p.name.toLowerCase() === pn);
    } else {
      // Fuzzy fallback for products not yet mapped to a Prospect name
      const kl = known.name.toLowerCase();
      match =
        crmProducts.find(p => p.name.toLowerCase() === kl) ||
        crmProducts.find(p => p.name.toLowerCase().startsWith(kl)) ||
        crmProducts.find(p => p.name.toLowerCase().includes(kl)) ||
        crmProducts.find(p => kl.includes(p.name.toLowerCase()) && p.name.length > 3);
    }
    return {
      name:     known.name,
      category: known.category,
      stock:    match ? match.stock : null,
      sku:      match ? match.sku   : '',
      matched:  !!match,
    };
  });
}

async function fetchStock() {
  if (stockFetching) return;
  stockFetching = true;

  const dash = document.getElementById('stock-dashboard');
  if (dash) dash.innerHTML = '<div class="stock-empty-state stock-loading">Loading live stock from Prospect CRM...</div>';

  // Reset stats while loading
  ['stock-count-in','stock-count-low','stock-count-out','stock-count-none'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  try {
    const res  = await withTimeout(fetch('/.netlify/functions/stock'), 20000);
    const json = await res.json();

    if (!res.ok || json.error) {
      const msg = json.error || ('HTTP ' + res.status);
      let extra = '';
      if (json.availableEntities && json.availableEntities.length) {
        extra = `<div class="stock-entity-list"><strong>Available entities in your Prospect account:</strong><br>${json.availableEntities.join('<br>')}</div>`;
      } else if (json.availableEntities && json.availableEntities.length === 0) {
        extra = `<div class="stock-entity-list">No entities returned from the Prospect API root — the token may not have OData access.</div>`;
      }
      if (dash) dash.innerHTML = `<div class="stock-empty-state stock-error">${msg}${extra}</div>`;
      showToast('Stock load failed — ' + msg, 'error');
      return;
    }

    stockData        = Array.isArray(json.products) ? json.products : [];
    stockLastFetched = new Date();

    const updEl = document.getElementById('stockLastUpdated');
    if (updEl) updEl.textContent = 'Updated ' + stockLastFetched.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });

    renderStock();

    // ── Temporary debug panel — shows raw data when nothing matched
    const matched = matchStockToProducts(stockData).filter(p => p.matched).length;
    const dash    = document.getElementById('stock-dashboard');
    if (dash && (matched === 0 || stockData.length === 0)) {
      const entity  = json.entity  || '?';
      const fields  = json._fields || [];
      const sample  = json._sample || [];
      let debugHtml = `<div class="stock-debug-panel">
        <strong>Debug — Prospect entity: <code>${entity}</code> · ${json.total ?? 0} total records · ${fields.length} fields</strong><br>
        <em>Fields: ${fields.join(', ') || 'none'}</em>`;
      if (sample.length) {
        debugHtml += `<div class="stock-debug-names" style="margin-top:8px;flex-direction:column;gap:4px;">`;
        sample.forEach((rec, i) => {
          debugHtml += `<span style="display:block;font-family:monospace;font-size:0.72rem;white-space:pre-wrap;">${'Record ' + (i+1) + ': ' + JSON.stringify(rec, null, 0)}</span>`;
        });
        debugHtml += `</div>`;
      }
      debugHtml += `</div>`;
      dash.insertAdjacentHTML('beforeend', debugHtml);
    }
  } catch (err) {
    if (dash) dash.innerHTML = `<div class="stock-empty-state stock-error">Connection error: ${err.message}</div>`;
    showToast('Stock connection error', 'error');
  } finally {
    stockFetching = false;
  }
}

function renderStock() {
  const merged = matchStockToProducts(stockData);

  // Apply search / status filter
  const search = (document.getElementById('stockSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('stockStatusFilter')?.value || '';

  const filtered = merged.filter(p => {
    if (search && !p.name.toLowerCase().includes(search) && !p.category.toLowerCase().includes(search)) return false;
    if (status) {
      const s = p.matched ? stockStatus(p.stock) : 'none';
      if (s !== status) return false;
    }
    return true;
  });

  // Stats — always from full merged list so the counts don't jump on filter
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('stock-count-in',   merged.filter(p => p.matched && stockStatus(p.stock) === 'in').length);
  setEl('stock-count-low',  merged.filter(p => p.matched && stockStatus(p.stock) === 'low').length);
  setEl('stock-count-out',  merged.filter(p => p.matched && stockStatus(p.stock) === 'out').length);
  setEl('stock-count-none', merged.filter(p => !p.matched).length);

  const dash = document.getElementById('stock-dashboard');
  if (!dash) return;

  if (!stockData.length) {
    dash.innerHTML = '<div class="stock-empty-state">Click <strong>Refresh</strong> to load live stock data.</div>';
    return;
  }
  if (!filtered.length) {
    dash.innerHTML = '<div class="stock-empty-state">No products match your filters.</div>';
    return;
  }

  // Group by category, preserving the order they appear in STOCK_PRODUCTS
  const groups = {};
  filtered.forEach(p => {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  });

  const STATUS_META = {
    in:   { badge: 'badge-in',   label: 'In Stock',     qtyClass: 'qty-in'  },
    low:  { badge: 'badge-low',  label: 'Low Stock',    qtyClass: 'qty-low' },
    out:  { badge: 'badge-out',  label: 'Out of Stock', qtyClass: 'qty-out' },
    none: { badge: 'badge-none', label: 'Not in CRM',   qtyClass: 'qty-none'},
  };

  dash.innerHTML = Object.entries(groups).map(([cat, products]) => {
    const cards = products.map(p => {
      const s    = p.matched ? stockStatus(p.stock) : 'none';
      const meta = STATUS_META[s];
      const qty  = (s !== 'none' && p.stock !== null)
        ? Number(p.stock).toLocaleString('en-IE')
        : '—';
      const sub  = s !== 'none' ? 'units' : 'not tracked';
      return `<div class="stock-card stock-card-${s}">
        <div class="stock-card-name">${p.name}</div>
        <div class="stock-card-qty ${meta.qtyClass}">${qty}</div>
        <div class="stock-card-sub">${sub}</div>
        <span class="stock-badge ${meta.badge}">${meta.label}</span>
      </div>`;
    }).join('');

    return `<div class="stock-group">
      <div class="stock-group-header">${cat}</div>
      <div class="stock-card-grid">${cards}</div>
    </div>`;
  }).join('');
}

// Wire up controls
['stockSearch', 'stockStatusFilter'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderStock);
});

document.getElementById('stockRefreshBtn')?.addEventListener('click', () => {
  stockData        = [];
  stockLastFetched = null;
  fetchStock();
});

// ===================== INIT =====================
let appInitialised = false;

async function initApp(user) {
  if (appInitialised) return;
  appInitialised = true;
  authUser = user;
  showLoading('Loading...');
  try {
    const hasProfile = await loadProfile(user);
    if (!hasProfile) {
      hideLoading();
      profileSetup.classList.remove('hidden');
      return;
    }
    hideLoading();
    showView('dashboard');
    loadAllData();
    subscribeRealtime();
  } catch (err) {
    hideLoading();
    console.error('Init error:', err);
    showToast('Failed to load — ' + err.message, 'error');
  }
}

// Check session on page load
(async () => {
  showLoading('Connecting...');
  // Safety net: if anything hangs, show login after 8 seconds
  const safety = setTimeout(() => { hideLoading(); showLoginScreen(); }, 8000);
  try {
    const { data: { session } } = await db.auth.getSession();
    clearTimeout(safety);
    if (session) {
      hideLoginScreen();
      await initApp(session.user);
    } else {
      hideLoading();
      showLoginScreen();
    }
  } catch (err) {
    clearTimeout(safety);
    console.error('Session check failed:', err);
    hideLoading();
    showLoginScreen();
  }
})();

// Listen for sign in / sign out
db.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && !appInitialised) {
    hideLoginScreen();
    await initApp(session.user);
  } else if (event === 'SIGNED_OUT') {
    orders = []; notifList = []; currentUser = null; authUser = null; appInitialised = false;
    if (realtimeChannel) { db.removeChannel(realtimeChannel); realtimeChannel = null; }
    document.getElementById('navUserName').textContent  = '';
    document.getElementById('notifCount').classList.add('hidden');
    document.getElementById('pendingBadge').textContent = '0 Pending';
    hideLoading();
    showLoginScreen();
  }
});
