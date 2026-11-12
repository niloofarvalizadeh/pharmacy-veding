/**
 * Bento Grid UI Renderer & Smart Cross-Sell Modal
 * Touch-optimized for 55" Vertical Kiosk (Zero-Overhead Vanilla JS)
 */

'use strict';

class BentoGridManager {
  constructor() {
    this.gridContainer = document.getElementById('bentoGrid');
    this.detailModal = document.getElementById('medicineDetailModal');
    this.searchQuery = '';

    this._bindEvents();
    this._subscribeToStore();
  }

  _bindEvents() {
    // Category pill filter clicks
    const pills = document.querySelectorAll('.category-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const cat = pill.dataset.category;
        if (window.store) {
          window.store.category = cat;
        }
      });
    });

    // Modal Close
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDetailModal());
    }

    // Backdrop Light-Dismiss for modal
    if (this.detailModal) {
      this.detailModal.addEventListener('click', (e) => {
        if (e.target === this.detailModal) {
          this.closeDetailModal();
        }
      });
    }

    // Modal Buy Button
    const modalBuyBtn = document.getElementById('modalBuyBtn');
    if (modalBuyBtn) {
      modalBuyBtn.addEventListener('click', () => {
        const med = window.store ? window.store.selectedMedicine : null;
        if (med && med.stock > 0 && window.KioskFlow) {
          this.closeDetailModal();
          window.KioskFlow.startPurchaseFlow(med);
        }
      });
    }

    // Cross-sell Add Button
    const modalCrossBtn = document.getElementById('modalCrossBtn');
    if (modalCrossBtn) {
      modalCrossBtn.addEventListener('click', () => {
        const med = window.store ? window.store.selectedMedicine : null;
        if (med && med.crossSellProduct && window.KioskFlow) {
          this.closeDetailModal();
          // Switch to cross-sell product or bundle flow
          window.KioskFlow.startPurchaseFlow(med.crossSellProduct);
        }
      });
    }
  }

  _subscribeToStore() {
    if (!window.storeSubscribe) return;

    window.storeSubscribe('medicines', () => this.render());
    window.storeSubscribe('category', (cat) => {
      this._updateActivePill(cat);
      this.render();
    });
    window.storeSubscribe('lang', () => {
      this._updatePillLabels();
      this.render();
    });
    window.storeSubscribe('privacyMode', () => this.render());
  }

  _updateActivePill(category) {
    const pills = document.querySelectorAll('.category-pill');
    pills.forEach((pill) => {
      if (pill.dataset.category === category) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  _updatePillLabels() {
    const lang = (window.store && window.store.lang) || 'fa';
    const pills = document.querySelectorAll('.category-pill');
    pills.forEach((pill) => {
      const key = pill.dataset.i18n;
      if (key && window.t) {
        pill.querySelector('.pill-text').textContent = window.t(key, lang);
      }
    });
  }

  /**
   * Render Bento Grid cards
   */
  render() {
    if (!this.gridContainer) return;
    const medicines = (window.store && window.store.medicines) || [];
    const activeCat = (window.store && window.store.category) || 'all';
    const lang = (window.store && window.store.lang) || 'fa';
    const privacy = (window.store && window.store.privacyMode) || false;

    // Filter items
    const filtered = medicines.filter((m) => {
      if (activeCat !== 'all' && m.category !== activeCat) return false;
      return true;
    });

    if (filtered.length === 0) {
      this.gridContainer.innerHTML = `
        <div class="empty-state">
          <p>${lang === 'fa' ? 'دارویی در این دسته‌بندی یافت نشد.' : (lang === 'ar' ? 'لم يتم العثور على أدوية.' : 'No medications found in this category.')}</p>
        </div>
      `;
      return;
    }

    // Build cards HTML
    let html = '';
    filtered.forEach((med, idx) => {
      // Dynamic bento span sizing for aesthetic variety
      let bentoSpan = 'col-span-1';
      if (idx === 0 || idx === 7) {
        bentoSpan = 'col-span-2 highlight-card';
      }

      const name = (lang === 'fa') ? med.name_fa : ((lang === 'ar') ? med.name_ar : med.name_en);
      const indication = (lang === 'fa') ? med.indication_fa : ((lang === 'ar') ? med.indication_ar : med.indication_en);
      const formattedPrice = Number(med.price).toLocaleString();
      const isOutOfStock = med.stock <= 0;

      // Privacy Mode masking
      const displayName = privacy ? '••••••••••••••' : name;
      const displayIndication = privacy ? '••••••••••••••••••••••••••••••••' : indication;

      // Badge style per category
      let categoryTag = med.category.toUpperCase();
      if (lang === 'fa') {
        categoryTag = med.category === 'head' ? 'سر و اعصاب' : (med.category === 'chest' ? 'قفسه سینه' : (med.category === 'stomach' ? 'معده' : 'پوست'));
      }

      html += `
        <div class="bento-card ${bentoSpan} ${isOutOfStock ? 'out-of-stock' : ''}" data-id="${med.id}">
          <div class="card-header">
            <span class="category-badge cat-${med.category}">${categoryTag}</span>
            <span class="slot-badge">${window.t('slotLabel', lang)} ${med.slot_id.toString().padStart(2, '0')}</span>
          </div>

          <div class="card-body">
            <h3 class="med-name ${privacy ? 'privacy-masked' : ''}">${displayName}</h3>
            <div class="med-dosage">${med.dosage} &bull; ${med.generic_name}</div>
            <p class="med-indication ${privacy ? 'privacy-masked' : ''}">${displayIndication}</p>
          </div>

          <div class="card-footer">
            <div class="price-stock-wrap">
              <div class="med-price">${formattedPrice} <span class="currency-label">${window.t('currency', lang)}</span></div>
              <div class="med-stock ${med.stock < 5 ? 'stock-low' : ''}">
                ${isOutOfStock ? window.t('outOfStock', lang) : `${med.stock} ${window.t('itemsLeft', lang)}`}
              </div>
            </div>
            <button type="button" class="btn-card-action" ${isOutOfStock ? 'disabled' : ''} data-id="${med.id}">
              ${window.t('detailsAndBuy', lang)}
            </button>
          </div>
        </div>
      `;
    });

    this.gridContainer.innerHTML = html;

    // Attach click listeners to cards
    const cards = this.gridContainer.querySelectorAll('.bento-card');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const id = Number(card.dataset.id);
        this.openDetailModal(id);
      });
    });
  }

  /**
   * Open Medicine Detail Modal
   */
  openDetailModal(medicineId) {
    const medicines = (window.store && window.store.medicines) || [];
    const med = medicines.find((m) => m.id === medicineId);
    if (!med) return;

    if (window.store) {
      window.store.selectedMedicine = med;
    }

    const lang = (window.store && window.store.lang) || 'fa';
    const privacy = (window.store && window.store.privacyMode) || false;

    const name = (lang === 'fa') ? med.name_fa : ((lang === 'ar') ? med.name_ar : med.name_en);
    const indication = (lang === 'fa') ? med.indication_fa : ((lang === 'ar') ? med.indication_ar : med.indication_en);

    document.getElementById('modalTitle').textContent = privacy ? '••••••••••••' : name;
    document.getElementById('modalDosage').textContent = `${med.dosage} (${med.generic_name})`;
    document.getElementById('modalSlot').textContent = `${window.t('slotLabel', lang)}: #${med.slot_id}`;
    document.getElementById('modalStock').textContent = `${med.stock} ${window.t('itemsLeft', lang)}`;
    document.getElementById('modalPrice').textContent = `${Number(med.price).toLocaleString()} ${window.t('currency', lang)}`;
    document.getElementById('modalIndication').textContent = privacy ? '••••••••••••••••••••••••••••••••' : indication;

    // Smart Cross-Sell Section
    const crossSection = document.getElementById('modalCrossSellSection');
    if (med.crossSellProduct && !privacy) {
      const crossName = (lang === 'fa') ? med.crossSellProduct.name_fa : ((lang === 'ar') ? med.crossSellProduct.name_ar : med.crossSellProduct.name_en);
      const crossReason = (lang === 'fa') ? med.cross_sell_reason_fa : ((lang === 'ar') ? med.cross_sell_reason_ar : med.cross_sell_reason_en);

      document.getElementById('crossTitle').textContent = window.t('smartCrossSell', lang);
      document.getElementById('crossMedName').textContent = crossName;
      document.getElementById('crossReason').textContent = crossReason;
      document.getElementById('crossPrice').textContent = `${Number(med.crossSellProduct.price).toLocaleString()} ${window.t('currency', lang)}`;
      crossSection.style.display = 'block';
    } else {
      crossSection.style.display = 'none';
    }

    const buyBtn = document.getElementById('modalBuyBtn');
    buyBtn.textContent = window.t('buyNow', lang);
    buyBtn.disabled = med.stock <= 0;

    if (this.detailModal) {
      this.detailModal.classList.add('modal-visible');
    }
  }

  closeDetailModal() {
    if (this.detailModal) {
      this.detailModal.classList.remove('modal-visible');
    }
    if (window.store) {
      window.store.selectedMedicine = null;
    }
  }
}

window.BentoGridManager = BentoGridManager;
