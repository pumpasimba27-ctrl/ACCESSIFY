/**
 * ACCESSIFY — STOREFRONT APPLICATION ENGINE
 * REAL-TIME SYNCHRONIZED CATALOGUE & WHATSAPP ORDERING SYSTEM
 * DUAL SHOPPING DEPARTMENTS: ACCESSORIES // CLOTHING
 * BRAND: ACCESSIFY (WA: +91 7012400815)
 */

(function () {
  'use strict';

  // Constants
  const WHATSAPP_NUMBER = '917012400815';
  const API_BASE = '/api';

  // Global State
  let allProducts = [];
  let allCategories = [];
  let currentSection = 'accessories';
  let currentCategory = 'all';
  let currentSort = 'default';
  let currentSearchQuery = '';
  let activeProduct = null;
  let activeVariant = '';
  let currentDbVersion = null;
  let sseSource = null;
  let originalAccessoriesVaultHtml = '';

  // Cart State (Persisted in localStorage)
  let cart = [];
  try {
    const saved = localStorage.getItem('accessify_cart_v1');
    if (saved) cart = JSON.parse(saved);
    if (!Array.isArray(cart)) cart = [];
  } catch (_) {
    cart = [];
  }

  // Payment configuration cache
  let paymentConfig = {
    upiId: '7012400815@upi',
    upiName: 'ACCESSIFY',
    whatsappNumber: '917012400815',
    deliveryCharge: 99,
    qrImage: '/assets/images/upi-qr.png'
  };

  // Selected screenshot file for checkout
  let checkoutScreenshotFile = null;
  let isSubmittingOrder = false;

  // DOM Elements Cache
  const el = {
    // Department Switcher Tabs
    headerDeptTabs: document.getElementById('header-dept-tabs'),
    mobileDeptTabs: document.getElementById('mobile-dept-tabs'),
    headerNav: document.getElementById('header-nav'),

    // Catalog & Vault Headers
    catalogSectionTitle: document.getElementById('catalog-section-title'),
    catalogSectionLabel: document.getElementById('catalog-section-label'),
    categoriesSection: document.getElementById('categories'),
    categoriesSectionTitle: document.getElementById('categories-section-title'),
    categoriesSectionLabel: document.getElementById('categories-section-label'),
    categoriesVaultGrid: document.getElementById('categories-vault-grid'),

    // Products Grid & Filters
    productsGrid: document.getElementById('products-grid'),
    catalogCount: document.getElementById('catalog-count'),
    categoryPills: document.getElementById('category-pills'),
    sortSelect: document.getElementById('sort-select'),
    heroExploreBtn: document.getElementById('hero-explore-btn'),
    heroWhatsappBtn: document.getElementById('hero-whatsapp-btn'),

    // Search Modal
    searchBtn: document.getElementById('search-btn'),
    searchModal: document.getElementById('search-modal'),
    searchCloseBtn: document.getElementById('search-close-btn'),
    searchInput: document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),
    searchResultCount: document.getElementById('search-result-count'),

    // Mobile Navigation Drawer
    menuToggle: document.getElementById('menu-toggle'),
    mobileNavDrawer: document.getElementById('mobile-nav-drawer'),
    mobileNavClose: document.getElementById('mobile-nav-close'),
    mobileNavLinks: document.getElementById('mobile-nav-links'),

    // PDP Modal
    pdpModal: document.getElementById('pdp-modal'),
    pdpCloseBtn: document.getElementById('pdp-close-btn'),
    pdpCategory: document.getElementById('pdp-category'),
    pdpTitle: document.getElementById('pdp-title'),
    pdpPrice: document.getElementById('pdp-price'),
    pdpMrp: document.getElementById('pdp-mrp'),
    pdpDiscount: document.getElementById('pdp-discount'),
    pdpStock: document.getElementById('pdp-stock'),
    pdpDesc: document.getElementById('pdp-desc'),
    pdpMainImg: document.getElementById('pdp-main-img'),
    pdpThumbs: document.getElementById('pdp-thumbs'),
    pdpVariantsBox: document.getElementById('pdp-variants-box'),
    pdpVariantsList: document.getElementById('pdp-variants-list'),
    pdpWhatsappBtn: document.getElementById('pdp-whatsapp-btn'),
    pdpAddCartBtn: document.getElementById('pdp-add-cart-btn'),
    pdpBuyNowBtn: document.getElementById('pdp-buy-now-btn'),
    pdpShareBtn: document.getElementById('pdp-share-btn'),
    pdpRelatedGrid: document.getElementById('pdp-related-grid'),

    // Sticky Mobile Bar
    stickyOrderBar: document.getElementById('sticky-mobile-order-bar'),
    stickyTitle: document.getElementById('sticky-title'),
    stickyPrice: document.getElementById('sticky-price'),
    stickyWhatsappBtn: document.getElementById('sticky-whatsapp-btn'),
    stickyAddCartBtn: document.getElementById('sticky-add-cart-btn'),
    stickyBuyNowBtn: document.getElementById('sticky-buy-now-btn'),

    // Cart Drawer Elements
    headerCartBtn: document.getElementById('header-cart-btn'),
    cartBadgeCount: document.getElementById('cart-badge-count'),
    cartDrawerOverlay: document.getElementById('cart-drawer-overlay'),
    cartDrawer: document.getElementById('cart-drawer'),
    cartDrawerClose: document.getElementById('cart-drawer-close'),
    cartHeaderCount: document.getElementById('cart-header-count'),
    cartItemsList: document.getElementById('cart-items-list'),
    cartSubtotalVal: document.getElementById('cart-subtotal-val'),
    cartTotalVal: document.getElementById('cart-total-val'),
    cartCheckoutBtn: document.getElementById('cart-checkout-btn'),

    // Checkout Modal Elements
    checkoutModalBackdrop: document.getElementById('checkout-modal-backdrop'),
    checkoutModal: document.getElementById('checkout-modal'),
    checkoutModalClose: document.getElementById('checkout-modal-close'),
    checkoutOrderForm: document.getElementById('checkout-order-form'),
    checkoutItemsSummary: document.getElementById('checkout-items-summary'),
    checkoutPayableAmount: document.getElementById('checkout-payable-amount'),
    checkoutUpiQrImg: document.getElementById('checkout-upi-qr-img'),
    checkoutUpiIdText: document.getElementById('checkout-upi-id-text'),
    checkoutUpiIntentBtn: document.getElementById('checkout-upi-intent-btn'),
    btnCopyAmount: document.getElementById('btn-copy-amount'),
    btnCopyUpiId: document.getElementById('btn-copy-upi-id'),
    screenshotDropzone: document.getElementById('screenshot-upload-dropzone'),
    screenshotFileInput: document.getElementById('screenshot-file-input'),
    screenshotPreviewCard: document.getElementById('screenshot-preview-card'),
    screenshotPreviewImg: document.getElementById('screenshot-preview-img'),
    screenshotPreviewName: document.getElementById('screenshot-preview-name'),
    btnReplaceScreenshot: document.getElementById('btn-replace-screenshot'),
    btnRemoveScreenshot: document.getElementById('btn-remove-screenshot'),
    btnPlaceOrder: document.getElementById('btn-place-order'),
    btnPlaceOrderText: document.getElementById('btn-place-order-text'),
    btnPlaceOrderSpinner: document.getElementById('btn-place-order-spinner'),
    checkoutErrorBox: document.getElementById('checkout-error-box'),

    // Order Success Modal Elements
    orderSuccessBackdrop: document.getElementById('order-success-modal-backdrop'),
    successOrderId: document.getElementById('success-order-id'),
    successCustName: document.getElementById('success-cust-name'),
    successCustPhone: document.getElementById('success-cust-phone'),
    successCustAddress: document.getElementById('success-cust-address'),
    successOrderTotal: document.getElementById('success-order-total'),
    successWhatsappBtn: document.getElementById('success-whatsapp-btn'),
    successContinueBtn: document.getElementById('success-continue-btn'),

    // Lightbox Modal Elements
    lightboxModal: document.getElementById('lightbox-modal'),
    lightboxClose: document.getElementById('lightbox-close'),
    lightboxImg: document.getElementById('lightbox-img'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // -------------------------------------------------------------
  // WHATSAPP ORDERING UTILITY — STRICT REQUIREMENT
  // -------------------------------------------------------------
  function generateWhatsAppLink(product, chosenVariant) {
    if (!product) {
      const defaultMsg = currentSection === 'clothing'
        ? `Hello ACCESSIFY! I'm interested in the upcoming CLOTHING streetwear collection.`
        : `Hello ACCESSIFY! I'm interested in browsing your ACCESSORIES collection.`;
      return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(defaultMsg)}`;
    }

    const baseUrl = window.location.origin;
    const productUrl = `${baseUrl}/?product=${encodeURIComponent(product.slug || product.id)}`;

    let variantText = '';
    if (chosenVariant) {
      variantText = `\nOption / Variant: ${chosenVariant}`;
    }

    const priceText = `₹${Number(product.price).toLocaleString('en-IN')}`;

    const message =
      `Hello ACCESSIFY! I'm interested in ordering this piece from the ${((product.section || currentSection) || 'accessories').toUpperCase()} collection.

Product: ${product.name}${variantText}
Price: ${priceText}
Product Link: ${productUrl}

Please provide more details about availability and ordering.`;

    const encoded = encodeURIComponent(message);
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  }

  function openWhatsApp(product, chosenVariant) {
    const url = generateWhatsAppLink(product, chosenVariant);

    // Compatible with Android, iPhone Safari, Chrome, and Instagram in-app browser
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // -------------------------------------------------------------
  // DEPARTMENT SWITCHING & ROUTING
  // -------------------------------------------------------------
  async function switchSection(section) {
    const target = (section === 'clothing') ? 'clothing' : 'accessories';
    currentSection = target;
    sessionStorage.setItem('accessify_active_section', target);

    // Update Tab Classes in Header & Mobile Nav
    document.querySelectorAll('.header-dept-tab, .mobile-dept-tab').forEach(tab => {
      const isSelected = tab.getAttribute('data-dept') === target;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Update Catalog Section Headers
    if (el.catalogSectionTitle) {
      el.catalogSectionTitle.textContent = target === 'clothing' ? 'CLOTHING ARCHIVE' : 'ALL COLLECTIONS';
    }
    if (el.catalogSectionLabel) {
      el.catalogSectionLabel.textContent = target === 'clothing' ? 'STREETWEAR APPAREL DEPARTMENT' : '316L SURGICAL STEEL ARCHIVE';
    }

    // Update URL query state cleanly without full reload
    try {
      const url = new URL(window.location);
      url.searchParams.set('section', target);
      window.history.replaceState({ section: target }, '', url);
    } catch (_) { }

    // Reset active category filter to all for new section
    currentCategory = 'all';

    // Reload active categories & products for this department
    await fetchCategories();
    await fetchProducts();
  }

  // -------------------------------------------------------------
  // DATA FETCHING & RENDERING
  // -------------------------------------------------------------
  async function fetchCategories() {
    try {
      const res = await fetch(`${API_BASE}/categories?section=${encodeURIComponent(currentSection)}&t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        allCategories = json.data;
        renderHeaderNav();
        renderCategoryPills();
        renderMobileCategories();
        handleVaultCategories();
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function renderHeaderNav() {
    if (!el.headerNav) return;

    let html = `
      <a href="#catalog" class="nav-link ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
        ALL ${currentSection.toUpperCase()}
      </a>
    `;

    const topCats = allCategories.slice(0, 5);
    topCats.forEach(cat => {
      const isActive = currentCategory === cat.id ? 'active' : '';
      html += `
        <a href="#catalog" class="nav-link ${isActive}" data-cat="${escapeHtml(cat.id)}">
          ${escapeHtml(cat.name.toUpperCase())}
        </a>
      `;
    });

    el.headerNav.innerHTML = html;

    el.headerNav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = link.getAttribute('data-cat');
        setCategory(cat);
        scrollToCatalog();
      });
    });
  }

  function handleVaultCategories() {
    if (!el.categoriesSection) return;

    if (currentSection === 'clothing') {
      if (allCategories.length === 0) {
        // Hide categories showcase when clothing has no categories yet
        el.categoriesSection.style.display = 'none';
      } else {
        el.categoriesSection.style.display = 'block';
        if (el.categoriesSectionTitle) {
          el.categoriesSectionTitle.textContent = 'THE CLOTHING ARCHIVE';
        }
        if (el.categoriesVaultGrid) {
          let html = '';
          allCategories.forEach(cat => {
            const img = cat.image || '/assets/images/category-gothic.jpg';
            html += `
              <a href="#catalog" class="category-card" data-vault-cat="${escapeHtml(cat.id)}">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(cat.name)}" class="category-card-img" loading="lazy">
                <div class="category-card-gradient"></div>
                <div class="category-card-info">
                  <div class="category-card-count">${cat.count || 0} PIECES</div>
                  <div class="category-card-name">
                    <span>${escapeHtml(cat.name.toUpperCase())}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </div>
              </a>
            `;
          });
          el.categoriesVaultGrid.innerHTML = html;
          el.categoriesVaultGrid.querySelectorAll('[data-vault-cat]').forEach(card => {
            card.addEventListener('click', (e) => {
              e.preventDefault();
              const cid = card.getAttribute('data-vault-cat');
              setCategory(cid);
            });
          });
        }
      }
    } else {
      // ACCESSORIES section
      el.categoriesSection.style.display = 'block';
      if (el.categoriesSectionTitle) {
        el.categoriesSectionTitle.textContent = 'THE ACCESSIFY VAULT';
      }
      if (originalAccessoriesVaultHtml && el.categoriesVaultGrid && el.categoriesVaultGrid.innerHTML !== originalAccessoriesVaultHtml) {
        el.categoriesVaultGrid.innerHTML = originalAccessoriesVaultHtml;
      }
      updateVaultCategoryCounts();
    }
  }

  function updateVaultCategoryCounts() {
    allCategories.forEach(cat => {
      const elCount = document.querySelector(`[data-vault-cat="${cat.id}"]`);
      if (elCount) {
        elCount.textContent = `${cat.count || 0} PIECES`;
      }
    });
  }

  const FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 533' fill='%23050505'%3E%3Crect width='400' height='533' fill='%23050505'/%3E%3Ctext x='50%25' y='50%25' fill='%23555' font-family='sans-serif' font-size='13' letter-spacing='2' text-anchor='middle' dominant-baseline='middle'%3EACCESSIFY%3C/text%3E%3C/svg%3E";

  async function fetchProducts(silent = false) {
    try {
      const params = new URLSearchParams();
      params.append('section', currentSection);
      if (currentCategory && currentCategory !== 'all') {
        params.append('category', currentCategory);
      }
      if (currentSort && currentSort !== 'default') {
        params.append('sort', currentSort);
      }
      if (currentSearchQuery) {
        params.append('search', currentSearchQuery);
      }
      params.append('t', Date.now());

      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        const prevVersion = currentDbVersion;
        allProducts = json.data;
        currentDbVersion = json.dbVersion;
        renderProductsGrid(allProducts);

        // Keep open search modal results in sync with live catalogue updates
        if (el.searchModal && el.searchModal.classList.contains('open') && el.searchInput && el.searchInput.value.trim()) {
          if (typeof renderSearchResults === 'function') {
            renderSearchResults(el.searchInput.value);
          }
        }

        if (silent && prevVersion !== null && String(prevVersion) !== String(json.dbVersion)) {
          showToast('Live catalogue synchronized');
        }

        // If PDP is currently open, refresh active product details
        if (activeProduct) {
          const refreshed = allProducts.find(p => p.id === activeProduct.id);
          if (refreshed) {
            renderPdpContent(refreshed);
          } else {
            closePdpModal();
          }
        }
      }
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  // -------------------------------------------------------------
  // CATEGORY PILLS & CONTROLS
  // -------------------------------------------------------------
  function renderCategoryPills() {
    if (!el.categoryPills) return;

    const totalCount = allCategories.reduce((acc, c) => acc + (c.count || 0), 0);

    let html = `
      <button class="filter-pill ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
        ALL (${totalCount})
      </button>
    `;

    allCategories.forEach(cat => {
      const isActive = currentCategory === cat.id ? 'active' : '';
      html += `
        <button class="filter-pill ${isActive}" data-cat="${escapeHtml(cat.id)}">
          ${escapeHtml(cat.name)} (${cat.count || 0})
        </button>
      `;
    });

    el.categoryPills.innerHTML = html;

    // Attach click events
    el.categoryPills.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        setCategory(cat);
      });
    });
  }

  function renderMobileCategories() {
    if (!el.mobileNavLinks) return;

    let html = `
      <a href="#catalog" class="mobile-nav-item ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
        ALL ${currentSection.toUpperCase()}
      </a>
    `;

    allCategories.forEach(cat => {
      const isActive = currentCategory === cat.id ? 'active' : '';
      html += `
        <a href="#catalog" class="mobile-nav-item ${isActive}" data-cat="${escapeHtml(cat.id)}">
          ${escapeHtml(cat.name)}
        </a>
      `;
    });

    el.mobileNavLinks.innerHTML = html;

    el.mobileNavLinks.querySelectorAll('.mobile-nav-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = link.getAttribute('data-cat');
        setCategory(cat);
        closeMobileNav();
        scrollToCatalog();
      });
    });
  }

  function updateDesktopCategoryNav(catId) {
    document.querySelectorAll('.category-nav-link').forEach(link => {
      const cat = link.getAttribute('data-cat');
      const isMatch = cat === catId || (cat === 'all' && (!catId || catId === 'all'));
      link.classList.toggle('active', isMatch);
    });
  }

  function setCategory(catId) {
    currentCategory = catId;
    renderHeaderNav();
    renderCategoryPills();
    renderMobileCategories();
    updateDesktopCategoryNav(catId);
    fetchProducts();
    scrollToCatalog();
  }

  window.setStoreCategory = setCategory;
  window.scrollToCatalog = scrollToCatalog;

  function scrollToCatalog() {
    const target = document.getElementById('catalog');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // -------------------------------------------------------------
  // PRODUCTS GRID RENDERING (GENRAGE STYLE)
  // -------------------------------------------------------------
  function renderProductsGrid(products) {
    if (!el.productsGrid) return;

    if (el.catalogCount) {
      if (currentSection === 'clothing' && products.length === 0) {
        el.catalogCount.textContent = 'COMING SOON / ARCHIVE LOCKED';
      } else {
        el.catalogCount.textContent = `[${products.length} PIECES]`;
      }
    }

    if (products.length === 0) {
      if (currentSection === 'clothing') {
        el.productsGrid.innerHTML = `
          <div class="empty-catalog-state">
            <span class="empty-code">// ARCHIVE LOCKED</span>
            <h3>Clothing Drop Coming Soon</h3>
            <p>Our apparel archive is currently being prepared for the upcoming seasonal drop.</p>
            <a href="#accessories" class="btn-archive-primary" id="empty-switch-acc">
              EXPLORE ACCESSORIES
              <span class="btn-arrow">→</span>
            </a>
          </div>
        `;
        const switchBtn = document.getElementById('empty-switch-acc');
        if (switchBtn) {
          switchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection('accessories');
          });
        }
      } else {
        el.productsGrid.innerHTML = `
          <div class="empty-catalog-state">
            <span class="empty-code">// NO MATCHES FOUND</span>
            <h3>Zero Archive Items Found</h3>
            <p>Try clearing your category filter or search query to view all available pieces.</p>
            <button class="btn-archive-primary" id="empty-clear-filters">
              RESET ALL FILTERS
              <span class="btn-arrow">↺</span>
            </button>
          </div>
        `;
        const clearBtn = document.getElementById('empty-clear-filters');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            currentCategory = 'all';
            currentSearchQuery = '';
            renderHeaderNav();
            renderCategoryPills();
            fetchProducts();
          });
        }
      }
      return;
    }

    let cardsHtml = '';
    products.forEach(p => {
      cardsHtml += createProductCardHtml(p);
    });
    el.productsGrid.innerHTML = cardsHtml;
    attachCardListeners(el.productsGrid);
  }

  function createProductCardHtml(p) {
    const isSoldOut = p.status === 'sold_out' || (p.stock !== undefined && p.stock <= 0);
    const hasDiscount = p.comparePrice && p.comparePrice > p.price;
    const discountPercent = hasDiscount ? Math.round(((p.comparePrice - p.price) / p.comparePrice) * 100) : 0;

    const img1 = (p.images && p.images[0]) || 'https://cdn.zepio.io/blyo/product/ebbe65b3-b81a-448b-a644-09c752b39a3b.webp';
    const img2 = (p.images && p.images[1]) || img1;

    let badgeHtml = '';
    if (isSoldOut) {
      badgeHtml = `<span class="badge badge-sold-out">SOLD OUT</span>`;
    } else if (discountPercent > 0) {
      badgeHtml = `<span class="badge badge-sale">SAVE ${discountPercent}%</span>`;
    } else if (p.newArrival) {
      badgeHtml = `<span class="badge badge-new">NEW</span>`;
    }

    const priceFormatted = `₹${Number(p.price).toLocaleString('en-IN')}`;
    const mrpFormatted = p.comparePrice ? `₹${Number(p.comparePrice).toLocaleString('en-IN')}` : '';

    return `
      <article class="product-card" data-id="${p.id}" data-slug="${escapeHtml(p.slug || p.id)}">
        <div class="product-figure">
          <div class="card-badges">
            ${badgeHtml}
          </div>
          <a href="/?product=${encodeURIComponent(p.slug || p.id)}" class="product-media-link" data-open-pdp="${p.id}">
            <img src="${escapeHtml(img1)}" alt="${escapeHtml(p.name)}" class="product-img product-img-primary" loading="lazy">
            <img src="${escapeHtml(img2)}" alt="${escapeHtml(p.name)}" class="product-img product-img-secondary" loading="lazy">
          </a>
        </div>
        <div class="product-info">
          <div class="product-category">${escapeHtml(p.category)}</div>
          <h3 class="product-title">
            <a href="/?product=${encodeURIComponent(p.slug || p.id)}" data-open-pdp="${p.id}">
              ${escapeHtml(p.name)}
            </a>
          </h3>
          <div class="product-pricing">
            <span class="price-current">${priceFormatted}</span>
            ${mrpFormatted ? `<span class="price-mrp">${mrpFormatted}</span>` : ''}
            ${discountPercent > 0 ? `<span class="price-discount">${discountPercent}% OFF</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  function attachCardListeners(container) {
    if (!container) return;

    // Fast event delegation: attaches a single listener on the container
    // completely eliminating individual handler binding overhead on 200+ cards
    if (!container._hasCardDelegation) {
      container._hasCardDelegation = true;
      container.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        e.preventDefault();
        const id = card.getAttribute('data-id');
        const prod = allProducts.find(p => String(p.id) === String(id));
        if (prod) {
          openPdpModal(prod);
        }
      }, { passive: false });
    }
  }

  // -------------------------------------------------------------
  // PRODUCT DETAIL PAGE (PDP) MODAL & ROUTING
  // -------------------------------------------------------------
  let savedCatalogScrollY = 0;

  function openPdpModal(product) {
    activeProduct = product;
    activeVariant = (product.variants && product.variants[0]) || '';

    // Record the exact collections area scroll position before opening the modal
    if (!document.body.classList.contains('pdp-open')) {
      savedCatalogScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    // Reset scroll position to top instantly inside the PDP modal
    const scrollBox = el.pdpModal ? el.pdpModal.querySelector('.pdp-container') : null;
    if (scrollBox) scrollBox.scrollTop = 0;

    renderPdpContent(product);

    el.pdpModal.classList.add('open');
    document.body.classList.add('pdp-open');

    // Update URL query without full page refresh or back-button lag
    try {
      const url = new URL(window.location);
      url.searchParams.set('product', product.slug || product.id);
      window.history.replaceState({ productId: product.id }, '', url);
    } catch (_) { }

    // Update sticky mobile bar
    if (el.stickyTitle) el.stickyTitle.textContent = product.name;
    if (el.stickyPrice) el.stickyPrice.textContent = `₹${Number(product.price).toLocaleString('en-IN')}`;
  }

  function closePdpModal() {
    activeProduct = null;
    el.pdpModal.classList.remove('open');
    document.body.classList.remove('pdp-open');

    // Clear URL query
    try {
      const url = new URL(window.location);
      url.searchParams.delete('product');
      window.history.replaceState({ section: currentSection }, '', url);
    } catch (_) { }

    // MOBILE FIX: Ensure user stays in the collections area at their exact browsing position
    const isMobile = window.innerWidth <= 840 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      if (savedCatalogScrollY > 0) {
        window.scrollTo(0, savedCatalogScrollY);
        requestAnimationFrame(() => {
          window.scrollTo(0, savedCatalogScrollY);
          setTimeout(() => {
            window.scrollTo(0, savedCatalogScrollY);
          }, 35);
        });
      } else {
        // Fallback for direct product links: keep visitor in the collections area
        const catalogEl = document.getElementById('catalog');
        if (catalogEl) {
          catalogEl.scrollIntoView({ behavior: 'auto' });
        }
      }
    }
  }

  function renderPdpContent(p) {
    if (!el.pdpTitle) return;
    activeProduct = p;

    el.pdpCategory.textContent = `// ${p.category.toUpperCase()}`;
    el.pdpTitle.textContent = p.name;
    el.pdpPrice.textContent = `₹${Number(p.price).toLocaleString('en-IN')}`;
    if (el.stickyTitle) el.stickyTitle.textContent = p.name;
    if (el.stickyPrice) el.stickyPrice.textContent = `₹${Number(p.price).toLocaleString('en-IN')}`;

    if (p.comparePrice && p.comparePrice > p.price) {
      el.pdpMrp.textContent = `₹${Number(p.comparePrice).toLocaleString('en-IN')}`;
      el.pdpMrp.style.display = 'inline-block';
      const pct = Math.round(((p.comparePrice - p.price) / p.comparePrice) * 100);
      el.pdpDiscount.textContent = `SAVE ${pct}%`;
      el.pdpDiscount.style.display = 'inline-flex';
    } else {
      el.pdpMrp.style.display = 'none';
      el.pdpDiscount.style.display = 'none';
    }

    const isSoldOut = p.status === 'sold_out' || (p.stock !== undefined && p.stock <= 0);
    if (isSoldOut) {
      el.pdpStock.className = 'pdp-stock-status sold-out';
      el.pdpStock.innerHTML = `<span>●</span> CURRENTLY SOLD OUT (DROP EXHAUSTED)`;
      el.pdpWhatsappBtn.innerHTML = `ENQUIRE RESTOCK ON WHATSAPP`;
    } else {
      el.pdpStock.className = 'pdp-stock-status in-stock';
      el.pdpStock.innerHTML = `<span>●</span> IN STOCK — READY TO SHIP ACROSS INDIA`;
      el.pdpWhatsappBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.966.527 1.93.811 2.796.811 3.181 0 5.767-2.587 5.768-5.766.001-3.181-2.585-5.798-5.768-5.798zm3.385 8.163c-.145.408-.847.781-1.183.829-.336.048-.775.068-2.223-.529-1.854-.764-3.04-2.653-3.132-2.775-.093-.122-.749-.997-.749-1.902 0-.904.472-1.349.64-1.533.168-.184.368-.23.491-.23.123 0 .245.001.353.007.113.005.263-.043.412.316.153.368.522 1.272.568 1.365.046.092.077.2.015.323-.061.123-.092.2-.184.307-.092.107-.194.24-.277.323-.092.092-.189.193-.081.378.107.185.477.787 1.025 1.275.707.63 1.303.825 1.488.917.184.092.292.077.4-.046.108-.123.461-.537.584-.722.123-.184.246-.153.414-.092.169.061 1.074.507 1.258.6.184.092.307.138.353.215.046.077.046.446-.099.854z"/>
        </svg>
        ORDER ON WHATSAPP
      `;
    }

    el.pdpDesc.textContent = p.description || 'Crafted with premium surgical-grade 316L stainless steel for an elevated dark streetwear aesthetic.';

    // Gallery Images
    const images = Array.isArray(p.images) && p.images.length > 0 ? p.images : ['https://cdn.zepio.io/blyo/product/ebbe65b3-b81a-448b-a644-09c752b39a3b.webp'];
    el.pdpMainImg.decoding = 'async';
    el.pdpMainImg.onerror = () => {
      el.pdpMainImg.onerror = null;
      el.pdpMainImg.src = FALLBACK_SVG;
    };
    el.pdpMainImg.src = images[0];

    let thumbsHtml = '';
    images.forEach((img, idx) => {
      thumbsHtml += `
        <div class="pdp-thumb ${idx === 0 ? 'active' : ''}" data-thumb-src="${escapeHtml(img)}">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)} thumbnail ${idx + 1}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_SVG}'">
        </div>
      `;
    });
    el.pdpThumbs.innerHTML = thumbsHtml;

    el.pdpThumbs.querySelectorAll('.pdp-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        el.pdpThumbs.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        el.pdpMainImg.src = thumb.getAttribute('data-thumb-src');
      });
    });

    // Variants
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      el.pdpVariantsBox.style.display = 'block';
      let varHtml = '';
      p.variants.forEach((v, idx) => {
        const isSel = idx === 0 ? 'active' : '';
        varHtml += `<button class="pdp-variant-btn ${isSel}" data-variant="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
      });
      el.pdpVariantsList.innerHTML = varHtml;

      el.pdpVariantsList.querySelectorAll('.pdp-variant-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          el.pdpVariantsList.querySelectorAll('.pdp-variant-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeVariant = btn.getAttribute('data-variant');
        });
      });
    } else {
      el.pdpVariantsBox.style.display = 'none';
      activeVariant = '';
    }

    // Related Products - deferred slightly so the modal opens at pure 60fps first
    window.requestAnimationFrame(() => {
      renderInstantRelated(p.id, p.category);
    });
  }

  function renderInstantRelated(id, category) {
    if (!el.pdpRelatedGrid) return;

    // Pick related pieces synchronously from memory
    let related = allProducts.filter(p => String(p.id) !== String(id) && p.category === category);
    if (related.length < 4) {
      const others = allProducts.filter(p => String(p.id) !== String(id) && p.category !== category);
      related = related.concat(others);
    }
    related = related.slice(0, 4);

    if (related.length > 0) {
      let relatedHtml = '';
      related.forEach(rel => {
        relatedHtml += createProductCardHtml(rel);
      });
      el.pdpRelatedGrid.innerHTML = relatedHtml;
      attachCardListeners(el.pdpRelatedGrid);
    } else {
      el.pdpRelatedGrid.innerHTML = '';
    }
  }

  // -------------------------------------------------------------
  // SEARCH SYSTEM (DEPARTMENT-AWARE REAL-TIME LIVE FILTER)
  // -------------------------------------------------------------
  function openSearchModal() {
    el.searchModal.classList.add('open');
    el.searchInput.value = '';
    el.searchInput.focus();
    renderSearchResults('');
  }

  function closeSearchModal() {
    el.searchModal.classList.remove('open');
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      el.searchResultCount.textContent = `TYPE TO SEARCH ALL ${currentSection.toUpperCase()} PIECES`;
      el.searchResults.innerHTML = '';
      return;
    }

    const matches = allProducts.filter(p => {
      const n = (p.name || '').toLowerCase();
      const c = (p.category || '').toLowerCase();
      const d = (p.description || '').toLowerCase();
      return n.includes(q) || c.includes(q) || d.includes(q);
    });

    el.searchResultCount.textContent = `FOUND ${matches.length} PIECES IN ${currentSection.toUpperCase()} MATCHING "${query}"`;

    if (matches.length === 0) {
      el.searchResults.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 3rem 0;">No matching ${currentSection} pieces found.</p>`;
      return;
    }

    let html = `<div class="products-grid">`;
    matches.slice(0, 16).forEach(m => {
      html += createProductCardHtml(m);
    });
    html += `</div>`;

    el.searchResults.innerHTML = html;
    attachCardListeners(el.searchResults);
  }

  // =========================================================================
  // CART DRAWER ENGINE & LOCALSTORAGE PERSISTENCE
  // =========================================================================
  function saveCart() {
    try {
      localStorage.setItem('accessify_cart_v1', JSON.stringify(cart));
    } catch (_) { }
    updateCartUI();
  }

  function updateCartUI() {
    const totalQty = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);

    // Update Header Bag Badge
    if (el.cartBadgeCount) {
      if (totalQty > 0) {
        el.cartBadgeCount.textContent = totalQty > 99 ? '99+' : totalQty;
        el.cartBadgeCount.style.display = 'inline-flex';
      } else {
        el.cartBadgeCount.style.display = 'none';
      }
    }

    // Update Drawer Header Count
    if (el.cartHeaderCount) {
      el.cartHeaderCount.textContent = `(${totalQty})`;
    }

    // Update Drawer Totals
    if (el.cartSubtotalVal) el.cartSubtotalVal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (el.cartTotalVal) el.cartTotalVal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;

    // Render Drawer Items List
    if (el.cartItemsList) {
      if (cart.length === 0) {
        el.cartItemsList.innerHTML = `
          <div class="cart-empty-state">
            <svg class="cart-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <h3>Your Bag Is Empty</h3>
            <p>Explore our heavy 316L stainless steel jewelry and streetwear apparel archives.</p>
            <button type="button" class="btn-checkout-primary" id="btn-cart-empty-explore" style="max-width: 220px; min-height: 44px; font-size: 0.78rem;">
              EXPLORE ARCHIVE
            </button>
          </div>
        `;
        const exploreBtn = document.getElementById('btn-cart-empty-explore');
        if (exploreBtn) {
          exploreBtn.addEventListener('click', () => {
            closeCartDrawer();
            scrollToCatalog();
          });
        }
        if (el.cartCheckoutBtn) el.cartCheckoutBtn.disabled = true;
      } else {
        let itemsHtml = '';
        cart.forEach((item, idx) => {
          const itemImg = item.image || FALLBACK_SVG;
          const itemPriceFormatted = `₹${Number(item.price).toLocaleString('en-IN')}`;
          itemsHtml += `
            <div class="cart-item-card" data-cart-idx="${idx}">
              <div class="cart-item-thumb">
                <img src="${escapeHtml(itemImg)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_SVG}'">
              </div>
              <div class="cart-item-info">
                <div>
                  <div class="cart-item-name">${escapeHtml(item.name)}</div>
                  ${item.variant ? `<div class="cart-item-variant">Variant: ${escapeHtml(item.variant)}</div>` : ''}
                </div>
                <div class="cart-item-pricing-stepper">
                  <span class="cart-item-price">${itemPriceFormatted}</span>
                  <div class="cart-stepper">
                    <button type="button" class="cart-stepper-btn" data-action="decrement" data-cart-idx="${idx}" aria-label="Decrease quantity">−</button>
                    <span class="cart-stepper-qty">${item.qty}</span>
                    <button type="button" class="cart-stepper-btn" data-action="increment" data-cart-idx="${idx}" aria-label="Increase quantity">+</button>
                  </div>
                </div>
              </div>
              <button type="button" class="cart-item-remove" data-action="remove" data-cart-idx="${idx}" aria-label="Remove item" title="Remove piece">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `;
        });
        el.cartItemsList.innerHTML = itemsHtml;
        if (el.cartCheckoutBtn) el.cartCheckoutBtn.disabled = false;
      }
    }
  }

  function addToCart(product, variant, qty = 1, openDrawer = true) {
    if (!product) return;
    const isSoldOut = product.status === 'sold_out' || (product.stock !== undefined && product.stock <= 0);
    if (isSoldOut) {
      showToast('This piece is currently sold out.', 'error');
      return;
    }

    const chosenVariant = variant || (Array.isArray(product.variants) && product.variants.length > 0 ? product.variants[0] : '');
    const img = (Array.isArray(product.images) && product.images[0]) || '';

    // Check if matching item + variant is already in bag
    const existingIndex = cart.findIndex(item => String(item.productId) === String(product.id) && String(item.variant || '') === String(chosenVariant || ''));
    if (existingIndex > -1) {
      cart[existingIndex].qty += qty;
    } else {
      cart.push({
        id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        productId: product.id,
        name: product.name,
        variant: chosenVariant,
        price: Number(product.price),
        image: img,
        qty: Math.max(1, qty)
      });
    }

    saveCart();
    showToast(`Added ${product.name} to your bag`);

    if (openDrawer) {
      openCartDrawer();
    }
  }

  function updateCartQty(index, newQty) {
    if (index < 0 || index >= cart.length) return;
    if (newQty <= 0) {
      removeFromCart(index);
    } else {
      cart[index].qty = newQty;
      saveCart();
    }
  }

  function removeFromCart(index) {
    if (index < 0 || index >= cart.length) return;
    const removed = cart.splice(index, 1);
    saveCart();
    if (removed[0]) {
      showToast(`Removed ${removed[0].name} from your bag`);
    }
  }

  function clearCart() {
    cart = [];
    saveCart();
  }

  function openCartDrawer() {
    if (el.cartDrawerOverlay) {
      el.cartDrawerOverlay.classList.add('open');
      el.cartDrawerOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
    }
  }

  function closeCartDrawer() {
    if (el.cartDrawerOverlay) {
      el.cartDrawerOverlay.classList.remove('open');
      el.cartDrawerOverlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('drawer-open');
    }
  }

  // =========================================================================
  // CHECKOUT & PAYMENT FLOW
  // =========================================================================
  async function loadPaymentConfig() {
    try {
      const res = await fetch(`${API_BASE}/payment-config`);
      const json = await res.json();
      if (json && json.success) {
        paymentConfig.upiId = json.upiId || paymentConfig.upiId;
        paymentConfig.upiName = json.upiName || paymentConfig.upiName;
        paymentConfig.whatsappNumber = json.whatsappNumber || paymentConfig.whatsappNumber;
        paymentConfig.deliveryCharge = Number(json.deliveryCharge || 0);
        paymentConfig.qrImage = json.qrImage || paymentConfig.qrImage;
      }
    } catch (_) { }
  }

  async function openCheckoutModal() {
    if (cart.length === 0) {
      showToast('Your bag is empty! Please add pieces to checkout.');
      openCartDrawer();
      return;
    }

    closeCartDrawer();
    await loadPaymentConfig();

    const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);
    const delivery = Number(paymentConfig.deliveryCharge || 0);
    const totalAmount = subtotal + delivery;

    // Render Order Summary in Checkout
    if (el.checkoutItemsSummary) {
      let sumHtml = '';
      cart.forEach(it => {
        sumHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem; font-size: 0.78rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;">
              <span style="font-weight:700; color:#fff;">${it.qty}×</span>
              <span style="color:#e4e4e7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${escapeHtml(it.name)}</span>
              ${it.variant ? `<span style="font-size:0.7rem; color:#a1a1aa;">(${escapeHtml(it.variant)})</span>` : ''}
            </div>
            <span style="font-family:var(--font-mono, monospace); font-weight:700; color:#ffffff;">₹${(Number(it.price) * it.qty).toLocaleString('en-IN')}</span>
          </div>
        `;
      });
      sumHtml += `
        <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:0.45rem; margin-top:0.45rem; display:flex; justify-content:space-between; font-size:0.82rem; font-weight:800; color:#fff;">
          <span>Subtotal (${cart.reduce((s, i) => s + i.qty, 0)} items)</span>
          <span style="font-family:var(--font-mono, monospace);">₹${subtotal.toLocaleString('en-IN')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#a1a1aa; margin-top:0.2rem;">
          <span>Pan-India Delivery</span>
          <span style="color:#6ee7b7; font-weight:700;">${delivery > 0 ? '₹' + delivery : 'FREE'}</span>
        </div>
      `;
      el.checkoutItemsSummary.innerHTML = sumHtml;
    }

    // Set Payable Amount
    if (el.checkoutPayableAmount) {
      el.checkoutPayableAmount.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    }

    // Set QR Image URL with dynamic amount
    if (el.checkoutUpiQrImg) {
      el.checkoutUpiQrImg.src = `${API_BASE}/upi-qr?amount=${totalAmount}&upi_id=${encodeURIComponent(paymentConfig.upiId)}&t=${Date.now()}`;
    }

    // Set UPI ID
    if (el.checkoutUpiIdText) {
      el.checkoutUpiIdText.textContent = paymentConfig.upiId;
    }

    // Set Mobile UPI Intent Link
    if (el.checkoutUpiIntentBtn) {
      el.checkoutUpiIntentBtn.href = `upi://pay?pa=${encodeURIComponent(paymentConfig.upiId)}&pn=${encodeURIComponent(paymentConfig.upiName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('ACCESSIFY Order')}`;
    }

    // Autofill stored customer details
    try {
      const savedCust = JSON.parse(localStorage.getItem('accessify_cust_v1') || '{}');
      if (savedCust.name) document.getElementById('chk-name').value = savedCust.name;
      if (savedCust.phone) document.getElementById('chk-phone').value = savedCust.phone;
      if (savedCust.email) document.getElementById('chk-email').value = savedCust.email;
      if (savedCust.house) document.getElementById('chk-house').value = savedCust.house;
      if (savedCust.street) document.getElementById('chk-street').value = savedCust.street;
      if (savedCust.city) document.getElementById('chk-city').value = savedCust.city;
      if (savedCust.state) document.getElementById('chk-state').value = savedCust.state;
      if (savedCust.pincode) document.getElementById('chk-pincode').value = savedCust.pincode;
      if (savedCust.landmark) document.getElementById('chk-landmark').value = savedCust.landmark;
    } catch (_) { }

    if (el.checkoutErrorBox) {
      el.checkoutErrorBox.classList.remove('show');
      el.checkoutErrorBox.textContent = '';
    }

    // Open Modal
    if (el.checkoutModalBackdrop) {
      el.checkoutModalBackdrop.classList.add('open');
      el.checkoutModalBackdrop.setAttribute('aria-hidden', 'false');
      document.body.classList.add('checkout-open');
    }
  }

  function closeCheckoutModal() {
    if (el.checkoutModalBackdrop) {
      el.checkoutModalBackdrop.classList.remove('open');
      el.checkoutModalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('checkout-open');
    }
  }

  function handleScreenshotSelected(file) {
    if (!file) return;
    const validExts = /\.(jpe?g|png|webp)$/i;
    const validMimes = /^image\/(jpeg|png|webp)$/i;

    if (!validExts.test(file.name) && !validMimes.test(file.type)) {
      showToast('Please upload a valid image (JPG, PNG, or WEBP)', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image file size must be less than 10MB', 'error');
      return;
    }

    checkoutScreenshotFile = file;

    // Generate local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (el.screenshotPreviewImg) el.screenshotPreviewImg.src = e.target.result;
      if (el.screenshotPreviewName) el.screenshotPreviewName.textContent = file.name;
      if (el.screenshotPreviewCard) el.screenshotPreviewCard.style.display = 'flex';
      if (el.screenshotDropzone) el.screenshotDropzone.style.display = 'none';
      if (el.checkoutErrorBox) el.checkoutErrorBox.classList.remove('show');
    };
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    checkoutScreenshotFile = null;
    if (el.screenshotFileInput) el.screenshotFileInput.value = '';
    if (el.screenshotPreviewCard) el.screenshotPreviewCard.style.display = 'none';
    if (el.screenshotDropzone) el.screenshotDropzone.style.display = 'block';
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    if (isSubmittingOrder) return;

    const name = (document.getElementById('chk-name')?.value || '').trim();
    const phone = (document.getElementById('chk-phone')?.value || '').trim().replace(/\D/g, '');
    const email = (document.getElementById('chk-email')?.value || '').trim();
    const house = (document.getElementById('chk-house')?.value || '').trim();
    const street = (document.getElementById('chk-street')?.value || '').trim();
    const city = (document.getElementById('chk-city')?.value || '').trim();
    const state = (document.getElementById('chk-state')?.value || '').trim();
    const pincode = (document.getElementById('chk-pincode')?.value || '').trim().replace(/\D/g, '');
    const landmark = (document.getElementById('chk-landmark')?.value || '').trim();

    function showError(msg) {
      if (el.checkoutErrorBox) {
        el.checkoutErrorBox.textContent = msg;
        el.checkoutErrorBox.classList.add('show');
        el.checkoutErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        showToast(msg, 'error');
      }
    }

    if (!name) return showError('Please enter your full name.');
    if (!phone || phone.length !== 10) return showError('Please enter a valid 10-digit mobile / WhatsApp number.');
    if (!house) return showError('Please enter your house name, flat, or building number.');
    if (!street) return showError('Please enter your street, area, or locality.');
    if (!city) return showError('Please enter your city.');
    if (!state) return showError('Please enter your state.');
    if (!pincode || pincode.length !== 6) return showError('Please enter a valid 6-digit PIN code.');
    if (!checkoutScreenshotFile) return showError('Please upload your payment screenshot before placing order.');
    if (cart.length === 0) return showError('Your cart is empty. Please add items to checkout.');

    isSubmittingOrder = true;
    if (el.btnPlaceOrder) el.btnPlaceOrder.disabled = true;
    if (el.btnPlaceOrderText) el.btnPlaceOrderText.style.display = 'none';
    if (el.btnPlaceOrderSpinner) el.btnPlaceOrderSpinner.style.display = 'inline-block';

    try {
      // 1. Upload screenshot
      const formData = new FormData();
      formData.append('screenshot', checkoutScreenshotFile);

      const uploadRes = await fetch(`${API_BASE}/upload-payment-proof`, {
        method: 'POST',
        body: formData
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success) {
        throw new Error(uploadJson.error || 'Failed to upload payment screenshot');
      }

      const screenshotUrl = uploadJson.url;

      // 2. Submit order to database
      const orderPayload = {
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        house,
        street,
        city,
        state,
        pincode,
        landmark,
        items: cart,
        payment_screenshot: screenshotUrl
      };

      const orderRes = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || !orderJson.success) {
        throw new Error(orderJson.error || 'Failed to register order');
      }

      const createdOrder = orderJson.data;

      // 3. Save customer details for next checkout convenience
      try {
        localStorage.setItem('accessify_cust_v1', JSON.stringify({
          name, phone, email, house, street, city, state, pincode, landmark
        }));
      } catch (_) { }

      // 4. Construct WhatsApp Order Notification Message
      const itemsListFormatted = createdOrder.items.map(it => {
        const varTxt = it.variant ? ` (Variant: ${it.variant})` : '';
        return `- ${it.qty}x ${it.name}${varTxt} - ₹${Number(it.total || (it.price * it.qty)).toLocaleString('en-IN')}`;
      }).join('\n');

      const waMsg =
        `💎 NEW ORDER RECEIVED - ACCESSIFY 💎

Order ID: ${createdOrder.order_number}
Customer: ${createdOrder.customer_name}
Phone: ${createdOrder.customer_phone}
Address: ${createdOrder.shipping_address}

Products Ordered:
${itemsListFormatted}

Items Subtotal: ₹${Number(createdOrder.subtotal).toLocaleString('en-IN')}
Delivery: ${createdOrder.delivery_charge > 0 ? '₹' + createdOrder.delivery_charge : 'Free'}
Total Amount: ₹${Number(createdOrder.total_amount).toLocaleString('en-IN')}

Payment Method: UPI
Payment Status: Payment Screenshot Submitted (Verification Pending)

Thank you! I have uploaded the payment screenshot on the website. Please confirm my order.`;

      // Target WhatsApp: +917012400815
      const targetWaNumber = paymentConfig.whatsappNumber || '917012400815';
      const waUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(waMsg)}`;

      // 5. Clear cart
      clearCart();
      removeScreenshot();
      closeCheckoutModal();

      // 6. Show Success Screen
      openOrderSuccessModal(createdOrder, waUrl);

      // Automatically launch WhatsApp window/tab
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

    } catch (err) {
      console.error('[Checkout Error]', err);
      showError(err.message || 'Something went wrong while submitting your order. Please try again.');
    } finally {
      isSubmittingOrder = false;
      if (el.btnPlaceOrder) el.btnPlaceOrder.disabled = false;
      if (el.btnPlaceOrderText) el.btnPlaceOrderText.style.display = 'inline';
      if (el.btnPlaceOrderSpinner) el.btnPlaceOrderSpinner.style.display = 'none';
    }
  }

  function openOrderSuccessModal(order, waUrl) {
    if (el.successOrderId) el.successOrderId.textContent = order.order_number;
    if (el.successCustName) el.successCustName.textContent = order.customer_name;
    if (el.successCustPhone) el.successCustPhone.textContent = order.customer_phone;
    if (el.successCustAddress) el.successCustAddress.textContent = order.shipping_address;
    if (el.successOrderTotal) el.successOrderTotal.textContent = `₹${Number(order.total_amount).toLocaleString('en-IN')}`;

    if (el.successWhatsappBtn) {
      el.successWhatsappBtn.href = waUrl;
    }

    if (el.orderSuccessBackdrop) {
      el.orderSuccessBackdrop.classList.add('open');
      el.orderSuccessBackdrop.setAttribute('aria-hidden', 'false');
      document.body.classList.add('success-open');
    }
  }

  function closeOrderSuccessModal() {
    if (el.orderSuccessBackdrop) {
      el.orderSuccessBackdrop.classList.remove('open');
      el.orderSuccessBackdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('success-open');
    }
  }

  function openLightbox(src) {
    if (el.lightboxModal && el.lightboxImg) {
      el.lightboxImg.src = src;
      el.lightboxModal.classList.add('open');
      el.lightboxModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeLightbox() {
    if (el.lightboxModal) {
      el.lightboxModal.classList.remove('open');
      el.lightboxModal.setAttribute('aria-hidden', 'true');
    }
  }

  // -------------------------------------------------------------
  // REAL-TIME GLOBAL SYNCHRONIZATION ENGINE
  // -------------------------------------------------------------
  function initRealtimeSync() {
    let isSyncing = false;
    let isCheckingVersion = false;
    let sseFailures = 0;

    async function handleVersionUpdate(incomingVersion) {
      if (!incomingVersion) return;
      if (currentDbVersion === null) {
        if (!isSyncing) {
          isSyncing = true;
          try {
            await Promise.all([fetchCategories(), fetchProducts(false)]);
          } finally {
            isSyncing = false;
          }
        }
        return;
      }

      if (String(incomingVersion) !== String(currentDbVersion) && !isSyncing) {
        isSyncing = true;
        try {
          await fetchCategories();
          await fetchProducts(true);
        } finally {
          isSyncing = false;
        }
      }
    }

    async function checkVersionSync() {
      if (isCheckingVersion || isSyncing) return;
      isCheckingVersion = true;
      try {
        const res = await fetch(`${API_BASE}/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        await handleVersionUpdate(data.dbVersion);
      } catch (e) {
        // network silent
      } finally {
        isCheckingVersion = false;
      }
    }

    // 1. Server-Sent Events (SSE) Stream for immediate local push & serverless heartbeat
    if (window.EventSource) {
      try {
        sseSource = new EventSource('/api/events');

        sseSource.addEventListener('open', () => {
          sseFailures = 0;
        });

        sseSource.addEventListener('catalog_update', (event) => {
          sseFailures = 0;
          try {
            const data = JSON.parse(event.data);
            handleVersionUpdate(data.version || data.dbVersion);
          } catch (e) {
            console.error('Error handling SSE message:', e);
          }
        });

        sseSource.onerror = () => {
          sseFailures += 1;
          // Close only after consecutive real connection failures so serverless short-lived SSE stays clean
          if (sseFailures >= 4 && sseSource) {
            sseSource.close();
            sseSource = null;
          }
        };
      } catch (err) {
        console.warn('SSE connection failed, falling back to background polling');
      }
    }

    // 2. Fast background version polling (ensures near-instant sync across mobile/serverless)
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkVersionSync();
      }
    }, 3500);

    // 3. Sync immediately when shopper returns to the browser tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkVersionSync();
      }
    });
    window.addEventListener('focus', checkVersionSync);
  }

  // -------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // -------------------------------------------------------------
  function showToast(msg, isSync = true) {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isSync ? 'toast-sync' : ''}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${escapeHtml(msg)}</span>
    `;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // -------------------------------------------------------------
  // MOBILE NAVIGATION DRAWER
  // -------------------------------------------------------------
  function openMobileNav() {
    el.mobileNavDrawer?.classList.add('open');
  }

  function closeMobileNav() {
    el.mobileNavDrawer?.classList.remove('open');
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS INITIALIZATION
  // -------------------------------------------------------------
  function initEventListeners() {
    // Department Switcher Tabs (Desktop & Mobile)
    document.querySelectorAll('.header-dept-tab, .mobile-dept-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const sec = tab.getAttribute('data-dept');
        switchSection(sec);
        if (el.mobileNavDrawer?.classList.contains('open')) {
          closeMobileNav();
        }
      });
    });

    // Hero WhatsApp Button
    el.heroWhatsappBtn?.addEventListener('click', () => {
      openWhatsApp(null);
    });

    // Hero Explore Button
    el.heroExploreBtn?.addEventListener('click', () => {
      scrollToCatalog();
    });

    // Category sorting dropdown
    el.sortSelect?.addEventListener('change', (e) => {
      currentSort = e.target.value;
      fetchProducts();
    });

    // Header Category Nav Links
    document.querySelectorAll('[data-header-cat]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = link.getAttribute('data-header-cat');
        setCategory(cat);
      });
    });

    // Search events
    el.searchBtn?.addEventListener('click', openSearchModal);
    document.getElementById('desktop-search-trigger')?.addEventListener('click', openSearchModal);
    el.searchCloseBtn?.addEventListener('click', closeSearchModal);
    el.searchInput?.addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
    });

    // Desktop Category Navigation Links
    document.querySelectorAll('.category-nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = link.getAttribute('data-cat') || 'all';
        setCategory(cat);
      });
    });

    // Desktop Shop By Category Square Cards
    document.querySelectorAll('.category-square-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = card.getAttribute('data-cat') || 'all';
        setCategory(cat);
      });
    });

    document.getElementById('desktop-view-all-cats')?.addEventListener('click', (e) => {
      e.preventDefault();
      setCategory('all');
    });

    // Mobile nav toggle
    document.querySelectorAll('#menu-toggle, .menu-toggle').forEach(btn => {
      btn.addEventListener('click', openMobileNav);
    });
    el.mobileNavClose?.addEventListener('click', closeMobileNav);
    el.mobileNavDrawer?.addEventListener('click', (e) => {
      if (e.target === el.mobileNavDrawer) closeMobileNav();
    });

    // PDP Modal close
    el.pdpCloseBtn?.addEventListener('click', closePdpModal);
    el.pdpModal?.addEventListener('click', (e) => {
      if (e.target === el.pdpModal) closePdpModal();
    });

    // PDP Add to Bag Action
    el.pdpAddCartBtn?.addEventListener('click', () => {
      if (activeProduct) {
        addToCart(activeProduct, activeVariant, 1, true);
      }
    });

    // PDP Buy Now Action
    el.pdpBuyNowBtn?.addEventListener('click', () => {
      if (activeProduct) {
        addToCart(activeProduct, activeVariant, 1, false);
        closePdpModal();
        openCheckoutModal();
      }
    });

    // PDP WhatsApp Action (Enquiry)
    el.pdpWhatsappBtn?.addEventListener('click', () => {
      if (activeProduct) {
        openWhatsApp(activeProduct, activeVariant);
      }
    });

    // Sticky Mobile Bar Actions
    el.stickyAddCartBtn?.addEventListener('click', () => {
      if (activeProduct) {
        addToCart(activeProduct, activeVariant, 1, true);
      }
    });

    el.stickyBuyNowBtn?.addEventListener('click', () => {
      if (activeProduct) {
        addToCart(activeProduct, activeVariant, 1, false);
        closePdpModal();
        openCheckoutModal();
      }
    });

    el.stickyWhatsappBtn?.addEventListener('click', () => {
      if (activeProduct) {
        openWhatsApp(activeProduct, activeVariant);
      }
    });

    // Cart Drawer Actions
    el.headerCartBtn?.addEventListener('click', openCartDrawer);
    el.cartDrawerClose?.addEventListener('click', closeCartDrawer);
    el.cartDrawerOverlay?.addEventListener('click', (e) => {
      if (e.target === el.cartDrawerOverlay) closeCartDrawer();
    });

    // Cart Item Stepper & Removal (Event Delegation)
    el.cartItemsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const idx = parseInt(btn.getAttribute('data-cart-idx'), 10);
      if (isNaN(idx)) return;

      if (action === 'increment') {
        updateCartQty(idx, (cart[idx]?.qty || 1) + 1);
      } else if (action === 'decrement') {
        updateCartQty(idx, (cart[idx]?.qty || 1) - 1);
      } else if (action === 'remove') {
        removeFromCart(idx);
      }
    });

    // Proceed to Checkout
    el.cartCheckoutBtn?.addEventListener('click', () => {
      openCheckoutModal();
    });

    // Checkout Modal Close
    el.checkoutModalClose?.addEventListener('click', closeCheckoutModal);
    el.checkoutModalBackdrop?.addEventListener('click', (e) => {
      if (e.target === el.checkoutModalBackdrop) closeCheckoutModal();
    });

    // Copy Amount Button
    el.btnCopyAmount?.addEventListener('click', () => {
      const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);
      const total = subtotal + Number(paymentConfig.deliveryCharge || 0);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(String(total)).then(() => {
          const orig = el.btnCopyAmount.textContent;
          el.btnCopyAmount.textContent = 'COPIED!';
          setTimeout(() => el.btnCopyAmount.textContent = orig, 1800);
          showToast(`Copied amount ₹${total} to clipboard`);
        });
      }
    });

    // Copy UPI ID Button
    el.btnCopyUpiId?.addEventListener('click', () => {
      const upiId = paymentConfig.upiId || '7012400815@upi';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(upiId).then(() => {
          const orig = el.btnCopyUpiId.textContent;
          el.btnCopyUpiId.textContent = 'COPIED!';
          setTimeout(() => el.btnCopyUpiId.textContent = orig, 1800);
          showToast(`Copied UPI ID "${upiId}" to clipboard`);
        });
      }
    });

    // Screenshot file upload handling
    el.screenshotDropzone?.addEventListener('click', () => {
      el.screenshotFileInput?.click();
    });

    el.screenshotFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleScreenshotSelected(e.target.files[0]);
      }
    });

    // Drag and drop for screenshot dropzone
    el.screenshotDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.screenshotDropzone.classList.add('dragover');
    });

    el.screenshotDropzone?.addEventListener('dragleave', () => {
      el.screenshotDropzone.classList.remove('dragover');
    });

    el.screenshotDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      el.screenshotDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleScreenshotSelected(e.dataTransfer.files[0]);
      }
    });

    el.btnReplaceScreenshot?.addEventListener('click', () => {
      el.screenshotFileInput?.click();
    });

    el.btnRemoveScreenshot?.addEventListener('click', () => {
      removeScreenshot();
    });

    el.screenshotPreviewImg?.addEventListener('click', () => {
      if (el.screenshotPreviewImg.src) {
        openLightbox(el.screenshotPreviewImg.src);
      }
    });

    // Checkout Form Submit
    el.checkoutOrderForm?.addEventListener('submit', handleCheckoutSubmit);

    // Order Success Modal Actions
    el.successContinueBtn?.addEventListener('click', () => {
      closeOrderSuccessModal();
      scrollToCatalog();
    });

    // Lightbox modal close
    el.lightboxClose?.addEventListener('click', closeLightbox);
    el.lightboxModal?.addEventListener('click', (e) => {
      if (e.target === el.lightboxModal) closeLightbox();
    });

    // PDP Share Action
    el.pdpShareBtn?.addEventListener('click', () => {
      if (!activeProduct) return;
      const shareUrl = `${window.location.origin}/?product=${encodeURIComponent(activeProduct.slug || activeProduct.id)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('Product link copied to clipboard!');
        });
      }
    });

    // FAQ Accordion
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });

    // Handle browser back/forward buttons (Popstate)
    window.addEventListener('popstate', (e) => {
      const url = new URL(window.location);
      const prodParam = url.searchParams.get('product');
      const secParam = url.searchParams.get('section');

      if (secParam && secParam !== currentSection) {
        switchSection(secParam, true);
      }

      if (prodParam && allProducts.length > 0) {
        const match = allProducts.find(p => p.slug === prodParam || String(p.id) === String(prodParam));
        if (match) openPdpModal(match);
      } else {
        closePdpModal();
      }
    });

    // Escape key to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePdpModal();
        closeSearchModal();
        closeMobileNav();
      }
    });
  }

  // -------------------------------------------------------------
  // INITIAL ROUTING & DEEP LINKING
  // -------------------------------------------------------------
  async function initSectionRouting() {
    const url = new URL(window.location);
    const prodParam = url.searchParams.get('product');
    const secParam = url.searchParams.get('section');
    const path = window.location.pathname.toLowerCase();
    const storedSec = sessionStorage.getItem('accessify_active_section');

    // Store original accessories vault HTML once
    if (el.categoriesVaultGrid) {
      originalAccessoriesVaultHtml = el.categoriesVaultGrid.innerHTML;
    }

    // Case 1: Direct link to a product (?product=... or /product/...)
    if (prodParam || path.startsWith('/product/')) {
      const pid = prodParam || path.split('/product/')[1];
      if (pid) {
        try {
          const res = await fetch(`${API_BASE}/products/${encodeURIComponent(pid)}`);
          const json = await res.json();
          if (json.success && json.data) {
            currentSection = json.data.section || 'accessories';
            sessionStorage.setItem('accessify_active_section', currentSection);
            await switchSection(currentSection);
            openPdpModal(json.data);
            return;
          }
        } catch (_) { }
      }
    }

    // Case 2: Direct link with section specified via URL (?section=... or /clothing or /accessories)
    if (secParam === 'clothing' || path === '/clothing') {
      currentSection = 'clothing';
      sessionStorage.setItem('accessify_active_section', 'clothing');
      await switchSection('clothing');
      return;
    }
    if (secParam === 'accessories' || path === '/accessories') {
      currentSection = 'accessories';
      sessionStorage.setItem('accessify_active_section', 'accessories');
      await switchSection('accessories');
      return;
    }

    // Case 3: Returning visitor within same session
    if (storedSec === 'clothing' || storedSec === 'accessories') {
      currentSection = storedSec;
      await switchSection(storedSec);
      return;
    }

    // Case 4: Default visitor opening homepage -> directly enter Accessories store
    currentSection = 'accessories';
    await switchSection('accessories');
  }

  // -------------------------------------------------------------
  // HELPER ESCAPING
  // -------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -------------------------------------------------------------
  // BOOTSTRAP
  // -------------------------------------------------------------
  async function init() {
    initEventListeners();
    updateCartUI();
    loadPaymentConfig();
    await initSectionRouting();
    initRealtimeSync();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
