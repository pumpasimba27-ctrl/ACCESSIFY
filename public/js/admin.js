/* ==========================================================================
   ACCESSIFY ADMIN STUDIO — FULL CLIENT CONTROLLER
   ========================================================================== */
(() => {
  'use strict';

  const TOKEN_KEY = 'accessify_admin_token';
  const PLACEHOLDER_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
        '<rect width="120" height="120" fill="#18181d"/>' +
        '<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="11">NO IMAGE</text>' +
      '</svg>'
    );

  // Application State
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    activeTab: 'products',
    products: [],
    categories: [],
    orders: [],
    customers: [],
    banners: [],
    settings: {},
    auditLogs: [],
    dashboardStats: null,
    modalImages: [],
    orderLineItems: [],
    isUploading: false,
    isSubmitting: false,
    confirmCallback: null,
    sseSource: null,
    sseErrors: 0
  };

  // DOM Lookup Helper
  const $ = (id) => document.getElementById(id);

  // =========================================================================
  // UTILITIES: Escaping, Formatting, Toasts, Confirm Modal, API Fetch
  // =========================================================================
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatINR(num) {
    return `₹${Math.round(Number(num) || 0).toLocaleString('en-IN')}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'string' && !ts.endsWith('Z') && ts.includes(' ') ? `${ts.replace(' ', 'T')}Z` : ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showToast(message, type = 'success') {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, 3400);
  }

  function openModal(modalId) {
    const m = $(modalId);
    if (!m) return;
    m.classList.remove('hidden');
  }

  function closeModal(modalId) {
    const m = $(modalId);
    if (!m) return;
    m.classList.add('hidden');
  }

  function openConfirm({ title = 'Confirm Action', message, confirmText = 'Delete Permanently', onConfirm }) {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    const yesBtn = $('confirm-yes-btn');
    yesBtn.textContent = confirmText;
    yesBtn.disabled = false;
    state.confirmCallback = onConfirm;
    openModal('confirm-modal');
  }

  function setAuthToken(token) {
    state.token = token || '';
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  function handleUnauthorized(msg = 'Session expired. Please sign in again.') {
    setAuthToken('');
    state.user = null;
    if (state.sseSource) {
      state.sseSource.close();
      state.sseSource = null;
    }
    $('admin-shell').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    const errBox = $('login-error');
    if (errBox && msg) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.token) {
      headers.set('Authorization', `Bearer ${state.token}`);
    }

    const isFormData = options.body instanceof FormData;
    if (options.body && !isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store'
    });

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const txt = await res.text();
      data = { success: res.ok, error: txt || `HTTP ${res.status}` };
    }

    if (res.status === 401 && !url.includes('/api/admin/login')) {
      handleUnauthorized(data?.error || 'Session expired. Please sign in again.');
      throw new Error(data?.error || 'Unauthorized');
    }

    if (!res.ok || (data && data.success === false)) {
      throw new Error(data?.error || `Request failed with status ${res.status}`);
    }

    if (data && data.dbVersion) {
      updateVersionPill(data.dbVersion);
    }

    return data;
  }

  function updateVersionPill(version) {
    if (!version) return;
    const el = $('live-sync-text');
    if (el) el.textContent = `LIVE SYNC v${version}`;
  }

  // =========================================================================
  // AUTHENTICATION & BOOTSTRAP
  // =========================================================================
  async function handleLoginSubmit(e) {
    e.preventDefault();
    const errBox = $('login-error');
    errBox.classList.add('hidden');

    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    if (!username || !password) {
      errBox.textContent = 'Username and password are required.';
      errBox.classList.remove('hidden');
      return;
    }

    const btn = $('login-submit');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Authenticating...';

    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setAuthToken(res.token);
      state.user = res.user;
      $('login-password').value = '';
      await enterDashboard();
      showToast('Signed in to ACCESSIFY Admin Studio');
    } catch (err) {
      errBox.textContent = err.message || 'Login failed';
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/admin/logout', { method: 'POST' });
    } catch (_) {
      // Clear local session regardless
    }
    handleUnauthorized('');
    $('login-error').classList.add('hidden');
    showToast('Signed out', 'info');
  }

  async function checkExistingSession() {
    if (!state.token) {
      $('login-screen').classList.remove('hidden');
      $('admin-shell').classList.add('hidden');
      return;
    }

    try {
      const me = await apiFetch('/api/admin/me');
      state.user = me.user;
      updateEnvBadges(me);
      await enterDashboard();
    } catch (_) {
      // handleUnauthorized already ran on 401
      $('login-screen').classList.remove('hidden');
      $('admin-shell').classList.add('hidden');
    }
  }

  function updateEnvBadges(info) {
    if (info?.user?.username) {
      $('admin-username-badge').textContent = info.user.username.toUpperCase();
    }
    if (info?.dbMode) {
      const label = info.dbMode === 'turso' ? 'TURSO CLOUD' : 'LOCAL SQLITE';
      $('db-mode-badge').textContent = `DB: ${label}`;
    }
    if (info?.blobStorage !== undefined) {
      $('blob-mode-badge').textContent = info.blobStorage ? 'MEDIA: VERCEL BLOB' : 'MEDIA: LOCAL DISK';
    }
    if (info?.dbVersion) {
      updateVersionPill(info.dbVersion);
    }
  }

  async function enterDashboard() {
    $('login-screen').classList.add('hidden');
    $('admin-shell').classList.remove('hidden');
    await syncAllData();
    initAdminRealtime();
  }

  async function syncAllData() {
    await Promise.all([
      loadDashboard(),
      loadCategories(),
      loadProducts(),
      loadOrders(),
      loadCustomers(),
      loadBannersAndSettings()
    ]);
  }

  function initAdminRealtime() {
    if (state.sseSource || !window.EventSource) return;
    try {
      const source = new EventSource('/api/events');
      state.sseSource = source;

      source.addEventListener('open', () => {
        state.sseErrors = 0;
      });

      source.addEventListener('catalog_update', (evt) => {
        state.sseErrors = 0;
        try {
          const data = JSON.parse(evt.data);
          if (data.version) updateVersionPill(data.version);
          if (data.type && data.type !== 'connected' && data.type !== 'sync') {
            loadDashboard();
          }
        } catch (_) {}
      });

      source.onerror = () => {
        state.sseErrors += 1;
        if (state.sseErrors >= 4) {
          source.close();
          state.sseSource = null;
        }
      };
    } catch (_) {}
  }

  // =========================================================================
  // DASHBOARD & AUDIT LOGS
  // =========================================================================
  async function loadDashboard() {
    try {
      const data = await apiFetch('/api/admin/dashboard');
      const s = data.stats || {};
      state.dashboardStats = s;
      state.auditLogs = data.auditLogs || [];

      updateEnvBadges({
        dbMode: s.dbMode,
        blobStorage: data.blobStorage,
        dbVersion: s.dbVersion
      });

      $('stat-total').textContent = s.total ?? 0;
      $('stat-total-sub').textContent = `${s.accessoriesTotal ?? 0} Accessories • ${s.clothingTotal ?? 0} Clothing`;
      $('stat-available').textContent = s.available ?? 0;
      $('stat-sold-out').textContent = `${s.soldOut ?? 0} / ${s.hidden ?? 0}`;
      $('stat-hidden-sub').textContent = `${s.soldOut ?? 0} sold out • ${s.hidden ?? 0} hidden`;
      $('stat-categories').textContent = s.categoriesCount ?? 0;
      $('stat-orders').textContent = s.ordersCount ?? 0;
      $('stat-revenue').textContent = `${formatINR(s.totalRevenue ?? 0)} revenue`;
      $('stat-clients').textContent = data.connectedClients ?? 0;
      $('stat-customers-sub').textContent = `${s.customersCount ?? 0} saved customers`;

      $('count-products').textContent = s.allTotal ?? s.total ?? 0;
      $('count-categories').textContent = s.categoriesCount ?? 0;
      $('count-orders').textContent = s.ordersCount ?? 0;
      $('count-customers').textContent = s.customersCount ?? 0;
      $('count-logs').textContent = state.auditLogs.length;

      renderAuditLogs();
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  function renderAuditLogs() {
    const tbody = $('audit-tbody');
    if (!tbody) return;
    if (!state.auditLogs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No audit logs recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.auditLogs
      .map(
        (log) => `
      <tr>
        <td style="font-family:var(--font-mono);color:var(--text-muted);">#${escapeHtml(log.id)}</td>
        <td style="white-space:nowrap;color:var(--text-secondary);">${escapeHtml(formatDateTime(log.timestamp))}</td>
        <td><span class="badge badge-section">${escapeHtml(log.action)}</span></td>
        <td>${escapeHtml(log.details)}</td>
      </tr>
    `
      )
      .join('');
  }

  // =========================================================================
  // CATEGORIES MANAGEMENT
  // =========================================================================
  async function loadCategories() {
    try {
      const res = await apiFetch('/api/categories?section=all');
      state.categories = res.data || [];
      $('count-categories').textContent = state.categories.length;
      syncFilterCategoryOptions();
      renderCategoriesGrid();
    } catch (err) {
      showToast(err.message || 'Failed to load categories', 'error');
    }
  }

  function syncFilterCategoryOptions() {
    const secFilter = $('filter-section').value;
    const catSelect = $('filter-category');
    const prevVal = catSelect.value;

    const list =
      secFilter === 'all'
        ? state.categories
        : state.categories.filter((c) => (c.section || 'accessories') === secFilter);

    catSelect.innerHTML =
      '<option value="all">All Categories</option>' +
      list
        .map(
          (c) =>
            `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.section || 'accessories')})</option>`
        )
        .join('');

    if ([...catSelect.options].some((o) => o.value === prevVal)) {
      catSelect.value = prevVal;
    } else {
      catSelect.value = 'all';
    }
  }

  function syncProductModalCategoryOptions(selectedCategory = '') {
    const sec = $('prod-section').value || 'accessories';
    const catSelect = $('prod-category');
    const matching = state.categories.filter((c) => (c.section || 'accessories') === sec);
    const list = matching.length > 0 ? matching : state.categories;

    let optionsHtml = list
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join('');

    // Preserve legacy or cross-section category ID when editing existing items
    if (selectedCategory && !list.some((c) => c.id === selectedCategory)) {
      const foundAny = state.categories.find((c) => c.id === selectedCategory);
      const label = foundAny ? `${foundAny.name} (${foundAny.section})` : `${selectedCategory} (legacy)`;
      optionsHtml = `<option value="${escapeHtml(selectedCategory)}">${escapeHtml(label)}</option>` + optionsHtml;
    }

    catSelect.innerHTML = optionsHtml || '<option value="general">General</option>';
    if (selectedCategory && [...catSelect.options].some((o) => o.value === selectedCategory)) {
      catSelect.value = selectedCategory;
    }
  }

  function renderCategoriesGrid() {
    const grid = $('categories-grid');
    if (!grid) return;

    const sec = $('cat-filter-section').value;
    const list =
      sec === 'all' ? state.categories : state.categories.filter((c) => (c.section || 'accessories') === sec);

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No categories match this section filter.</div>';
      return;
    }

    grid.innerHTML = list
      .map(
        (c) => `
      <article class="item-card">
        <div class="item-card-top">
          <div style="display:flex;gap:12px;align-items:center;">
            <img src="${escapeHtml(c.image || PLACEHOLDER_SVG)}" alt="" class="item-card-media" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'" />
            <div>
              <div style="font-weight:600;font-size:15px;">${escapeHtml(c.name)}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">slug: ${escapeHtml(c.slug || c.id)}</div>
            </div>
          </div>
          <span class="badge badge-section">${escapeHtml((c.section || 'accessories').toUpperCase())}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);min-height:18px;">
          ${escapeHtml(c.description || 'No description')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border-subtle);">
          <span style="font-size:12px;color:var(--text-muted);">
            <strong>${Number(c.count) || 0}</strong> products • Order #${Number(c.display_order) || 0}
          </span>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-edit-cat="${escapeHtml(c.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-del-cat="${escapeHtml(c.id)}" data-cat-name="${escapeHtml(c.name)}">Delete</button>
          </div>
        </div>
      </article>
    `
      )
      .join('');
  }

  function openCategoryModal(cat = null) {
    $('cat-id').value = cat ? cat.id : '';
    $('cat-name').value = cat ? cat.name : '';
    $('cat-section').value = cat ? cat.section || 'accessories' : 'accessories';
    $('cat-order').value = cat ? Number(cat.display_order ?? 10) : 10;
    $('cat-description').value = cat ? cat.description || '' : '';
    $('cat-image').value = cat ? cat.image || '' : '';
    $('cat-image-upload').value = '';
    $('category-modal-title').textContent = cat ? `Edit Category: ${cat.name}` : 'Add Category';
    updateSingleImagePreview('cat-image', 'cat-image-preview');
    openModal('category-modal');
  }

  async function handleCategorySubmit(e) {
    e.preventDefault();
    const id = $('cat-id').value;
    const payload = {
      name: $('cat-name').value.trim(),
      section: $('cat-section').value,
      display_order: Number($('cat-order').value || 10),
      description: $('cat-description').value.trim(),
      image: $('cat-image').value.trim()
    };

    if (!payload.name) {
      showToast('Category name is required', 'error');
      return;
    }

    const btn = $('cat-save-btn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Saving...';

    try {
      if (id) {
        await apiFetch(`/api/admin/categories/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Category updated');
      } else {
        await apiFetch('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Category created');
      }
      closeModal('category-modal');
      await Promise.all([loadCategories(), loadDashboard(), loadProducts()]);
    } catch (err) {
      showToast(err.message || 'Failed to save category', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // =========================================================================
  // PRODUCTS MANAGEMENT
  // =========================================================================
  async function loadProducts() {
    try {
      const params = new URLSearchParams();
      const search = $('filter-search').value.trim();
      const section = $('filter-section').value;
      const category = $('filter-category').value;
      const status = $('filter-status').value;
      const sort = $('filter-sort').value;

      if (search) params.set('search', search);
      if (section && section !== 'all') params.set('section', section);
      if (category && category !== 'all') params.set('category', category);
      if (status && status !== 'all') params.set('status', status);
      if (sort) params.set('sort', sort);

      const res = await apiFetch(`/api/admin/products?${params.toString()}`);
      state.products = res.data || [];
      $('products-summary').textContent = `Showing ${state.products.length} of ${res.total ?? state.products.length} products`;
      renderProductsTable();
    } catch (err) {
      showToast(err.message || 'Failed to load products', 'error');
    }
  }

  function renderProductsTable() {
    const tbody = $('products-tbody');
    if (!tbody) return;

    if (!state.products.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No products match the current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = state.products
      .map((p) => {
        const imgs = Array.isArray(p.images) ? p.images : [];
        const thumb = imgs[0] || PLACEHOLDER_SVG;
        const price = Number(p.price) || 0;
        const mrp = p.comparePrice ? Number(p.comparePrice) : null;
        const discountPct = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
        const status = p.status || 'available';
        const isSoldOut = status === 'sold_out';
        const isHidden = status === 'hidden';
        const catObj = state.categories.find((c) => c.id === p.category);
        const catLabel = catObj ? catObj.name : p.category;
        const variantsText = Array.isArray(p.variants) && p.variants.length ? p.variants.join(', ') : '';

        return `
      <tr>
        <td>
          <div class="prod-cell">
            <div class="prod-thumb-wrap">
              <img src="${escapeHtml(thumb)}" alt="" class="prod-thumb" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'" />
              ${imgs.length > 1 ? `<span class="thumb-count">${imgs.length} imgs</span>` : ''}
            </div>
            <div>
              <div class="prod-meta-title">
                <a href="/product/${encodeURIComponent(p.slug || p.id)}" target="_blank" rel="noopener" title="View on Storefront">${escapeHtml(p.name)} ↗</a>
              </div>
              <div class="prod-meta-sub">
                ${p.sku_code ? `<span>${escapeHtml(p.sku_code)}</span>` : ''}
                ${variantsText ? `<span>Sizes: ${escapeHtml(variantsText)}</span>` : ''}
                ${p.featured ? '<span class="badge badge-vip">Featured</span>' : ''}
                ${p.newArrival ? '<span class="badge badge-info">New</span>' : ''}
              </div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge badge-section">${escapeHtml((p.section || 'accessories').toUpperCase())}</span>
          <div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">${escapeHtml(catLabel)}</div>
        </td>
        <td class="price-cell">
          <div>
            <span class="price-main">${formatINR(price)}</span>
            ${mrp && mrp > price ? `<span class="price-mrp">${formatINR(mrp)}</span>` : ''}
          </div>
          ${discountPct > 0 ? `<div class="discount-pill">${discountPct}% OFF</div>` : ''}
        </td>
        <td>
          <div class="stock-inline">
            <button type="button" data-stock-step="-1" data-prod-id="${escapeHtml(p.id)}" title="Decrease stock">−</button>
            <input type="number" min="0" value="${Number(p.stock ?? 0)}" data-stock-input="${escapeHtml(p.id)}" aria-label="Stock quantity" />
            <button type="button" data-stock-step="1" data-prod-id="${escapeHtml(p.id)}" title="Increase stock">+</button>
          </div>
        </td>
        <td>
          <span class="badge badge-${escapeHtml(status)}">${escapeHtml(status.replace('_', ' '))}</span>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-edit-prod="${escapeHtml(p.id)}">Edit</button>
            <button type="button" class="btn btn-secondary btn-xs" data-status-prod="${escapeHtml(p.id)}" data-next-status="${isSoldOut ? 'available' : 'sold_out'}">
              ${isSoldOut ? 'Mark Available' : 'Mark Sold Out'}
            </button>
            <button type="button" class="btn btn-secondary btn-xs" data-status-prod="${escapeHtml(p.id)}" data-next-status="${isHidden ? 'available' : 'hidden'}">
              ${isHidden ? 'Activate' : 'Hide'}
            </button>
            <button type="button" class="btn btn-danger btn-xs" data-del-prod="${escapeHtml(p.id)}" data-prod-name="${escapeHtml(p.name)}">Delete</button>
          </div>
        </td>
      </tr>`;
      })
      .join('');
  }

  async function updateProductStockQuick(id, newStock) {
    const qty = Math.max(0, Math.floor(Number(newStock) || 0));
    try {
      await apiFetch(`/api/admin/products/${encodeURIComponent(id)}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: qty })
      });
      showToast(`Stock updated to ${qty}`);
      await Promise.all([loadProducts(), loadDashboard()]);
    } catch (err) {
      showToast(err.message || 'Stock update failed', 'error');
      await loadProducts();
    }
  }

  async function updateProductStatusQuick(id, nextStatus) {
    try {
      await apiFetch(`/api/admin/products/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      showToast(`Product marked as ${nextStatus.replace('_', ' ')}`);
      await Promise.all([loadProducts(), loadDashboard(), loadCategories()]);
    } catch (err) {
      showToast(err.message || 'Status update failed', 'error');
    }
  }

  // =========================================================================
  // PRODUCT ADD / EDIT MODAL + MULTI-IMAGE UPLOAD ENGINE
  // =========================================================================
  function openProductModal(product = null) {
    $('prod-form-error').classList.add('hidden');
    $('prod-upload-status').textContent = '';
    $('prod-upload').value = '';
    $('prod-image-url-input').value = '';

    $('prod-id').value = product ? product.id : '';
    $('prod-name').value = product ? product.name : '';
    $('prod-sku').value = product ? product.sku_code || '' : '';
    $('prod-section').value = product ? product.section || 'accessories' : 'accessories';

    syncProductModalCategoryOptions(product ? product.category : '');

    $('prod-price').value = product ? Number(product.price) : '';
    $('prod-compare-price').value = product && product.comparePrice ? Number(product.comparePrice) : '';
    $('prod-stock').value = product ? Number(product.stock ?? 25) : 25;
    $('prod-status').value = product ? product.status || 'available' : 'available';
    $('prod-variants').value = product && Array.isArray(product.variants) ? product.variants.join(', ') : '';
    $('prod-tags').value = product && Array.isArray(product.tags) ? product.tags.join(', ') : '';
    $('prod-description').value = product ? product.description || '' : '';
    $('prod-featured').checked = Boolean(product && product.featured);
    $('prod-new-arrival').checked = product ? Boolean(product.newArrival) : true;

    state.modalImages = product && Array.isArray(product.images) ? [...product.images] : [];
    renderModalImagePreviewStrip();
    updateDiscountPreview();

    $('product-modal-title').textContent = product ? `Edit Product: ${product.name}` : 'Add New Product';
    $('prod-save-btn').textContent = product ? 'Save Changes & Sync' : 'Save & Publish Product';

    openModal('product-modal');
  }

  function updateDiscountPreview() {
    const price = Number($('prod-price').value);
    const mrp = Number($('prod-compare-price').value);
    const badge = $('prod-discount-preview');
    if (price > 0 && mrp > price) {
      const pct = Math.round(((mrp - price) / mrp) * 100);
      badge.textContent = `${pct}% OFF`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function renderModalImagePreviewStrip() {
    const strip = $('prod-image-preview-strip');
    if (!strip) return;

    if (!state.modalImages.length) {
      strip.innerHTML =
        '<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);padding:8px 0;">No images attached yet. Upload files above or paste an image URL.</div>';
      return;
    }

    strip.innerHTML = state.modalImages
      .map(
        (url, idx) => `
      <div class="preview-box">
        ${idx === 0 ? '<span class="primary-badge">PRIMARY</span>' : ''}
        <img src="${escapeHtml(url)}" alt="Preview ${idx + 1}" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'" />
        <div class="preview-controls">
          <div>
            <button type="button" data-img-move="-1" data-img-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Left">←</button>
            <button type="button" data-img-move="1" data-img-idx="${idx}" ${idx === state.modalImages.length - 1 ? 'disabled' : ''} title="Move Right">→</button>
          </div>
          <button type="button" class="btn-remove-img" data-img-del="${idx}" title="Remove Image">×</button>
        </div>
      </div>
    `
      )
      .join('');
  }

  async function uploadImageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];

    if (files.length > 10) {
      throw new Error('Maximum 10 images can be uploaded in a single batch.');
    }

    const allowedExt = /\.(jpe?g|png|webp|gif|avif)$/i;
    for (const file of files) {
      if (!allowedExt.test(file.name) && !/^image\/(jpeg|jpg|png|webp|gif|avif)/i.test(file.type)) {
        throw new Error(`Unsupported format for "${file.name}". Use JPG, JPEG, PNG, WEBP, GIF, or AVIF.`);
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`"${file.name}" exceeds the 10MB file size limit.`);
      }
    }

    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    const res = await apiFetch('/api/admin/upload', {
      method: 'POST',
      body: fd
    });
    return res.urls || [];
  }

  async function handleProductFilesSelected(fileList) {
    if (!fileList || !fileList.length) return;
    const statusEl = $('prod-upload-status');
    const saveBtn = $('prod-save-btn');
    state.isUploading = true;
    saveBtn.disabled = true;
    statusEl.style.color = 'var(--text-secondary)';
    statusEl.textContent = `Uploading ${fileList.length} image(s)...`;

    try {
      const urls = await uploadImageFiles(fileList);
      urls.forEach((u) => {
        if (!state.modalImages.includes(u)) {
          state.modalImages.push(u);
        }
      });
      renderModalImagePreviewStrip();
      statusEl.style.color = '#6ee7b7';
      statusEl.textContent = `Uploaded ${urls.length} image(s) successfully.`;
      showToast(`${urls.length} image(s) uploaded`);
    } catch (err) {
      statusEl.style.color = '#fca5a5';
      statusEl.textContent = err.message || 'Image upload failed';
      showToast(err.message || 'Image upload failed', 'error');
    } finally {
      state.isUploading = false;
      saveBtn.disabled = false;
      $('prod-upload').value = '';
    }
  }

  async function handleProductSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting || state.isUploading) return;

    const errBox = $('prod-form-error');
    errBox.classList.add('hidden');

    const id = $('prod-id').value;
    const name = $('prod-name').value.trim();
    const category = $('prod-category').value;
    const priceVal = $('prod-price').value;
    const compareVal = $('prod-compare-price').value;

    if (!name || !category || priceVal === '' || Number(priceVal) < 0) {
      errBox.textContent = 'Please provide a valid product name, category, and non-negative price.';
      errBox.classList.remove('hidden');
      return;
    }

    const variants = $('prod-variants')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = $('prod-tags')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name,
      sku_code: $('prod-sku').value.trim(),
      section: $('prod-section').value,
      category,
      price: Number(priceVal),
      comparePrice: compareVal === '' ? null : Number(compareVal),
      stock: Math.max(0, Math.floor(Number($('prod-stock').value || 0))),
      status: $('prod-status').value,
      variants,
      tags,
      description: $('prod-description').value.trim(),
      featured: $('prod-featured').checked,
      newArrival: $('prod-new-arrival').checked,
      images: state.modalImages
    };

    const btn = $('prod-save-btn');
    const origText = btn.textContent;
    state.isSubmitting = true;
    btn.disabled = true;
    btn.textContent = 'Saving & Syncing...';

    try {
      if (id) {
        await apiFetch(`/api/admin/products/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Product updated & synchronized live');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Product added & published to storefront');
      }
      closeModal('product-modal');
      await Promise.all([loadProducts(), loadCategories(), loadDashboard()]);
    } catch (err) {
      errBox.textContent = err.message || 'Failed to save product';
      errBox.classList.remove('hidden');
      showToast(err.message || 'Failed to save product', 'error');
    } finally {
      state.isSubmitting = false;
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  // =========================================================================
  // ORDERS MANAGEMENT
  // =========================================================================
  async function loadOrders() {
    try {
      const params = new URLSearchParams();
      const search = $('order-filter-search').value.trim();
      const status = $('order-filter-status').value;
      if (search) params.set('search', search);
      if (status && status !== 'all') params.set('status', status);

      const res = await apiFetch(`/api/admin/orders?${params.toString()}`);
      state.orders = res.data || [];
      $('count-orders').textContent = state.orders.length;
      renderOrdersTable();
    } catch (err) {
      showToast(err.message || 'Failed to load orders', 'error');
    }
  }

  function renderOrdersTable() {
    const tbody = $('orders-tbody');
    if (!tbody) return;
    if (!state.orders.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No orders found.</td></tr>';
      return;
    }

    const orderStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
    const payStatuses = ['pending', 'paid', 'refunded'];

    tbody.innerHTML = state.orders
      .map((o) => {
        const itemsSummary = Array.isArray(o.items) && o.items.length
          ? o.items.map((it) => `${it.qty || 1}× ${it.name || 'Item'}`).join(', ')
          : 'No items listed';

        return `
      <tr>
        <td>
          <div style="font-family:var(--font-mono);font-weight:600;">${escapeHtml(o.order_number)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(formatDateTime(o.created_at))} • ${escapeHtml(o.source || 'whatsapp')}</div>
        </td>
        <td>
          <div style="font-weight:600;">${escapeHtml(o.customer_name)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(o.customer_phone || o.customer_email || '—')}</div>
        </td>
        <td style="max-width:220px;font-size:12px;color:var(--text-secondary);">${escapeHtml(itemsSummary)}</td>
        <td style="font-family:var(--font-mono);font-weight:600;">${formatINR(o.total_amount)}</td>
        <td>
          <select class="form-control" style="padding:5px 8px;font-size:12px;" data-order-pay="${escapeHtml(o.id)}">
            ${payStatuses
              .map((ps) => `<option value="${ps}" ${o.payment_status === ps ? 'selected' : ''}>${ps.toUpperCase()}</option>`)
              .join('')}
          </select>
        </td>
        <td>
          <select class="form-control" style="padding:5px 8px;font-size:12px;" data-order-stat="${escapeHtml(o.id)}">
            ${orderStatuses
              .map((os) => `<option value="${os}" ${o.order_status === os ? 'selected' : ''}>${os.toUpperCase()}</option>`)
              .join('')}
          </select>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-edit-order="${escapeHtml(o.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-del-order="${escapeHtml(o.id)}" data-order-num="${escapeHtml(o.order_number)}">Delete</button>
          </div>
        </td>
      </tr>`;
      })
      .join('');
  }

  function renderOrderLineItems() {
    const list = $('ord-items-list');
    if (!list) return;
    if (!state.orderLineItems.length) {
      state.orderLineItems = [{ name: '', qty: 1, price: 0 }];
    }

    list.innerHTML = state.orderLineItems
      .map(
        (item, idx) => `
      <div class="order-item-row">
        <input type="text" class="form-control" placeholder="Product / Size" value="${escapeHtml(item.name || '')}" data-item-field="name" data-item-idx="${idx}" />
        <input type="number" min="1" class="form-control" placeholder="Qty" value="${Number(item.qty || 1)}" data-item-field="qty" data-item-idx="${idx}" />
        <input type="number" min="0" class="form-control" placeholder="Price ₹" value="${Number(item.price || 0)}" data-item-field="price" data-item-idx="${idx}" />
        <button type="button" class="btn btn-danger btn-xs" data-item-remove="${idx}" title="Remove item">×</button>
      </div>
    `
      )
      .join('');
  }

  function recalculateOrderTotals() {
    const subtotal = state.orderLineItems.reduce(
      (sum, it) => sum + Math.max(0, Number(it.qty || 1)) * Math.max(0, Number(it.price || 0)),
      0
    );
    const discount = Math.max(0, Number($('ord-discount').value || 0));
    $('ord-subtotal').value = Math.round(subtotal);
    $('ord-total').value = Math.max(0, Math.round(subtotal - discount));
  }

  function openOrderModal(order = null) {
    const custSel = $('ord-customer-select');
    custSel.innerHTML =
      '<option value="">-- New / Custom Customer --</option>' +
      state.customers
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.phone || c.email || 'no contact')})</option>`)
        .join('');

    $('ord-id').value = order ? order.id : '';
    custSel.value = order && order.customer_id ? order.customer_id : '';
    $('ord-customer-name').value = order ? order.customer_name : '';
    $('ord-customer-phone').value = order ? order.customer_phone || '' : '';
    $('ord-customer-email').value = order ? order.customer_email || '' : '';
    $('ord-shipping-address').value = order ? order.shipping_address || '' : '';
    $('ord-source').value = order ? order.source || 'whatsapp' : 'whatsapp';
    $('ord-order-status').value = order ? order.order_status || 'pending' : 'pending';
    $('ord-payment-status').value = order ? order.payment_status || 'pending' : 'pending';
    $('ord-notes').value = order ? order.notes || '' : '';

    state.orderLineItems =
      order && Array.isArray(order.items) && order.items.length
        ? order.items.map((it) => ({ ...it }))
        : [{ name: '', qty: 1, price: 0 }];
    renderOrderLineItems();

    $('ord-subtotal').value = order ? Number(order.subtotal ?? 0) : 0;
    $('ord-discount').value = order ? Number(order.discount_amount ?? 0) : 0;
    $('ord-total').value = order ? Number(order.total_amount ?? 0) : 0;
    $('order-modal-title').textContent = order ? `Edit Order: ${order.order_number}` : 'Create Order';

    openModal('order-modal');
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    const id = $('ord-id').value;
    const customerName = $('ord-customer-name').value.trim();
    if (!customerName) {
      showToast('Customer name is required', 'error');
      return;
    }

    const cleanItems = state.orderLineItems
      .filter((it) => String(it.name || '').trim())
      .map((it) => ({
        name: String(it.name).trim(),
        qty: Math.max(1, Number(it.qty || 1)),
        price: Math.max(0, Number(it.price || 0))
      }));

    const payload = {
      customer_id: $('ord-customer-select').value || null,
      customer_name: customerName,
      customer_phone: $('ord-customer-phone').value.trim(),
      customer_email: $('ord-customer-email').value.trim(),
      shipping_address: $('ord-shipping-address').value.trim(),
      items: cleanItems,
      subtotal: Number($('ord-subtotal').value || 0),
      discount_amount: Number($('ord-discount').value || 0),
      total_amount: Number($('ord-total').value || 0),
      payment_status: $('ord-payment-status').value,
      order_status: $('ord-order-status').value,
      source: $('ord-source').value,
      notes: $('ord-notes').value.trim()
    };

    const btn = $('ord-save-btn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      if (id) {
        await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Order updated');
      } else {
        await apiFetch('/api/admin/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Order created');
      }
      closeModal('order-modal');
      await Promise.all([loadOrders(), loadCustomers(), loadDashboard()]);
    } catch (err) {
      showToast(err.message || 'Failed to save order', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // =========================================================================
  // CUSTOMERS MANAGEMENT
  // =========================================================================
  async function loadCustomers() {
    try {
      const search = $('cust-filter-search').value.trim();
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await apiFetch(`/api/admin/customers${params}`);
      state.customers = res.data || [];
      $('count-customers').textContent = state.customers.length;
      renderCustomersTable();
    } catch (err) {
      showToast(err.message || 'Failed to load customers', 'error');
    }
  }

  function renderCustomersTable() {
    const tbody = $('customers-tbody');
    if (!tbody) return;
    if (!state.customers.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No customers recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.customers
      .map(
        (c) => `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(c.name)}</div>
          ${c.notes ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.notes)}</div>` : ''}
        </td>
        <td>
          <div>${escapeHtml(c.phone || '—')}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(c.email || '')}</div>
        </td>
        <td>
          <div>${escapeHtml(c.city || '—')}</div>
          <div style="font-size:11px;color:var(--text-muted);max-width:220px;">${escapeHtml(c.address || '')}</div>
        </td>
        <td style="font-family:var(--font-mono);">
          ${Number(c.total_orders || 0)} orders • ${formatINR(c.total_spent || 0)}
        </td>
        <td><span class="badge badge-${escapeHtml(c.status || 'active')}">${escapeHtml(c.status || 'active')}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-edit-cust="${escapeHtml(c.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-del-cust="${escapeHtml(c.id)}" data-cust-name="${escapeHtml(c.name)}">Delete</button>
          </div>
        </td>
      </tr>
    `
      )
      .join('');
  }

  function openCustomerModal(cust = null) {
    $('cust-id').value = cust ? cust.id : '';
    $('cust-name').value = cust ? cust.name : '';
    $('cust-phone').value = cust ? cust.phone || '' : '';
    $('cust-email').value = cust ? cust.email || '' : '';
    $('cust-city').value = cust ? cust.city || '' : '';
    $('cust-status').value = cust ? cust.status || 'active' : 'active';
    $('cust-address').value = cust ? cust.address || '' : '';
    $('cust-notes').value = cust ? cust.notes || '' : '';
    $('customer-modal-title').textContent = cust ? `Edit Customer: ${cust.name}` : 'Add Customer';
    openModal('customer-modal');
  }

  async function handleCustomerSubmit(e) {
    e.preventDefault();
    const id = $('cust-id').value;
    const payload = {
      name: $('cust-name').value.trim(),
      phone: $('cust-phone').value.trim(),
      email: $('cust-email').value.trim(),
      city: $('cust-city').value.trim(),
      status: $('cust-status').value,
      address: $('cust-address').value.trim(),
      notes: $('cust-notes').value.trim()
    };

    if (!payload.name) {
      showToast('Customer name is required', 'error');
      return;
    }

    const btn = $('cust-save-btn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      if (id) {
        await apiFetch(`/api/admin/customers/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Customer updated');
      } else {
        await apiFetch('/api/admin/customers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Customer added');
      }
      closeModal('customer-modal');
      await Promise.all([loadCustomers(), loadDashboard()]);
    } catch (err) {
      showToast(err.message || 'Failed to save customer', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // =========================================================================
  // BANNERS, SETTINGS, PASSWORD & BACKUP
  // =========================================================================
  async function loadBannersAndSettings() {
    try {
      const res = await apiFetch('/api/admin/banners');
      state.banners = res.data || [];
      state.settings = res.settings || {};
      $('count-banners').textContent = state.banners.length;
      renderBannersGrid();
      populateSettingsForm();
    } catch (err) {
      showToast(err.message || 'Failed to load banners & settings', 'error');
    }
  }

  function renderBannersGrid() {
    const grid = $('banners-grid');
    if (!grid) return;

    if (!state.banners.length) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;">No promotional banners created yet. Click "+ Add Banner" to create one.</div>';
      return;
    }

    grid.innerHTML = state.banners
      .map(
        (b) => `
      <article class="item-card">
        <div class="item-card-top">
          <div style="display:flex;gap:12px;align-items:center;">
            <img src="${escapeHtml(b.image_url || PLACEHOLDER_SVG)}" alt="" class="item-card-media" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'" />
            <div>
              <div style="font-weight:600;">${escapeHtml(b.title)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(b.position || 'promo')} • Order #${Number(b.display_order || 0)}</div>
            </div>
          </div>
          <span class="badge ${b.active ? 'badge-active' : 'badge-inactive'}">${b.active ? 'Active' : 'Disabled'}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);">
          ${b.badge_text ? `<span class="badge badge-section">${escapeHtml(b.badge_text)}</span> ` : ''}
          ${escapeHtml(b.subtitle || '')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border-subtle);">
          <button type="button" class="btn btn-secondary btn-xs" data-toggle-ban="${escapeHtml(b.id)}" data-ban-active="${b.active ? '0' : '1'}">
            ${b.active ? 'Disable' : 'Activate'}
          </button>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-edit-ban="${escapeHtml(b.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-del-ban="${escapeHtml(b.id)}" data-ban-title="${escapeHtml(b.title)}">Delete</button>
          </div>
        </div>
      </article>
    `
      )
      .join('');
  }

  function populateSettingsForm() {
    const s = state.settings || {};
    $('set-store-name').value = s.store_name || 'ACCESSIFY';
    $('set-whatsapp').value = s.whatsapp_number || '';
    $('set-promo').value = s.promo_notice || '';
    $('set-instagram').value = s.instagram_url || '';
    $('set-dispatch').value = s.dispatch_notice || '';
    $('set-maintenance').checked = s.maintenance_mode === 'true' || s.maintenance_mode === '1';
  }

  function openBannerModal(banner = null) {
    $('ban-id').value = banner ? banner.id : '';
    $('ban-title').value = banner ? banner.title : '';
    $('ban-subtitle').value = banner ? banner.subtitle || '' : '';
    $('ban-badge').value = banner ? banner.badge_text || '' : '';
    $('ban-position').value = banner ? banner.position || 'promo' : 'promo';
    $('ban-link').value = banner ? banner.link_url || '' : '';
    $('ban-order').value = banner ? Number(banner.display_order || 0) : 0;
    $('ban-image-url').value = banner ? banner.image_url || '' : '';
    $('ban-image-upload').value = '';
    $('ban-active').checked = banner ? Boolean(banner.active) : true;
    $('banner-modal-title').textContent = banner ? `Edit Banner: ${banner.title}` : 'Add Promotional Banner';
    updateSingleImagePreview('ban-image-url', 'ban-image-preview');
    openModal('banner-modal');
  }

  async function handleBannerSubmit(e) {
    e.preventDefault();
    const id = $('ban-id').value;
    const payload = {
      title: $('ban-title').value.trim(),
      subtitle: $('ban-subtitle').value.trim(),
      badge_text: $('ban-badge').value.trim(),
      position: $('ban-position').value,
      link_url: $('ban-link').value.trim(),
      display_order: Number($('ban-order').value || 0),
      image_url: $('ban-image-url').value.trim(),
      active: $('ban-active').checked
    };

    if (!payload.title) {
      showToast('Banner title is required', 'error');
      return;
    }

    const btn = $('ban-save-btn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      if (id) {
        await apiFetch(`/api/admin/banners/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Banner updated');
      } else {
        await apiFetch('/api/admin/banners', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Banner created');
      }
      closeModal('banner-modal');
      await Promise.all([loadBannersAndSettings(), loadDashboard()]);
    } catch (err) {
      showToast(err.message || 'Failed to save banner', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function handleSettingsSubmit(e) {
    e.preventDefault();
    const btn = $('save-settings-btn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const payload = {
        store_name: $('set-store-name').value.trim(),
        whatsapp_number: $('set-whatsapp').value.trim(),
        promo_notice: $('set-promo').value.trim(),
        instagram_url: $('set-instagram').value.trim(),
        dispatch_notice: $('set-dispatch').value.trim(),
        maintenance_mode: $('set-maintenance').checked ? 'true' : 'false'
      };
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.settings = res.data || payload;
      showToast('Store settings saved');
      await loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    const currentPassword = $('pw-current').value;
    const newPassword = $('pw-new').value;
    const confirmPassword = $('pw-confirm').value;

    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }

    const btn = $('save-password-btn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await apiFetch('/api/admin/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      $('password-form').reset();
      showToast('Administrator password updated');
      await loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function handleBackupDownload() {
    const btn = $('download-backup-btn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Preparing...';

    try {
      const res = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${state.token}` },
        cache: 'no-store'
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) throw new Error('Backup export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accessify-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Database backup downloaded');
    } catch (err) {
      showToast(err.message || 'Backup export failed', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function updateSingleImagePreview(inputId, previewId) {
    const val = $(inputId)?.value.trim();
    const box = $(previewId);
    if (!box) return;
    if (!val) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `<img src="${escapeHtml(val)}" alt="Preview" style="width:96px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border-subtle);" onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'" />`;
  }

  // =========================================================================
  // TAB SWITCHING & GLOBAL EVENT WIRING
  // =========================================================================
  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `panel-${tabName}`);
    });
  }

  function bindEvents() {
    // Login & Logout
    $('login-form').addEventListener('submit', handleLoginSubmit);
    $('logout-btn').addEventListener('click', handleLogout);
    $('refresh-dashboard-btn').addEventListener('click', async () => {
      await syncAllData();
      showToast('Synchronized with database', 'info');
    });

    // Tab navigation
    document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Modal close buttons + Escape key + Backdrop click
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => closeModal(m.id));
      }
    });

    // Confirm Modal Action
    $('confirm-yes-btn').addEventListener('click', async () => {
      if (!state.confirmCallback) return;
      const btn = $('confirm-yes-btn');
      btn.disabled = true;
      try {
        await state.confirmCallback();
        closeModal('confirm-modal');
      } finally {
        btn.disabled = false;
        state.confirmCallback = null;
      }
    });

    // Product Filters (debounced search)
    let prodSearchTimer = null;
    $('filter-search').addEventListener('input', () => {
      clearTimeout(prodSearchTimer);
      prodSearchTimer = setTimeout(loadProducts, 220);
    });
    $('filter-section').addEventListener('change', () => {
      syncFilterCategoryOptions();
      loadProducts();
    });
    $('filter-category').addEventListener('change', loadProducts);
    $('filter-status').addEventListener('change', loadProducts);
    $('filter-sort').addEventListener('change', loadProducts);
    $('reset-filters-btn').addEventListener('click', () => {
      $('filter-search').value = '';
      $('filter-section').value = 'all';
      syncFilterCategoryOptions();
      $('filter-category').value = 'all';
      $('filter-status').value = 'all';
      $('filter-sort').value = 'newest';
      loadProducts();
    });

    // Product Actions (Delegated on tbody)
    $('open-add-product-btn').addEventListener('click', () => openProductModal(null));
    $('products-tbody').addEventListener('click', (e) => {
      const editId = e.target.dataset.editProd;
      if (editId) {
        const prod = state.products.find((p) => p.id === editId);
        if (prod) openProductModal(prod);
        return;
      }

      const statusId = e.target.dataset.statusProd;
      if (statusId) {
        updateProductStatusQuick(statusId, e.target.dataset.nextStatus);
        return;
      }

      const stepVal = e.target.dataset.stockStep;
      if (stepVal) {
        const pid = e.target.dataset.prodId;
        const input = document.querySelector(`input[data-stock-input="${CSS.escape(pid)}"]`);
        const nextVal = Math.max(0, (Number(input?.value) || 0) + Number(stepVal));
        if (input) input.value = nextVal;
        updateProductStockQuick(pid, nextVal);
        return;
      }

      const delId = e.target.dataset.delProd;
      if (delId) {
        const name = e.target.dataset.prodName || delId;
        openConfirm({
          title: 'Delete Product',
          message: `Permanently delete "${name}" from database and remove it immediately from all customer storefronts?`,
          confirmText: 'Delete Product',
          onConfirm: async () => {
            try {
              await apiFetch(`/api/admin/products/${encodeURIComponent(delId)}`, { method: 'DELETE' });
              showToast(`Deleted "${name}"`);
              await Promise.all([loadProducts(), loadCategories(), loadDashboard()]);
            } catch (err) {
              showToast(err.message || 'Delete failed', 'error');
            }
          }
        });
      }
    });

    $('products-tbody').addEventListener('change', (e) => {
      const pid = e.target.dataset.stockInput;
      if (pid) {
        updateProductStockQuick(pid, e.target.value);
      }
    });

    // Product Modal Controls & Multi-image Dropzone
    $('prod-section').addEventListener('change', () => {
      syncProductModalCategoryOptions('');
    });
    $('prod-price').addEventListener('input', updateDiscountPreview);
    $('prod-compare-price').addEventListener('input', updateDiscountPreview);

    document.querySelectorAll('[data-variant-preset]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const existing = $('prod-variants')
          .value.split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const incoming = chip.dataset.variantPreset
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        incoming.forEach((v) => {
          if (!existing.includes(v)) existing.push(v);
        });
        $('prod-variants').value = existing.join(', ');
      });
    });

    const dropzone = $('prod-dropzone');
    const fileInput = $('prod-upload');
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleProductFilesSelected(e.dataTransfer.files);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        handleProductFilesSelected(e.target.files);
      }
    });

    $('prod-add-url-btn').addEventListener('click', () => {
      const raw = $('prod-image-url-input').value.trim();
      if (!raw) return;
      if (!/^(\/|https?:\/\/|data:image\/)/i.test(raw)) {
        showToast('Image URL must start with /, http://, or https://', 'error');
        return;
      }
      if (!state.modalImages.includes(raw)) {
        state.modalImages.push(raw);
        renderModalImagePreviewStrip();
      }
      $('prod-image-url-input').value = '';
    });

    $('prod-image-preview-strip').addEventListener('click', (e) => {
      const delIdx = e.target.dataset.imgDel;
      if (delIdx !== undefined) {
        state.modalImages.splice(Number(delIdx), 1);
        renderModalImagePreviewStrip();
        return;
      }

      const moveDir = e.target.dataset.imgMove;
      if (moveDir !== undefined) {
        const idx = Number(e.target.dataset.imgIdx);
        const target = idx + Number(moveDir);
        if (target >= 0 && target < state.modalImages.length) {
          const tmp = state.modalImages[idx];
          state.modalImages[idx] = state.modalImages[target];
          state.modalImages[target] = tmp;
          renderModalImagePreviewStrip();
        }
      }
    });

    $('product-form').addEventListener('submit', handleProductSubmit);

    // Categories Actions
    $('cat-filter-section').addEventListener('change', renderCategoriesGrid);
    $('open-add-category-btn').addEventListener('click', () => openCategoryModal(null));
    $('category-form').addEventListener('submit', handleCategorySubmit);
    $('cat-image').addEventListener('input', () => updateSingleImagePreview('cat-image', 'cat-image-preview'));
    $('cat-image-upload').addEventListener('change', async (e) => {
      if (!e.target.files?.length) return;
      try {
        const urls = await uploadImageFiles(e.target.files);
        if (urls[0]) {
          $('cat-image').value = urls[0];
          updateSingleImagePreview('cat-image', 'cat-image-preview');
          showToast('Category image uploaded');
        }
      } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
      } finally {
        e.target.value = '';
      }
    });
    $('categories-grid').addEventListener('click', (e) => {
      const editId = e.target.dataset.editCat;
      if (editId) {
        const cat = state.categories.find((c) => c.id === editId);
        if (cat) openCategoryModal(cat);
        return;
      }
      const delId = e.target.dataset.delCat;
      if (delId) {
        const name = e.target.dataset.catName || delId;
        openConfirm({
          title: 'Delete Category',
          message: `Delete category "${name}"? Existing products keeping this category tag remain untouched in inventory.`,
          confirmText: 'Delete Category',
          onConfirm: async () => {
            try {
              await apiFetch(`/api/admin/categories/${encodeURIComponent(delId)}`, { method: 'DELETE' });
              showToast(`Deleted category "${name}"`);
              await Promise.all([loadCategories(), loadDashboard()]);
            } catch (err) {
              showToast(err.message || 'Delete failed', 'error');
            }
          }
        });
      }
    });

    // Orders Actions
    let orderSearchTimer = null;
    $('order-filter-search').addEventListener('input', () => {
      clearTimeout(orderSearchTimer);
      orderSearchTimer = setTimeout(loadOrders, 220);
    });
    $('order-filter-status').addEventListener('change', loadOrders);
    $('open-add-order-btn').addEventListener('click', () => openOrderModal(null));
    $('ord-customer-select').addEventListener('change', (e) => {
      const cust = state.customers.find((c) => c.id === e.target.value);
      if (cust) {
        $('ord-customer-name').value = cust.name || '';
        $('ord-customer-phone').value = cust.phone || '';
        $('ord-customer-email').value = cust.email || '';
        $('ord-shipping-address').value = [cust.address, cust.city].filter(Boolean).join(', ');
      }
    });
    $('ord-add-item-btn').addEventListener('click', () => {
      state.orderLineItems.push({ name: '', qty: 1, price: 0 });
      renderOrderLineItems();
    });
    $('ord-items-list').addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.itemIdx);
      const field = e.target.dataset.itemField;
      if (!Number.isNaN(idx) && field && state.orderLineItems[idx]) {
        state.orderLineItems[idx][field] = field === 'name' ? e.target.value : Number(e.target.value || 0);
        recalculateOrderTotals();
      }
    });
    $('ord-items-list').addEventListener('click', (e) => {
      const idx = e.target.dataset.itemRemove;
      if (idx !== undefined) {
        state.orderLineItems.splice(Number(idx), 1);
        renderOrderLineItems();
        recalculateOrderTotals();
      }
    });
    $('ord-discount').addEventListener('input', recalculateOrderTotals);
    $('order-form').addEventListener('submit', handleOrderSubmit);

    $('orders-tbody').addEventListener('change', async (e) => {
      const orderIdPay = e.target.dataset.orderPay;
      if (orderIdPay) {
        try {
          await apiFetch(`/api/admin/orders/${encodeURIComponent(orderIdPay)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ payment_status: e.target.value })
          });
          showToast('Payment status updated');
          await Promise.all([loadOrders(), loadDashboard()]);
        } catch (err) {
          showToast(err.message || 'Update failed', 'error');
        }
        return;
      }

      const orderIdStat = e.target.dataset.orderStat;
      if (orderIdStat) {
        try {
          await apiFetch(`/api/admin/orders/${encodeURIComponent(orderIdStat)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ order_status: e.target.value })
          });
          showToast('Order status updated');
          await Promise.all([loadOrders(), loadDashboard()]);
        } catch (err) {
          showToast(err.message || 'Update failed', 'error');
        }
      }
    });

    $('orders-tbody').addEventListener('click', (e) => {
      const editId = e.target.dataset.editOrder;
      if (editId) {
        const order = state.orders.find((o) => o.id === editId);
        if (order) openOrderModal(order);
        return;
      }
      const delId = e.target.dataset.delOrder;
      if (delId) {
        const num = e.target.dataset.orderNum || delId;
        openConfirm({
          title: 'Delete Order',
          message: `Permanently delete order ${num}?`,
          confirmText: 'Delete Order',
          onConfirm: async () => {
            try {
              await apiFetch(`/api/admin/orders/${encodeURIComponent(delId)}`, { method: 'DELETE' });
              showToast(`Deleted order ${num}`);
              await Promise.all([loadOrders(), loadDashboard()]);
            } catch (err) {
              showToast(err.message || 'Delete failed', 'error');
            }
          }
        });
      }
    });

    // Customers Actions
    let custSearchTimer = null;
    $('cust-filter-search').addEventListener('input', () => {
      clearTimeout(custSearchTimer);
      custSearchTimer = setTimeout(loadCustomers, 220);
    });
    $('open-add-customer-btn').addEventListener('click', () => openCustomerModal(null));
    $('customer-form').addEventListener('submit', handleCustomerSubmit);
    $('customers-tbody').addEventListener('click', (e) => {
      const editId = e.target.dataset.editCust;
      if (editId) {
        const cust = state.customers.find((c) => c.id === editId);
        if (cust) openCustomerModal(cust);
        return;
      }
      const delId = e.target.dataset.delCust;
      if (delId) {
        const name = e.target.dataset.custName || delId;
        openConfirm({
          title: 'Delete Customer',
          message: `Delete customer "${name}" from records?`,
          confirmText: 'Delete Customer',
          onConfirm: async () => {
            try {
              await apiFetch(`/api/admin/customers/${encodeURIComponent(delId)}`, { method: 'DELETE' });
              showToast(`Deleted customer "${name}"`);
              await Promise.all([loadCustomers(), loadDashboard()]);
            } catch (err) {
              showToast(err.message || 'Delete failed', 'error');
            }
          }
        });
      }
    });

    // Banners, Settings, Password & Backup Actions
    $('open-add-banner-btn').addEventListener('click', () => openBannerModal(null));
    $('banner-form').addEventListener('submit', handleBannerSubmit);
    $('ban-image-url').addEventListener('input', () => updateSingleImagePreview('ban-image-url', 'ban-image-preview'));
    $('ban-image-upload').addEventListener('change', async (e) => {
      if (!e.target.files?.length) return;
      try {
        const urls = await uploadImageFiles(e.target.files);
        if (urls[0]) {
          $('ban-image-url').value = urls[0];
          updateSingleImagePreview('ban-image-url', 'ban-image-preview');
          showToast('Banner image uploaded');
        }
      } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
      } finally {
        e.target.value = '';
      }
    });
    $('banners-grid').addEventListener('click', async (e) => {
      const toggleId = e.target.dataset.toggleBan;
      if (toggleId) {
        try {
          await apiFetch(`/api/admin/banners/${encodeURIComponent(toggleId)}`, {
            method: 'PUT',
            body: JSON.stringify({ active: e.target.dataset.banActive === '1' })
          });
          showToast('Banner visibility updated');
          await loadBannersAndSettings();
        } catch (err) {
          showToast(err.message || 'Banner toggle failed', 'error');
        }
        return;
      }

      const editId = e.target.dataset.editBan;
      if (editId) {
        const ban = state.banners.find((b) => b.id === editId);
        if (ban) openBannerModal(ban);
        return;
      }

      const delId = e.target.dataset.delBan;
      if (delId) {
        const title = e.target.dataset.banTitle || delId;
        openConfirm({
          title: 'Delete Banner',
          message: `Permanently delete banner "${title}"?`,
          confirmText: 'Delete Banner',
          onConfirm: async () => {
            try {
              await apiFetch(`/api/admin/banners/${encodeURIComponent(delId)}`, { method: 'DELETE' });
              showToast(`Deleted banner "${title}"`);
              await Promise.all([loadBannersAndSettings(), loadDashboard()]);
            } catch (err) {
              showToast(err.message || 'Delete failed', 'error');
            }
          }
        });
      }
    });

    $('store-settings-form').addEventListener('submit', handleSettingsSubmit);
    $('password-form').addEventListener('submit', handlePasswordSubmit);
    $('download-backup-btn').addEventListener('click', handleBackupDownload);
    $('refresh-logs-btn').addEventListener('click', async () => {
      await loadDashboard();
      showToast('Audit logs refreshed', 'info');
    });
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    checkExistingSession();
  });
})();
