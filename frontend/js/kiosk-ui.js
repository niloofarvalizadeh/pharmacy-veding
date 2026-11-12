/**
 * Master Kiosk UI Controller (21.5" Vertical Touchscreen 1080x1920)
 * Drives all screen flows, catalog tabs, cart, POS payment, dispensing, and decision guide.
 */

'use strict';

class KioskUIController {
  constructor() {
    this.currentViewEl = null;
    this.inactivityTimer = null;
    this.inactivityTimeoutMs = 45000; // 45 seconds auto-reset to idle

    this._bindNavigation();
    this._bindIdleView();
    this._bindCategoriesView();
    this._bindCatalogView();
    this._bindDetailView();
    this._bindCartView();
    this._bindPaymentView();
    this._bindPosView();
    this._bindCompleteView();
    this._bindGuideWizard();
    this._bindAppPickupView();
    this._bindSupportView();
    this._bindAccessibilityModal();
    this._bindInactivityReset();

    this._subscribeToStore();
  }

  _subscribeToStore() {
    if (!window.storeSubscribe) return;

    window.storeSubscribe('currentView', (viewName) => {
      this._renderView(viewName);
    });

    window.storeSubscribe('cart', (cart) => {
      this._updateCartNavBadge(cart);
      if (window.store.currentView === 'cart') {
        this._renderCartItems();
      }
    });

    window.storeSubscribe('lang', (lang) => {
      this._updateLocalizedStrings(lang);
    });

    window.storeSubscribe('selectedCategory', () => {
      if (window.store.currentView === 'catalog') {
        this._renderCatalogProducts();
      }
    });

    window.storeSubscribe('selectedSubcategory', () => {
      if (window.store.currentView === 'catalog') {
        this._renderCatalogProducts();
      }
    });
  }

  /**
   * Switch Active View Screen
   */
  _renderView(viewName) {
    const views = document.querySelectorAll('.kiosk-view');
    views.forEach(v => v.classList.remove('active-view'));

    const targetView = document.getElementById(`view-${viewName.replace(/_/g, '-')}`);
    if (targetView) {
      targetView.classList.add('active-view');
      this.currentViewEl = targetView;
    }

    // Top Navigation Back Button state
    const btnBack = document.getElementById('btnNavBack');
    if (btnBack) {
      if (viewName === 'idle') {
        btnBack.classList.add('hidden-btn');
      } else {
        btnBack.classList.remove('hidden-btn');
      }
    }

    // Status Pill Text
    const statusText = document.getElementById('statusPillText');
    if (statusText) {
      const lang = window.store.lang;
      statusText.textContent = (viewName === 'idle') 
        ? window.t('kioskReady', lang) 
        : window.t('kioskDirectBuy', lang);
    }

    // View-specific initializations
    if (viewName === 'catalog') {
      this._renderCatalogTabs();
      this._renderCatalogProducts();
    } else if (viewName === 'product_detail') {
      this._renderProductDetail();
    } else if (viewName === 'cart') {
      this._renderCartItems();
    } else if (viewName === 'payment') {
      this._renderPaymentSummary();
    } else if (viewName === 'pos_processing') {
      this._renderPosProcessing();
    } else if (viewName === 'complete') {
      this._startCompleteCountdown();
    } else if (viewName === 'guide_step1' || viewName === 'decision_guide') {
      this._renderGuideStep(1);
    }
  }

  // --- 1. PERSISTENT NAVIGATION ---
  _bindNavigation() {
    // Top Back Button
    const btnBack = document.getElementById('btnNavBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this._handleSmartBack();
      });
    }

    // Top Language/Accessibility Button
    const btnLang = document.getElementById('btnNavLang');
    const btnAccess = document.getElementById('btnNavAccess');
    const modal = document.getElementById('modalLangAccessibility');

    const openAccessModal = () => {
      if (modal) modal.classList.add('open');
    };

    if (btnLang) btnLang.addEventListener('click', openAccessModal);
    if (btnAccess) btnAccess.addEventListener('click', openAccessModal);

    // Cart Button in Header
    const btnCart = document.getElementById('btnNavCart');
    if (btnCart) {
      btnCart.addEventListener('click', () => {
        window.cartHelpers.navigateTo('cart');
      });
    }
  }

  _handleSmartBack() {
    const cur = window.store.currentView;
    if (cur === 'catalog') {
      window.cartHelpers.navigateTo('categories');
    } else if (cur === 'product_detail') {
      window.cartHelpers.navigateTo('catalog');
    } else if (cur === 'cart') {
      window.cartHelpers.navigateTo('catalog');
    } else if (cur === 'payment') {
      window.cartHelpers.navigateTo('cart');
    } else if (cur === 'pos_processing' || cur === 'pos_error') {
      window.cartHelpers.navigateTo('payment');
    } else if (cur === 'app_pickup' || cur === 'support') {
      window.cartHelpers.navigateTo('idle');
    } else {
      window.cartHelpers.navigateTo('categories');
    }
  }

  // --- 2. IDLE VIEW (photo_17) ---
  _bindIdleView() {
    const btnStart = document.getElementById('btnStartShopping');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        window.cartHelpers.navigateTo('categories');
      });
    }

    const btnPickup = document.getElementById('btnPickupApp');
    if (btnPickup) {
      btnPickup.addEventListener('click', () => {
        window.cartHelpers.navigateTo('app_pickup');
      });
    }

    // Mini preview category clicks on idle
    const miniCards = document.querySelectorAll('.idle-cat-mini-card');
    miniCards.forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        window.store.selectedCategory = cat;
        window.store.selectedSubcategory = 'all';
        window.cartHelpers.navigateTo('catalog');
      });
    });
  }

  // --- 3. CATEGORIES VIEW (photo_16) ---
  _bindCategoriesView() {
    const catCards = document.querySelectorAll('.category-large-card');
    catCards.forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        window.store.selectedCategory = cat;
        window.store.selectedSubcategory = 'all';
        window.cartHelpers.navigateTo('catalog');
      });
    });

    const btnGuide = document.getElementById('btnOpenGuide');
    if (btnGuide) {
      btnGuide.addEventListener('click', () => {
        window.cartHelpers.navigateTo('decision_guide');
      });
    }
  }

  // --- 4. CATALOG VIEW (photo_24, photo_25, photo_26, photo_27) ---
  _bindCatalogView() {
    const btnBackCats = document.getElementById('btnBackToCategories');
    if (btnBackCats) {
      btnBackCats.addEventListener('click', () => {
        window.cartHelpers.navigateTo('categories');
      });
    }
  }

  _renderCatalogTabs() {
    const tabsContainer = document.getElementById('catalogTabsBar');
    const titleEl = document.getElementById('catalogHeaderTitle');
    if (!tabsContainer) return;

    const cat = window.store.selectedCategory || 'protection';
    const sub = window.store.selectedSubcategory || 'all';
    const lang = window.store.lang;

    // Subcategory definitions per main category
    const catConfigs = {
      protection: {
        title: (lang === 'fa') ? 'محصولات محافظت' : 'Protection Products',
        tabs: [
          { id: 'all', label: (lang === 'fa') ? 'همه' : 'All' },
          { id: 'classic', label: (lang === 'fa') ? 'کلاسیک' : 'Classic' },
          { id: 'thin', label: (lang === 'fa') ? 'نازک' : 'Thin' },
          { id: 'latex_free', label: (lang === 'fa') ? 'بدون لاتکس' : 'Latex-Free' },
          { id: 'economy', label: (lang === 'fa') ? 'اقتصادی' : 'Economy' }
        ]
      },
      lubricants: {
        title: (lang === 'fa') ? 'روان‌کننده‌ها' : 'Lubricants',
        tabs: [
          { id: 'all', label: (lang === 'fa') ? 'همه' : 'All' },
          { id: 'water_based', label: (lang === 'fa') ? 'آب‌پایه' : 'Water-Based' },
          { id: 'silicone_based', label: (lang === 'fa') ? 'سیلیکون‌پایه' : 'Silicone' },
          { id: 'fragrance_free', label: (lang === 'fa') ? 'بدون عطر' : 'Fragrance-Free' },
          { id: 'sachet', label: (lang === 'fa') ? 'ساشه‌ای' : 'Pocket Sachet' }
        ]
      },
      period: {
        title: (lang === 'fa') ? 'محصولات پریود' : 'Period Care',
        tabs: [
          { id: 'all', label: (lang === 'fa') ? 'همه' : 'All' },
          { id: 'daily', label: (lang === 'fa') ? 'روزانه' : 'Daily' },
          { id: 'regular', label: (lang === 'fa') ? 'معمولی' : 'Regular' },
          { id: 'night', label: (lang === 'fa') ? 'شب' : 'Night' },
          { id: 'emergency', label: (lang === 'fa') ? 'پوست حساس' : 'Sensitive' }
        ]
      },
      ready_kits: {
        title: (lang === 'fa') ? 'کیت‌های آماده' : 'Ready Kits',
        tabs: [
          { id: 'all', label: (lang === 'fa') ? 'همه' : 'All' },
          { id: 'protection', label: (lang === 'fa') ? 'محافظت' : 'Protection' },
          { id: 'period', label: (lang === 'fa') ? 'پریود' : 'Period' },
          { id: 'travel', label: (lang === 'fa') ? 'سفر' : 'Travel' },
          { id: 'sensitive', label: (lang === 'fa') ? 'پوست و مراقبت' : 'Skin Care' }
        ]
      }
    };

    const cfg = catConfigs[cat] || catConfigs.protection;
    if (titleEl) titleEl.textContent = cfg.title;

    let tabsHtml = '';
    cfg.tabs.forEach(t => {
      const isActive = (sub === t.id) || (sub === 'all' && t.id === 'all');
      tabsHtml += `
        <button type="button" class="catalog-tab ${isActive ? 'active-tab' : ''}" data-sub="${t.id}">
          ${t.label}
        </button>
      `;
    });
    tabsContainer.innerHTML = tabsHtml;

    const tabBtns = tabsContainer.querySelectorAll('.catalog-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        window.store.selectedSubcategory = btn.dataset.sub;
      });
    });
  }

  _renderCatalogProducts() {
    const grid = document.getElementById('catalogProductsGrid');
    if (!grid) return;

    const cat = window.store.selectedCategory || 'protection';
    const sub = window.store.selectedSubcategory || 'all';
    const lang = window.store.lang;
    const allMeds = window.store.medicines || [];

    const filtered = allMeds.filter(m => {
      if (m.category !== cat) return false;
      if (sub !== 'all' && m.subcategory !== sub) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: span 4; text-align: center; padding: 40px; font-size: 20px; color: var(--text-muted);">محصولی در این زیردسته یافت نشد.</div>`;
      return;
    }

    let html = '';
    filtered.forEach(med => {
      const name = (lang === 'fa') ? med.name_fa : ((lang === 'ar') ? med.name_ar : med.name_en);
      const pkg = (lang === 'fa') ? med.package_info_fa : med.package_info_en;
      const formattedPrice = Number(med.price).toLocaleString();

      html += `
        <div class="product-catalog-card" data-id="${med.id}">
          <div class="product-img-wrap">
            <img src="assets/images/${med.image_key}.png" alt="${name}" onerror="this.src='assets/images/kit-protection.png'">
          </div>
          <div style="width: 100%;">
            <div class="product-card-title">${name}</div>
            <div class="product-card-pack">${pkg}</div>
            <div class="product-card-price-pill">${formattedPrice} ${window.t('toman', lang)}</div>
            <div class="product-card-stock-status">
              <span class="status-dot"></span>
              <span>${window.t('inStock', lang)}</span>
            </div>
          </div>
          <button type="button" class="btn-card-choose btn-select-prod" data-id="${med.id}">
            ${window.t('choose', lang)}
          </button>
        </div>
      `;
    });

    grid.innerHTML = html;

    const selectBtns = grid.querySelectorAll('.btn-select-prod');
    selectBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const med = allMeds.find(m => m.id === id);
        if (med) {
          window.store.selectedProduct = med;
          window.store.productQuantity = 1;
          window.cartHelpers.navigateTo('product_detail');
        }
      });
    });

    const cards = grid.querySelectorAll('.product-catalog-card');
    cards.forEach(c => {
      c.addEventListener('click', () => {
        const id = Number(c.dataset.id);
        const med = allMeds.find(m => m.id === id);
        if (med) {
          window.store.selectedProduct = med;
          window.store.productQuantity = 1;
          window.cartHelpers.navigateTo('product_detail');
        }
      });
    });
  }

  // --- 5. PRODUCT DETAIL VIEW (photo_23) ---
  _bindDetailView() {
    const btnMinus = document.getElementById('btnStepMinus');
    const btnPlus = document.getElementById('btnStepPlus');
    const qtyVal = document.getElementById('detailQuantityVal');

    if (btnMinus) {
      btnMinus.addEventListener('click', () => {
        if (window.store.productQuantity > 1) {
          window.store.productQuantity--;
          qtyVal.textContent = window.store.productQuantity;
        }
      });
    }

    if (btnPlus) {
      btnPlus.addEventListener('click', () => {
        window.store.productQuantity++;
        qtyVal.textContent = window.store.productQuantity;
      });
    }

    const btnAddToCart = document.getElementById('btnDetailAddToCart');
    if (btnAddToCart) {
      btnAddToCart.addEventListener('click', () => {
        const prod = window.store.selectedProduct;
        const qty = window.store.productQuantity || 1;
        if (prod) {
          window.cartHelpers.addToCart(prod, qty);
          window.cartHelpers.navigateTo('cart');
        }
      });
    }

    const btnBack = document.getElementById('btnDetailBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        window.cartHelpers.navigateTo('catalog');
      });
    }
  }

  _renderProductDetail() {
    const prod = window.store.selectedProduct;
    if (!prod) return;

    const lang = window.store.lang;
    const name = (lang === 'fa') ? prod.name_fa : ((lang === 'ar') ? prod.name_ar : prod.name_en);

    document.getElementById('detailProductTitle').textContent = name;
    document.getElementById('detailFeature1').querySelector('span').textContent = prod.feature1_fa;
    document.getElementById('detailFeature2').querySelector('span').textContent = prod.feature2_fa;
    document.getElementById('detailPricePill').textContent = `${Number(prod.price).toLocaleString()} ${window.t('toman', lang)}`;
    document.getElementById('detailStockPill').querySelector('span:nth-child(2)').textContent = `${window.t('inStock', lang)} ${prod.stock}`;
    document.getElementById('detailQuantityVal').textContent = window.store.productQuantity || 1;

    const imgEl = document.getElementById('detailProductImage');
    if (imgEl) {
      imgEl.src = `assets/images/${prod.image_key}.png`;
      imgEl.onerror = () => { imgEl.src = 'assets/images/kit-protection.png'; };
    }
  }

  // --- 6. SHOPPING CART VIEW (photo_8) ---
  _bindCartView() {
    const btnClear = document.getElementById('btnClearCart');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        window.cartHelpers.clearCart();
      });
    }

    const btnAddCross = document.getElementById('btnAddCartCrossSell');
    if (btnAddCross) {
      btnAddCross.addEventListener('click', () => {
        // Add water-based lubricant sachet as companion item
        const lubeSachet = (window.store.medicines || []).find(m => m.id === 10) || window.store.medicines[0];
        if (lubeSachet) {
          window.cartHelpers.addToCart(lubeSachet, 1);
        }
      });
    }

    const btnPay = document.getElementById('btnCartProceedPay');
    if (btnPay) {
      btnPay.addEventListener('click', () => {
        if (window.store.cart.length === 0) return;
        window.cartHelpers.navigateTo('payment');
      });
    }

    const btnContinue = document.getElementById('btnCartContinueShopping');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        window.cartHelpers.navigateTo('catalog');
      });
    }
  }

  _renderCartItems() {
    const list = document.getElementById('cartItemsList');
    const totalEl = document.getElementById('cartTotalAmountVal');
    const payBtn = document.getElementById('btnCartProceedPay');
    if (!list) return;

    const cart = window.store.cart || [];
    const lang = window.store.lang;

    if (cart.length === 0) {
      list.innerHTML = `<div style="text-align: center; padding: 40px; font-size: 22px; color: var(--text-muted);">${window.t('cartEmpty', lang)}</div>`;
      if (totalEl) totalEl.textContent = `۰ ${window.t('toman', lang)}`;
      if (payBtn) payBtn.style.opacity = '0.5';
      return;
    }

    if (payBtn) payBtn.style.opacity = '1';

    let html = '';
    cart.forEach(item => {
      const med = item.medicine;
      const name = (lang === 'fa') ? med.name_fa : ((lang === 'ar') ? med.name_ar : med.name_en);
      const pkg = (lang === 'fa') ? med.package_info_fa : med.package_info_en;
      const itemTotal = Number(med.price * item.quantity).toLocaleString();

      html += `
        <div class="cart-item-card" data-id="${med.id}">
          <div class="cart-item-right">
            <div class="cart-item-icon-box">
              <img src="assets/images/${med.image_key}.png" style="max-width: 50px; max-height: 50px; object-fit: contain;" onerror="this.style.display='none'">
            </div>
            <div class="cart-item-info">
              <h4>${name}</h4>
              <p>${pkg}</p>
            </div>
          </div>

          <div class="cart-item-left">
            <div class="stepper-controls">
              <button type="button" class="btn-stepper btn-cart-dec" data-id="${med.id}">-</button>
              <span class="stepper-val">${item.quantity}</span>
              <button type="button" class="btn-stepper btn-cart-inc" data-id="${med.id}">+</button>
            </div>
            <div class="cart-item-price">${itemTotal} ${window.t('toman', lang)}</div>
            <button type="button" class="btn-cart-delete btn-cart-del" data-id="${med.id}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    list.innerHTML = html;

    const total = window.cartHelpers.getCartTotal();
    if (totalEl) totalEl.textContent = `${Number(total).toLocaleString()} ${window.t('toman', lang)}`;

    // Quantity buttons
    list.querySelectorAll('.btn-cart-dec').forEach(b => {
      b.addEventListener('click', () => {
        window.cartHelpers.updateCartQuantity(Number(b.dataset.id), -1);
      });
    });

    list.querySelectorAll('.btn-cart-inc').forEach(b => {
      b.addEventListener('click', () => {
        window.cartHelpers.updateCartQuantity(Number(b.dataset.id), +1);
      });
    });

    list.querySelectorAll('.btn-cart-del').forEach(b => {
      b.addEventListener('click', () => {
        window.cartHelpers.removeFromCart(Number(b.dataset.id));
      });
    });
  }

  _updateCartNavBadge(cart) {
    const badge = document.getElementById('navCartBadge');
    if (!badge) return;
    const totalCount = window.cartHelpers.getCartItemCount();
    if (totalCount > 0) {
      badge.textContent = totalCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // --- 7. PAYMENT METHOD SELECTION (photo_12) ---
  _bindPaymentView() {
    const methodCards = document.querySelectorAll('.payment-method-card');
    methodCards.forEach(card => {
      card.addEventListener('click', () => {
        methodCards.forEach(c => c.classList.remove('active-method'));
        card.classList.add('active-method');
        window.store.paymentMethod = card.dataset.method;
      });
    });

    const btnConfirm = document.getElementById('btnConfirmPayment');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        window.cartHelpers.navigateTo('pos_processing');
      });
    }

    const btnBack = document.getElementById('btnPaymentBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        window.cartHelpers.navigateTo('cart');
      });
    }
  }

  _renderPaymentSummary() {
    const total = window.cartHelpers.getCartTotal();
    const lang = window.store.lang;
    const display = document.getElementById('paymentTotalDisplay');
    if (display) {
      display.textContent = `${Number(total).toLocaleString()} ${window.t('toman', lang)}`;
    }
  }

  // --- 8. POS CARD PROCESSING (photo_2) ---
  _bindPosView() {
    // POS Approved Simulation (or triggered by real hardware terminal)
    const btnSuccess = document.getElementById('btnSimulatePosSuccess');
    if (btnSuccess) {
      btnSuccess.addEventListener('click', () => {
        this._executeHardwareDispenseFlow();
      });
    }

    // POS Error Simulation
    const btnFail = document.getElementById('btnSimulatePosFail');
    if (btnFail) {
      btnFail.addEventListener('click', () => {
        window.cartHelpers.navigateTo('pos_error');
      });
    }

    const btnHelp = document.getElementById('btnPosHelp');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        window.cartHelpers.navigateTo('support');
      });
    }

    // Error view actions
    const btnRetry = document.getElementById('btnRetryPayment');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        window.cartHelpers.navigateTo('pos_processing');
      });
    }

    const btnChange = document.getElementById('btnChangePayment');
    if (btnChange) {
      btnChange.addEventListener('click', () => {
        window.cartHelpers.navigateTo('payment');
      });
    }

    const btnErrHelp = document.getElementById('btnErrorHelp');
    if (btnErrHelp) {
      btnErrHelp.addEventListener('click', () => {
        window.cartHelpers.navigateTo('support');
      });
    }
  }

  _renderPosProcessing() {
    const total = window.cartHelpers.getCartTotal();
    const lang = window.store.lang;
    const amtEl = document.getElementById('posAmountValue');
    if (amtEl) {
      amtEl.textContent = `${Number(total).toLocaleString()} ${window.t('toman', lang)}`;
    }
  }

  /**
   * Execute real 5-stage ATmega Hardware Dispense Flow
   */
  async _executeHardwareDispenseFlow() {
    window.cartHelpers.navigateTo('dispensing');

    const cart = window.store.cart;
    if (!cart || cart.length === 0) return;

    // Dispense first item or sequentially
    const firstItem = cart[0];
    const slotId = firstItem.slot_id || 1;

    if (window.socketClient) {
      window.socketClient.send({
        type: 'DISPENSE_REQUEST',
        medicineId: firstItem.id,
        slotId: slotId
      });
    }
  }

  // --- 9. COMPLETE & COUNTDOWN (photo_1) ---
  _bindCompleteView() {
    const btnFinish = document.getElementById('btnCompleteFinish');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        window.cartHelpers.clearCart();
        window.cartHelpers.navigateTo('idle');
      });
    }

    const btnQR = document.getElementById('btnCompleteQRReceipt');
    const qrModal = document.getElementById('modalQRReceipt');
    if (btnQR && qrModal) {
      btnQR.addEventListener('click', () => {
        this._generateQRReceipt();
        qrModal.classList.add('open');
      });
    }

    const btnCloseQR = document.getElementById('btnCloseQRModal');
    const btnDoneQR = document.getElementById('btnDoneQRModal');
    if (btnCloseQR && qrModal) {
      btnCloseQR.addEventListener('click', () => qrModal.classList.remove('open'));
    }
    if (btnDoneQR && qrModal) {
      btnDoneQR.addEventListener('click', () => {
        qrModal.classList.remove('open');
        window.cartHelpers.clearCart();
        window.cartHelpers.navigateTo('idle');
      });
    }
  }

  _startCompleteCountdown() {
    let secondsLeft = 15;
    const txt = document.getElementById('completeCountdownText');
    if (!txt) return;

    txt.textContent = `اطلاعات خرید تا ${secondsLeft} ثانیه دیگر پاک می‌شود`;

    const interval = setInterval(() => {
      secondsLeft--;
      if (txt) txt.textContent = `اطلاعات خرید تا ${secondsLeft} ثانیه دیگر پاک می‌شود`;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        window.cartHelpers.clearCart();
        window.cartHelpers.navigateTo('idle');
      }
    }, 1000);
  }

  _generateQRReceipt() {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stylized QR pattern on 2D canvas (Zero external library)
    ctx.fillStyle = '#593796';
    const s = 14;
    // Corners
    ctx.fillRect(20, 20, 50, 50);
    ctx.clearRect(28, 28, 34, 34);
    ctx.fillRect(36, 36, 18, 18);

    ctx.fillRect(150, 20, 50, 50);
    ctx.clearRect(158, 28, 34, 34);
    ctx.fillRect(166, 36, 18, 18);

    ctx.fillRect(20, 150, 50, 50);
    ctx.clearRect(28, 158, 34, 34);
    ctx.fillRect(36, 166, 18, 18);

    // Data dots
    for (let x = 3; x < 13; x++) {
      for (let y = 3; y < 13; y++) {
        if ((x * 7 + y * 13) % 3 === 0) {
          ctx.fillRect(x * s + 5, y * s + 5, s - 3, s - 3);
        }
      }
    }
  }

  // --- 10. DECISION GUIDE WIZARD (photo_18, photo_19, photo_21, photo_22) ---
  _bindGuideWizard() {
    this.wizardStep = 1;

    const btnNext = document.getElementById('btnGuideNext');
    const btnBack = document.getElementById('btnGuideBack');

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (this.wizardStep === 1) {
          this.wizardStep = 2;
          this._renderGuideStep(2);
        } else if (this.wizardStep === 2) {
          this.wizardStep = 3;
          this._renderGuideStep(3);
        } else if (this.wizardStep === 3) {
          this.wizardStep = 4;
          this._renderGuideStep(4);
        } else if (this.wizardStep === 4) {
          // Select recommended item
          const prod = window.store.guideRecommendedProduct || window.store.medicines[2];
          window.store.selectedProduct = prod;
          window.store.productQuantity = 1;
          window.cartHelpers.navigateTo('product_detail');
        }
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', () => {
        if (this.wizardStep > 1) {
          this.wizardStep--;
          this._renderGuideStep(this.wizardStep);
        } else {
          window.cartHelpers.navigateTo('categories');
        }
      });
    }
  }

  _renderGuideStep(step) {
    this.wizardStep = step;
    const pill = document.getElementById('guideStepPill');
    const title = document.getElementById('guideQuestionTitle');
    const container = document.getElementById('guideStepContentContainer');
    const nextBtn = document.getElementById('btnGuideNext');
    const nextLabel = document.getElementById('guideNextBtnLabel');

    if (step === 1) {
      pill.textContent = 'راهنمای انتخاب';
      title.textContent = 'برای چه چیزی کمک می‌خواهید؟';
      nextLabel.textContent = 'ادامه';
      container.innerHTML = `
        <div class="guide-options-grid-4">
          <div class="guide-option-card selected" data-choice="condom">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#593796"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"></path></svg>
            <div style="font-size: 20px; font-weight: 800;">انتخاب کاندوم مناسب</div>
          </div>
          <div class="guide-option-card" data-choice="pad">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#803697"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
            <div style="font-size: 20px; font-weight: 800;">انتخاب پد مناسب</div>
          </div>
          <div class="guide-option-card" data-choice="lube">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#A23391"><path d="M10 2h4v3h-4zM7 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path></svg>
            <div style="font-size: 20px; font-weight: 800;">انتخاب روان‌کننده سازگار</div>
          </div>
          <div class="guide-option-card" data-choice="kit">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#B4317F"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
            <div style="font-size: 20px; font-weight: 800;">کیت فوری</div>
          </div>
        </div>
        <div style="margin: 16px auto; padding: 10px 24px; border-radius: 9999px; background: #ffffff; border: 1px solid var(--border-subtle); display: inline-flex; align-items: center; gap: 8px; font-weight: 800;">
          ❓ فقط دو سؤال کوتاه
        </div>
      `;

      container.querySelectorAll('.guide-option-card').forEach(card => {
        card.addEventListener('click', () => {
          container.querySelectorAll('.guide-option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          window.store.guideChoiceNeed = card.dataset.choice;
        });
      });

    } else if (step === 2) {
      pill.textContent = 'سؤال ۱ از ۲';
      title.textContent = 'آیا به لاتکس حساسیت دارید؟';
      nextLabel.textContent = 'ادامه';
      container.innerHTML = `
        <p style="font-size: 18px; color: var(--text-muted); margin-bottom: 24px;">اگر مطمئن نیستید، گزینه بدون لاتکس پیشنهاد می‌شود</p>
        <div class="guide-options-grid-3">
          <div class="guide-option-card" data-choice="yes">
            <div style="font-size: 40px; color: var(--danger-red);">🚫</div>
            <div style="font-size: 24px; font-weight: 800;">بله</div>
          </div>
          <div class="guide-option-card" data-choice="no">
            <div style="font-size: 40px; color: var(--primary-green);">🌿</div>
            <div style="font-size: 24px; font-weight: 800;">خیر</div>
          </div>
          <div class="guide-option-card selected" data-choice="unknown">
            <div style="font-size: 40px; color: var(--purple-theme);">❓</div>
            <div style="font-size: 24px; font-weight: 800;">مطمئن نیستم</div>
          </div>
        </div>
      `;

      container.querySelectorAll('.guide-option-card').forEach(card => {
        card.addEventListener('click', () => {
          container.querySelectorAll('.guide-option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          window.store.guideChoiceLatex = card.dataset.choice;
        });
      });

    } else if (step === 3) {
      pill.textContent = 'سؤال ۲ از ۲';
      title.textContent = 'چه نوعی را ترجیح می‌دهید؟';
      nextLabel.textContent = 'نمایش پیشنهاد';
      container.innerHTML = `
        <div class="guide-options-grid-4">
          <div class="guide-option-card" data-choice="classic">
            <img src="assets/images/condom-classic.png" style="max-height: 80px; object-fit: contain;">
            <div style="font-size: 20px; font-weight: 800;">کلاسیک</div>
          </div>
          <div class="guide-option-card" data-choice="thin">
            <img src="assets/images/condom-thin.png" style="max-height: 80px; object-fit: contain;">
            <div style="font-size: 20px; font-weight: 800;">نازک</div>
          </div>
          <div class="guide-option-card" data-choice="large">
            <img src="assets/images/condom-classic.png" style="max-height: 80px; object-fit: contain;">
            <div style="font-size: 20px; font-weight: 800;">سایز بزرگ</div>
          </div>
          <div class="guide-option-card selected" data-choice="no_pref">
            <div style="font-size: 44px; color: var(--amber-theme);">🎁</div>
            <div style="font-size: 20px; font-weight: 800;">فرقی ندارد</div>
          </div>
        </div>
      `;

      container.querySelectorAll('.guide-option-card').forEach(card => {
        card.addEventListener('click', () => {
          container.querySelectorAll('.guide-option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          window.store.guideChoiceType = card.dataset.choice;
        });
      });

    } else if (step === 4) {
      pill.textContent = 'نتیجه هوشمند';
      title.textContent = 'پیشنهاد مناسب شما';
      nextLabel.textContent = 'انتخاب این محصول';

      // Pick ideal recommended product based on answers
      let prod = (window.store.medicines || []).find(m => m.id === 3); // Latex-free condom
      if (window.store.guideChoiceLatex === 'no' && window.store.guideChoiceType === 'thin') {
        prod = (window.store.medicines || []).find(m => m.id === 2);
      }
      window.store.guideRecommendedProduct = prod;

      container.innerHTML = `
        <div style="display: flex; justify-content: center; margin-top: 10px;">
          <div class="guide-recommendation-card">
            <div style="display: flex; align-items: center; gap: 24px;">
              <img src="assets/images/${prod.image_key}.png" style="max-width: 140px; max-height: 140px; object-fit: contain;" onerror="this.src='assets/images/kit-protection.png'">
              <div>
                <h3 style="font-size: 28px; font-weight: 900; color: var(--text-dark); margin-bottom: 8px;">${prod.name_fa}</h3>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                  <span style="padding: 6px 14px; border-radius: 9999px; background: var(--mint-light); color: var(--primary-green); font-weight: 800;">موجود ✓</span>
                  <span style="padding: 6px 14px; border-radius: 9999px; background: var(--purple-light); color: var(--purple-theme); font-weight: 800;">${prod.package_info_fa}</span>
                </div>
                <div style="font-size: 26px; font-weight: 900; color: var(--primary-green);">${Number(prod.price).toLocaleString()} تومان</div>
              </div>
            </div>

            <div style="background: var(--mint-light); border-radius: var(--radius-md); padding: 20px; font-size: 18px; font-weight: 800; color: var(--primary-green); line-height: 1.5;">
              🌿 انتخاب مطمئن‌تر برای حساسیت احتمالی به لاتکس و حداکثر ایمنی
            </div>
          </div>
        </div>
      `;
    }
  }

  // --- 11. APP PICKUP (photo_14) ---
  _bindAppPickupView() {
    const btnProceed = document.getElementById('btnAppPickupProceed');
    if (btnProceed) {
      btnProceed.addEventListener('click', () => {
        // Trigger hardware dispense for locker/slot
        window.cartHelpers.navigateTo('dispensing');
        if (window.socketClient) {
          window.socketClient.send({
            type: 'DISPENSE_REQUEST',
            medicineId: 5,
            slotId: 3
          });
        }
      });
    }

    const btnBack = document.getElementById('btnAppPickupBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        window.cartHelpers.navigateTo('idle');
      });
    }
  }

  // --- 12. SUPPORT VIEW (photo_9) ---
  _bindSupportView() {
    const btnBack = document.getElementById('btnSupportBack');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this._handleSmartBack();
      });
    }

    const btnCall = document.getElementById('btnCallSupport');
    if (btnCall) {
      btnCall.addEventListener('click', () => {
        alert('درخواست تماس با پشتیبانی ارسال شد. اپراتور کیوسک از طریق بلندگو پاسخ خواهد داد.');
      });
    }
  }

  // --- 13. ACCESSIBILITY MODAL (photo_20) ---
  _bindAccessibilityModal() {
    const modal = document.getElementById('modalLangAccessibility');
    const btnClose = document.getElementById('btnCloseLangModal');
    const btnCancel = document.getElementById('btnCancelLangModal');
    const btnSave = document.getElementById('btnSaveLangModal');

    const closeModal = () => {
      if (modal) modal.classList.remove('open');
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // Language options
    const langBtns = document.querySelectorAll('.lang-choice-btn');
    langBtns.forEach(b => {
      b.addEventListener('click', () => {
        langBtns.forEach(btn => btn.style.background = '#ffffff');
        b.style.background = 'var(--mint-light)';
        window.store.lang = b.dataset.lang;
      });
    });

    // Toggles
    const chkLarge = document.getElementById('chkLargeText');
    const chkContrast = document.getElementById('chkHighContrast');
    const chkAudio = document.getElementById('chkAudioGuide');

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        if (chkLarge) window.store.largeText = chkLarge.checked;
        if (chkContrast) window.store.highContrast = chkContrast.checked;
        if (chkAudio) window.store.audioGuide = chkAudio.checked;
        closeModal();
      });
    }
  }

  // --- 14. INACTIVITY AUTO-RESET TO IDLE ---
  _bindInactivityReset() {
    const resetTimer = () => {
      if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
      if (window.store.currentView !== 'idle') {
        this.inactivityTimer = setTimeout(() => {
          console.log('⏰ Inactivity timeout: resetting kiosk to idle');
          window.cartHelpers.clearCart();
          window.cartHelpers.navigateTo('idle');
        }, this.inactivityTimeoutMs);
      }
    };

    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('click', resetTimer);
  }

  _updateLocalizedStrings(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key && window.t) {
        el.textContent = window.t(key, lang);
      }
    });
  }
}

window.KioskUIController = KioskUIController;
