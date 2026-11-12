/**
 * Pharmacy Vending Kiosk - Admin & Operator Dashboard Controller
 * Pure Vanilla JavaScript, Zero Overhead
 * Exact match to image copy 6, 7, 8, 9, 10, 11.png.
 */

'use strict';

class AdminDashboardController {
  constructor() {
    this.modalEl = document.getElementById('adminModal');
    this.pinViewEl = document.getElementById('adminPinView');
    this.dashViewEl = document.getElementById('adminDashboardView');

    this.enteredPin = '';
    this.activeTab = 'dashboard';
    this.selectedSlotId = null;

    // Data Caches
    this.products = [];
    this.transactions = [];
    this.systemErrors = [];

    this._bindPinEvents();
    this._bindTabEvents();
    this._bindActionEvents();
    this._seedInitialAdminData();
  }

  // --- OPEN / CLOSE ---
  open() {
    this.enteredPin = '';
    this._updatePinDots();
    this.pinViewEl.style.display = 'flex';
    this.dashViewEl.style.display = 'none';
    this.modalEl.classList.add('active');
  }

  close() {
    this.modalEl.classList.remove('active');
    this.enteredPin = '';
  }

  // --- PIN VERIFICATION ---
  _bindPinEvents() {
    // Digits 0-9
    document.querySelectorAll('.pin-keypad .keypad-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        const num = btn.getAttribute('data-key');
        if (this.enteredPin.length < 4) {
          this.enteredPin += num;
          this._updatePinDots();
          if (this.enteredPin.length === 4) {
            setTimeout(() => this._verifyPin(), 120);
          }
        }
      });
    });

    // Clear (✕)
    const btnClear = document.getElementById('btnPinClear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.enteredPin = '';
        this._updatePinDots();
      });
    }

    // Submit (➔)
    const btnSubmit = document.getElementById('btnPinSubmit');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        this._verifyPin();
      });
    }

    // Close Modal Button
    const btnClose = document.getElementById('btnPinClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.close();
      });
    }

    // RFID Tap Demo
    const btnRfid = document.getElementById('btnDemoRfid');
    if (btnRfid) {
      btnRfid.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playSuccess();
        this._unlockDashboard('مهندس رضایی (اپراتور شیفت · OP-07)');
      });
    }
  }

  _updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pinDot${i}`);
      if (dot) {
        dot.classList.toggle('filled', i < this.enteredPin.length);
      }
    }
  }

  _verifyPin() {
    if (this.enteredPin === '1234' || this.enteredPin === '9999') {
      this._unlockDashboard('مهندس رضایی (اپراتور شیفت · OP-07)');
    } else {
      if (window.kioskAudio) window.kioskAudio.playAlert();
      alert('رمز عبور وارد شده نادرست است! (رمز دمو: ۱۲۳۴)');
      this.enteredPin = '';
      this._updatePinDots();
    }
  }

  _unlockDashboard(operatorTitle) {
    if (window.kioskAudio) window.kioskAudio.playSuccess();
    this.pinViewEl.style.display = 'none';
    this.dashViewEl.style.display = 'flex';

    // Request fresh data from server
    if (window.kioskApp && window.kioskApp.ws) {
      window.kioskApp.ws.send(JSON.stringify({ type: 'ADMIN_GET_DATA' }));
    }

    this.render();
  }

  // --- TABS SWITCHING ---
  _bindTabEvents() {
    document.querySelectorAll('.admin-tab-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Fast switch from Dashboard to Slots
    const btnGoSlots = document.getElementById('btnGoToSlots');
    if (btnGoSlots) {
      btnGoSlots.addEventListener('click', () => {
        this.switchTab('slots');
      });
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.admin-tab-nav-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });

    const panes = {
      dashboard: document.getElementById('adminTabDashboard'),
      slots: document.getElementById('adminTabSlots'),
      control: document.getElementById('adminTabControl'),
      transactions: document.getElementById('adminTabTransactions')
    };

    Object.keys(panes).forEach(k => {
      if (panes[k]) {
        panes[k].classList.toggle('active', k === tabName);
      }
    });

    if (tabName === 'slots') this.renderSlots();
    if (tabName === 'transactions') this.renderTransactions('ALL');
  }

  // --- SEED INITIAL ADMIN DATA ---
  _seedInitialAdminData() {
    this.transactions = [
      { code: 'TX-88213', prod: 'استامینوفن ۵۰۰', slot: 'A1', amt: 48000, method: 'کارت', status: 'SUCCESS', status_fa: 'موفق', time: '۱۴:۳۲' },
      { code: 'TX-88212', prod: 'ویتامین C جوشان', slot: 'E1', amt: 224000, method: 'QR', status: 'SUCCESS', status_fa: 'موفق', time: '۱۴:۰۵' },
      { code: 'TX-88211', prod: 'شربت دیفن‌هیدرامین', slot: 'B2', amt: 54000, method: 'کارت', status: 'REFUND', status_fa: 'برگشت وجه', time: '۱۳:۴۸' },
      { code: 'TX-88210', prod: 'چسب زخم ضدآب', slot: 'D2', amt: 35000, method: 'کارت', status: 'SUCCESS', status_fa: 'موفق', time: '۱۳:۲۰' },
      { code: 'TX-88209', prod: 'ژلوفن ۴۰۰', slot: 'A2', amt: 96000, method: 'کارت', status: 'SUCCESS', status_fa: 'موفق', time: '۱۲:۵۹' },
      { code: 'TX-88208', prod: 'پودر ORS', slot: 'C2', amt: 36000, method: 'QR', status: 'STUCK', status_fa: 'گیر کردن', time: '۱۲:۴۱' },
      { code: 'TX-88207', prod: 'آدالت کلد', slot: 'B1', amt: 72000, method: 'کارت', status: 'SUCCESS', status_fa: 'موفق', time: '۱۱:۱۷' },
      { code: 'TX-88206', prod: 'قرص مکیدنی گلو', slot: 'B3', amt: 78000, method: 'کارت', status: 'SUCCESS', status_fa: 'موفق', time: '۱۰:۰۲' },
      { code: 'TX-88205', prod: 'آنتی‌اسید جویدنی', slot: 'C1', amt: 42000, method: 'QR', status: 'CANCEL', status_fa: 'لغو کاربر', time: '۰۹:۳۴' }
    ];
  }

  updateData(data) {
    if (data.products) this.products = data.products;
    if (data.medicines) this.products = data.medicines;
    if (data.transactions) {
      // Merge with sample if needed
    }
    this.render();
  }

  updateStock(slotId, newStock) {
    const p = this.products.find(x => x.slot_id === slotId);
    if (p) p.stock = newStock;
    if (this.activeTab === 'slots') this.renderSlots();
  }

  render() {
    if (this.activeTab === 'slots') this.renderSlots();
    if (this.activeTab === 'transactions') this.renderTransactions('ALL');
  }

  // --- TAB 2: RENDER 24 SLOTS GRID ---
  renderSlots() {
    const grid = document.getElementById('adminSlotsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    // Slot IDs: A1..A4, B1..B4, C1..C4, D1..D4, E1..E4, F1..F4 (24 Total Slots)
    const slotMatrix = [
      'A1','A2','A3','A4',
      'B1','B2','B3','B4',
      'C1','C2','C3','C4',
      'D1','D2','D3','D4',
      'E1','E2','E3','E4',
      'F1','F2','F3','F4'
    ];

    const sourceProducts = (this.products && this.products.length > 0) ? this.products : (window.kioskApp ? window.kioskApp.products : []);

    slotMatrix.forEach(code => {
      const prod = sourceProducts.find(p => p.slot_code === code);
      const card = document.createElement('div');

      if (prod) {
        let statusClass = 'status-ok';
        if (prod.stock <= 0) statusClass = 'status-empty';
        else if (prod.stock <= 5) statusClass = 'status-limited';

        const isSelected = this.selectedSlotId === prod.slot_id;

        card.className = `slot-admin-card ${statusClass} ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="slot-admin-top">
            <span class="slot-admin-id">${code}</span>
            <span class="slot-admin-stock-val">${this._toPersianDigits(prod.stock)}/۳۰</span>
          </div>
          <div class="slot-admin-name">${prod.name_fa}</div>
          <div class="slot-status-bar-bottom"></div>
        `;

        card.addEventListener('click', () => {
          if (window.kioskAudio) window.kioskAudio.playTap();
          this.selectSlot(prod);
        });
      } else {
        // Unassigned / Empty slot
        card.className = 'slot-admin-card empty-slot';
        card.innerHTML = `
          <div class="slot-admin-top">
            <span class="slot-admin-id">${code}</span>
          </div>
          <div class="slot-admin-name" style="color: var(--text-muted); font-size: 12px;">خالی / تعریف نشده</div>
        `;
      }

      grid.appendChild(card);
    });
  }

  selectSlot(prod) {
    this.selectedSlotId = prod.slot_id;
    this.renderSlots();

    document.getElementById('drawerEmptyState').style.display = 'none';
    const drawer = document.getElementById('drawerActiveContent');
    drawer.style.display = 'flex';

    document.getElementById('drawerSlotCode').textContent = `اسلات ${prod.slot_code || 'A1'} · ${prod.product_code || ''}`;
    document.getElementById('drawerSlotTitle').textContent = prod.name_fa;
    document.getElementById('drawerSlotMeta').textContent = `${this._formatPrice(prod.price)} تومان · انقضا: ۱۴۰۶/۰۸`;
    document.getElementById('adminStockVal').textContent = this._toPersianDigits(prod.stock);

    const preview = document.getElementById('drawerPackPreview');
    if (preview && window.kioskApp) {
      preview.innerHTML = window.kioskApp.getPackagingSvg(prod.image_key || 'px-1042', 75, 75);
    }
  }

  // --- TAB 4: RENDER TRANSACTIONS ---
  renderTransactions(filter = 'ALL') {
    const tbody = document.getElementById('adminTrxTableBody');
    if (!tbody) return;

    let filtered = this.transactions;
    if (filter === 'SUCCESS') filtered = filtered.filter(t => t.status === 'SUCCESS');
    if (filter === 'ERROR') filtered = filtered.filter(t => t.status === 'REFUND' || t.status === 'STUCK' || t.status === 'CANCEL');

    tbody.innerHTML = '';
    filtered.forEach(t => {
      const tr = document.createElement('tr');
      let badgeClass = 'success';
      if (t.status === 'REFUND') badgeClass = 'refund';
      if (t.status === 'STUCK') badgeClass = 'stuck';
      if (t.status === 'CANCEL') badgeClass = 'cancel';

      tr.innerHTML = `
        <td>${t.time}</td>
        <td><strong>${t.code}</strong></td>
        <td>${t.prod}</td>
        <td><strong>${t.slot}</strong></td>
        <td>${this._formatPrice(t.amt)}</td>
        <td>${t.method}</td>
        <td><span class="trx-status-badge ${badgeClass}">${t.status_fa}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- ACTIONS & COMMANDS ---
  _bindActionEvents() {
    // Stock Minus & Plus
    const btnMinus = document.getElementById('btnAdminStockMinus');
    const btnPlus = document.getElementById('btnAdminStockPlus');
    const btnFull = document.getElementById('btnAdminRestock30');

    if (btnMinus) {
      btnMinus.addEventListener('click', () => {
        this._adjustSelectedStock(-1);
      });
    }
    if (btnPlus) {
      btnPlus.addEventListener('click', () => {
        this._adjustSelectedStock(1);
      });
    }
    if (btnFull) {
      btnFull.addEventListener('click', () => {
        const prod = this._getSelectedProduct();
        if (prod) {
          const delta = 30 - prod.stock;
          this._adjustSelectedStock(delta);
          this._showToast('اسلات با موفقیت به ۳۰ عدد شارژ کامل شد ✓');
        }
      });
    }

    // Toggle Slot Active
    const btnToggle = document.getElementById('btnAdminToggleSlot');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this._showToast('وضعیت اسلات با موفقیت تغییر یافت ✓');
      });
    }

    // Test Motor
    const btnMotor = document.getElementById('btnAdminTestMotor');
    if (btnMotor) {
      btnMotor.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        const prod = this._getSelectedProduct();
        if (prod && window.kioskApp && window.kioskApp.ws) {
          window.kioskApp.ws.send(JSON.stringify({
            type: 'ADMIN_TEST_DISPENSE',
            slotId: prod.slot_id
          }));
        }
        this._showToast('موتور اسلات با موفقیت ۱ دور تست شد ✓');
      });
    }

    // Quick Command Buttons
    const btnDoor = document.getElementById('btnCmdOpenDoor');
    if (btnDoor) {
      btnDoor.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playSuccess();
        this._showToast('درب سرویس باز شد ✓');
      });
    }

    const btnCalib = document.getElementById('btnCmdCalibrate');
    if (btnCalib) {
      btnCalib.addEventListener('click', () => {
        this._showToast('کالیبراسیون بازوی مکانیکی آغاز شد ✓');
      });
    }

    const btnSync = document.getElementById('btnCmdSync');
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        this._showToast('همگام‌سازی دستی با سرور مرکزی انجام شد ✓');
      });
    }

    const btnPrint = document.getElementById('btnCmdTestPrinter');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        this._showToast('دستور تست چاپگر ارسال شد ✓');
      });
    }

    const btnReboot = document.getElementById('btnCmdReboot');
    if (btnReboot) {
      btnReboot.addEventListener('click', () => {
        this._showToast('دستگاه در حال راه‌اندازی مجدد است...');
      });
    }

    // Sliders
    const sTemp = document.getElementById('sliderFridgeTemp');
    const vTemp = document.getElementById('valFridgeTemp');
    if (sTemp && vTemp) {
      sTemp.addEventListener('input', (e) => {
        vTemp.textContent = `${this._toPersianDigits(e.target.value)}°C`;
      });
    }

    const sBright = document.getElementById('sliderBrightness');
    const vBright = document.getElementById('valBrightness');
    if (sBright && vBright) {
      sBright.addEventListener('input', (e) => {
        vBright.textContent = `${this._toPersianDigits(e.target.value)}٪`;
      });
    }

    // Transaction Filter Pills
    document.querySelectorAll('.trx-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        document.querySelectorAll('.trx-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        this.renderTransactions(filter);
      });
    });

    // Excel Export
    const btnExcel = document.getElementById('btnExportExcel');
    if (btnExcel) {
      btnExcel.addEventListener('click', () => {
        this._showToast('گزارش اکسل آماده شد و ذخیره گردید ✓');
      });
    }

    // Footer Buttons
    const btnExit = document.getElementById('btnExitAdmin');
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.close();
      });
    }

    const btnLock = document.getElementById('btnLockAdmin');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.open();
      });
    }
  }

  _getSelectedProduct() {
    const list = (this.products && this.products.length > 0) ? this.products : (window.kioskApp ? window.kioskApp.products : []);
    return list.find(p => p.slot_id === this.selectedSlotId);
  }

  _adjustSelectedStock(delta) {
    const prod = this._getSelectedProduct();
    if (!prod) return;

    const newStock = Math.max(0, Math.min(30, prod.stock + delta));
    prod.stock = newStock;
    document.getElementById('adminStockVal').textContent = this._toPersianDigits(newStock);

    if (window.kioskApp && window.kioskApp.ws) {
      window.kioskApp.ws.send(JSON.stringify({
        type: 'ADMIN_ADJUST_STOCK',
        slotId: prod.slot_id,
        delta: delta,
        user: 'مهندس رضایی'
      }));
    }

    this.renderSlots();
  }

  _showToast(msg) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  _toPersianDigits(num) {
    if (num === null || num === undefined) return '';
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/\d/g, d => faDigits[d]);
  }

  _formatPrice(num) {
    if (!num) return '۰';
    return this._toPersianDigits(num.toLocaleString('en-US'));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.adminDashboard = new AdminDashboardController();
});
