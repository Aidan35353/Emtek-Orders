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
const SAFETY_PRODUCTS = ['Polymer Barrier', 'Steel Barrier', 'Bollard', 'Rack Guard', 'Column Protector'];
const STAGE_NOTIFY = {
  'Sale':         { role: 'operations', msg: o => `📦 New order ${o.id} from ${o.customer_name} — ready to pick` },
  'Order Picked': { role: 'operations', msg: o => `✅ ${o.id} picked — ready to dispatch` },
  'Dispatched':   { role: 'accounts',   msg: o => `🚚 ${o.id} dispatched to ${o.customer_name} — ready to invoice` },
  'Invoice':      { role: 'accounts',   msg: o => `🧾 ${o.id} ready to invoice — action required` },
  'Completed':    { role: 'sales',      msg: o => `✔ ${o.id} invoice complete — order closed` },
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
};
const navBtns = document.querySelectorAll('.nav-btn[data-view]');

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  if (views[name]) views[name].classList.remove('hidden');
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'pipeline')  renderPipeline();
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
      <span class="card-date">${overdue ? '⚠ OVERDUE · ' : ''}${dateStr}</span>
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
    actionHTML = '<div class="stage-complete invoice-done">✔ Invoice Complete</div>';
  } else if (stage === 'Invoice') {
    actionHTML = `<button class="btn-advance btn-complete-invoice" data-id="${order.id}">✔ Mark Invoice Complete</button>`;
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
    stageLabel.textContent = '📋 Status updates automatically via the CM Pipeline';
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
