/**
 * Pharmacy Vending Kiosk - Main Application Controller
 * Pure Vanilla JavaScript, Zero Overhead, 60 FPS Target
 * Manages 6-Screen Customer Flow & Real-Time Hardware Synchronization.
 */

'use strict';

class KioskApplication {
  constructor() {
    this.ws = null;
    this.currentScreen = 'screen-home';
    this.products = [];
    this.categories = [];
    this.selectedProduct = null;
    this.currentTransaction = null;

    // Cart / Order State
    this.orderQuantity = 1;
    this.hasCrossSellAdded = false;
    this.crossSellProduct = null;

    // Feature Toggles
    this.isPrivacyMode = false;
    this.isReachabilityMode = false;
    this.currentLanguage = 'fa';

    // Timers
    this.paymentTimer = null;
    this.paymentSecondsLeft = 84;
    this.successTimer = null;
    this.successSecondsLeft = 28;
    this.dispenseInterval = null;

    // DOM Elements Cache
    this.container = document.getElementById('kioskContainer');
    this.clockEl = document.getElementById('statusClock');
    this.dateEl = document.getElementById('statusDate');
    this.cloudPill = document.getElementById('cloudPill');
    this.cloudStatusText = document.getElementById('cloudStatusText');

    this._initClock();
    this._bindEvents();
    this._connectWebSocket();
    this._initFallbackProducts();
  }

  // --- CLOCK & DATE ---
  _initClock() {
    const updateTime = () => {
      const now = new Date();
      if (this.clockEl) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        this.clockEl.textContent = this._toPersianDigits(`${hh}:${mm}`);
      }
      if (this.dateEl) {
        try {
          const faDate = new Intl.DateTimeFormat('fa-IR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          }).format(now);
          this.dateEl.textContent = faDate;
        } catch {
          this.dateEl.textContent = 'سه‌شنبه ۲۰ آبان';
        }
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
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

  // --- SCREEN SWITCHING ---
  showScreen(screenId) {
    document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
      this.currentScreen = screenId;
    }

    // Clear background timers when navigating
    if (screenId !== 'screen-payment' && this.paymentTimer) {
      clearInterval(this.paymentTimer);
      this.paymentTimer = null;
    }
    if (screenId !== 'screen-success' && this.successTimer) {
      clearInterval(this.successTimer);
      this.successTimer = null;
    }
  }

  // --- WEBSOCKET CONNECTION ---
  _connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this._setCloudStatus(true);
      };

      this.ws.onclose = () => {
        this._setCloudStatus(false);
        setTimeout(() => this._connectWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        this._setCloudStatus(false);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleServerMessage(msg);
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };
    } catch (e) {
      this._setCloudStatus(false);
    }
  }

  _setCloudStatus(isOnline) {
    if (this.cloudStatusText) {
      this.cloudStatusText.textContent = isOnline ? 'متصل به سرور' : 'آفلاین (محلی)';
    }
    if (this.cloudPill) {
      this.cloudPill.style.opacity = isOnline ? '1' : '0.6';
    }
  }

  _handleServerMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE': {
        this.products = msg.data.products || msg.data.medicines || [];
        this.categories = msg.data.categories || [];
        this.renderCatalog('all', 'all');
        this.renderHomeFeatured();
        if (window.adminDashboard) {
          window.adminDashboard.updateData(msg.data);
        }
        break;
      }

      case 'TRX_CREATED': {
        this.currentTransaction = msg.data;
        break;
      }

      case 'STOCK_UPDATED': {
        const p = this.products.find(x => x.slot_id === msg.data.slotId);
        if (p) p.stock = msg.data.newStock;
        this.renderCatalog();
        if (window.adminDashboard) {
          window.adminDashboard.updateStock(msg.data.slotId, msg.data.newStock);
        }
        break;
      }

      case 'DISPENSE_STAGE': {
        this._handleDispenseStage(msg.data);
        break;
      }

      case 'DISPENSE_COMPLETE': {
        this._handleDispenseComplete();
        break;
      }

      case 'DISPENSE_FAILED': {
        this._handleDispenseFail(msg.data);
        break;
      }

      case 'ADMIN_DATA_REFRESH': {
        if (window.adminDashboard) {
          window.adminDashboard.updateData(msg.data);
        }
        break;
      }
    }
  }

  // --- FALLBACK INITIAL DATA ---
  _initFallbackProducts() {
    if (this.products.length === 0) {
      // 16 Standard Products matching extracted photos
      this.products = [
        { id: 1, product_code: 'PX-1042', name_fa: 'استامینوفن ۵۰۰', name_en: 'Acetaminophen 500mg', category: 'head', sub_category_fa: 'مسکن و تب بر', slot_code: 'A1', indication_fa: 'تسکین سردرد، تب و دردهای خفیف تا متوسط', ingredients_fa: 'استامینوفن ۵۰۰ میلی‌گرم، نشاسته ذرت، منیزیم استئارات', price: 48000, slot_id: 1, stock: 18, max_capacity: 30, is_sensitive: 0, image_key: 'px-1042' },
        { id: 2, product_code: 'PX-1051', name_fa: 'ژلوفن ۴۰۰', name_en: 'Gelofen 400mg', category: 'head', sub_category_fa: 'مسکن و تب بر', slot_code: 'A2', indication_fa: 'تسکین دردهای قاعدگی، دندان‌درد، میگرن و التهاب', ingredients_fa: 'ایبوپروفن ۴۰۰ میلی‌گرم، ژلاتین دارویی، گلیسیرین', price: 96000, slot_id: 2, stock: 3, max_capacity: 30, is_sensitive: 0, image_key: 'px-1051' },
        { id: 3, product_code: 'PX-1107', name_fa: 'آدالت کلد', name_en: 'Adult Cold', category: 'chest', sub_category_fa: 'سرماخوردگی', slot_code: 'B1', indication_fa: 'کاهش آبریزش، گرفتگی بینی و بدن‌درد', ingredients_fa: 'استامینوفن ۳۲۵mg، فنیل‌افرین ۵mg، کلرفنیرامین ۲mg', price: 72000, slot_id: 3, stock: 11, max_capacity: 30, is_sensitive: 0, image_key: 'px-1107' },
        { id: 4, product_code: 'PX-1120', name_fa: 'شربت دیفن‌هیدرامین', name_en: 'Diphenhydramine Syrup', category: 'chest', sub_category_fa: 'سرماخوردگی', slot_code: 'B2', indication_fa: 'بهبود سرفه‌های خشک، حساسیت تنفسی و آلرژی فصلی', ingredients_fa: 'دیفن‌هیدرامین هیدروکلراید ۱۲.۵mg در ۵ml', price: 54000, slot_id: 4, stock: 0, max_capacity: 30, is_sensitive: 0, image_key: 'px-1120' },
        { id: 5, product_code: 'PX-1131', name_fa: 'قرص مکیدنی گلو', name_en: 'Throat Lozenges', category: 'chest', sub_category_fa: 'سرماخوردگی', slot_code: 'B3', indication_fa: 'عسل و لیمو برای تسکین گلودرد و خشکی گلو', ingredients_fa: 'اسانس لیمو و عسل، منتول، اسید سیتریک، ویتامین C', price: 39000, slot_id: 5, stock: 22, max_capacity: 30, is_sensitive: 0, image_key: 'px-1131' },
        { id: 6, product_code: 'PX-1203', name_fa: 'آنتی‌اسید جویدنی', name_en: 'Chewable Antacid', category: 'stomach', sub_category_fa: 'گوارشی', slot_code: 'C1', indication_fa: 'رفع سریع ترش کردن و سوزش سر دل', ingredients_fa: 'هیدروکسید آلومینیوم ۲۰۰mg، هیدروکسید منیزیم ۲۰۰mg', price: 42000, slot_id: 6, stock: 14, max_capacity: 30, is_sensitive: 0, image_key: 'px-1203' },
        { id: 7, product_code: 'PX-1215', name_fa: 'پودر ORS', name_en: 'Oral Rehydration Salts', category: 'stomach', sub_category_fa: 'گوارشی', slot_code: 'C2', indication_fa: 'جبران آب و املاح بدن در اسهال و گرمازدگی', ingredients_fa: 'سدیم کلراید ۲.۶g، گلوکز بی‌آب ۱۳.۵g، پتاسیم کلراید ۱.۵g', price: 18000, slot_id: 7, stock: 4, max_capacity: 30, is_sensitive: 0, image_key: 'px-1215' },
        { id: 8, product_code: 'PX-1220', name_fa: 'ملین گیاهی', name_en: 'Herbal Laxative', category: 'stomach', sub_category_fa: 'گوارشی', slot_code: 'C3', indication_fa: 'بهبود یبوست، تسهیل گوارش و حرکات دودی روده', ingredients_fa: 'عصاره سنا، اسانس رازیانه، گل محمدی', price: 25000, slot_id: 8, stock: 9, max_capacity: 30, is_sensitive: 0, image_key: 'px-1220' },
        { id: 9, product_code: 'PX-1225', name_fa: 'محافظ معده', name_en: 'Gastro Shield', category: 'stomach', sub_category_fa: 'گوارشی', slot_code: 'C4', indication_fa: 'کاهش پایدار اسید معده و حفاظت مخاط', ingredients_fa: 'امپرازول ۲۰ میلی‌گرم پلت روده‌ای', price: 30000, slot_id: 9, stock: 10, max_capacity: 30, is_sensitive: 0, image_key: 'px-1225' },
        { id: 10, product_code: 'PX-1330', name_fa: 'کرم هیدروکورتیزون ۱٪', name_en: 'Hydrocortisone 1% Cream', category: 'skin', sub_category_fa: 'پوست و زخم', slot_code: 'D1', indication_fa: 'ضد خارش قوی، رفع اگزمای پوستی و حساسیت', ingredients_fa: 'هیدروکورتیزون استات ۱ گرم در ۱۰۰ گرم پایه کرم', price: 42000, slot_id: 10, stock: 7, max_capacity: 30, is_sensitive: 0, image_key: 'px-1330' },
        { id: 11, product_code: 'PX-1325', name_fa: 'چسب زخم ضدآب', name_en: 'Waterproof Bandages', category: 'skin', sub_category_fa: 'پوست و زخم', slot_code: 'D2', indication_fa: 'محافظت استریل از بریدگی‌ها و خراشیدگی', ingredients_fa: 'لایه پلی‌اورتان ضدآب، پد جاذب ضدچسبندگی', price: 35000, slot_id: 11, stock: 30, max_capacity: 30, is_sensitive: 0, image_key: 'px-1325' },
        { id: 12, product_code: 'PX-1320', name_fa: 'ژل آلوئه‌ورا', name_en: 'Aloe Vera Gel', category: 'skin', sub_category_fa: 'پوست و زخم', slot_code: 'D3', indication_fa: 'آبرسان، التیام آفتاب‌سوختگی و بازسازی پوست', ingredients_fa: 'عصاره خالص ژل آلوئه‌ورا ۹۹٪، آلانتوئین، ویتامین E', price: 55000, slot_id: 12, stock: 0, max_capacity: 30, is_sensitive: 0, image_key: 'px-1320' },
        { id: 13, product_code: 'PX-2210', name_fa: 'ویتامین C جوشان', name_en: 'Vitamin C Effervescent', category: 'chest', sub_category_fa: 'ویتامین و مکمل', slot_code: 'E1', indication_fa: 'تقویت سیستم ایمنی و تسریع بهبودی بدن', ingredients_fa: 'اسید اسکوربیک ۱۰۰۰mg، زینک ۱۰mg، طعم پرتقالی طبیعی', price: 112000, slot_id: 13, stock: 16, max_capacity: 30, is_sensitive: 0, image_key: 'px-2210' },
        { id: 14, product_code: 'PX-2218', name_fa: 'ویتامین D3 ۱۰۰۰', name_en: 'Vitamin D3 1000 IU', category: 'head', sub_category_fa: 'ویتامین و مکمل', slot_code: 'E2', indication_fa: 'سلامت استخوان و ایمنی، سافت‌ژل', ingredients_fa: 'کوله کلسیفرول ۱۰۰۰ IU، روغن زیتون حامل، ژلاتین پوشش', price: 138000, slot_id: 14, stock: 2, max_capacity: 30, is_sensitive: 0, image_key: 'px-2218' },
        { id: 15, product_code: 'PX-4401', name_fa: 'تست بارداری', name_en: 'Pregnancy Rapid Test', category: 'skin', sub_category_fa: 'بهداشت شخصی', slot_code: 'F1', indication_fa: 'تشخیص سریع خانگی hCG با دقت ۹۹.۸٪', ingredients_fa: 'نوار تشخیصی آنتی‌بادی منوکلونال، پد جاذب استریل', price: 45000, slot_id: 15, stock: 12, max_capacity: 30, is_sensitive: 1, image_key: 'px-4401' },
        { id: 16, product_code: 'PX-4410', name_fa: 'کاندوم کلاسیک', name_en: 'Classic Condom', category: 'skin', sub_category_fa: 'بهداشت شخصی', slot_code: 'F2', indication_fa: 'لاتکس طبیعی با لوبریکانت سیلیکونی و مخزن', ingredients_fa: 'لاتکس ۱۰۰٪ طبیعی، لوبریکانت سیلیکونی پزشکی', price: 65000, slot_id: 16, stock: 5, max_capacity: 30, is_sensitive: 1, image_key: 'px-4410' }
      ];
      this.renderCatalog('all', 'all');
      this.renderHomeFeatured();
    }
  }

  // --- SVG MEDICINE PACKAGING GENERATOR ---
  getPackagingSvg(key, width = 120, height = 120) {
    switch (key) {
      case 'px-1042': // Acetaminophen
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M25 34 C25 24 115 24 115 34 L115 54 C115 44 25 44 25 54 Z" fill="#CF2846"/>
            <text x="70" y="74" font-size="11" font-weight="700" fill="#45404A" text-anchor="middle" font-family="sans-serif">Acetaminophen</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">قرص ۲۰</text>
          </svg>
        `;
      case 'px-1051': // Gelofen
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M25 34 C25 24 115 24 115 34 L115 54 C115 44 25 44 25 54 Z" fill="#B4317F"/>
            <text x="70" y="74" font-size="11" font-weight="700" fill="#45404A" text-anchor="middle" font-family="sans-serif">Ibuprofen</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">کپسول ۲۰</text>
          </svg>
        `;
      case 'px-1107': // Adult Cold
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M25 34 C25 24 115 24 115 34 L115 54 C115 44 25 44 25 54 Z" fill="#803697"/>
            <text x="70" y="74" font-size="12" font-weight="800" fill="#45404A" text-anchor="middle" font-family="sans-serif">Adult</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">قرص ۲۰</text>
          </svg>
        `;
      case 'px-1120': // Diphenhydramine Syrup
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="52" y="15" width="36" height="18" rx="5" fill="#5A5462"/>
            <rect x="40" y="32" width="60" height="92" rx="16" fill="#8E2663" opacity="0.85"/>
            <rect x="45" y="55" width="50" height="45" rx="6" fill="#FFFFFF"/>
            <text x="70" y="75" font-size="9" font-weight="700" fill="#8E2663" text-anchor="middle" font-family="sans-serif">Diphen</text>
            <text x="70" y="88" font-size="8" font-weight="600" fill="#6B6574" text-anchor="middle" font-family="sans-serif">۱۲۰ ml</text>
          </svg>
        `;
      case 'px-1131': // Throat Lozenges
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M25 20 L115 20 L115 42 L25 42 Z" fill="#D9A0C0"/>
            <line x1="25" y1="42" x2="115" y2="42" stroke="#A23391" stroke-width="2"/>
            <text x="70" y="74" font-size="11" font-weight="800" fill="#45404A" text-anchor="middle" font-family="sans-serif">Throat</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">عدد ۱۲</text>
          </svg>
        `;
      case 'px-1203': // Chewable Antacid
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="50" y="16" width="40" height="16" rx="6" fill="#2E2A33"/>
            <rect x="35" y="32" width="70" height="88" rx="20" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M35 88 L105 88 L105 102 C105 112 35 112 35 102 Z" fill="#593796"/>
            <text x="70" y="66" font-size="11" font-weight="800" fill="#3A3540" text-anchor="middle" font-family="sans-serif">Antacid</text>
            <text x="70" y="80" font-size="8" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">قرص ۲۰</text>
          </svg>
        `;
      case 'px-1215': // ORS Powder
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <rect x="25" y="20" width="90" height="26" fill="#A23391"/>
            <text x="70" y="74" font-size="12" font-weight="800" fill="#3A3540" text-anchor="middle" font-family="sans-serif">Oral</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">ساشه ۵</text>
          </svg>
        `;
      case 'px-1220': // Herbal Laxative
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <rect x="25" y="20" width="90" height="26" fill="#593796"/>
            <text x="70" y="74" font-size="11" font-weight="800" fill="#593796" text-anchor="middle" font-family="sans-serif">Herbal</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">قرص ۳۰</text>
          </svg>
        `;
      case 'px-1225': // Gastro Shield
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <rect x="25" y="20" width="90" height="26" fill="#803697"/>
            <text x="70" y="74" font-size="11" font-weight="800" fill="#593796" text-anchor="middle" font-family="sans-serif">Gastro</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">کپسول ۱۴</text>
          </svg>
        `;
      case 'px-1330': // Hydrocortisone
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <polygon points="45,115 95,115 88,40 52,40" fill="#FFFFFF" stroke="#D3CAE6" stroke-width="2"/>
            <rect x="55" y="22" width="30" height="18" rx="4" fill="#803697"/>
            <rect x="49" y="60" width="42" height="18" fill="#593796"/>
            <text x="70" y="73" font-size="7" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">Hydrocortisone</text>
          </svg>
        `;
      case 'px-1325': // Plaster
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <rect x="25" y="20" width="90" height="26" fill="#593796"/>
            <circle cx="70" cy="74" r="14" fill="#E6DEF5"/>
            <path d="M70 65 L70 83 M61 74 L79 74" stroke="#593796" stroke-width="3" stroke-linecap="round"/>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">۲۰ عددی</text>
          </svg>
        `;
      case 'px-1320': // Aloe Vera Gel
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="52" y="18" width="36" height="16" rx="5" fill="#593796"/>
            <rect x="42" y="34" width="56" height="90" rx="16" fill="#E6DEF5" stroke="#CDBFE8" stroke-width="2"/>
            <text x="70" y="74" font-size="10" font-weight="800" fill="#593796" text-anchor="middle" font-family="sans-serif">Aloe Vera</text>
            <text x="70" y="90" font-size="8" font-weight="600" fill="#593796" text-anchor="middle" font-family="sans-serif">۹۹٪ خالص</text>
          </svg>
        `;
      case 'px-2210': // Vitamin C Effervescent
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="52" y="14" width="36" height="12" rx="4" fill="#FFFFFF" stroke="#D3CAE6" stroke-width="1.5"/>
            <rect x="46" y="26" width="48" height="96" rx="8" fill="#B4317F"/>
            <rect x="46" y="50" width="48" height="35" fill="#FFFFFF"/>
            <text x="70" y="65" font-size="9" font-weight="800" fill="#8E2663" text-anchor="middle" font-family="sans-serif">Vitamin C</text>
            <text x="70" y="78" font-size="8" font-weight="700" fill="#5A5462" text-anchor="middle" font-family="sans-serif">قرص ۲۰</text>
          </svg>
        `;
      case 'px-2218': // Vitamin D3
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="50" y="16" width="40" height="18" rx="6" fill="#2E2A33"/>
            <rect x="35" y="34" width="70" height="86" rx="20" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <path d="M35 88 L105 88 L105 104 C105 114 35 114 35 104 Z" fill="#D9A0C0"/>
            <text x="70" y="66" font-size="12" font-weight="900" fill="#3A3540" text-anchor="middle" font-family="sans-serif">Vitamin</text>
            <text x="70" y="80" font-size="8" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">عدد ۶۰</text>
          </svg>
        `;
      case 'px-4401': // Pregnancy Test
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#FFFFFF" stroke="#E3DDF1" stroke-width="2"/>
            <rect x="25" y="20" width="90" height="26" fill="#B4317F"/>
            <text x="70" y="74" font-size="12" font-weight="800" fill="#A23391" text-anchor="middle" font-family="sans-serif">بارداری</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">۱ عدد</text>
          </svg>
        `;
      case 'px-4410': // Classic Condom
      default:
        return `
          <svg width="${width}" height="${height}" viewBox="0 0 140 140" class="med-box-svg">
            <rect x="25" y="20" width="90" height="100" rx="14" fill="#2E2A33" stroke="#45404A" stroke-width="1.5"/>
            <rect x="25" y="20" width="90" height="24" fill="#3A3540"/>
            <text x="70" y="74" font-size="12" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">کلاسیک</text>
            <text x="70" y="104" font-size="9" font-weight="600" fill="#8A8394" text-anchor="middle" font-family="sans-serif">۳ عدد</text>
          </svg>
        `;
    }
  }

  // --- RENDER HOME FEATURED MEDICINE ---
  renderHomeFeatured() {
    const wrap = document.getElementById('homeFeaturedVisual');
    if (wrap) {
      wrap.innerHTML = this.getPackagingSvg('px-1042', 150, 150);
    }
  }

  // --- RENDER BENTO GRID CATALOG ---
  renderCatalog(catFilter = 'all', subFilter = 'all') {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    let filtered = this.products;

    if (catFilter && catFilter !== 'all') {
      filtered = filtered.filter(p => p.category === catFilter);
    }
    if (subFilter && subFilter !== 'all') {
      filtered = filtered.filter(p => p.sub_category_fa === subFilter);
    }

    const countEl = document.getElementById('catalogTotalCount');
    if (countEl) {
      countEl.textContent = `${this._toPersianDigits(filtered.length)} محصول`;
    }

    grid.innerHTML = '';
    filtered.forEach(p => {
      const card = document.createElement('div');
      const isOut = p.stock <= 0;
      const isLimited = p.stock > 0 && p.stock <= 5;
      const isSensitive = p.is_sensitive === 1;

      card.className = `product-bento-card ${isOut ? 'out-of-stock' : ''} ${isSensitive ? 'sensitive-item' : ''}`;

      let badgeHtml = '';
      if (isOut) {
        badgeHtml = `<span class="card-stock-badge empty">ناموجود</span>`;
      } else if (isLimited) {
        badgeHtml = `<span class="card-stock-badge limited"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>موجودی محدود</span>`;
      }

      card.innerHTML = `
        <div class="product-card-top-row">
          <span class="card-code-pill">${p.product_code || 'PX-1000'}</span>
          ${badgeHtml}
        </div>
        <div class="product-pack-visual-wrap">
          ${this.getPackagingSvg(p.image_key || 'px-1042', 110, 110)}
        </div>
        <div class="product-card-category">${p.sub_category_fa || 'دارویی'}</div>
        <h3 class="product-card-title">${p.name_fa}</h3>
        <p class="product-card-desc">${p.indication_fa || ''}</p>
        <div class="product-card-bottom-row">
          <div class="product-price-tag">${this._formatPrice(p.price)} <span>تومان</span></div>
          <button type="button" class="btn-add-product" aria-label="انتخاب محصول" ${isOut ? 'disabled' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', () => {
        if (!isOut) {
          if (window.kioskAudio) window.kioskAudio.playTap();
          this.selectProduct(p.id);
        }
      });

      grid.appendChild(card);
    });
  }

  // --- SELECT PRODUCT & GO TO CONFIRM ---
  selectProduct(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    this.selectedProduct = prod;
    this.orderQuantity = 1;
    this.hasCrossSellAdded = false;

    // Default cross-sell: Vitamin C effervescent (PX-2210)
    this.crossSellProduct = this.products.find(p => p.product_code === 'PX-2210') || this.products[12];

    // Populate Confirm View
    document.getElementById('confirmTitleFa').textContent = prod.name_fa;
    document.getElementById('confirmTitleEn').textContent = prod.name_en || '';
    document.getElementById('confirmIndication').textContent = prod.indication_fa || '';
    document.getElementById('confirmProductCategoryCode').textContent = `${prod.sub_category_fa || 'دارویی'} · ${prod.product_code || ''}`;
    document.getElementById('confirmSlotCode').textContent = prod.slot_code || 'A1';

    const row = prod.slot_code ? prod.slot_code[0] : 'A';
    const col = prod.slot_code ? prod.slot_code[1] : '1';
    document.getElementById('confirmSlotLocation').textContent = `ردیف ${row} · ستون ${col}`;

    // Render pack spotlight
    const spot = document.getElementById('confirmMainVisual');
    if (spot) {
      spot.innerHTML = this.getPackagingSvg(prod.image_key || 'px-2218', 190, 190);
    }

    // Render mini 6x4 slot matrix
    const matrix = document.getElementById('confirmSlotGrid');
    if (matrix) {
      matrix.innerHTML = '';
      const slots = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4','E1','E2','E3','E4','F1','F2','F3','F4'];
      slots.forEach(s => {
        const cell = document.createElement('div');
        cell.className = `matrix-cell ${s === prod.slot_code ? 'active-slot' : ''}`;
        matrix.appendChild(cell);
      });
    }

    // Setup Cross-Sell visual
    const crossVisual = document.getElementById('confirmCrossVisual');
    if (crossVisual && this.crossSellProduct) {
      crossVisual.innerHTML = this.getPackagingSvg(this.crossSellProduct.image_key || 'px-2210', 70, 70);
      document.getElementById('confirmCrossTitle').textContent = this.crossSellProduct.name_fa;
      document.getElementById('confirmCrossPrice').textContent = `${this._formatPrice(this.crossSellProduct.price)} تومان`;
    }

    const btnCross = document.getElementById('btnAddCrossSell');
    if (btnCross) {
      btnCross.className = 'btn-add-cross-sell';
      btnCross.textContent = '+ افزودن به سفارش';
    }

    this._updateConfirmSummary();
    this.showScreen('screen-confirm');
  }

  _updateConfirmSummary() {
    const qtyEl = document.getElementById('qtyNumber');
    if (qtyEl) qtyEl.textContent = this._toPersianDigits(this.orderQuantity);

    const basePrice = (this.selectedProduct ? this.selectedProduct.price : 0) * this.orderQuantity;
    const crossPrice = (this.hasCrossSellAdded && this.crossSellProduct) ? this.crossSellProduct.price : 0;
    const total = basePrice + crossPrice;

    // Items list
    const itemsEl = document.getElementById('checkoutItemsList');
    if (itemsEl && this.selectedProduct) {
      let str = `<span>${this.selectedProduct.name_fa} × ${this._toPersianDigits(this.orderQuantity)}: ${this._formatPrice(basePrice)}</span>`;
      if (this.hasCrossSellAdded && this.crossSellProduct) {
        str += ` <span style="margin-right: 14px;">+ ${this.crossSellProduct.name_fa} × ۱: ${this._formatPrice(crossPrice)}</span>`;
      }
      itemsEl.innerHTML = str;
    }

    const totalEl = document.getElementById('confirmTotalDisplay');
    if (totalEl) {
      totalEl.innerHTML = `${this._formatPrice(total)} <span>تومان</span>`;
    }
  }

  // --- START PAYMENT FLOW ---
  _startPaymentFlow() {
    const basePrice = (this.selectedProduct ? this.selectedProduct.price : 0) * this.orderQuantity;
    const crossPrice = (this.hasCrossSellAdded && this.crossSellProduct) ? this.crossSellProduct.price : 0;
    const total = basePrice + crossPrice;

    // Update Payment Screen
    const priceEl = document.getElementById('paymentBannerPrice');
    if (priceEl) priceEl.innerHTML = `${this._formatPrice(total)} <span>تومان</span>`;

    const posEl = document.getElementById('posScreenAmount');
    if (posEl) posEl.textContent = this._formatPrice(total);

    // Countdown Timer 84s
    this.paymentSecondsLeft = 84;
    const timerBadge = document.getElementById('paymentTimerBadge');
    if (this.paymentTimer) clearInterval(this.paymentTimer);
    this.paymentTimer = setInterval(() => {
      this.paymentSecondsLeft--;
      if (timerBadge) timerBadge.textContent = `⏱ ${this._toPersianDigits(this.paymentSecondsLeft)} ثانیه`;
      if (this.paymentSecondsLeft <= 0) {
        clearInterval(this.paymentTimer);
        this.showScreen('screen-home');
      }
    }, 1000);

    // Register transaction via WebSocket if connected
    if (this.ws && this.selectedProduct) {
      this.ws.send(JSON.stringify({
        type: 'CREATE_TRX',
        productId: this.selectedProduct.id,
        slotId: this.selectedProduct.slot_id,
        amount: total
      }));
    }

    this.showScreen('screen-payment');
    if (window.kioskAudio) {
      window.kioskAudio.speak('لطفاً کارت بانکی خود را به دستگاه نزدیک نموده یا وارد فرمایید.');
    }
  }

  // --- SIMULATE POS ACTIONS ---
  _executePosSuccess() {
    if (window.kioskAudio) window.kioskAudio.playSuccess();
    if (this.paymentTimer) clearInterval(this.paymentTimer);

    if (this.currentTransaction && this.ws) {
      this.ws.send(JSON.stringify({
        type: 'UPDATE_TRX_STATUS',
        trxCode: this.currentTransaction.trx_code,
        status: 'WAITING_PAYMENT',
        module: 'PAY'
      }));
    }

    this._startDispenseFlow();
  }

  _executePosFail() {
    if (window.kioskAudio) window.kioskAudio.playAlert();
    alert('تراکنش بانکی ناموفق بود یا توسط کاربر لغو گردید.');
  }

  // --- DISPENSE FLOW (CONVERTED TO BONE/CREAM BACKGROUND) ---
  _startDispenseFlow() {
    this.showScreen('screen-dispense');

    const slotCode = this.selectedProduct ? (this.selectedProduct.slot_code || 'A1') : 'A1';
    document.getElementById('dispenseArmText').textContent = `بازوی رباتیک به اسلات ${slotCode} رفت`;
    document.getElementById('dispenseMainTitle').textContent = 'در حال آماده‌سازی سفارش شما...';
    document.getElementById('dispenseMainSub').textContent = 'لطفاً منتظر بمانید، این فرایند حدود ۱۰ ثانیه طول می‌کشد';

    document.getElementById('dispenseRingWrap').style.display = 'flex';
    document.getElementById('dispenseCompleteCheck').style.display = 'none';
    document.getElementById('btnDispenseTaken').disabled = true;
    document.getElementById('dispenseDoorStatus').textContent = 'درب تحویل: قفل (در حال آماده‌سازی)';

    // Render Matrix Grid with Drop Slot
    const matrix = document.getElementById('dispenseMatrixGrid');
    if (matrix) {
      matrix.innerHTML = '';
      const slots = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4','E1','E2','E3','E4','F1','F2','F3','F4'];
      slots.forEach(s => {
        const d = document.createElement('div');
        d.className = `d-cell ${s === slotCode ? 'active-drop' : ''}`;
        d.textContent = s;
        matrix.appendChild(d);
      });
    }

    // Step Status Progression
    const p1 = document.getElementById('dispPhase1');
    const p2 = document.getElementById('dispPhase2');
    const p3 = document.getElementById('dispPhase3');
    const p4 = document.getElementById('dispPhase4');

    p1.className = 'dispense-step-card completed';
    p2.className = 'dispense-step-card active';
    p3.className = 'dispense-step-card';
    p4.className = 'dispense-step-card';

    // Animate progress ring up to 100%
    let percent = 20;
    const circle = document.getElementById('dispenseRingProgress');
    const text = document.getElementById('dispensePercent');

    if (this.dispenseInterval) clearInterval(this.dispenseInterval);
    this.dispenseInterval = setInterval(() => {
      percent += 15;
      if (percent > 100) percent = 100;
      if (text) text.textContent = `${this._toPersianDigits(percent)}٪`;
      if (circle) {
        const offset = 440 - (440 * percent) / 100;
        circle.style.strokeDashoffset = offset;
      }

      if (percent >= 50) p2.className = 'dispense-step-card completed';
      if (percent >= 75) p3.className = 'dispense-step-card completed';

      if (percent >= 100) {
        clearInterval(this.dispenseInterval);
        p4.className = 'dispense-step-card completed';
        this._handleDispenseReady();
      }
    }, 600);

    // Send actual hardware request to backend
    if (this.ws && this.selectedProduct) {
      this.ws.send(JSON.stringify({
        type: 'DISPENSE_REQUEST',
        trxCode: this.currentTransaction ? this.currentTransaction.trx_code : 'TRX-DEMO',
        medicineId: this.selectedProduct.id,
        slotId: this.selectedProduct.slot_id
      }));
    }
  }

  _handleDispenseReady() {
    if (window.kioskAudio) window.kioskAudio.playSuccess();

    document.getElementById('dispenseMainTitle').textContent = 'سفارش شما آماده است!';
    document.getElementById('dispenseMainSub').textContent = 'محصول را از درب تحویل در پایین دستگاه بردارید';
    document.getElementById('dispenseDoorStatus').textContent = 'درب تحویل: باز است - لطفاً محصول را بردارید';

    // Hide progress ring and show big checkmark
    document.getElementById('dispenseRingWrap').style.display = 'none';
    document.getElementById('dispenseCompleteCheck').style.display = 'flex';

    // Enable "محصول را برداشتم" button
    const btnTaken = document.getElementById('btnDispenseTaken');
    if (btnTaken) btnTaken.disabled = false;
  }

  _handleDispenseComplete() {
    this._handleDispenseReady();
  }

  _handleDispenseFail(data) {
    if (window.kioskAudio) window.kioskAudio.playAlert();
    alert(`خطا در تحویل کالا: ${data.message_fa || 'مبلغ شما برگشت داده شد'}`);
  }

  _handleDispenseStage(data) {
    // Stage updates from real microcontroller
  }

  // --- GO TO SUCCESS & RECEIPT SCREEN ---
  _showSuccessScreen() {
    const total = (this.selectedProduct ? this.selectedProduct.price : 48000) * this.orderQuantity;
    const trx = this.currentTransaction ? this.currentTransaction.trx_code : 'TX-88214';

    document.getElementById('successReceiptTrx').textContent = trx;
    document.getElementById('successReceiptItem').textContent = `${this.selectedProduct ? this.selectedProduct.name_fa : 'استامینوفن ۵۰۰'} × ${this._toPersianDigits(this.orderQuantity)}`;
    document.getElementById('successReceiptItemPrice').textContent = this._formatPrice(total);
    document.getElementById('successReceiptTotal').textContent = `${this._formatPrice(total)} تومان`;

    // 28-second auto countdown to home
    this.successSecondsLeft = 28;
    const badge = document.getElementById('successCountdownBadge');
    if (this.successTimer) clearInterval(this.successTimer);
    this.successTimer = setInterval(() => {
      this.successSecondsLeft--;
      if (badge) badge.textContent = this._toPersianDigits(this.successSecondsLeft);
      if (this.successSecondsLeft <= 0) {
        clearInterval(this.successTimer);
        this.showScreen('screen-home');
      }
    }, 1000);

    this.showScreen('screen-success');
  }

  // --- GLOBAL BUTTON BINDINGS ---
  _bindEvents() {
    // Top Bar: Audio Toggle
    const btnAudio = document.getElementById('btnAudioToggle');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        if (window.kioskAudio) {
          const isMuted = window.kioskAudio.toggleMute();
          btnAudio.classList.toggle('muted', isMuted);
        }
      });
    }

    // Top Bar: Secret Admin Trigger
    const btnAdmin = document.getElementById('btnAdminTrigger');
    if (btnAdmin) {
      btnAdmin.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        if (window.adminDashboard) {
          window.adminDashboard.open();
        }
      });
    }

    // Screen 1: Start Button & Symptom Cards
    const btnStart = document.getElementById('btnStartShopping');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.showScreen('screen-catalog');
        this.renderCatalog('all', 'all');
      });
    }

    document.querySelectorAll('.home-symptom-card[data-category]').forEach(card => {
      card.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        const cat = card.getAttribute('data-category');
        this.showScreen('screen-catalog');
        this.renderCatalog(cat, 'all');

        // Select the active category tab
        document.querySelectorAll('.cat-btn-card').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-cat') === cat);
        });
      });
    });

    // Screen 2: Body Category Tabs
    document.querySelectorAll('.cat-btn-card').forEach(tab => {
      tab.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        document.querySelectorAll('.cat-btn-card').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const cat = tab.getAttribute('data-cat');
        this.renderCatalog(cat, 'all');
      });
    });

    // Screen 2: Sub-filter Pills
    document.querySelectorAll('.subfilter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        document.querySelectorAll('.subfilter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const sub = pill.getAttribute('data-sub');
        this.renderCatalog('all', sub);
      });
    });

    // Screen 2: Back to Home & Cancel
    const btnBackHome = document.getElementById('btnBackToHome');
    const btnCancelCat = document.getElementById('btnCancelCatalog');
    const handleHome = () => {
      if (window.kioskAudio) window.kioskAudio.playTap();
      this.showScreen('screen-home');
    };
    if (btnBackHome) btnBackHome.addEventListener('click', handleHome);
    if (btnCancelCat) btnCancelCat.addEventListener('click', handleHome);

    // Screen 2: Reachability Mode Toggle
    const btnReach = document.getElementById('btnReachabilityToggle');
    if (btnReach) {
      btnReach.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.isReachabilityMode = !this.isReachabilityMode;
        this.container.classList.toggle('reachability-active', this.isReachabilityMode);
        btnReach.classList.toggle('active', this.isReachabilityMode);
      });
    }

    // Screen 2: Privacy Mode Toggle
    const btnPrivacy = document.getElementById('btnPrivacyToggle');
    const privLabel = document.getElementById('privacyBtnLabel');
    if (btnPrivacy) {
      btnPrivacy.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.isPrivacyMode = !this.isPrivacyMode;
        this.container.classList.toggle('privacy-active', this.isPrivacyMode);
        btnPrivacy.classList.toggle('active', this.isPrivacyMode);
        if (privLabel) {
          privLabel.textContent = this.isPrivacyMode ? 'حالت حریم خصوصی: فعال' : 'حالت حریم خصوصی: غیرفعال';
        }
      });
    }

    // Screen 3: Quantity Minus & Plus
    const btnMinus = document.getElementById('btnQtyMinus');
    const btnPlus = document.getElementById('btnQtyPlus');
    if (btnMinus) {
      btnMinus.addEventListener('click', () => {
        if (this.orderQuantity > 1) {
          if (window.kioskAudio) window.kioskAudio.playTap();
          this.orderQuantity--;
          this._updateConfirmSummary();
        }
      });
    }
    if (btnPlus) {
      btnPlus.addEventListener('click', () => {
        if (this.orderQuantity < 2) {
          if (window.kioskAudio) window.kioskAudio.playTap();
          this.orderQuantity++;
          this._updateConfirmSummary();
        }
      });
    }

    // Screen 3: Add Cross Sell
    const btnCross = document.getElementById('btnAddCrossSell');
    if (btnCross) {
      btnCross.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playSuccess();
        this.hasCrossSellAdded = !this.hasCrossSellAdded;
        btnCross.classList.toggle('added', this.hasCrossSellAdded);
        btnCross.textContent = this.hasCrossSellAdded ? '✓ به سفارش اضافه شد' : '+ افزودن به سفارش';
        this._updateConfirmSummary();
      });
    }

    // Screen 3: Navigation Buttons
    const btnBackCat = document.getElementById('btnBackToCatalog');
    const btnCancelConfirm = document.getElementById('btnCancelConfirmation');
    if (btnBackCat) btnBackCat.addEventListener('click', () => this.showScreen('screen-catalog'));
    if (btnCancelConfirm) btnCancelConfirm.addEventListener('click', () => this.showScreen('screen-catalog'));

    const btnProceed = document.getElementById('btnProceedToPayment');
    if (btnProceed) {
      btnProceed.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this._startPaymentFlow();
      });
    }

    // Screen 4: Payment Simulation Buttons
    const btnSimSuccess = document.getElementById('btnSimulatePosSuccess');
    const btnSimFail = document.getElementById('btnSimulatePosError');
    if (btnSimSuccess) btnSimSuccess.addEventListener('click', () => this._executePosSuccess());
    if (btnSimFail) btnSimFail.addEventListener('click', () => this._executePosFail());

    const btnBackConfirm = document.getElementById('btnBackToConfirm');
    const btnCancelPay = document.getElementById('btnCancelPayment');
    if (btnBackConfirm) btnBackConfirm.addEventListener('click', () => this.showScreen('screen-confirm'));
    if (btnCancelPay) btnCancelPay.addEventListener('click', () => this.showScreen('screen-home'));

    // Screen 4: Payment Method Tabs
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Screen 5: Dispense Door Confirm ("محصول را برداشتم")
    const btnTaken = document.getElementById('btnDispenseTaken');
    if (btnTaken) {
      btnTaken.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this._showSuccessScreen();
      });
    }

    // Screen 6: Star Ratings
    document.querySelectorAll('.star-btn').forEach(star => {
      star.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        const rating = parseInt(star.getAttribute('data-star'), 10);
        document.querySelectorAll('.star-btn').forEach((s, idx) => {
          s.classList.toggle('active', idx < rating);
        });
      });
    });

    // Screen 6: Finish Button
    const btnFinish = document.getElementById('btnSuccessDone');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        if (window.kioskAudio) window.kioskAudio.playTap();
        this.showScreen('screen-home');
      });
    }
  }
}

// Window Responsive Scaler (Scale 1080x1920 to fit window)
function scaleKioskToWindow() {
  const container = document.getElementById('kioskContainer');
  if (!container) return;
  if (window.innerWidth >= 1080 && window.innerHeight >= 1920) {
    container.style.transform = 'none';
    return;
  }
  const scaleX = window.innerWidth / 1080;
  const scaleY = window.innerHeight / 1920;
  const scale = Math.min(scaleX, scaleY, 1);
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = 'center center';
}

window.addEventListener('resize', scaleKioskToWindow);
window.addEventListener('DOMContentLoaded', () => {
  scaleKioskToWindow();
  window.kioskApp = new KioskApplication();
});
