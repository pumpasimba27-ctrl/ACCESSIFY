/**
 * ACCESSIFY — SECURE ADMIN CONTROL ENGINE
 * DIRECT CENTRAL DATABASE MANAGEMENT & REAL-TIME SYNC
 */

(function () {
  'use strict';

  const API_BASE = '/api';
  let adminToken = sessionStorage.getItem('accessify_admin_token') || localStorage.getItem('accessify_admin_token') || '';
  let allAdminProducts = [];
  let allCategories = [];
  let editingProductId = null;
  let deletingProductId = null;

  // DOM Elements
  const el = {
    loginWrapper: document.getElementById('login-wrapper'),
    loginForm: document.getElementById('login-form'),
    loginUser: document.getElementById('login-user'),
    loginPass: document.getElementById('login-pass'),
    loginAlert: document.getElementById('login-alert'),

    adminApp: document.getElementById('admin-app'),
    adminUserDisplay: document.getElementById('admin-user-display'),
    logoutBtn: document.getElementById('logout-btn'),
    dbVersionBadge: document.getElementById('db-version-badge'),

    // Stats
    statTotal: document.getElementById('stat-total'),
    statAccessories: document.getElementById('stat-accessories'),
    statClothing: document.getElementById('stat-clothing'),
    statAvailable: document.getElementById('stat-available'),
    statSoldOut: document.getElementById('stat-sold-out'),
    statCategories: document.getElementById('stat-categories'),
    statClients: document.getElementById('stat-clients'),

    // Toolbar
    adminSearch: document.getElementById('admin-search'),
    adminSectionFilter: document.getElementById('admin-section-filter'),
    adminCatFilter: document.getElementById('admin-cat-filter'),
    adminStatusFilter: document.getElementById('admin-status-filter'),
    addProductBtn: document.getElementById('add-product-btn'),
    manageCatsBtn: document.getElementById('manage-cats-btn'),

    // Table
    productsTableBody: document.getElementById('products-table-body'),
    tableLoading: document.getElementById('table-loading'),

    // Add/Edit Modal
    productModal: document.getElementById('product-modal'),
    productModalTitle: document.getElementById('product-modal-title'),
    productForm: document.getElementById('product-form'),
    prodSection: document.getElementById('prod-section'),
    prodName: document.getElementById('prod-name'),
    prodCategory: document.getElementById('prod-category'),
    prodPrice: document.getElementById('prod-price'),
    prodComparePrice: document.getElementById('prod-compare-price'),
    prodStock: document.getElementById('prod-stock'),
    prodStatus: document.getElementById('prod-status'),
    prodImages: document.getElementById('prod-images'),
    prodUpload: document.getElementById('prod-upload'),
    prodVariants: document.getElementById('prod-variants'),
    prodDesc: document.getElementById('prod-desc'),
    prodFeatured: document.getElementById('prod-featured'),
    prodNewArrival: document.getElementById('prod-new-arrival'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalAlert: document.getElementById('modal-alert'),

    // Delete Modal
    deleteModal: document.getElementById('delete-modal'),
    deleteProdName: document.getElementById('delete-prod-name'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),

    // Category Modal
    catModal: document.getElementById('cat-modal'),
    catList: document.getElementById('cat-list'),
    catNameInput: document.getElementById('cat-name-input'),
    catSectionInput: document.getElementById('cat-section-input'),
    addCatBtn: document.getElementById('add-cat-btn'),
    catCloseBtn: document.getElementById('cat-close-btn'),

    // Audit list
    auditList: document.getElementById('audit-list')
  };

  // -------------------------------------------------------------
  // AUTHENTICATION SYSTEM
  // -------------------------------------------------------------
  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };
  }

  async function checkAuth() {
    if (!adminToken) {
      showLogin();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/me`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        showAdminApp(data.user);
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    adminToken = '';
    sessionStorage.removeItem('accessify_admin_token');
    localStorage.removeItem('accessify_admin_token');
    el.loginWrapper.style.display = 'flex';
    el.adminApp.style.display = 'none';
  }

  function showAdminApp(user) {
    el.loginWrapper.style.display = 'none';
    el.adminApp.style.display = 'block';
    if (el.adminUserDisplay) el.adminUserDisplay.textContent = user.username;
    loadDashboard();
    loadCategories();
    loadProducts();
    initAdminSSE();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = el.loginUser.value.trim();
    const password = el.loginPass.value.trim();

    el.loginAlert.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        adminToken = data.token;
        sessionStorage.setItem('accessify_admin_token', adminToken);
        showAdminApp(data.user);
      } else {
        el.loginAlert.textContent = data.error || 'Invalid credentials';
        el.loginAlert.style.display = 'block';
      }
    } catch (err) {
      el.loginAlert.textContent = 'Server connection error. Please try again.';
      el.loginAlert.style.display = 'block';
    }
  }

  function handleLogout() {
    fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      headers: getHeaders()
    }).finally(() => {
      showLogin();
    });
  }

  // -------------------------------------------------------------
  // DASHBOARD METRICS & AUDIT
  // -------------------------------------------------------------
  async function loadDashboard() {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        if (el.statTotal) el.statTotal.textContent = s.total;
        if (el.statAccessories) el.statAccessories.textContent = s.accessoriesTotal || 0;
        if (el.statClothing) el.statClothing.textContent = s.clothingTotal || 0;
        if (el.statAvailable) el.statAvailable.textContent = s.available;
        if (el.statSoldOut) el.statSoldOut.textContent = s.soldOut;
        if (el.statCategories) el.statCategories.textContent = s.categoriesCount;
        if (el.statClients) el.statClients.textContent = data.connectedClients || 1;
        if (el.dbVersionBadge) el.dbVersionBadge.textContent = `● CENTRAL DB (v${String(s.dbVersion).slice(-6)})`;

        // Render audit logs
        if (el.auditList && Array.isArray(data.auditLogs)) {
          let html = '';
          data.auditLogs.slice(0, 15).forEach(log => {
            html += `
              <div class="audit-item">
                <span class="audit-action">${escapeHtml(log.action)}: ${escapeHtml(log.details)}</span>
                <span class="audit-time">${log.timestamp}</span>
              </div>
            `;
          });
          el.auditList.innerHTML = html || '<div style="color: var(--admin-text-subtle); padding: 0.5rem;">No recent logs</div>';
        }
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    }
  }

  // -------------------------------------------------------------
  // CATEGORIES MANAGEMENT & DYNAMIC SECTION FILTERING
  // -------------------------------------------------------------
  function populateFormCategories(section, currentCatId) {
    if (!el.prodCategory) return;
    const sec = (section || 'accessories').toLowerCase();
    const matching = allCategories.filter(c => (c.section || 'accessories').toLowerCase() === sec);
    let html = '';
    if (matching.length === 0) {
      html = `<option value="">-- No ${sec.toUpperCase()} categories yet (Create one in CATEGORIES) --</option>`;
    } else {
      matching.forEach(c => {
        const sel = (c.id === currentCatId) ? 'selected' : '';
        html += `<option value="${c.id}" ${sel}>${escapeHtml(c.name)}</option>`;
      });
    }
    el.prodCategory.innerHTML = html;
  }

  async function loadCategories() {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        allCategories = data.data;

        // Populate Category Filter dropdown with section tags
        let filterHtml = '<option value="all">ALL CATEGORIES</option>';
        allCategories.forEach(cat => {
          const secBadge = (cat.section === 'clothing') ? '[CLOTHING]' : '[ACCESSORIES]';
          filterHtml += `<option value="${cat.id}">${secBadge} ${escapeHtml(cat.name)} (${cat.count || 0})</option>`;
        });

        if (el.adminCatFilter) el.adminCatFilter.innerHTML = filterHtml;

        // Sync modal category list to currently selected section
        if (el.prodSection) {
          populateFormCategories(el.prodSection.value);
        }

        renderCategoryManagerList();
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function renderCategoryManagerList() {
    if (!el.catList) return;
    let html = '';
    allCategories.forEach(c => {
      const isClo = (c.section === 'clothing');
      const secBadge = isClo
        ? `<span style="background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); font-weight: 700; font-size: 0.6875rem; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; margin-left: 0.5rem;">CLOTHING</span>`
        : `<span style="background: rgba(96, 165, 250, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3); font-weight: 700; font-size: 0.6875rem; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; margin-left: 0.5rem;">ACCESSORIES</span>`;

      html += `
        <div class="audit-item" style="margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center;">
            <strong style="color: #fff;">${escapeHtml(c.name)}</strong>
            ${secBadge}
            <span style="color: var(--admin-text-subtle); margin-left: 0.5rem; font-size: 0.75rem;">(ID: ${c.id})</span>
          </div>
          <span class="badge-status available">${c.count || 0} Products</span>
        </div>
      `;
    });
    el.catList.innerHTML = html;
  }

  async function handleAddCategory() {
    const name = el.catNameInput.value.trim();
    if (!name) return;
    const section = el.catSectionInput ? el.catSectionInput.value : 'accessories';

    try {
      const res = await fetch(`${API_BASE}/admin/categories`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, section })
      });
      const data = await res.json();
      if (data.success) {
        el.catNameInput.value = '';
        loadCategories();
        loadDashboard();
      }
    } catch (e) {
      alert('Failed to add category');
    }
  }

  // -------------------------------------------------------------
  // PRODUCTS CATALOG MANAGEMENT (CRUD)
  // -------------------------------------------------------------
  async function loadProducts() {
    el.tableLoading.style.display = 'block';
    el.productsTableBody.innerHTML = '';

    try {
      const params = new URLSearchParams();
      const q = el.adminSearch.value.trim();
      const sec = el.adminSectionFilter ? el.adminSectionFilter.value : 'all';
      const cat = el.adminCatFilter.value;
      const status = el.adminStatusFilter.value;

      if (q) params.append('search', q);
      if (sec && sec !== 'all') params.append('section', sec);
      if (cat && cat !== 'all') params.append('category', cat);
      if (status && status !== 'all') params.append('status', status);

      const res = await fetch(`${API_BASE}/admin/products?${params.toString()}`, {
        headers: getHeaders()
      });
      const data = await res.json();

      el.tableLoading.style.display = 'none';

      if (data.success && Array.isArray(data.data)) {
        allAdminProducts = data.data;
        renderProductsTable(allAdminProducts);
      }
    } catch (err) {
      el.tableLoading.style.display = 'none';
      console.error('Error loading products for admin:', err);
    }
  }

  function renderProductsTable(products) {
    if (products.length === 0) {
      el.productsTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem; color: var(--admin-text-subtle);">
            No products match the selected criteria.
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    products.forEach(p => {
      const thumb = (p.images && p.images[0]) || 'https://cdn.zepio.io/blyo/product/ebbe65b3-b81a-448b-a644-09c752b39a3b.webp';
      const isSoldOut = p.status === 'sold_out' || (p.stock !== undefined && p.stock <= 0);
      const isHidden = p.status === 'hidden';
      const isClothing = (p.section === 'clothing');

      let statusBadgeClass = 'available';
      let statusText = 'IN STOCK';
      if (isHidden) {
        statusBadgeClass = 'hidden';
        statusText = 'HIDDEN';
      } else if (isSoldOut) {
        statusBadgeClass = 'sold_out';
        statusText = 'SOLD OUT';
      }

      const secBadge = isClothing
        ? `<span style="background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); font-weight: 700; font-size: 0.6875rem; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; display: inline-block;">CLOTHING</span>`
        : `<span style="background: rgba(96, 165, 250, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3); font-weight: 700; font-size: 0.6875rem; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; display: inline-block;">ACCESSORIES</span>`;

      rowsHtml += `
        <tr data-row-id="${p.id}">
          <td>
            <img src="${escapeHtml(thumb)}" alt="" class="table-thumb" loading="lazy">
          </td>
          <td>
            <div class="table-prod-name">${escapeHtml(p.name)}</div>
            <div class="table-prod-meta">
              <span>ID: ${p.id}</span>
              <span>•</span>
              <span>SKU: ${escapeHtml(p.sku_code || 'N/A')}</span>
            </div>
          </td>
          <td>
            ${secBadge}
          </td>
          <td>
            <span style="text-transform: uppercase; font-weight: 600; font-size: 0.75rem;">
              ${escapeHtml(p.category)}
            </span>
          </td>
          <td>
            <strong style="color: #fff;">₹${Number(p.price).toLocaleString('en-IN')}</strong>
            ${p.comparePrice ? `<div style="text-decoration: line-through; color: var(--admin-text-subtle); font-size: 0.75rem;">₹${Number(p.comparePrice).toLocaleString('en-IN')}</div>` : ''}
          </td>
          <td>
            <span>${p.stock !== undefined ? p.stock : 25}</span>
          </td>
          <td>
            <span class="badge-status ${statusBadgeClass}">${statusText}</span>
          </td>
          <td>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <!-- Quick Availability Toggle -->
              <button class="admin-btn admin-btn-secondary admin-btn-sm toggle-status-btn" data-id="${p.id}" data-current="${p.status}">
                ${isSoldOut ? 'Mark Available' : 'Mark Sold Out'}
              </button>

              <!-- Edit Button -->
              <button class="admin-btn admin-btn-secondary admin-btn-sm edit-prod-btn" data-id="${p.id}">
                Edit
              </button>

              <!-- Delete Button -->
              <button class="admin-btn admin-btn-danger admin-btn-sm delete-prod-btn" data-id="${p.id}" data-name="${escapeHtml(p.name)}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    el.productsTableBody.innerHTML = rowsHtml;
    attachTableActions();
  }

  function attachTableActions() {
    // Quick Status Toggle
    el.productsTableBody.querySelectorAll('.toggle-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const current = btn.getAttribute('data-current');
        const newStatus = (current === 'sold_out') ? 'available' : 'sold_out';

        try {
          const res = await fetch(`${API_BASE}/admin/products/${id}/status`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ status: newStatus })
          });
          const data = await res.json();
          if (data.success) {
            loadDashboard();
            loadProducts();
          }
        } catch (e) {
          alert('Failed to update status');
        }
      });
    });

    // Edit Modal Trigger
    el.productsTableBody.querySelectorAll('.edit-prod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const p = allAdminProducts.find(x => x.id === id);
        if (p) openEditModal(p);
      });
    });

    // Delete Modal Trigger
    el.productsTableBody.querySelectorAll('.delete-prod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        openDeleteModal(id, name);
      });
    });
  }

  // -------------------------------------------------------------
  // ADD & EDIT PRODUCT MODAL LOGIC
  // -------------------------------------------------------------
  function openAddModal() {
    editingProductId = null;
    el.productModalTitle.textContent = 'ADD NEW PRODUCT TO CATALOG';
    el.productForm.reset();
    el.modalAlert.style.display = 'none';

    if (el.prodSection) {
      const curFilter = el.adminSectionFilter ? el.adminSectionFilter.value : 'all';
      el.prodSection.value = (curFilter === 'clothing') ? 'clothing' : 'accessories';
      populateFormCategories(el.prodSection.value);
    }

    el.prodStatus.value = 'available';
    el.prodStock.value = 25;
    el.prodFeatured.checked = false;
    el.prodNewArrival.checked = true;
    el.productModal.classList.add('open');
  }

  function openEditModal(p) {
    editingProductId = p.id;
    el.productModalTitle.textContent = `EDIT PRODUCT: ${p.name}`;
    el.modalAlert.style.display = 'none';

    if (el.prodSection) {
      el.prodSection.value = p.section || 'accessories';
      populateFormCategories(el.prodSection.value, p.category);
    }

    el.prodName.value = p.name || '';
    if (el.prodCategory) el.prodCategory.value = p.category || '';
    el.prodPrice.value = p.price || 0;
    el.prodComparePrice.value = p.comparePrice || '';
    el.prodStock.value = p.stock !== undefined ? p.stock : 25;
    el.prodStatus.value = p.status || 'available';
    el.prodImages.value = Array.isArray(p.images) ? p.images.join('\n') : '';
    el.prodVariants.value = Array.isArray(p.variants) ? p.variants.join(', ') : '';
    el.prodDesc.value = p.description || '';
    el.prodFeatured.checked = Boolean(p.featured);
    el.prodNewArrival.checked = Boolean(p.newArrival);

    el.productModal.classList.add('open');
  }

  function closeProductModal() {
    editingProductId = null;
    el.productModal.classList.remove('open');
  }

  // Handle Multi-file Upload
  async function handleFileUpload(files) {
    if (!files || files.length === 0) return [];
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      const res = await fetch(`${API_BASE}/admin/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.urls)) {
        return data.urls;
      }
    } catch (e) {
      console.error('File upload failed:', e);
    }
    return [];
  }

  async function handleProductFormSubmit(e) {
    e.preventDefault();
    el.modalAlert.style.display = 'none';

    const section = el.prodSection ? el.prodSection.value : 'accessories';
    const name = el.prodName.value.trim();
    const category = el.prodCategory.value;
    const price = parseFloat(el.prodPrice.value);
    const comparePrice = el.prodComparePrice.value ? parseFloat(el.prodComparePrice.value) : null;
    const stock = parseInt(el.prodStock.value) || 0;
    const status = el.prodStatus.value;
    const description = el.prodDesc.value.trim();
    const featured = el.prodFeatured.checked;
    const newArrival = el.prodNewArrival.checked;

    // Process image URLs
    let images = el.prodImages.value
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);

    // If file inputs were selected, upload them now
    if (el.prodUpload.files && el.prodUpload.files.length > 0) {
      const uploadedUrls = await handleFileUpload(el.prodUpload.files);
      images = [...images, ...uploadedUrls];
    }

    // Process variants
    const variants = el.prodVariants.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!name || !category || isNaN(price)) {
      el.modalAlert.textContent = 'Name, Category, and Valid Price are required.';
      el.modalAlert.style.display = 'block';
      return;
    }

    const payload = {
      name,
      section,
      category,
      price,
      comparePrice,
      stock,
      status,
      description,
      images,
      variants,
      featured,
      newArrival
    };

    try {
      let res;
      if (editingProductId) {
        res = await fetch(`${API_BASE}/admin/products/${editingProductId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_BASE}/admin/products`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        closeProductModal();
        loadDashboard();
        loadProducts();
      } else {
        el.modalAlert.textContent = data.error || 'Operation failed';
        el.modalAlert.style.display = 'block';
      }
    } catch (err) {
      el.modalAlert.textContent = 'Network error saving product';
      el.modalAlert.style.display = 'block';
    }
  }

  // -------------------------------------------------------------
  // DELETE PRODUCT LOGIC
  // -------------------------------------------------------------
  function openDeleteModal(id, name) {
    deletingProductId = id;
    el.deleteProdName.textContent = name;
    el.deleteModal.classList.add('open');
  }

  function closeDeleteModal() {
    deletingProductId = null;
    el.deleteModal.classList.remove('open');
  }

  async function handleConfirmDelete() {
    if (!deletingProductId) return;

    try {
      const res = await fetch(`${API_BASE}/admin/products/${deletingProductId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        closeDeleteModal();
        loadDashboard();
        loadProducts();
      } else {
        alert(data.error || 'Failed to delete product');
      }
    } catch (e) {
      alert('Network error deleting product');
    }
  }

  // -------------------------------------------------------------
  // ADMIN REAL-TIME SSE LISTENER
  // -------------------------------------------------------------
  function initAdminSSE() {
    if (!window.EventSource) return;

    try {
      const sse = new EventSource('/api/events');
      sse.addEventListener('catalog_update', (event) => {
        loadDashboard();
      });
    } catch (e) {
      console.warn('Admin SSE failed');
    }
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS
  // -------------------------------------------------------------
  function initListeners() {
    el.loginForm?.addEventListener('submit', handleLogin);
    el.logoutBtn?.addEventListener('click', handleLogout);

    // Toolbar filters & search
    el.adminSearch?.addEventListener('input', debounce(loadProducts, 300));
    el.adminSectionFilter?.addEventListener('change', loadProducts);
    el.adminCatFilter?.addEventListener('change', loadProducts);
    el.adminStatusFilter?.addEventListener('change', loadProducts);

    // Section Selector Dynamic Category Filter
    el.prodSection?.addEventListener('change', () => {
      populateFormCategories(el.prodSection.value);
    });

    // Add Product
    el.addProductBtn?.addEventListener('click', openAddModal);
    el.modalCancelBtn?.addEventListener('click', closeProductModal);
    el.productForm?.addEventListener('submit', handleProductFormSubmit);

    // Delete
    el.confirmDeleteBtn?.addEventListener('click', handleConfirmDelete);
    el.cancelDeleteBtn?.addEventListener('click', closeDeleteModal);

    // Categories
    el.manageCatsBtn?.addEventListener('click', () => {
      el.catModal.classList.add('open');
    });
    el.catCloseBtn?.addEventListener('click', () => {
      el.catModal.classList.remove('open');
    });
    el.addCatBtn?.addEventListener('click', handleAddCategory);
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Init
  initListeners();
  checkAuth();

})();

