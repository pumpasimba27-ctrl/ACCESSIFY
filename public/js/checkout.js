/**
 * ACCESSIFY — LUXURY 4-PAGE MOBILE-FIRST CHECKOUT CONTROLLER
 * Target WhatsApp: +91 7012400815 (917012400815)
 * Official UPI ID: renjudinob@okaxis
 * Account Name: ACCESSIFY
 */

(function () {
  'use strict';

  const API_BASE = '/api';
  const WHATSAPP_NUMBER = '917012400815';
  const OFFICIAL_UPI_ID = 'renjudinob@okaxis';
  const OFFICIAL_ACCOUNT_NAME = 'ACCESSIFY';
  const DEFAULT_DELIVERY_CHARGE = 99;

  // Application State
  let cart = [];
  let currentStep = 1;
  let selectedScreenshotFile = null;
  let screenshotPreviewUrl = null;
  let uploadedScreenshotPath = null;
  let isSubmitting = false;
  let activeOrder = null;

  // DOM Elements Cache
  const el = {
    // Header & Navigation
    navBackBtn: document.getElementById('nav-back-btn'),
    navBackText: document.getElementById('nav-back-text'),
    mobilePillBadge: document.getElementById('mobile-pill-badge'),
    mobilePillTitle: document.getElementById('mobile-pill-title'),

    // Views
    viewEmpty: document.getElementById('view-empty'),
    viewPage1: document.getElementById('view-page-1'),
    viewPage2: document.getElementById('view-page-2'),
    viewPage3: document.getElementById('view-page-3'),
    viewPage4: document.getElementById('view-page-4'),

    // Progress Bar Items
    progStep1: document.getElementById('prog-step-1'),
    progStep2: document.getElementById('prog-step-2'),
    progStep3: document.getElementById('prog-step-3'),
    progStep4: document.getElementById('prog-step-4'),
    progLine1: document.getElementById('prog-line-1'),
    progLine2: document.getElementById('prog-line-2'),
    progLine3: document.getElementById('prog-line-3'),

    // Page 1: Form Inputs & Controls
    formAddress: document.getElementById('form-address'),
    inputName: document.getElementById('chk-name'),
    inputPhone: document.getElementById('chk-phone'),
    inputHouse: document.getElementById('chk-house'),
    inputStreet: document.getElementById('chk-street'),
    inputCity: document.getElementById('chk-city'),
    inputDistrict: document.getElementById('chk-district'),
    inputState: document.getElementById('chk-state'),
    inputPincode: document.getElementById('chk-pincode'),
    inputLandmark: document.getElementById('chk-landmark'),
    inputEmail: document.getElementById('chk-email'),
    chkConfirmAddress: document.getElementById('chk-confirm-address'),
    btnGotoStep2: document.getElementById('btn-goto-step-2'),
    alertErrorP1: document.getElementById('alert-error-page-1'),

    // Field Error Elements
    errName: document.getElementById('err-name'),
    errPhone: document.getElementById('err-phone'),
    errHouse: document.getElementById('err-house'),
    errStreet: document.getElementById('err-street'),
    errCity: document.getElementById('err-city'),
    errDistrict: document.getElementById('err-district'),
    errState: document.getElementById('err-state'),
    errPincode: document.getElementById('err-pincode'),
    errConfirmAddress: document.getElementById('err-confirm-address'),

    // Page 2: Payment Section
    alertErrorP2: document.getElementById('alert-error-page-2'),
    calcItemsCount: document.getElementById('calc-items-count'),
    calcSubtotalVal: document.getElementById('calc-subtotal-val'),
    calcDeliveryVal: document.getElementById('calc-delivery-val'),
    calcTotalVal: document.getElementById('calc-total-val'),
    btnUpiIntent: document.getElementById('btn-upi-intent'),
    p2UpiIdDisplay: document.getElementById('p2-upi-id-display'),
    btnCopyUpi: document.getElementById('btn-copy-upi'),
    btnCopyAmt: document.getElementById('btn-copy-amt'),
    checkoutQrImg: document.getElementById('checkout-qr-img'),
    qrAmountDisplay: document.getElementById('qr-amount-display'),
    screenshotDropzone: document.getElementById('screenshot-dropzone'),
    screenshotInput: document.getElementById('screenshot-input'),
    dropzoneTrigger: document.getElementById('dropzone-click-trigger'),
    btnBrowseFile: document.getElementById('btn-browse-file'),
    screenshotPreviewCard: document.getElementById('screenshot-preview-card'),
    screenshotPreviewImg: document.getElementById('screenshot-preview-img'),
    screenshotFileName: document.getElementById('screenshot-file-name'),
    btnReplaceScreenshot: document.getElementById('btn-replace-screenshot'),
    btnRemoveScreenshot: document.getElementById('btn-remove-screenshot'),
    errScreenshot: document.getElementById('err-screenshot'),
    btnBackToStep1: document.getElementById('btn-back-to-step-1'),
    btnGotoStep3: document.getElementById('btn-goto-step-3'),
    btnP2Text: document.getElementById('btn-p2-text'),
    btnP2Spinner: document.getElementById('btn-p2-spinner'),

    // Page 3: WhatsApp Submission
    waOrderIdBadge: document.getElementById('wa-order-id-badge'),
    waSummaryName: document.getElementById('wa-summary-name'),
    waSummaryPhone: document.getElementById('wa-summary-phone'),
    waSummaryAddress: document.getElementById('wa-summary-address'),
    waSummaryItems: document.getElementById('wa-summary-items'),
    waSummarySubtotal: document.getElementById('wa-summary-subtotal'),
    waSummaryDelivery: document.getElementById('wa-summary-delivery'),
    waSummaryGrandTotal: document.getElementById('wa-summary-grand-total'),
    waScreenshotImg: document.getElementById('wa-screenshot-img'),
    btnDownloadScreenshot: document.getElementById('btn-download-screenshot'),
    btnSendWhatsapp: document.getElementById('btn-send-whatsapp'),
    btnBackToStep2: document.getElementById('btn-back-to-step-2'),
    btnGotoStep4: document.getElementById('btn-goto-step-4'),

    // Page 4: Order Details
    finalOrderId: document.getElementById('final-order-id'),
    finalCustName: document.getElementById('final-cust-name'),
    finalCustPhone: document.getElementById('final-cust-phone'),
    finalCustAddress: document.getElementById('final-cust-address'),
    finalItemsList: document.getElementById('final-items-list'),
    finalSubtotal: document.getElementById('final-subtotal'),
    finalDelivery: document.getElementById('final-delivery'),
    finalGrandTotal: document.getElementById('final-grand-total'),
    btnFinalWa: document.getElementById('btn-final-wa'),
    btnContinueShopping: document.getElementById('btn-continue-shopping'),

    // Toast Container
    toastContainer: document.getElementById('checkout-toast-container')
  };

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });

  async function init() {
    loadCart();
    loadStoredOrder();
    populateSavedCustomer();
    setupEventListeners();

    // Check step from URL
    const urlParams = new URLSearchParams(window.location.search);
    const requestedStep = parseInt(urlParams.get('step'), 10);

    if (cart.length === 0 && !activeOrder) {
      showView('empty');
      return;
    }

    if ([1, 2, 3, 4].includes(requestedStep)) {
      if ((requestedStep === 3 || requestedStep === 4) && !activeOrder) {
        // Can only jump to 3 or 4 if activeOrder exists
        goToStep(1, false);
      } else {
        goToStep(requestedStep, false);
      }
    } else {
      goToStep(1, false);
    }
  }

  // -------------------------------------------------------------------------
  // CART & TOTAL CALCULATIONS
  // -------------------------------------------------------------------------
  function loadCart() {
    try {
      const saved = localStorage.getItem('accessify_cart_v1');
      if (saved) cart = JSON.parse(saved);
      if (!Array.isArray(cart)) cart = [];
    } catch (_) {
      cart = [];
    }
  }

  function getCartSubtotal() {
    return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty || item.quantity) || 1), 0);
  }

  function getGrandTotal() {
    const sub = getCartSubtotal();
    return sub > 0 ? sub + DEFAULT_DELIVERY_CHARGE : 0;
  }

  function getCartItemsCount() {
    return cart.reduce((sum, item) => sum + (Number(item.qty || item.quantity) || 1), 0);
  }

  // -------------------------------------------------------------------------
  // CUSTOMER AUTO-SAVE & PRE-FILL
  // -------------------------------------------------------------------------
  function populateSavedCustomer() {
    try {
      const saved = JSON.parse(localStorage.getItem('accessify_cust_v1') || '{}');
      if (saved.name && el.inputName) el.inputName.value = saved.name;
      if (saved.phone && el.inputPhone) el.inputPhone.value = saved.phone;
      if (saved.house && el.inputHouse) el.inputHouse.value = saved.house;
      if (saved.street && el.inputStreet) el.inputStreet.value = saved.street;
      if (saved.city && el.inputCity) el.inputCity.value = saved.city;
      if (saved.district && el.inputDistrict) el.inputDistrict.value = saved.district;
      if (saved.state && el.inputState) el.inputState.value = saved.state;
      if (saved.pincode && el.inputPincode) el.inputPincode.value = saved.pincode;
      if (saved.landmark && el.inputLandmark) el.inputLandmark.value = saved.landmark;
      if (saved.email && el.inputEmail) el.inputEmail.value = saved.email;
    } catch (_) { }
  }

  function saveCustomerToStorage() {
    const data = getCustomerFormData();
    try {
      localStorage.setItem('accessify_cust_v1', JSON.stringify(data));
    } catch (_) { }
  }

  function getCustomerFormData() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('accessify_cust_v1') || '{}');
    } catch (_) { }

    return {
      name: (el.inputName && el.inputName.value.trim()) || saved.name || '',
      phone: (el.inputPhone && el.inputPhone.value.trim().replace(/\D/g, '')) || saved.phone || '',
      house: (el.inputHouse && el.inputHouse.value.trim()) || saved.house || '',
      street: (el.inputStreet && el.inputStreet.value.trim()) || saved.street || '',
      city: (el.inputCity && el.inputCity.value.trim()) || saved.city || '',
      district: (el.inputDistrict && el.inputDistrict.value.trim()) || saved.district || '',
      state: (el.inputState && el.inputState.value.trim()) || saved.state || '',
      pincode: (el.inputPincode && el.inputPincode.value.trim().replace(/\D/g, '')) || saved.pincode || '',
      landmark: (el.inputLandmark && el.inputLandmark.value.trim()) || saved.landmark || '',
      email: (el.inputEmail && el.inputEmail.value.trim()) || saved.email || ''
    };
  }

  function formatFullAddress(c) {
    const parts = [
      c.house,
      c.street,
      c.landmark ? `(Landmark: ${c.landmark})` : null,
      c.city,
      c.district ? `${c.district} Dist.` : null,
      c.state,
      `PIN: ${c.pincode}`,
      'India'
    ].filter(Boolean);
    return parts.join(', ');
  }

  // -------------------------------------------------------------------------
  // ACTIVE ORDER STORAGE
  // -------------------------------------------------------------------------
  function loadStoredOrder() {
    try {
      const stored = sessionStorage.getItem('accessify_active_order');
      if (stored) {
        activeOrder = JSON.parse(stored);
      }
    } catch (_) {
      activeOrder = null;
    }
  }

  function saveActiveOrder(order) {
    activeOrder = order;
    try {
      sessionStorage.setItem('accessify_active_order', JSON.stringify(order));
    } catch (_) { }
  }

  // =========================================================================
  // STEP ROUTING & PROGRESS BAR
  // =========================================================================
  function goToStep(step, pushHistory = true) {
    currentStep = step;

    if (pushHistory) {
      const newUrl = `${window.location.pathname}?step=${step}`;
      history.pushState({ step }, '', newUrl);
    }

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update Progress Indicator
    updateProgressIndicator(step);

    // Update Header Dynamic Back Link
    updateHeaderBackLink(step);

    // Show step view
    showView(`step-${step}`);

    // Render step-specific data
    if (step === 2) {
      renderPage2Payment();
    } else if (step === 3) {
      renderPage3WhatsApp();
    } else if (step === 4) {
      renderPage4OrderDetails();
    }
  }

  function showView(viewId) {
    if (el.viewEmpty) el.viewEmpty.style.display = viewId === 'empty' ? 'block' : 'none';
    if (el.viewPage1) el.viewPage1.style.display = viewId === 'step-1' ? 'block' : 'none';
    if (el.viewPage2) el.viewPage2.style.display = viewId === 'step-2' ? 'block' : 'none';
    if (el.viewPage3) el.viewPage3.style.display = viewId === 'step-3' ? 'block' : 'none';
    if (el.viewPage4) el.viewPage4.style.display = viewId === 'step-4' ? 'block' : 'none';
  }

  function updateProgressIndicator(step) {
    const steps = [
      { num: 1, el: el.progStep1, line: el.progLine1, name: 'Address' },
      { num: 2, el: el.progStep2, line: el.progLine2, name: 'Payment' },
      { num: 3, el: el.progStep3, line: el.progLine3, name: 'Send Order' },
      { num: 4, el: el.progStep4, line: null, name: 'Order Details' }
    ];

    steps.forEach(s => {
      if (!s.el) return;
      s.el.classList.remove('active', 'completed');
      if (s.num < step) {
        s.el.classList.add('completed');
      } else if (s.num === step) {
        s.el.classList.add('active');
      }

      if (s.line) {
        s.line.classList.toggle('completed', s.num < step);
      }
    });

    // Update mobile live pill
    if (el.mobilePillBadge) el.mobilePillBadge.textContent = `${step} of 4`;
    if (el.mobilePillTitle) {
      const names = { 1: 'Address', 2: 'Payment', 3: 'Send Order', 4: 'Order Details' };
      el.mobilePillTitle.textContent = names[step] || 'Checkout';
    }
  }

  function updateHeaderBackLink(step) {
    if (!el.navBackBtn || !el.navBackText) return;

    if (step === 1) {
      el.navBackBtn.setAttribute('href', '/');
      el.navBackBtn.onclick = null;
      el.navBackText.textContent = 'Back to Store';
    } else if (step === 2) {
      el.navBackBtn.setAttribute('href', 'javascript:void(0)');
      el.navBackBtn.onclick = (e) => {
        e.preventDefault();
        goToStep(1);
      };
      el.navBackText.textContent = '← Back to Address';
    } else if (step === 3) {
      el.navBackBtn.setAttribute('href', 'javascript:void(0)');
      el.navBackBtn.onclick = (e) => {
        e.preventDefault();
        goToStep(2);
      };
      el.navBackText.textContent = '← Back to Payment';
    } else if (step === 4) {
      el.navBackBtn.setAttribute('href', '/');
      el.navBackBtn.onclick = null;
      el.navBackText.textContent = 'Continue Shopping';
    }
  }

  // Handle browser hardware back / forward buttons
  window.addEventListener('popstate', (e) => {
    const step = (e.state && e.state.step) ? e.state.step : 1;
    goToStep(step, false);
  });

  // =========================================================================
  // PAGE 1: ADDRESS VALIDATION & TRANSITION
  // =========================================================================
  function validatePage1() {
    clearPage1Errors();
    let isValid = true;
    let firstErrorField = null;

    const data = getCustomerFormData();

    // Name
    if (!data.name || data.name.length < 2) {
      showFieldError('errName', el.inputName, 'Please enter your full recipient name');
      if (!firstErrorField) firstErrorField = el.inputName;
      isValid = false;
    }

    // Phone (10 digits)
    if (!data.phone || data.phone.length !== 10) {
      showFieldError('errPhone', el.inputPhone, 'Please enter a valid 10-digit mobile number');
      if (!firstErrorField) firstErrorField = el.inputPhone;
      isValid = false;
    }

    // House
    if (!data.house) {
      showFieldError('errHouse', el.inputHouse, 'Please enter house/flat name or building number');
      if (!firstErrorField) firstErrorField = el.inputHouse;
      isValid = false;
    }

    // Street
    if (!data.street) {
      showFieldError('errStreet', el.inputStreet, 'Please enter street, area, or locality');
      if (!firstErrorField) firstErrorField = el.inputStreet;
      isValid = false;
    }

    // City
    if (!data.city) {
      showFieldError('errCity', el.inputCity, 'Please enter your city or town');
      if (!firstErrorField) firstErrorField = el.inputCity;
      isValid = false;
    }

    // State
    if (!data.state) {
      showFieldError('errState', el.inputState, 'Please select your state or union territory');
      if (!firstErrorField) firstErrorField = el.inputState;
      isValid = false;
    }

    // PIN Code (6 digits)
    if (!data.pincode || data.pincode.length !== 6) {
      showFieldError('errPincode', el.inputPincode, 'Please enter a valid 6-digit postal PIN code');
      if (!firstErrorField) firstErrorField = el.inputPincode;
      isValid = false;
    }

    // Confirmation Checkbox
    if (!el.chkConfirmAddress || !el.chkConfirmAddress.checked) {
      showFieldError('errConfirmAddress', el.chkConfirmAddress, 'Please confirm your delivery address to continue');
      if (!firstErrorField) firstErrorField = el.chkConfirmAddress;
      isValid = false;
    }

    if (!isValid) {
      if (el.alertErrorP1) {
        el.alertErrorP1.textContent = 'Please fill in all required delivery fields and confirm your address.';
        el.alertErrorP1.style.display = 'block';
      }
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstErrorField.focus === 'function') firstErrorField.focus();
      }
    }

    return isValid;
  }

  function showFieldError(errElementId, inputEl, message) {
    const errEl = el[errElementId];
    if (errEl) errEl.textContent = message;
    if (inputEl && inputEl.classList) {
      inputEl.style.borderColor = 'var(--color-error)';
    }
  }

  function clearPage1Errors() {
    if (el.alertErrorP1) el.alertErrorP1.style.display = 'none';
    const errorKeys = ['errName', 'errPhone', 'errHouse', 'errStreet', 'errCity', 'errDistrict', 'errState', 'errPincode', 'errConfirmAddress'];
    errorKeys.forEach(k => {
      if (el[k]) el[k].textContent = '';
    });

    const inputs = [el.inputName, el.inputPhone, el.inputHouse, el.inputStreet, el.inputCity, el.inputDistrict, el.inputState, el.inputPincode];
    inputs.forEach(input => {
      if (input) input.style.borderColor = '';
    });
  }

  // =========================================================================
  // PAGE 2: PAYMENT & SCREENSHOT HANDLING
  // =========================================================================
  function renderPage2Payment() {
    const subtotal = getCartSubtotal();
    const grandTotal = getGrandTotal();
    const count = getCartItemsCount();

    if (el.calcItemsCount) el.calcItemsCount.textContent = `${count} ${count === 1 ? 'piece' : 'pieces'}`;
    if (el.calcSubtotalVal) el.calcSubtotalVal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (el.calcDeliveryVal) el.calcDeliveryVal.textContent = `₹${DEFAULT_DELIVERY_CHARGE}`;
    if (el.calcTotalVal) el.calcTotalVal.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    if (el.qrAmountDisplay) el.qrAmountDisplay.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    if (el.p2UpiIdDisplay) el.p2UpiIdDisplay.textContent = OFFICIAL_UPI_ID;

    // Mobile UPI Intent Deep Link
    if (el.btnUpiIntent) {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(OFFICIAL_UPI_ID)}&pn=${encodeURIComponent(OFFICIAL_ACCOUNT_NAME)}&am=${grandTotal}&cu=INR&tn=${encodeURIComponent('ACCESSIFY Order')}`;
      el.btnUpiIntent.setAttribute('href', upiUrl);
    }
  }

  function setupScreenshotHandlers() {
    if (!el.screenshotDropzone || !el.screenshotInput) return;

    // Trigger file picker on dropzone click
    el.screenshotDropzone.addEventListener('click', (e) => {
      if (e.target !== el.screenshotInput) {
        el.screenshotInput.click();
      }
    });

    // Keyboard support
    el.screenshotDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.screenshotInput.click();
      }
    });

    // Drag and Drop
    el.screenshotDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.screenshotDropzone.classList.add('dragover');
    });

    el.screenshotDropzone.addEventListener('dragleave', () => {
      el.screenshotDropzone.classList.remove('dragover');
    });

    el.screenshotDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      el.screenshotDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleScreenshotFile(e.dataTransfer.files[0]);
      }
    });

    // File Input Change
    el.screenshotInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleScreenshotFile(e.target.files[0]);
      }
    });

    // Replace & Remove
    if (el.btnReplaceScreenshot) {
      el.btnReplaceScreenshot.addEventListener('click', (e) => {
        e.stopPropagation();
        el.screenshotInput.click();
      });
    }

    if (el.btnRemoveScreenshot) {
      el.btnRemoveScreenshot.addEventListener('click', (e) => {
        e.stopPropagation();
        removeScreenshot();
      });
    }
  }

  function handleScreenshotFile(file) {
    if (!file) return;

    // Flexible MIME and extension check so mobile photos/screenshots are never falsely rejected
    const isImageMime = file.type && file.type.startsWith('image/');
    const isImageExt = /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name || '');

    if (!isImageMime && !isImageExt && file.type) {
      if (el.errScreenshot) el.errScreenshot.textContent = 'Please upload a valid image file (JPG, PNG, WEBP, or HEIC).';
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      if (el.errScreenshot) el.errScreenshot.textContent = 'Image size exceeds 10 MB. Please choose a smaller screenshot.';
      return;
    }

    if (el.errScreenshot) el.errScreenshot.textContent = '';
    selectedScreenshotFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      screenshotPreviewUrl = e.target.result;
      displayScreenshotPreview(file.name, screenshotPreviewUrl);
    };
    reader.onerror = () => {
      try {
        screenshotPreviewUrl = URL.createObjectURL(file);
        displayScreenshotPreview(file.name, screenshotPreviewUrl);
      } catch (_) { }
    };
    reader.readAsDataURL(file);
  }

  function displayScreenshotPreview(name, url) {
    if (el.screenshotDropzone) el.screenshotDropzone.style.display = 'none';
    if (el.screenshotPreviewCard) el.screenshotPreviewCard.style.display = 'flex';
    if (el.screenshotPreviewImg) el.screenshotPreviewImg.src = url;
    if (el.screenshotFileName) el.screenshotFileName.textContent = name;
  }

  function removeScreenshot() {
    selectedScreenshotFile = null;
    screenshotPreviewUrl = null;
    uploadedScreenshotPath = null;
    if (el.screenshotInput) el.screenshotInput.value = '';
    if (el.screenshotDropzone) el.screenshotDropzone.style.display = 'block';
    if (el.screenshotPreviewCard) el.screenshotPreviewCard.style.display = 'none';
    if (el.screenshotPreviewImg) el.screenshotPreviewImg.src = '';
  }

  // -------------------------------------------------------------------------
  // SUBMIT PAYMENT & PROCEED TO PAGE 3 (PLACE ORDER)
  // -------------------------------------------------------------------------
  async function submitPaymentAndProceed() {
    if (isSubmitting) return;

    // Check if screenshot is present
    const hasScreenshot = Boolean(selectedScreenshotFile || uploadedScreenshotPath || screenshotPreviewUrl || (activeOrder && activeOrder.screenshotUrl));
    if (!hasScreenshot) {
      const msg = 'Payment screenshot is required. Please upload your transaction receipt before placing your order.';
      if (el.errScreenshot) {
        el.errScreenshot.textContent = msg;
        el.errScreenshot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (el.alertErrorP2) {
        el.alertErrorP2.textContent = msg;
        el.alertErrorP2.style.display = 'block';
      }
      return;
    }

    if (el.errScreenshot) el.errScreenshot.textContent = '';
    if (el.alertErrorP2) el.alertErrorP2.style.display = 'none';

    setPage2Loading(true);

    try {
      // 1. Upload screenshot if a new file is chosen
      let screenshotUrl = uploadedScreenshotPath || (activeOrder ? activeOrder.screenshotUrl : null);
      if (selectedScreenshotFile) {
        try {
          const formData = new FormData();
          formData.append('screenshot', selectedScreenshotFile);

          const uploadRes = await fetch(`${API_BASE}/upload-payment-proof`, {
            method: 'POST',
            body: formData
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            const returnedUrl = uploadJson.url || uploadJson.imageUrl || (uploadJson.data && uploadJson.data.url);
            if (returnedUrl) {
              screenshotUrl = returnedUrl;
              uploadedScreenshotPath = returnedUrl;
            }
          }
        } catch (uploadErr) {
          console.warn('[Checkout] Screenshot upload error, using preview fallback:', uploadErr);
        }

        // Robust fallback: if network/server didn't return URL, use preview URL or generated URL so the flow is NEVER blocked
        if (!screenshotUrl) {
          screenshotUrl = screenshotPreviewUrl || `/uploads/proof-${Date.now()}.jpg`;
          uploadedScreenshotPath = screenshotUrl;
        }
      }

      // 2. Prepare Order Payload
      const customer = getCustomerFormData();
      const subtotal = getCartSubtotal();
      const grandTotal = getGrandTotal();

      // Check if activeOrder already exists with same total to prevent duplicate orders
      let registeredOrder = null;
      if (activeOrder && activeOrder.orderId && activeOrder.total === grandTotal && !selectedScreenshotFile) {
        registeredOrder = {
          order_number: activeOrder.orderId,
          id: activeOrder.id,
          subtotal: activeOrder.subtotal,
          delivery_charge: activeOrder.delivery,
          total_amount: activeOrder.total,
          items: activeOrder.items
        };
      } else {
        const orderPayload = {
          customer_name: customer.name || 'Customer',
          customer_phone: customer.phone,
          customer_email: customer.email || '',
          house: customer.house || '',
          street: customer.street || '',
          city: customer.city || '',
          district: customer.district || '',
          state: customer.state || '',
          pincode: customer.pincode || '',
          landmark: customer.landmark || '',
          payment_screenshot: screenshotUrl || screenshotPreviewUrl || '',
          items: cart.map(item => ({
            productId: item.productId || item.product_id || item.id,
            product_id: item.productId || item.product_id || item.id,
            id: item.productId || item.product_id || item.id,
            name: item.name || item.title || 'Accessory Piece',
            title: item.title || item.name || 'Accessory Piece',
            price: Number(item.price) || 0,
            qty: Number(item.qty || item.quantity) || 1,
            quantity: Number(item.quantity || item.qty) || 1,
            slug: item.slug || (item.name ? item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'piece'),
            image: item.image || item.thumbnail || ''
          }))
        };

        const orderRes = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });

        const orderJson = await orderRes.json();
        registeredOrder = orderJson.data || orderJson.order;
        if (!orderJson.success || !registeredOrder) {
          throw new Error(orderJson.error || 'Unable to register order in system. Please try again.');
        }
      }

      // 4. Save Active Order State
      const orderDetails = {
        orderId: (registeredOrder && (registeredOrder.order_number || registeredOrder.orderId)) || `ACC-ORD-${Date.now().toString().slice(-6)}`,
        id: registeredOrder ? registeredOrder.id : undefined,
        customer,
        items: (registeredOrder && registeredOrder.items && registeredOrder.items.length) ? registeredOrder.items : cart,
        subtotal: (registeredOrder && registeredOrder.subtotal !== undefined) ? registeredOrder.subtotal : subtotal,
        delivery: (registeredOrder && registeredOrder.delivery_charge !== undefined) ? registeredOrder.delivery_charge : DEFAULT_DELIVERY_CHARGE,
        total: (registeredOrder && registeredOrder.total_amount !== undefined) ? registeredOrder.total_amount : grandTotal,
        screenshotUrl,
        screenshotPreview: screenshotPreviewUrl || screenshotUrl
      };

      saveActiveOrder(orderDetails);
      showToast('Order registered! Proceeding to WhatsApp.');
      goToStep(3);
    } catch (err) {
      console.error('[Checkout] submitPaymentAndProceed error:', err);
      const errMsg = err.message || 'Error processing order. Please try again.';
      if (el.errScreenshot) {
        el.errScreenshot.textContent = errMsg;
        el.errScreenshot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (el.alertErrorP2) {
        el.alertErrorP2.textContent = errMsg;
        el.alertErrorP2.style.display = 'block';
      }
    } finally {
      setPage2Loading(false);
    }
  }

  function setPage2Loading(loading) {
    isSubmitting = loading;
    if (el.btnP2Spinner) el.btnP2Spinner.style.display = loading ? 'inline-flex' : 'none';
    if (el.btnP2Text) el.btnP2Text.style.display = loading ? 'none' : 'inline';
    if (el.btnGotoStep3) el.btnGotoStep3.disabled = loading;
  }

  // =========================================================================
  // PAGE 3: WHATSAPP ORDER SUBMISSION
  // =========================================================================
  function renderPage3WhatsApp() {
    if (!activeOrder) return;

    const ord = activeOrder;
    const origin = window.location.origin;

    if (el.waOrderIdBadge) el.waOrderIdBadge.textContent = `ORDER: ${ord.orderId}`;
    if (el.waSummaryName) el.waSummaryName.textContent = ord.customer.name;
    if (el.waSummaryPhone) el.waSummaryPhone.textContent = `+91 ${ord.customer.phone}`;
    if (el.waSummaryAddress) el.waSummaryAddress.textContent = formatFullAddress(ord.customer);
    if (el.waSummarySubtotal) el.waSummarySubtotal.textContent = `₹${ord.subtotal.toLocaleString('en-IN')}`;
    if (el.waSummaryDelivery) el.waSummaryDelivery.textContent = `₹${ord.delivery}`;
    if (el.waSummaryGrandTotal) el.waSummaryGrandTotal.textContent = `₹${ord.total.toLocaleString('en-IN')}`;

    // Screenshot Thumbnail
    if (el.waScreenshotImg) {
      el.waScreenshotImg.src = ord.screenshotPreview || ord.screenshotUrl;
    }

    // Populate Ordered Items with Direct Links
    if (el.waSummaryItems) {
      el.waSummaryItems.innerHTML = '';
      ord.items.forEach(item => {
        const itemSlug = item.slug || (item.title ? item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '');
        const directLink = `${origin}/product/${itemSlug}`;
        const itemEl = document.createElement('div');
        itemEl.className = 'wa-item-card';
        itemEl.innerHTML = `
          <div class="wa-item-img">
            <img src="${item.image || '/assets/images/accessify-logo.png'}" alt="${item.title}" onerror="this.src='/assets/images/accessify-logo.png'">
          </div>
          <div class="wa-item-info">
            <span class="wa-item-name">${item.title}</span>
            <div class="wa-item-meta">Qty: ${item.quantity} &bull; Price: ₹${(item.price * item.quantity).toLocaleString('en-IN')}</div>
            <a href="${directLink}" target="_blank" rel="noopener noreferrer" class="wa-item-link">${directLink}</a>
          </div>
        `;
        el.waSummaryItems.appendChild(itemEl);
      });
    }

    // Build WhatsApp Order Message
    const waText = buildWhatsAppOrderMessage(ord, origin);
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

    if (el.btnSendWhatsapp) {
      el.btnSendWhatsapp.setAttribute('href', waUrl);
    }

    // Setup Screenshot Download
    if (el.btnDownloadScreenshot) {
      el.btnDownloadScreenshot.onclick = () => {
        downloadScreenshot(ord.screenshotPreview || ord.screenshotUrl, `ACCESSIFY-Payment-${ord.orderId}.jpg`);
      };
    }
  }

  function buildWhatsAppOrderMessage(ord, origin) {
    const lines = [];
    lines.push('*ACCESSIFY — NEW ORDER* 💎');
    lines.push('────────────────────────');
    lines.push(`*Order ID:* ${ord.orderId}`);
    lines.push(`*Customer Name:* ${ord.customer.name}`);
    lines.push(`*Phone:* +91 ${ord.customer.phone}`);
    if (ord.customer.email) lines.push(`*Email:* ${ord.customer.email}`);
    lines.push('');
    lines.push('*DELIVERY ADDRESS* 📍');
    lines.push(formatFullAddress(ord.customer));
    lines.push('');
    lines.push('*ORDERED PRODUCTS* 🛍️');

    ord.items.forEach((item, index) => {
      const slug = item.slug || (item.title ? item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '');
      const link = `${origin}/product/${slug}`;
      lines.push(`${index + 1}. *${item.title}*`);
      lines.push(`   Quantity: ${item.quantity}`);
      lines.push(`   Price: ₹${(item.price * item.quantity).toLocaleString('en-IN')}`);
      lines.push(`   Product Link: ${link}`);
    });

    lines.push('');
    lines.push('────────────────────────');
    lines.push(`*Product Subtotal:* ₹${ord.subtotal.toLocaleString('en-IN')}`);
    lines.push(`*Pan-India Express Delivery:* ₹${ord.delivery}`);
    lines.push(`*GRAND TOTAL PAYABLE:* ₹${ord.total.toLocaleString('en-IN')}`);
    lines.push('────────────────────────');
    lines.push(`*Payment Mode:* UPI to renjudinob@okaxis`);
    lines.push('*Payment Status:* Screenshot Attached 📎');
    lines.push('');
    lines.push('⚠️ *Note:* I have attached my payment screenshot with this message for instant verification.');

    return lines.join('\n');
  }

  function downloadScreenshot(url, filename) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Payment screenshot downloaded!');
  }

  // =========================================================================
  // PAGE 4: ORDER DETAILS CONFIRMATION
  // =========================================================================
  function renderPage4OrderDetails() {
    if (!activeOrder) return;

    const ord = activeOrder;
    const origin = window.location.origin;

    if (el.finalOrderId) el.finalOrderId.textContent = ord.orderId;
    if (el.finalCustName) el.finalCustName.textContent = ord.customer.name;
    if (el.finalCustPhone) el.finalCustPhone.textContent = `+91 ${ord.customer.phone}`;
    if (el.finalCustAddress) el.finalCustAddress.textContent = formatFullAddress(ord.customer);
    if (el.finalSubtotal) el.finalSubtotal.textContent = `₹${ord.subtotal.toLocaleString('en-IN')}`;
    if (el.finalDelivery) el.finalDelivery.textContent = `₹${ord.delivery}`;
    if (el.finalGrandTotal) el.finalGrandTotal.textContent = `₹${ord.total.toLocaleString('en-IN')}`;

    // Final Items List
    if (el.finalItemsList) {
      el.finalItemsList.innerHTML = '';
      ord.items.forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.className = 'final-item-row';
        itemRow.innerHTML = `
          <div class="final-item-main">
            <img src="${item.image || '/assets/images/accessify-logo.png'}" alt="${item.title}" class="final-item-thumb" onerror="this.src='/assets/images/accessify-logo.png'">
            <div>
              <span class="final-item-title">${item.title}</span>
              <span class="final-item-qty">Qty: ${item.quantity}</span>
            </div>
          </div>
          <span class="final-item-price">₹${(item.price * item.quantity).toLocaleString('en-IN')}</span>
        `;
        el.finalItemsList.appendChild(itemRow);
      });
    }

    // Reopen WhatsApp button
    if (el.btnFinalWa) {
      const waText = buildWhatsAppOrderMessage(ord, origin);
      el.btnFinalWa.setAttribute('href', `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`);
    }

    // Clear cart so next visit starts fresh
    try {
      localStorage.removeItem('accessify_cart_v1');
    } catch (_) { }
  }

  // =========================================================================
  // EVENT LISTENERS & COPY UTILITIES
  // =========================================================================
  function setupEventListeners() {
    // Page 1 Input Auto-save
    const p1Inputs = [
      el.inputName, el.inputPhone, el.inputHouse, el.inputStreet,
      el.inputCity, el.inputDistrict, el.inputState, el.inputPincode,
      el.inputLandmark, el.inputEmail
    ];
    p1Inputs.forEach(input => {
      if (!input) return;
      input.addEventListener('input', () => {
        saveCustomerToStorage();
        if (input.style.borderColor) input.style.borderColor = '';
      });
    });

    // Page 1: Continue Button
    if (el.btnGotoStep2) {
      el.btnGotoStep2.addEventListener('click', (e) => {
        e.preventDefault();
        if (validatePage1()) {
          saveCustomerToStorage();
          goToStep(2);
        }
      });
    }

    // Page 2: Back Button
    if (el.btnBackToStep1) {
      el.btnBackToStep1.addEventListener('click', (e) => {
        e.preventDefault();
        goToStep(1);
      });
    }

    // Page 2: Continue to WhatsApp Order Button
    if (el.btnGotoStep3) {
      el.btnGotoStep3.addEventListener('click', (e) => {
        e.preventDefault();
        submitPaymentAndProceed();
      });
    }

    // Page 2: Copy UPI ID
    if (el.btnCopyUpi) {
      el.btnCopyUpi.addEventListener('click', () => {
        copyToClipboard(OFFICIAL_UPI_ID, 'Official UPI ID copied to clipboard!');
      });
    }

    // Page 2: Copy Amount
    if (el.btnCopyAmt) {
      el.btnCopyAmt.addEventListener('click', () => {
        const total = getGrandTotal();
        copyToClipboard(String(total), `Payable amount ₹${total} copied!`);
      });
    }

    // Page 3: Back to Payment Button
    if (el.btnBackToStep2) {
      el.btnBackToStep2.addEventListener('click', (e) => {
        e.preventDefault();
        goToStep(2);
      });
    }

    // Page 3: Continue to Order Details Button
    if (el.btnGotoStep4) {
      el.btnGotoStep4.addEventListener('click', (e) => {
        e.preventDefault();
        goToStep(4);
      });
    }

    // Setup Screenshot handlers
    setupScreenshotHandlers();
  }

  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (_) { }
    document.body.removeChild(input);
  }

  function showToast(message) {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'checkout-toast';
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

})();
