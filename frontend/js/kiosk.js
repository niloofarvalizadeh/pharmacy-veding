/**
 * Kiosk Interaction Controller: Light Guides, Reachability, Privacy Mode, POS Flow
 */

'use strict';

class KioskFlowController {
  constructor() {
    this.root = document.getElementById('kioskRoot');
    this.rightLightGuide = document.getElementById('rightLightGuide');
    this.bottomLightGuide = document.getElementById('bottomLightGuide');
    this.kioskFlowModal = document.getElementById('kioskFlowModal');

    this._bindHeaderControls();
    this._subscribeToStore();
  }

  _bindHeaderControls() {
    // Language Switcher
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (window.store) {
          window.store.lang = lang;
        }
        langBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateStaticTexts();
      });
    });

    // Privacy Mode Toggle
    const privacyBtn = document.getElementById('privacyToggleBtn');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', () => {
        if (!window.store) return;
        window.store.privacyMode = !window.store.privacyMode;
        privacyBtn.classList.toggle('active', window.store.privacyMode);
      });
    }

    // Reachability (Accessibility) Toggle
    const reachBtn = document.getElementById('reachabilityToggleBtn');
    if (reachBtn) {
      reachBtn.addEventListener('click', () => {
        if (!window.store) return;
        window.store.reachabilityMode = !window.store.reachabilityMode;
        reachBtn.classList.toggle('active', window.store.reachabilityMode);
        this.root.classList.toggle('reachability-active', window.store.reachabilityMode);
      });
    }

    // Cancel Purchase Flow Modal
    const cancelFlowBtn = document.getElementById('cancelFlowBtn');
    if (cancelFlowBtn) {
      cancelFlowBtn.addEventListener('click', () => this.cancelPurchaseFlow());
    }

    // Simulate Card Tap Button
    const simulateCardBtn = document.getElementById('simulateCardBtn');
    if (simulateCardBtn) {
      simulateCardBtn.addEventListener('click', () => this.simulateCardPaymentApproved());
    }
  }

  _subscribeToStore() {
    if (!window.storeSubscribe) return;

    window.storeSubscribe('lang', () => this.updateStaticTexts());
    window.storeSubscribe('hardwareConnected', (connected) => {
      const badge = document.getElementById('hardwareStatusBadge');
      if (badge && window.t) {
        const lang = window.store.lang;
        const isMock = window.store.hardwareIsMock;
        badge.textContent = isMock ? window.t('hardwareMock', lang) : window.t('hardwareOnline', lang);
        badge.className = `status-badge ${connected ? (isMock ? 'mock' : 'online') : 'offline'}`;
      }
    });
  }

  updateStaticTexts() {
    const lang = (window.store && window.store.lang) || 'fa';
    if (!window.t) return;

    // Update elements with data-i18n
    const translatables = document.querySelectorAll('[data-i18n]');
    translatables.forEach((el) => {
      const key = el.dataset.i18n;
      if (key) {
        el.textContent = window.t(key, lang);
      }
    });

    // Update privacy button label
    const privacyBtn = document.getElementById('privacyToggleBtn');
    if (privacyBtn) {
      const textSpan = privacyBtn.querySelector('.btn-label');
      if (textSpan) {
        textSpan.textContent = window.store.privacyMode ? window.t('privacyOn', lang) : window.t('privacyOff', lang);
      }
    }

    // Update reachability button label
    const reachBtn = document.getElementById('reachabilityToggleBtn');
    if (reachBtn) {
      const textSpan = reachBtn.querySelector('.btn-label');
      if (textSpan) {
        textSpan.textContent = window.store.reachabilityMode ? window.t('reachabilityOn', lang) : window.t('reachabilityOff', lang);
      }
    }
  }

  /**
   * Start Purchase Flow: Step 1 - Turn on Right Light Guide to POS Card Reader
   */
  startPurchaseFlow(medicine) {
    if (!medicine || medicine.stock <= 0) return;

    if (window.store) {
      window.store.dispenseState = 'pos_waiting';
      window.store.activeDispenseInfo = medicine;
    }

    const lang = (window.store && window.store.lang) || 'fa';
    const name = (lang === 'fa') ? medicine.name_fa : ((lang === 'ar') ? medicine.name_ar : medicine.name_en);

    // Turn ON Right-Side Neon Guide pointing to physical card terminal
    this.rightLightGuide.classList.add('guide-active');
    this.bottomLightGuide.classList.remove('guide-active');

    // Show Flow Modal
    document.getElementById('flowStepPOS').style.display = 'block';
    document.getElementById('flowStepDispensing').style.display = 'none';
    document.getElementById('flowStepDone').style.display = 'none';

    document.getElementById('posMedName').textContent = name;
    document.getElementById('posMedPrice').textContent = `${Number(medicine.price).toLocaleString()} ${window.t('currency', lang)}`;
    document.getElementById('posMedSlot').textContent = `${window.t('slotLabel', lang)}: #${medicine.slot_id}`;

    this.kioskFlowModal.classList.add('modal-visible');
  }

  /**
   * Step 2: Payment Approved -> Trigger Hardware Dispense via WebSocket
   */
  simulateCardPaymentApproved() {
    const med = window.store ? window.store.activeDispenseInfo : null;
    if (!med) return;

    // Switch right guide OFF
    this.rightLightGuide.classList.remove('guide-active');

    // Show Dispensing Step
    document.getElementById('flowStepPOS').style.display = 'none';
    document.getElementById('flowStepDispensing').style.display = 'block';
    document.getElementById('flowStepDone').style.display = 'none';

    if (window.store) {
      window.store.dispenseState = 'hardware_cycle';
    }

    // Send DISPENSE_REQUEST to backend
    if (window.socketClient) {
      window.socketClient.send({
        type: 'DISPENSE_REQUEST',
        medicineId: med.id,
        slotId: med.slot_id
      });
    }
  }

  /**
   * Step 3: Microcontroller returns COMMAND_DONE (0x03)
   * Activate Bottom Light Guide to Physical Delivery Chute
   */
  onDispenseSuccess(data) {
    if (window.store) {
      window.store.dispenseState = 'complete';
    }

    // Turn ON Bottom-Side Neon Guide pointing down to physical chute
    this.bottomLightGuide.classList.add('guide-active');

    document.getElementById('flowStepPOS').style.display = 'none';
    document.getElementById('flowStepDispensing').style.display = 'none';
    document.getElementById('flowStepDone').style.display = 'block';

    const lang = (window.store && window.store.lang) || 'fa';
    document.getElementById('doneChuteText').textContent = `${window.t('dispenseDoneTitle', lang)} (#${data.slotId})`;

    // Automatically dismiss modal and turn off lights after 6 seconds
    setTimeout(() => {
      this.cancelPurchaseFlow();
    }, 6000);
  }

  /**
   * Handle Dispense Error
   */
  onDispenseError(data) {
    if (window.store) {
      window.store.dispenseState = 'error';
    }
    alert(`خطای تحویل کالا: ${data.reason}`);
    this.cancelPurchaseFlow();
  }

  /**
   * Cancel and close flow modal
   */
  cancelPurchaseFlow() {
    this.rightLightGuide.classList.remove('guide-active');
    this.bottomLightGuide.classList.remove('guide-active');
    this.kioskFlowModal.classList.remove('modal-visible');

    if (window.store) {
      window.store.dispenseState = 'idle';
      window.store.activeDispenseInfo = null;
    }
  }
}

window.KioskFlowController = KioskFlowController;
