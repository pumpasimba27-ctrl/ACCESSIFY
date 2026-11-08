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
    pdpShareBtn: document.getElementById('pdp-share-btn'),
    pdpRelatedGrid: document.getElementById('pdp-related-grid'),

    // Sticky Mobile Bar
    stickyOrderBar: document.getElementById('sticky-mobile-order-bar'),
    stickyTitle: document.getElementById('sticky-title'),
    stickyPrice: document.getElementById('sticky-price'),
    stickyWhatsappBtn: document.getElementById('sticky-whatsapp-btn'),

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
        allProducts = json.data;
        currentDbVersion = json.dbVersion;
        renderProductsGrid(allProducts);

        if (silent) {
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

  function setCategory(catId) {
    currentCategory = catId;
    renderHeaderNav();
    renderCategoryPills();
    renderMobileCategories();
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
        el.catalogCount.textContent = 'COMING SOON // 0 PIECES';
      } else {
        el.catalogCount.textContent = `SHOWING ${products.length} PIECES`;
      }
    }

    if (products.length === 0) {
      if (currentSection === 'clothing') {
        el.productsGrid.innerHTML = `
          <div class="clothing-empty-state">
            <div class="empty-icon-box">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
              </svg>
            </div>
            <h3 class="clothing-empty-title">CLOTHING VAULT PREPARING</h3>
            <p class="clothing-empty-desc">
              The ACCESSIFY streetwear apparel collection is currently in production. Heavyweight silhouettes, oversized drop-shoulder cuts, and limited-edition garments are dropping soon.
            </p>
            <div class="clothing-empty-actions">
              <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello ACCESSIFY! When is the Clothing drop launching?")}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.966.527 1.93.811 2.796.811 3.181 0 5.767-2.587 5.768-5.766.001-3.181-2.585-5.798-5.768-5.798zm3.385 8.163c-.145.408-.847.781-1.183.829-.336.048-.775.068-2.223-.529-1.854-.764-3.04-2.653-3.132-2.775-.093-.122-.749-.997-.749-1.902 0-.904.472-1.349.64-1.533.168-.184.368-.23.491-.23.123 0 .245.001.353.007.113.005.263-.043.412.316.153.368.522 1.272.568 1.365.046.092.077.2.015.323-.061.123-.092.2-.184.307-.092.107-.194.24-.277.323-.092.092-.189.193-.081.378.107.185.477.787 1.025 1.275.707.63 1.303.825 1.488.917.184.092.292.077.4-.046.108-.123.461-.537.584-.722.123-.184.246-.153.414-.092.169.061 1.074.507 1.258.6.184.092.307.138.353.215.046.077.046.446-.099.854z"/>
                </svg>
                <span>ENQUIRE CLOTHING DROP ON WHATSAPP</span>
              </a>
              <button type="button" class="btn btn-outline" id="switch-to-accessories-btn">
                EXPLORE ACCESSORIES ARCHIVE
              </button>
            </div>
          </div>
        `;
        document.getElementById('switch-to-accessories-btn')?.addEventListener('click', () => {
          switchSection('accessories');
          scrollToCatalog();
        });
      } else {
        el.productsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
            <h3 style="font-size: 1.25rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.75rem;">
              No Pieces Found
            </h3>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
              Try clearing filters or search terms.
            </p>
            <button class="btn btn-outline btn-sm" id="reset-filters-btn">RESET ALL FILTERS</button>
          </div>
        `;
        document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
          currentCategory = 'all';
          currentSearchQuery = '';
          renderHeaderNav();
          renderCategoryPills();
          fetchProducts();
        });
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

    el.pdpCategory.textContent = `// ${p.category.toUpperCase()}`;
    el.pdpTitle.textContent = p.name;
    el.pdpPrice.textContent = `₹${Number(p.price).toLocaleString('en-IN')}`;

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
    el.pdpMainImg.src = images[0];

    let thumbsHtml = '';
    images.forEach((img, idx) => {
      thumbsHtml += `
        <div class="pdp-thumb ${idx === 0 ? 'active' : ''}" data-thumb-src="${escapeHtml(img)}">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)} thumbnail ${idx + 1}">
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

  // -------------------------------------------------------------
  // REAL-TIME GLOBAL SYNCHRONIZATION ENGINE
  // -------------------------------------------------------------
  function initRealtimeSync() {
    // 1. Server-Sent Events (SSE) Stream
    if (window.EventSource) {
      try {
        sseSource = new EventSource('/api/events');

        sseSource.addEventListener('catalog_update', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.version && data.version !== currentDbVersion) {
              fetchProducts(true);
              fetchCategories();
            }
          } catch (e) {
            console.error('Error handling SSE message:', e);
          }
        });

        sseSource.onerror = () => {
          // Fallback to polling if SSE drops on mobile or Instagram browser
          sseSource.close();
          sseSource = null;
        };
      } catch (err) {
        console.warn('SSE connection failed, falling back to background polling');
      }
    }

    // 2. Periodic background version poll every 10 seconds
    setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/version?t=${Date.now()}`);
        const data = await res.json();
        if (data.dbVersion && currentDbVersion && data.dbVersion > currentDbVersion) {
          fetchProducts(true);
          fetchCategories();
        }
      } catch (e) {
        // network silent
      }
    }, 10000);
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
    el.searchCloseBtn?.addEventListener('click', closeSearchModal);
    el.searchInput?.addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
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

    // PDP WhatsApp Action
    el.pdpWhatsappBtn?.addEventListener('click', () => {
      if (activeProduct) {
        openWhatsApp(activeProduct, activeVariant);
      }
    });

    // Sticky WhatsApp Action (Mobile)
    el.stickyWhatsappBtn?.addEventListener('click', () => {
      if (activeProduct) {
        openWhatsApp(activeProduct, activeVariant);
      }
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
