/**
 * Reactive Zero-Overhead Store based on native JavaScript new Proxy()
 * Manages kiosk views, cart, products, categories, decision guide, and hardware status.
 */

'use strict';

(function () {
  const listeners = new Map();
  const globalListeners = new Set();

  const rawState = {
    // Current Active View
    // 'idle' | 'categories' | 'catalog' | 'product_detail' | 'cart' | 'payment' |
    // 'pos_processing' | 'pos_error' | 'dispensing' | 'shutter' | 'complete' |
    // 'guide_step1' | 'guide_step2' | 'guide_step3' | 'guide_result' | 'app_pickup' | 'support'
    currentView: 'idle',
    previousView: 'idle',

    // Language & Accessibility
    lang: 'fa',
    dir: 'rtl',
    largeText: false,
    highContrast: false,
    audioGuide: false,

    // Active Category & Subcategory Filter
    selectedCategory: 'protection',
    selectedSubcategory: 'all',

    // Selected Product in Detail View
    selectedProduct: null,
    productQuantity: 1,

    // Shopping Cart Array: [ { id, medicine, quantity, slot_id } ]
    cart: [],

    // Payment State
    paymentMethod: 'bank_card', // 'bank_card' | 'qr_code' | 'contactless'
    paymentAmount: 0,
    trackingCode: '7319',
    orderNumber: '4821',

    // Decision Wizard State
    guideChoiceNeed: 'condom',      // 'condom' | 'pad' | 'lube' | 'kit'
    guideChoiceLatex: 'unknown',    // 'yes' | 'no' | 'unknown'
    guideChoiceType: 'no_pref',     // 'classic' | 'thin' | 'large' | 'no_pref'
    guideRecommendedProduct: null,

    // Shutter / Locker State
    shutterPercent: 60,
    shutterDirection: 'opening',    // 'opening' | 'closing'
    lockerNumber: 3,
    countdownSeconds: 15,

    // Hardware State from Backend
    hardwareConnected: false,
    hardwareIsMock: true,
    hardwarePort: 'SIMULATOR',
    hardwareOutputs: [0, 0, 0, 0, 0, 0, 0, 0],
    lastPingLatency: null,
    hardwareCurrentStage: null,

    // Product & Category Data from DB
    categories: [],
    medicines: [],

    // Modals
    langModalOpen: false,
    adminModalOpen: false,
    qrReceiptModalOpen: false,

    // Raw Hardware Binary Logs
    rawLogs: []
  };

  const store = new Proxy(rawState, {
    set(target, property, value) {
      const oldValue = target[property];
      if (oldValue === value && typeof value !== 'object') {
        return true;
      }

      target[property] = value;

      if (property === 'lang') {
        target.dir = (value === 'en') ? 'ltr' : 'rtl';
        document.documentElement.lang = value;
        document.documentElement.dir = target.dir;
      }

      if (property === 'largeText') {
        document.documentElement.classList.toggle('large-text-active', !!value);
      }

      if (property === 'highContrast') {
        document.documentElement.classList.toggle('high-contrast-active', !!value);
      }

      // Notify property-specific subscribers
      if (listeners.has(property)) {
        const propCallbacks = listeners.get(property);
        for (const cb of propCallbacks) {
          try {
            cb(value, oldValue);
          } catch (e) {
            console.error(`Store listener error for ${String(property)}:`, e);
          }
        }
      }

      // Notify global subscribers
      for (const gcb of globalListeners) {
        try {
          gcb(property, value, oldValue);
        } catch (e) {
          console.error('Store global listener error:', e);
        }
      }

      return true;
    },

    get(target, property) {
      return target[property];
    }
  });

  /**
   * Cart Helper Methods
   */
  function addToCart(product, qty = 1) {
    if (!product) return;
    const existingIndex = store.cart.findIndex(item => item.id === product.id);
    const newCart = [...store.cart];
    if (existingIndex > -1) {
      newCart[existingIndex].quantity += qty;
    } else {
      newCart.push({
        id: product.id,
        medicine: product,
        quantity: qty,
        slot_id: product.slot_id
      });
    }
    store.cart = newCart;
  }

  function updateCartQuantity(productId, delta) {
    const newCart = store.cart.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean);
    store.cart = newCart;
  }

  function removeFromCart(productId) {
    store.cart = store.cart.filter(item => item.id !== productId);
  }

  function clearCart() {
    store.cart = [];
  }

  function getCartTotal() {
    return store.cart.reduce((sum, item) => sum + (item.medicine.price * item.quantity), 0);
  }

  function getCartItemCount() {
    return store.cart.reduce((count, item) => count + item.quantity, 0);
  }

  /**
   * Navigate to View
   */
  function navigateTo(viewName) {
    if (store.currentView !== viewName) {
      store.previousView = store.currentView;
      store.currentView = viewName;
    }
  }

  function navigateBack() {
    const prev = store.previousView || 'idle';
    navigateTo(prev);
  }

  /**
   * Subscribe to specific property changes
   */
  function subscribe(prop, callback) {
    if (!listeners.has(prop)) {
      listeners.set(prop, new Set());
    }
    listeners.get(prop).add(callback);
    return () => listeners.get(prop).delete(callback);
  }

  function subscribeAll(callback) {
    globalListeners.add(callback);
    return () => globalListeners.delete(callback);
  }

  window.store = store;
  window.storeSubscribe = subscribe;
  window.storeSubscribeAll = subscribeAll;
  window.cartHelpers = {
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartItemCount,
    navigateTo,
    navigateBack
  };
})();
