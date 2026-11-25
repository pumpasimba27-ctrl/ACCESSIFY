/**
 * ACCESSIFY — LUXURY DEDICATED CHECKOUT ENGINE
 * FULL-PAGE REAL-TIME ORDER PLACEMENT & WHATSAPP CONCIERGE INTEGRATION
 * TARGET WHATSAPP: +91 7012400815
 */

(function () {
  'use strict';

  const API_BASE = '/api';
  const FALLBACK_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23111"/><text x="50" y="55" fill="%23444" font-size="12" text-anchor="middle" font-family="sans-serif">ACCESSIFY</text></svg>';

  // State
  let cart = [];
  let paymentConfig = {
    upiId: 'renjudinob@okaxis',
    upiName: 'ACCESSIFY',
    whatsappNumber: '917012400815',
    deliveryCharge: 99,
    qrImage: '/assets/images/renjudinob-upi-qr.jpg'
  };
  let selectedScreenshotFile = null;
  let isSubmitting = false;

  // DOM Elements
  const el = {
    form: document.getElementById('checkout-form'),
    emptyState: document.getElementById('checkout-empty'),
    successView: document.getElementById('checkout-success-view'),
    alertError: document.getElementById('checkout-alert-error'),

    // Inputs
    inputName: document.getElementById('chk-name'),
    inputPhone: document.getElementById('chk-phone'),
    inputWhatsapp: document.getElementById('chk-whatsapp'),
    inputEmail: document.getElementById('chk-email'),
    inputHouse: document.getElementById('chk-house'),
    inputStreet: document.getElementById('chk-street'),
    inputCity: document.getElementById('chk-city'),
    inputDistrict: document.getElementById('chk-district'),
    inputState: document.getElementById('chk-state'),
    inputPincode: document.getElementById('chk-pincode'),
    inputLandmark: document.getElementById('chk-landmark'),

    // Summary
    itemsCountBadge: document.getElementById('summary-items-count'),
    itemsList: document.getElementById('order-items-list'),
    subtotalVal: document.getElementById('summary-subtotal'),
    deliveryVal: document.getElementById('summary-delivery'),
    grandTotalVal: document.getElementById('summary-grand-total'),

    // Payment Section
    btnUpiIntent: document.getElementById('btn-upi-intent'),
    upiIdDisplay: document.getElementById('upi-id-display'),
    btnCopyUpi: document.getElementById('btn-copy-upi'),
    btnCopyAmt: document.getElementById('btn-copy-amt'),
    qrImg: document.getElementById('checkout-qr-img'),
    qrPayableAmount: document.getElementById('qr-payable-amount'),

    // Screenshot
    dropzone: document.getElementById('screenshot-dropzone'),
    dropzoneTrigger: document.getElementById('dropzone-click-trigger'),
    fileInput: document.getElementById('screenshot-input'),
    btnBrowse: document.getElementById('btn-browse-file'),
    previewCard: document.getElementById('screenshot-preview-card'),
    previewImg: document.getElementById('screenshot-preview-img'),
    previewFileName: document.getElementById('screenshot-file-name'),
    btnReplaceScreenshot: document.getElementById('btn-replace-screenshot'),
    btnRemoveScreenshot: document.getElementById('btn-remove-screenshot'),
    errScreenshot: document.getElementById('err-screenshot'),

    // Submit
    btnPlaceOrder: document.getElementById('btn-place-order'),
    btnText: document.getElementById('btn-text'),
    btnSpinner: document.getElementById('btn-spinner'),

    // Success State
    successOrderId: document.getElementById('success-order-id'),
    successCustName: document.getElementById('success-cust-name'),
    successCustPhone: document.getElementById('success-cust-phone'),
    successCustAddress: document.getElementById('success-cust-address'),
    successSubtotal: document.getElementById('success-subtotal'),
    successDelivery: document.getElementById('success-delivery'),
    successTotal: document.getElementById('success-total'),
    successProductsList: document.getElementById('success-products-list'),
    btnSuccessWa: document.getElementById('btn-success-wa'),
    btnSuccessDownloadSs: document.getElementById('btn-success-download-ss'),

    // Toast
    toastContainer: document.getElementById('checkout-toast-container')
  };

  // -------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------
  async function init() {
    loadCart();
    if (cart.length === 0) {
      showEmptyCart();
      return;
    }

    await loadPaymentConfig();
    populateSavedCustomer();
    renderOrderSummary();
    setupEventListeners();
  }

  function loadCart() {
    try {
      const saved = localStorage.getItem('accessify_cart_v1');
      if (saved) cart = JSON.parse(saved);
      if (!Array.isArray(cart)) cart = [];
    } catch (_) {
      cart = [];
    }
  }

  function showEmptyCart() {
    if (el.form) el.form.style.display = 'none';
    if (el.emptyState) el.emptyState.style.display = 'block';
  }

  async function loadPaymentConfig() {
    try {
      const res = await fetch(`${API_BASE}/settings?t=${Date.now()}`);
      const json = await res.json();
      if (json.success && json.data) {
        paymentConfig.upiId = json.data.upi_id || 'renjudinob@okaxis';
        paymentConfig.upiName = json.data.account_name || 'ACCESSIFY';
        const fetchedWa = (json.data.whatsapp_number || '').trim();
        paymentConfig.whatsappNumber = (fetchedWa && fetchedWa !== '917012408015') ? fetchedWa : '917012400815';
        paymentConfig.deliveryCharge = Number(json.data.delivery_charge !== undefined ? json.data.delivery_charge : 99);
      }
    } catch (_) { }

    if (el.upiIdDisplay) {
      el.upiIdDisplay.textContent = paymentConfig.upiId;
    }
  }

  function populateSavedCustomer() {
    try {
      const saved = JSON.parse(localStorage.getItem('accessify_cust_v1') || '{}');
      if (saved.name && el.inputName) el.inputName.value = saved.name;
      if (saved.phone && el.inputPhone) el.inputPhone.value = saved.phone;
      if (saved.whatsapp && el.inputWhatsapp) el.inputWhatsapp.value = saved.whatsapp;
      if (saved.email && el.inputEmail) el.inputEmail.value = saved.email;
      if (saved.house && el.inputHouse) el.inputHouse.value = saved.house;
      if (saved.street && el.inputStreet) el.inputStreet.value = saved.street;
      if (saved.city && el.inputCity) el.inputCity.value = saved.city;
      if (saved.district && el.inputDistrict) el.inputDistrict.value = saved.district;
      if (saved.state && el.inputState) el.inputState.value = saved.state;
      if (saved.pincode && el.inputPincode) el.inputPincode.value = saved.pincode;
      if (saved.landmark && el.inputLandmark) el.inputLandmark.value = saved.landmark;
    } catch (_) { }
  }

  // -------------------------------------------------------------
  // RENDER ORDER SUMMARY & COMPUTE TOTALS
  // -------------------------------------------------------------
  function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);
    const delivery = Number(paymentConfig.deliveryCharge !== undefined ? paymentConfig.deliveryCharge : 99);
    const grandTotal = subtotal + delivery;
    const totalQty = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    return { subtotal, delivery, grandTotal, totalQty };
  }

  function renderOrderSummary() {
    const { subtotal, delivery, grandTotal, totalQty } = calculateTotals();

    if (el.itemsCountBadge) {
      el.itemsCountBadge.textContent = `${totalQty} ${totalQty === 1 ? 'PIECE' : 'PIECES'}`;
    }

    if (el.subtotalVal) {
      el.subtotalVal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    }

    if (el.deliveryVal) {
      el.deliveryVal.textContent = delivery > 0 ? `₹${delivery}` : 'FREE';
    }

    if (el.grandTotalVal) {
      el.grandTotalVal.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    }

    if (el.qrPayableAmount) {
      el.qrPayableAmount.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    }

    // Dynamic QR with exact order amount and payee name ACCESSIFY
    if (el.qrImg) {
      el.qrImg.src = `${API_BASE}/upi-qr?amount=${grandTotal}&upi_id=${encodeURIComponent(paymentConfig.upiId)}&name=ACCESSIFY&t=${Date.now()}`;
    }

    // Mobile UPI Intent link
    if (el.btnUpiIntent) {
      el.btnUpiIntent.href = `upi://pay?pa=${encodeURIComponent(paymentConfig.upiId)}&pn=${encodeURIComponent(paymentConfig.upiName)}&am=${grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent('ACCESSIFY Order')}`;
    }

    // Render items list
    if (el.itemsList) {
      let html = '';
      cart.forEach((item) => {
        const itemImg = item.image || FALLBACK_SVG;
        const itemPriceFormatted = `₹${Number(item.price).toLocaleString('en-IN')}`;
        const itemTotalFormatted = `₹${(Number(item.price) * (Number(item.qty) || 1)).toLocaleString('en-IN')}`;
        const variantHtml = item.variant ? `<span class="item-meta"> &bull; ${escapeHtml(item.variant)}</span>` : '';

        html += `
          <div class="checkout-item-row">
            <div class="item-thumb-box">
              <img src="${escapeHtml(itemImg)}" alt="${escapeHtml(item.name)}" class="item-thumb-img" onerror="this.src='${FALLBACK_SVG}'">
              <span class="item-qty-badge">${item.qty || 1}</span>
            </div>
            <div class="item-details">
              <h3 class="item-name">${escapeHtml(item.name)}</h3>
              <div class="item-meta">
                ${itemPriceFormatted} × ${item.qty || 1}${variantHtml}
              </div>
            </div>
            <div class="item-price">${itemTotalFormatted}</div>
          </div>
        `;
      });
      el.itemsList.innerHTML = html;
    }
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS & SCREENSHOT WORKFLOW
  // -------------------------------------------------------------
  function setupEventListeners() {
    // Copy UPI ID
    el.btnCopyUpi?.addEventListener('click', () => {
      copyToClipboard(paymentConfig.upiId, 'UPI ID copied to clipboard!', el.btnCopyUpi);
    });

    // Copy Amount
    el.btnCopyAmt?.addEventListener('click', () => {
      const { grandTotal } = calculateTotals();
      copyToClipboard(grandTotal.toString(), `Payable amount ₹${grandTotal} copied!`, el.btnCopyAmt);
    });

    // Dropzone Click
    el.dropzoneTrigger?.addEventListener('click', () => {
      el.fileInput?.click();
    });

    el.btnBrowse?.addEventListener('click', (e) => {
      e.stopPropagation();
      el.fileInput?.click();
    });

    // File input change
    el.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleFileSelected(file);
    });

    // Drag and drop
    if (el.dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        el.dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.dropzone.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        el.dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.dropzone.classList.remove('drag-over');
        });
      });

      el.dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        handleFileSelected(file);
      });
    }

    // Replace / Remove Screenshot
    el.btnReplaceScreenshot?.addEventListener('click', () => {
      el.fileInput?.click();
    });

    el.btnRemoveScreenshot?.addEventListener('click', () => {
      removeScreenshot();
    });

    // Clean field errors on user typing
    const inputs = [
      el.inputName, el.inputPhone, el.inputHouse, el.inputStreet,
      el.inputCity, el.inputDistrict, el.inputState, el.inputPincode
    ];
    inputs.forEach(input => {
      input?.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        const errSpan = document.getElementById(`err-${input.name || input.id.replace('chk-', '')}`);
        if (errSpan) errSpan.classList.remove('show');
        if (el.alertError) el.alertError.style.display = 'none';
      });
    });

    // Submit Order Form
    el.form?.addEventListener('submit', handleOrderSubmit);
  }

  function handleFileSelected(file) {
    if (!file) return;

    const validExts = /\.(jpe?g|png|webp)$/i;
    const validMimes = /^image\/(jpeg|png|webp)$/i;

    if (!validExts.test(file.name) && !validMimes.test(file.type)) {
      showToast('Please select a valid image (JPG, PNG, or WEBP)', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image file size must be less than 10MB', 'error');
      return;
    }

    selectedScreenshotFile = file;

    // Show Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (el.previewImg) el.previewImg.src = e.target.result;
      if (el.previewFileName) el.previewFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      if (el.dropzone) el.dropzone.style.display = 'none';
      if (el.previewCard) el.previewCard.style.display = 'flex';
      if (el.errScreenshot) el.errScreenshot.classList.remove('show');
      if (el.alertError) el.alertError.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    selectedScreenshotFile = null;
    if (el.fileInput) el.fileInput.value = '';
    if (el.previewCard) el.previewCard.style.display = 'none';
    if (el.dropzone) el.dropzone.style.display = 'block';
  }

  function copyToClipboard(text, successMsg, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
      if (btnElement) {
        btnElement.classList.add('copied');
        const origText = btnElement.querySelector('span')?.textContent || '';
        if (btnElement.querySelector('span')) btnElement.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
          btnElement.classList.remove('copied');
          if (btnElement.querySelector('span')) btnElement.querySelector('span').textContent = origText;
        }, 2000);
      }
    }).catch(() => {
      showToast('Copied to clipboard!');
    });
  }

  // -------------------------------------------------------------
  // FORM VALIDATION & SUBMISSION WORKFLOW
  // -------------------------------------------------------------
  function validateForm() {
    let isValid = true;
    let firstInvalidInput = null;

    function markError(input, errId, msg) {
      isValid = false;
      if (input) {
        input.classList.add('is-invalid');
        if (!firstInvalidInput) firstInvalidInput = input;
      }
      const errSpan = document.getElementById(errId);
      if (errSpan) {
        errSpan.textContent = msg;
        errSpan.classList.add('show');
      }
    }

    const name = (el.inputName?.value || '').trim();
    const phone = (el.inputPhone?.value || '').trim().replace(/\D/g, '');
    const house = (el.inputHouse?.value || '').trim();
    const street = (el.inputStreet?.value || '').trim();
    const city = (el.inputCity?.value || '').trim();
    const district = (el.inputDistrict?.value || '').trim();
    const state = (el.inputState?.value || '').trim();
    const pincode = (el.inputPincode?.value || '').trim().replace(/\D/g, '');

    if (!name) markError(el.inputName, 'err-name', 'Please enter your full name');
    if (!phone || phone.length !== 10) markError(el.inputPhone, 'err-phone', 'Please enter a valid 10-digit mobile number');
    if (!house) markError(el.inputHouse, 'err-house', 'Please enter your house name, flat or building no.');
    if (!street) markError(el.inputStreet, 'err-street', 'Please enter your street, locality or area');
    if (!city) markError(el.inputCity, 'err-city', 'Please enter your city/town');
    if (!district) markError(el.inputDistrict, 'err-district', 'Please enter your district');
    if (!state) markError(el.inputState, 'err-state', 'Please select your state');
    if (!pincode || pincode.length !== 6) markError(el.inputPincode, 'err-pincode', 'Please enter a valid 6-digit Indian PIN code');

    if (!selectedScreenshotFile) {
      isValid = false;
      if (el.errScreenshot) {
        el.errScreenshot.textContent = 'Please upload your UPI payment screenshot to place your order';
        el.errScreenshot.classList.add('show');
      }
      if (!firstInvalidInput) firstInvalidInput = el.dropzone;
    }

    if (!isValid) {
      if (el.alertError) {
        el.alertError.textContent = 'Please correct the highlighted fields and ensure your payment screenshot is attached before submitting.';
        el.alertError.style.display = 'block';
        el.alertError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (firstInvalidInput) {
        firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return isValid;
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) return;
    if (cart.length === 0) {
      showToast('Your shopping bag is empty. Please add items to checkout.');
      return;
    }

    isSubmitting = true;
    setLoadingState(true);

    try {
      // 1. Upload screenshot to backend storage
      const formData = new FormData();
      formData.append('screenshot', selectedScreenshotFile);

      const uploadRes = await fetch(`${API_BASE}/upload-payment-proof`, {
        method: 'POST',
        body: formData
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success) {
        throw new Error(uploadJson.error || 'Failed to upload payment screenshot. Please try again.');
      }

      const screenshotUrl = uploadJson.url;

      // 2. Prepare order payload
      const name = (el.inputName?.value || '').trim();
      const phone = (el.inputPhone?.value || '').trim().replace(/\D/g, '');
      const whatsapp = (el.inputWhatsapp?.value || '').trim().replace(/\D/g, '') || phone;
      const email = (el.inputEmail?.value || '').trim();
      const house = (el.inputHouse?.value || '').trim();
      const street = (el.inputStreet?.value || '').trim();
      const city = (el.inputCity?.value || '').trim();
      const district = (el.inputDistrict?.value || '').trim();
      const state = (el.inputState?.value || '').trim();
      const pincode = (el.inputPincode?.value || '').trim().replace(/\D/g, '');
      const landmark = (el.inputLandmark?.value || '').trim();

      const orderPayload = {
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        whatsapp_phone: whatsapp,
        house,
        street,
        city,
        district,
        state,
        pincode,
        landmark,
        items: cart,
        payment_screenshot: screenshotUrl
      };

      // 3. Register order in database
      const orderRes = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || !orderJson.success) {
        throw new Error(orderJson.error || 'Failed to register your order. Please try again.');
      }

      const createdOrder = orderJson.data;

      // 4. Save customer details for future checkout convenience
      try {
        localStorage.setItem('accessify_cust_v1', JSON.stringify({
          name, phone, whatsapp, email, house, street, city, district, state, pincode, landmark
        }));
      } catch (_) { }

      // 5. Construct formatted WhatsApp Order Notification
      const origin = window.location.origin || 'https://accessify-xi.vercel.app';
      const itemsListFormatted = (createdOrder.items || []).map(it => {
        const varTxt = it.variant ? ` (${it.variant})` : '';
        const prodSlug = it.slug || it.productId || it.id || '';
        const prodUrl = `${origin}/product/${encodeURIComponent(prodSlug)}`;
        return `${it.name}${varTxt}\nQuantity: ${it.qty}\nPrice: ₹${Number(it.price).toLocaleString('en-IN')}\nProduct Link: ${prodUrl}`;
      }).join('\n\n');

      const fullAddress = [
        createdOrder.house,
        createdOrder.street,
        createdOrder.city,
        district,
        createdOrder.state
      ].filter(Boolean).join(', ');

      const waMsg =
        `💎 NEW WEBSITE ORDER 💎

Order ID: ${createdOrder.order_number}

CUSTOMER DETAILS
Name: ${createdOrder.customer_name}
Phone: ${createdOrder.customer_phone}

DELIVERY ADDRESS
${fullAddress}
PIN Code: ${createdOrder.pincode || '—'}
Landmark: ${createdOrder.landmark || 'None'}

ORDERED PRODUCTS:

${itemsListFormatted}

PAYMENT SUMMARY
Product Subtotal: ₹${Number(createdOrder.subtotal).toLocaleString('en-IN')}
Delivery Charge: ₹99
Grand Total: ₹${Number(createdOrder.total_amount).toLocaleString('en-IN')}

Payment Method: UPI
UPI ID: ${paymentConfig.upiId || 'renjudinob@okaxis'}
Payment Status: Screenshot submitted – verification pending

📸 PAYMENT SCREENSHOT
Customer will attach the payment screenshot manually before sending this WhatsApp message.`;

      // Target WhatsApp: strictly +917012400815
      let targetWaNumber = (paymentConfig.whatsappNumber || '917012400815').trim();
      if (!targetWaNumber || targetWaNumber === '917012408015') {
        targetWaNumber = '917012400815';
      }
      const waUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(waMsg)}`;

      // Retain reference to selected file for local instant download
      const uploadedFileRef = selectedScreenshotFile;

      // 6. Clear shopping cart
      try {
        localStorage.removeItem('accessify_cart_v1');
      } catch (_) { }

      // 7. Render Success Screen
      renderSuccessState(createdOrder, waUrl, uploadedFileRef);

      // 8. Open WhatsApp chat automatically on mobile devices
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

    } catch (err) {
      console.error('[Checkout Error]', err);
      if (el.alertError) {
        el.alertError.textContent = err.message || 'An error occurred while placing your order. Please check your network and try again.';
        el.alertError.style.display = 'block';
        el.alertError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        showToast(err.message || 'Order failed. Please try again.', 'error');
      }
    } finally {
      isSubmitting = false;
      setLoadingState(false);
    }
  }

  function setLoadingState(loading) {
    if (!el.btnPlaceOrder) return;
    el.btnPlaceOrder.disabled = loading;
    if (el.btnText) el.btnText.style.display = loading ? 'none' : 'inline';
    if (el.btnSpinner) el.btnSpinner.style.display = loading ? 'inline-flex' : 'none';
  }

  // -------------------------------------------------------------
  // POST-ORDER SUCCESS VIEW
  // -------------------------------------------------------------
  function renderSuccessState(order, waUrl, fileObj) {
    // Hide Form, Show Success
    if (el.form) el.form.style.display = 'none';
    if (el.successView) el.successView.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (el.successOrderId) el.successOrderId.textContent = order.order_number;
    if (el.successCustName) el.successCustName.textContent = order.customer_name;
    if (el.successCustPhone) el.successCustPhone.textContent = order.customer_phone;
    if (el.successCustAddress) el.successCustAddress.textContent = order.shipping_address;
    if (el.successSubtotal) el.successSubtotal.textContent = `₹${Number(order.subtotal).toLocaleString('en-IN')}`;
    if (el.successDelivery) el.successDelivery.textContent = `₹${Number(order.delivery_charge || 99).toLocaleString('en-IN')}`;
    if (el.successTotal) el.successTotal.textContent = `₹${Number(order.total_amount).toLocaleString('en-IN')}`;

    // WhatsApp Action Link
    if (el.btnSuccessWa) {
      el.btnSuccessWa.href = waUrl;
    }

    // Download Screenshot Button
    if (el.btnSuccessDownloadSs) {
      el.btnSuccessDownloadSs.onclick = () => {
        downloadScreenshot(order, fileObj);
      };
    }

    // Render Ordered Products
    if (el.successProductsList) {
      const origin = window.location.origin || 'https://accessify-xi.vercel.app';
      el.successProductsList.innerHTML = (order.items || []).map(it => {
        const prodSlug = it.slug || it.productId || it.id || '';
        const prodUrl = `${origin}/product/${encodeURIComponent(prodSlug)}`;
        const varTxt = it.variant ? `<span style="color:#a1a1aa;"> &bull; ${escapeHtml(it.variant)}</span>` : '';
        const itemTotal = Number(it.total || (it.price * it.qty)).toLocaleString('en-IN');

        return `
          <div class="success-product-card">
            <div class="success-product-info">
              <h4 class="success-product-name">${escapeHtml(it.name)}${varTxt}</h4>
              <div class="success-product-meta">Qty: <strong>${it.qty}</strong> &bull; ₹${Number(it.price).toLocaleString('en-IN')} each</div>
              <a href="${prodUrl}" target="_blank" rel="noopener noreferrer" class="success-product-link">
                ${prodUrl} ↗
              </a>
            </div>
            <div class="success-product-total">₹${itemTotal}</div>
          </div>
        `;
      }).join('');
    }
  }

  function downloadScreenshot(order, fileObj) {
    const filename = `ACCESSIFY-Payment-${order.order_number || 'receipt'}.jpg`;
    if (fileObj) {
      const blobUrl = URL.createObjectURL(fileObj);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast('Payment screenshot downloaded!');
      return;
    }

    if (order.payment_screenshot) {
      fetch(order.payment_screenshot)
        .then(r => r.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          showToast('Payment screenshot downloaded!');
        })
        .catch(() => {
          window.open(order.payment_screenshot, '_blank');
        });
    }
  }

  // -------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------
  function showToast(msg) {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'checkout-toast';
    toast.textContent = msg;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
