/**
 * Clinical Pharmacy Kiosk Database (SQLite / node:sqlite)
 * Implements: Products, Slots, Immutable Transaction Lifecycle, Cryptographic Inventory Logs, and System Errors (E001-E010).
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  // Graceful fallback
}

const DB_FILE_PATH = path.join(__dirname, 'pharmacy_kiosk.db');

class PharmacyDatabase {
  constructor() {
    this.db = null;
    this.memoryStore = null;
  }

  init() {
    // If DB exists, reset to ensure full schema alignment with customer flow & admin specs
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        fs.unlinkSync(DB_FILE_PATH);
      } catch {}
    }

    if (DatabaseSync) {
      try {
        this.db = new DatabaseSync(DB_FILE_PATH);
        this._setupSchema();
        this._seedData();
        return;
      } catch (err) {
        console.warn('[Database] Disk DB error, falling back to in-memory:', err.message);
        try {
          this.db = new DatabaseSync(':memory:');
          this._setupSchema();
          this._seedData();
          return;
        } catch {}
      }
    }

    this._setupMemoryFallback();
  }

  _setupSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name_fa TEXT NOT NULL,
        name_en TEXT NOT NULL,
        icon TEXT NOT NULL,
        accent_color TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        product_code TEXT UNIQUE NOT NULL,
        name_fa TEXT NOT NULL,
        name_en TEXT NOT NULL,
        category TEXT NOT NULL,
        sub_category_fa TEXT NOT NULL,
        slot_code TEXT NOT NULL,
        indication_fa TEXT NOT NULL,
        ingredients_fa TEXT NOT NULL,
        price INTEGER NOT NULL,
        slot_id INTEGER UNIQUE NOT NULL,
        stock INTEGER NOT NULL,
        max_capacity INTEGER NOT NULL DEFAULT 30,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_sensitive INTEGER NOT NULL DEFAULT 0,
        image_key TEXT NOT NULL,
        cross_sell_id INTEGER,
        cross_sell_title_fa TEXT,
        cross_sell_reason_fa TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trx_code TEXT UNIQUE NOT NULL,
        product_id INTEGER,
        slot_id INTEGER,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL, -- CREATED, SELECTED, WAITING_PAYMENT, DISPENSED, FAILED, REFUND_PENDING, CLOSED
        payment_method TEXT,
        module TEXT NOT NULL DEFAULT 'TRX', -- TRX, PAY, DSP
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        old_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        changed_by TEXT NOT NULL,
        hash_signature TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_errors (
        code TEXT PRIMARY KEY,
        title_fa TEXT NOT NULL,
        severity TEXT NOT NULL, -- High, Medium, Low
        is_active INTEGER NOT NULL DEFAULT 0,
        description_fa TEXT NOT NULL,
        last_triggered_at TEXT,
        resolved_at TEXT
      );
    `);
  }

  _seedData() {
    // 4 Main symptom categories matching "سر و درد", "قفسه سینه", "معده و گوارش", "پوست و زخم"
    const categories = [
      { id: 'head', name_fa: 'سر و درد', name_en: 'Head & Brain', icon: 'head', accent_color: '#0ea5e9' },
      { id: 'chest', name_fa: 'قفسه سینه', name_en: 'Chest & Lungs', icon: 'lungs', accent_color: '#10b981' },
      { id: 'stomach', name_fa: 'معده و گوارش', name_en: 'Stomach & Gut', icon: 'stomach', accent_color: '#f59e0b' },
      { id: 'skin', name_fa: 'پوست و زخم', name_en: 'Skin & Care', icon: 'skin', accent_color: '#8b5cf6' }
    ];

    const insCat = this.db.prepare('INSERT INTO categories VALUES (?, ?, ?, ?, ?)');
    for (const c of categories) {
      insCat.run(c.id, c.name_fa, c.name_en, c.icon, c.accent_color);
    }

    // 16 Medical & Health Products across 16 Physical Slots (A1..F2) - Exactly matching extracted photos
    const products = [
      // A1 (Slot 1)
      {
        id: 1,
        product_code: 'PX-1042',
        name_fa: 'استامینوفن ۵۰۰',
        name_en: 'Acetaminophen 500mg',
        category: 'head',
        sub_category_fa: 'مسکن و تب بر',
        slot_code: 'A1',
        indication_fa: 'تسکین سردرد، تب و دردهای خفیف تا متوسط',
        ingredients_fa: 'استامینوفن ۵۰۰ میلی‌گرم، نشاسته ذرت، منیزیم استئارات',
        price: 48000,
        slot_id: 1,
        stock: 18,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1042',
        cross_sell_id: 13,
        cross_sell_title_fa: 'ویتامین C جوشان',
        cross_sell_reason_fa: 'افزایش جذب و تسریع روند بهبود'
      },
      // A2 (Slot 2)
      {
        id: 2,
        product_code: 'PX-1051',
        name_fa: 'ژلوفن ۴۰۰',
        name_en: 'Gelofen 400mg',
        category: 'head',
        sub_category_fa: 'مسکن و تب بر',
        slot_code: 'A2',
        indication_fa: 'تسکین دردهای قاعدگی، دندان‌درد، میگرن و التهاب',
        ingredients_fa: 'ایبوپروفن ۴۰۰ میلی‌گرم، ژلاتین دارویی، گلیسیرین',
        price: 96000,
        slot_id: 2,
        stock: 3,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1051',
        cross_sell_id: 9,
        cross_sell_title_fa: 'محافظ معده',
        cross_sell_reason_fa: 'پیشگیری از تحریک اسید معده'
      },
      // B1 (Slot 3)
      {
        id: 3,
        product_code: 'PX-1107',
        name_fa: 'آدالت کلد',
        name_en: 'Adult Cold',
        category: 'chest',
        sub_category_fa: 'سرماخوردگی',
        slot_code: 'B1',
        indication_fa: 'کاهش آبریزش، گرفتگی بینی و بدن‌درد',
        ingredients_fa: 'استامینوفن ۳۲۵mg، فنیل‌افرین ۵mg، کلرفنیرامین ۲mg',
        price: 72000,
        slot_id: 3,
        stock: 11,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1107',
        cross_sell_id: 5,
        cross_sell_title_fa: 'قرص مکیدنی گلو',
        cross_sell_reason_fa: 'نرمی حنجره و تسکین سوزش گلو'
      },
      // B2 (Slot 4)
      {
        id: 4,
        product_code: 'PX-1120',
        name_fa: 'شربت دیفن‌هیدرامین',
        name_en: 'Diphenhydramine Syrup',
        category: 'chest',
        sub_category_fa: 'سرماخوردگی',
        slot_code: 'B2',
        indication_fa: 'بهبود سرفه‌های خشک، حساسیت تنفسی و آلرژی فصلی',
        ingredients_fa: 'دیفن‌هیدرامین هیدروکلراید ۱۲.۵mg در ۵ml',
        price: 54000,
        slot_id: 4,
        stock: 0, // Empty / red in slots map
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1120',
        cross_sell_id: 13,
        cross_sell_title_fa: 'ویتامین C جوشان',
        cross_sell_reason_fa: 'تقویت سیستم ایمنی بدن'
      },
      // B3 (Slot 5)
      {
        id: 5,
        product_code: 'PX-1131',
        name_fa: 'قرص مکیدنی گلو',
        name_en: 'Throat Lozenges',
        category: 'chest',
        sub_category_fa: 'سرماخوردگی',
        slot_code: 'B3',
        indication_fa: 'عسل و لیمو برای تسکین گلودرد و خشکی گلو',
        ingredients_fa: 'اسانس لیمو و عسل، منتول، اسید سیتریک، ویتامین C',
        price: 39000,
        slot_id: 5,
        stock: 22,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1131',
        cross_sell_id: 3,
        cross_sell_title_fa: 'آدالت کلد',
        cross_sell_reason_fa: 'درمان کامل علائم سرماخوردگی'
      },
      // C1 (Slot 6)
      {
        id: 6,
        product_code: 'PX-1203',
        name_fa: 'آنتی‌اسید جویدنی',
        name_en: 'Chewable Antacid',
        category: 'stomach',
        sub_category_fa: 'گوارشی',
        slot_code: 'C1',
        indication_fa: 'رفع سریع ترش کردن و سوزش سر دل',
        ingredients_fa: 'هیدروکسید آلومینیوم ۲۰۰mg، هیدروکسید منیزیم ۲۰۰mg',
        price: 42000,
        slot_id: 6,
        stock: 14,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1203',
        cross_sell_id: 9,
        cross_sell_title_fa: 'محافظ معده',
        cross_sell_reason_fa: 'کنترل پایدار اسید معده'
      },
      // C2 (Slot 7)
      {
        id: 7,
        product_code: 'PX-1215',
        name_fa: 'پودر ORS',
        name_en: 'Oral Rehydration Salts',
        category: 'stomach',
        sub_category_fa: 'گوارشی',
        slot_code: 'C2',
        indication_fa: 'جبران آب و املاح بدن در اسهال و گرمازدگی',
        ingredients_fa: 'سدیم کلراید ۲.۶g، گلوکز بی‌آب ۱۳.۵g، پتاسیم کلراید ۱.۵g',
        price: 18000,
        slot_id: 7,
        stock: 4, // Limited stock
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1215',
        cross_sell_id: 6,
        cross_sell_title_fa: 'آنتی‌اسید جویدنی',
        cross_sell_reason_fa: 'تسکین مشکلات گوارشی'
      },
      // C3 (Slot 8)
      {
        id: 8,
        product_code: 'PX-1220',
        name_fa: 'ملین گیاهی',
        name_en: 'Herbal Laxative',
        category: 'stomach',
        sub_category_fa: 'گوارشی',
        slot_code: 'C3',
        indication_fa: 'بهبود یبوست، تسهیل گوارش و حرکات دودی روده',
        ingredients_fa: 'عصاره سنا، اسانس رازیانه، گل محمدی',
        price: 25000,
        slot_id: 8,
        stock: 9,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1220',
        cross_sell_id: 7,
        cross_sell_title_fa: 'پودر ORS',
        cross_sell_reason_fa: 'حفظ تعادل هیدراتاسیون بدن'
      },
      // C4 (Slot 9)
      {
        id: 9,
        product_code: 'PX-1225',
        name_fa: 'محافظ معده',
        name_en: 'Gastro Shield',
        category: 'stomach',
        sub_category_fa: 'گوارشی',
        slot_code: 'C4',
        indication_fa: 'کاهش پایدار اسید معده و حفاظت مخاط',
        ingredients_fa: 'امپرازول ۲۰ میلی‌گرم پلت روده‌ای',
        price: 30000,
        slot_id: 9,
        stock: 10,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1225',
        cross_sell_id: 6,
        cross_sell_title_fa: 'آنتی‌اسید جویدنی',
        cross_sell_reason_fa: 'رفع فوری سوزش سر دل'
      },
      // D1 (Slot 10)
      {
        id: 10,
        product_code: 'PX-1330',
        name_fa: 'کرم هیدروکورتیزون ۱٪',
        name_en: 'Hydrocortisone 1% Cream',
        category: 'skin',
        sub_category_fa: 'پوست و زخم',
        slot_code: 'D1',
        indication_fa: 'ضد خارش قوی، رفع اگزمای پوستی و حساسیت',
        ingredients_fa: 'هیدروکورتیزون استات ۱ گرم در ۱۰۰ گرم پایه کرم',
        price: 42000,
        slot_id: 10,
        stock: 7,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1330',
        cross_sell_id: 11,
        cross_sell_title_fa: 'چسب زخم ضدآب',
        cross_sell_reason_fa: 'محافظت از ناحیه آسیب‌دیده'
      },
      // D2 (Slot 11)
      {
        id: 11,
        product_code: 'PX-1325',
        name_fa: 'چسب زخم ضدآب',
        name_en: 'Waterproof Bandages',
        category: 'skin',
        sub_category_fa: 'پوست و زخم',
        slot_code: 'D2',
        indication_fa: 'محافظت استریل از بریدگی‌ها و خراشیدگی',
        ingredients_fa: 'لایه پلی‌اورتان ضدآب، پد جاذب ضدچسبندگی',
        price: 35000,
        slot_id: 11,
        stock: 30,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1325',
        cross_sell_id: 10,
        cross_sell_title_fa: 'کرم هیدروکورتیزون',
        cross_sell_reason_fa: 'تسکین التهاب پوست'
      },
      // D3 (Slot 12)
      {
        id: 12,
        product_code: 'PX-1320',
        name_fa: 'ژل آلوئه‌ورا',
        name_en: 'Aloe Vera Gel',
        category: 'skin',
        sub_category_fa: 'پوست و زخم',
        slot_code: 'D3',
        indication_fa: 'آبرسان، التیام آفتاب‌سوختگی و بازسازی پوست',
        ingredients_fa: 'عصاره خالص ژل آلوئه‌ورا ۹۹٪، آلانتوئین، ویتامین E',
        price: 55000,
        slot_id: 12,
        stock: 0, // Empty / red in slots map
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-1320',
        cross_sell_id: 11,
        cross_sell_title_fa: 'چسب زخم ضدآب',
        cross_sell_reason_fa: 'پانسمان بهداشتی زخم'
      },
      // E1 (Slot 13)
      {
        id: 13,
        product_code: 'PX-2210',
        name_fa: 'ویتامین C جوشان',
        name_en: 'Vitamin C Effervescent',
        category: 'chest',
        sub_category_fa: 'ویتامین و مکمل',
        slot_code: 'E1',
        indication_fa: 'تقویت سیستم ایمنی و تسریع بهبودی بدن',
        ingredients_fa: 'اسید اسکوربیک ۱۰۰۰mg، زینک ۱۰mg، طعم پرتقالی طبیعی',
        price: 112000,
        slot_id: 13,
        stock: 16,
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-2210',
        cross_sell_id: 14,
        cross_sell_title_fa: 'ویتامین D3 ۱۰۰۰',
        cross_sell_reason_fa: 'ترکیب طلایی تقویت ایمنی و استخوان'
      },
      // E2 (Slot 14)
      {
        id: 14,
        product_code: 'PX-2218',
        name_fa: 'ویتامین D3 ۱۰۰۰',
        name_en: 'Vitamin D3 1000 IU',
        category: 'head',
        sub_category_fa: 'ویتامین و مکمل',
        slot_code: 'E2',
        indication_fa: 'سلامت استخوان و ایمنی، سافت‌ژل',
        ingredients_fa: 'کوله کلسیفرول ۱۰۰۰ IU، روغن زیتون حامل، ژلاتین پوشش',
        price: 138000,
        slot_id: 14,
        stock: 2, // Low stock
        max_capacity: 30,
        is_sensitive: 0,
        image_key: 'px-2218',
        cross_sell_id: 13,
        cross_sell_title_fa: 'ویتامین C جوشان',
        cross_sell_reason_fa: 'اغلب همراه این محصول خریداری می‌شود'
      },
      // F1 (Slot 15)
      {
        id: 15,
        product_code: 'PX-4401',
        name_fa: 'تست بارداری',
        name_en: 'Pregnancy Rapid Test',
        category: 'skin',
        sub_category_fa: 'بهداشت شخصی',
        slot_code: 'F1',
        indication_fa: 'تشخیص سریع خانگی hCG با دقت ۹۹.۸٪',
        ingredients_fa: 'نوار تشخیصی آنتی‌بادی منوکلونال، پد جاذب استریل',
        price: 45000,
        slot_id: 15,
        stock: 12,
        max_capacity: 30,
        is_sensitive: 1, // Sensitive product for privacy mode
        image_key: 'px-4401',
        cross_sell_id: 16,
        cross_sell_title_fa: 'کاندوم کلاسیک',
        cross_sell_reason_fa: 'مراقبت بهداشتی پیشرفته'
      },
      // F2 (Slot 16)
      {
        id: 16,
        product_code: 'PX-4410',
        name_fa: 'کاندوم کلاسیک',
        name_en: 'Classic Condom',
        category: 'skin',
        sub_category_fa: 'بهداشت شخصی',
        slot_code: 'F2',
        indication_fa: 'لاتکس طبیعی با لوبریکانت سیلیکونی و مخزن',
        ingredients_fa: 'لاتکس ۱۰۰٪ طبیعی، لوبریکانت سیلیکونی پزشکی',
        price: 65000,
        slot_id: 16,
        stock: 5, // Limited stock
        max_capacity: 30,
        is_sensitive: 1, // Sensitive product for privacy mode
        image_key: 'px-4410',
        cross_sell_id: 15,
        cross_sell_title_fa: 'تست بارداری',
        cross_sell_reason_fa: 'محصولات بهداشت خانواده'
      }
    ];

    const insProd = this.db.prepare(`
      INSERT INTO products (
        id, product_code, name_fa, name_en, category, sub_category_fa, slot_code,
        indication_fa, ingredients_fa, price, slot_id, stock, max_capacity,
        is_active, is_sensitive, image_key, cross_sell_id, cross_sell_title_fa, cross_sell_reason_fa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of products) {
      insProd.run(
        p.id, p.product_code, p.name_fa, p.name_en, p.category, p.sub_category_fa, p.slot_code,
        p.indication_fa, p.ingredients_fa, p.price, p.slot_id, p.stock, p.max_capacity,
        p.is_active || 1, p.is_sensitive || 0, p.image_key, p.cross_sell_id, p.cross_sell_title_fa, p.cross_sell_reason_fa
      );
    }

    // 10 Standard System Error Codes (E001 - E010)
    const errors = [
      { code: 'E001', title_fa: 'خطای خط ارتباط سریال با میکروکنترلر', severity: 'High', description_fa: 'عدم دریافت پاسخ PING یا CRC نامعتبر از برد ATmega' },
      { code: 'E002', title_fa: 'خطای سنسور مادون قرمز سقوط کالا (Drop Sensor)', severity: 'High', description_fa: 'پرتو مادون قرمز سقوط کالا در موعد مقرر قطع نشد (کالا گیر کرده)' },
      { code: 'E003', title_fa: 'اضافه بار مکانیکی / گیرپاژ موتور اسپیرال', severity: 'High', description_fa: 'جریان مصرفی درایور موتور فراتر از حد مجاز ۱.۵ آمپر رفت' },
      { code: 'E004', title_fa: 'سنسور دمای یخچال و زنجیره سرمایش', severity: 'Medium', description_fa: 'دمای محفظه خارج از بازه استاندارد ۲ تا ۸ درجه سانتی‌گراد است' },
      { code: 'E005', title_fa: 'خطای ارتباطی پوز بانکی شاپرک (POS)', severity: 'High', description_fa: 'پاسخ تاییدیه تراکنش از درگاه پرداخت بانکی دریافت نشد' },
      { code: 'E006', title_fa: 'خطای میکرو سوئیچ درب فیزیکی تحویل کالا', severity: 'Medium', description_fa: 'درب خروجی کالا پس از تحویل توسط مشتری به صورت کامل بسته نشد' },
      { code: 'E007', title_fa: 'اتمام رول کاغذ چاپگر رسید حرارتی', severity: 'Low', description_fa: 'سنسور پایان کاغذ فعال شد؛ فاکتور دیجیتال QR همچنان فعال است' },
      { code: 'E008', title_fa: 'قطع ارتباط شبکه ابری و سامانه مرکزی', severity: 'Medium', description_fa: 'عدم ارسال بسته همگام‌سازی به سرور مرکزی در بازه مجاز ۵ دقیقه' },
      { code: 'E009', title_fa: 'اتمام موجودی فیزیکی اسلات تعریف شده', severity: 'Low', description_fa: 'موجودی انبار اسلات به صفر رسید و از فهرست سفارش خارج شد' },
      { code: 'E010', title_fa: 'نوسان ولتاژ ورودی منبع تغذیه دستگاه', severity: 'High', description_fa: 'ولتاژ ورودی منبع تغذیه ۱۲ ولت به زیر ۱۰.۵ ولت کاهش یافت' }
    ];

    const insErr = this.db.prepare('INSERT INTO system_errors VALUES (?, ?, ?, 0, ?, NULL, NULL)');
    for (const e of errors) {
      insErr.run(e.code, e.title_fa, e.severity, e.description_fa);
    }

    // Seed realistic initial transactions matching image copy 10.png
    const sampleTrx = [
      { code: 'TX-88213', prod: 1, slot: 1, amt: 48000, status: 'DISPENSED', pay: 'کارت', module: 'DSP', err: null, time: '14:32' },
      { code: 'TX-88212', prod: 13, slot: 13, amt: 224000, status: 'DISPENSED', pay: 'QR', module: 'DSP', err: null, time: '14:05' },
      { code: 'TX-88211', prod: 4, slot: 4, amt: 54000, status: 'REFUND_PENDING', pay: 'کارت', module: 'PAY', err: 'E002', time: '13:48' },
      { code: 'TX-88210', prod: 11, slot: 11, amt: 35000, status: 'DISPENSED', pay: 'کارت', module: 'DSP', err: null, time: '13:20' },
      { code: 'TX-88209', prod: 2, slot: 2, amt: 96000, status: 'DISPENSED', pay: 'کارت', module: 'DSP', err: null, time: '12:59' },
      { code: 'TX-88208', prod: 7, slot: 7, amt: 36000, status: 'FAILED', pay: 'QR', module: 'DSP', err: 'E002', time: '12:41' },
      { code: 'TX-88207', prod: 3, slot: 3, amt: 72000, status: 'DISPENSED', pay: 'کارت', module: 'DSP', err: null, time: '11:17' },
      { code: 'TX-88206', prod: 5, slot: 5, amt: 78000, status: 'DISPENSED', pay: 'کارت', module: 'DSP', err: null, time: '10:02' },
      { code: 'TX-88205', prod: 6, slot: 6, amt: 42000, status: 'FAILED', pay: 'QR', module: 'TRX', err: 'USER_CANCELLED', time: '09:34' }
    ];

    const insTrx = this.db.prepare(`
      INSERT INTO transactions (
        trx_code, product_id, slot_id, amount, status, payment_method, module, error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of sampleTrx) {
      const today = new Date().toISOString().split('T')[0];
      const isoTime = `${today}T${t.time}:00.000Z`;
      insTrx.run(t.code, t.prod, t.slot, t.amt, t.status, t.pay, t.module, t.err, isoTime, isoTime);
    }
  }

  _setupMemoryFallback() {
    this.memoryStore = {
      categories: [
        { id: 'head', name_fa: 'سر و درد', name_en: 'Head & Brain', icon: 'head', accent_color: '#0ea5e9' },
        { id: 'chest', name_fa: 'قفسه سینه', name_en: 'Chest & Lungs', icon: 'lungs', accent_color: '#10b981' },
        { id: 'stomach', name_fa: 'معده و گوارش', name_en: 'Stomach & Gut', icon: 'stomach', accent_color: '#f59e0b' },
        { id: 'skin', name_fa: 'پوست و زخم', name_en: 'Skin & Care', icon: 'skin', accent_color: '#8b5cf6' }
      ],
      products: [],
      transactions: [],
      auditLogs: [],
      systemErrors: []
    };
  }

  // --- Products & Categories API ---

  getCategories() {
    if (this.db) {
      return this.db.prepare('SELECT * FROM categories').all();
    }
    return this.memoryStore.categories;
  }

  getProducts(category = 'all') {
    if (this.db) {
      if (category && category !== 'all') {
        return this.db.prepare('SELECT * FROM products WHERE category = ? ORDER BY slot_id ASC').all(category);
      }
      return this.db.prepare('SELECT * FROM products ORDER BY slot_id ASC').all();
    }
    return this.memoryStore.products;
  }

  // Alias for backward compatibility
  getMedicines(category = 'all') {
    return this.getProducts(category);
  }

  getProductById(id) {
    if (this.db) {
      return this.db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    }
    return this.memoryStore.products.find(p => p.id === id);
  }

  getProductBySlot(slotId) {
    if (this.db) {
      return this.db.prepare('SELECT * FROM products WHERE slot_id = ?').get(slotId);
    }
    return this.memoryStore.products.find(p => p.slot_id === slotId);
  }

  // --- Transactions API ---

  createTransaction(arg1, arg2, arg3, arg4 = 'POS') {
    let trxCode, productId, slotId, amount, paymentMethod;
    if (typeof arg1 === 'string' && arg1.startsWith('TRX')) {
      trxCode = arg1;
      productId = arg2;
      slotId = arg3;
      amount = arg4;
      paymentMethod = 'POS';
    } else {
      productId = arg1;
      slotId = arg2;
      amount = arg3;
      paymentMethod = arg4 || 'POS';
      trxCode = 'TRX-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
    }
    const now = new Date().toISOString();
    if (this.db) {
      this.db.prepare(`
        INSERT INTO transactions (trx_code, product_id, slot_id, amount, status, payment_method, module, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'SELECTED', ?, 'TRX', ?, ?)
      `).run(trxCode, productId, slotId, amount, paymentMethod, now, now);
      return this.getTransaction(trxCode);
    }
    const item = {
      id: this.memoryStore.transactions.length + 1,
      trx_code: trxCode,
      product_id: productId,
      slot_id: slotId,
      amount,
      status: 'SELECTED',
      payment_method: paymentMethod,
      module: 'TRX',
      error_code: null,
      created_at: now,
      updated_at: now
    };
    this.memoryStore.transactions.unshift(item);
    return item;
  }

  updateTransactionStatus(trxCode, status, opt = {}, err = null) {
    let moduleName = 'TRX';
    let errorCode = null;
    let paymentMethod = null;

    if (typeof opt === 'string') {
      moduleName = opt;
      errorCode = err;
    } else if (opt && typeof opt === 'object') {
      moduleName = opt.module || 'TRX';
      errorCode = opt.errorCode || null;
      paymentMethod = opt.paymentMethod || null;
    }

    const now = new Date().toISOString();
    if (this.db) {
      if (paymentMethod) {
        this.db.prepare(`
          UPDATE transactions
          SET status = ?, module = ?, error_code = COALESCE(?, error_code), payment_method = ?, updated_at = ?
          WHERE trx_code = ?
        `).run(status, moduleName, errorCode, paymentMethod, now, trxCode);
      } else {
        this.db.prepare(`
          UPDATE transactions
          SET status = ?, module = ?, error_code = COALESCE(?, error_code), updated_at = ?
          WHERE trx_code = ?
        `).run(status, moduleName, errorCode, now, trxCode);
      }
      return this.getTransaction(trxCode);
    }
    const t = this.memoryStore.transactions.find(x => x.trx_code === trxCode);
    if (t) {
      t.status = status;
      t.module = moduleName;
      if (errorCode) t.error_code = errorCode;
      if (paymentMethod) t.payment_method = paymentMethod;
      t.updated_at = now;
    }
    return t;
  }

  getTransaction(trxCode) {
    if (this.db) {
      return this.db.prepare('SELECT * FROM transactions WHERE trx_code = ?').get(trxCode);
    }
    return this.memoryStore.transactions.find(x => x.trx_code === trxCode);
  }

  getTransactions(filters = {}) {
    if (this.db) {
      let query = 'SELECT * FROM transactions';
      const params = [];
      const conditions = [];

      if (filters.status && filters.status !== 'ALL') {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters.module && filters.module !== 'ALL') {
        conditions.push('module = ?');
        params.push(filters.module);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY id DESC LIMIT 100';
      return this.db.prepare(query).all(...params);
    }
    return this.memoryStore.transactions;
  }

  // --- Inventory & Audit Trail API ---

  adjustStock(slotId, delta, changedBy = 'operator') {
    return this.updateStock(slotId, delta, changedBy);
  }

  decrementStock(slotId) {
    const res = this.updateStock(slotId, -1, 'dispense_engine');
    return res ? res.newStock : null;
  }

  updateStock(slotId, delta, changedBy = 'operator') {
    const product = this.getProductBySlot(slotId);
    if (!product) return null;

    const oldStock = product.stock;
    const newStock = Math.max(0, oldStock + delta);
    const now = new Date().toISOString();

    // Compute cryptographic SHA-256 hash
    const prevHash = this._getLatestAuditHash();
    const dataToHash = `${slotId}:${product.id}:${oldStock}:${newStock}:${delta}:${changedBy}:${now}:${prevHash}`;
    const hashSignature = crypto.createHash('sha256').update(dataToHash).digest('hex');

    if (this.db) {
      this.db.prepare('UPDATE products SET stock = ? WHERE slot_id = ?').run(newStock, slotId);
      this.db.prepare(`
        INSERT INTO inventory_audit_logs (slot_id, product_id, old_stock, new_stock, delta, changed_by, hash_signature, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(slotId, product.id, oldStock, newStock, delta, changedBy, hashSignature, now);
    } else {
      product.stock = newStock;
      this.memoryStore.auditLogs.unshift({
        id: this.memoryStore.auditLogs.length + 1,
        slot_id: slotId,
        product_id: product.id,
        old_stock: oldStock,
        new_stock: newStock,
        delta,
        changed_by: changedBy,
        hash_signature: hashSignature,
        created_at: now
      });
    }

    return { slotId, productId: product.id, oldStock, newStock, delta, hashSignature };
  }

  _getLatestAuditHash() {
    if (this.db) {
      const row = this.db.prepare('SELECT hash_signature FROM inventory_audit_logs ORDER BY id DESC LIMIT 1').get();
      return row ? row.hash_signature : '0000000000000000000000000000000000000000000000000000000000000000';
    }
    return (this.memoryStore.auditLogs[0] && this.memoryStore.auditLogs[0].hash_signature) || '0000000000000000000000000000000000000000000000000000000000000000';
  }

  getInventoryAuditLogs(limit = 50) {
    if (this.db) {
      return this.db.prepare(`
        SELECT l.*, p.name_fa AS product_name_fa, p.name_en AS product_name_en, p.product_code
        FROM inventory_audit_logs l
        LEFT JOIN products p ON l.product_id = p.id
        ORDER BY l.id DESC
        LIMIT ?
      `).all(limit);
    }
    return this.memoryStore.auditLogs.slice(0, limit);
  }

  // --- System Errors API ---

  getSystemErrors() {
    if (this.db) {
      return this.db.prepare('SELECT * FROM system_errors ORDER BY code ASC').all();
    }
    return this.memoryStore.systemErrors;
  }

  triggerSystemError(code) {
    return this.setSystemErrorActive(code, true);
  }

  resolveSystemError(code) {
    return this.setSystemErrorActive(code, false);
  }

  setSystemErrorActive(code, isActive) {
    const now = new Date().toISOString();
    if (this.db) {
      if (isActive) {
        this.db.prepare('UPDATE system_errors SET is_active = 1, last_triggered_at = ? WHERE code = ?').run(now, code);
      } else {
        this.db.prepare('UPDATE system_errors SET is_active = 0, resolved_at = ? WHERE code = ?').run(now, code);
      }
      return this.getSystemErrors();
    }
    const err = this.memoryStore.systemErrors.find(e => e.code === code);
    if (err) {
      err.is_active = isActive ? 1 : 0;
      if (isActive) err.last_triggered_at = now;
      else err.resolved_at = now;
    }
    return this.memoryStore.systemErrors;
  }
}

const db = new PharmacyDatabase();

module.exports = {
  db,
  PharmacyDatabase
};
