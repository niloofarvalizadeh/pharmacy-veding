/**
 * Pharmacy Vending Kiosk - Main Backend Server
 * High Performance, Pure Zero-Overhead HTTP & WebSocket Server (Node.js Native + ws)
 * Supports: 6-Screen Customer Flow, Full Transaction Lifecycle,
 *           4-Tab Admin Dashboard, Real-Time Hardware & Cloud Sync.
 */

'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocketServer, WebSocket } = require('ws');

const { db } = require('./database');
const { HardwareManager } = require('./hardware');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');

// MIME types for pure node:http file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Initialize Database & Hardware
db.init();
const hardware = new HardwareManager({
  port: process.env.SERIAL_PORT || '/dev/ttyUSB0',
  baudRate: parseInt(process.env.BAUD_RATE, 10) || 115200
});

// System version metadata
const SYSTEM_VERSIONS = {
  appVersion: 'v2.4.1-core',
  mcuFirmware: 'v1.8.0',
  buildDate: '2026-11-09',
  architecture: 'x86_64-linux (Intel Core i5-5200U)'
};

// Cloud MQTT Gateway Connection State (Simulated resilient connection)
const cloudState = {
  connected: true,
  brokerUrl: 'mqtts://cloud.smart-pharmacy-vending.internal:8883',
  clientId: 'KIOSK-TEH-0021-IR',
  lastSyncAt: new Date().toISOString(),
  pendingLogsCount: 0,
  tlsSecured: true
};

// Ring buffer for the most recent 100 raw hardware frames (for Admin Monitor)
const recentLogs = [];
function addHardwareLog(log) {
  recentLogs.push(log);
  if (recentLogs.length > 100) recentLogs.shift();
}

/**
 * Pure HTTP Server
 */
const server = http.createServer((req, res) => {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;

  // REST API Endpoints
  if (pathname === '/api/products' || pathname === '/api/medicines') {
    const category = url.searchParams.get('category') || 'all';
    const products = db.getProducts(category);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: products.length, products, medicines: products }));
    return;
  }

  if (pathname === '/api/categories') {
    const categories = db.getCategories();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, categories }));
    return;
  }

  if (pathname === '/api/transactions') {
    const status = url.searchParams.get('status') || 'ALL';
    const moduleName = url.searchParams.get('module') || 'ALL';
    const transactions = db.getTransactions({ status, module: moduleName });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: transactions.length, transactions }));
    return;
  }

  if (pathname === '/api/inventory-logs') {
    const logs = db.getInventoryAuditLogs(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: logs.length, logs }));
    return;
  }

  if (pathname === '/api/system-errors') {
    const errors = db.getSystemErrors();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, errors }));
    return;
  }

  if (pathname === '/api/status') {
    const status = {
      online: true,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      system: SYSTEM_VERSIONS,
      cloud: cloudState,
      hardware: {
        connected: hardware.isConnected,
        isMock: hardware.isMock,
        port: hardware.isMock ? 'ATMEGA_VIRTUAL_MOCK' : hardware.portPath,
        outputs: hardware.statusCache.outputs,
        lastPingLatencyMs: hardware.statusCache.lastPingLatencyMs
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  // Static File Serving
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(path.join(FRONTEND_DIR, pathname));
  if (!safePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

/**
 * WebSocket Server
 */
const wss = new WebSocketServer({ server });

/**
 * Broadcast message to all active WebSocket clients
 * @param {object} message 
 */
function broadcast(message) {
  const json = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// Hardware Event Listeners -> Bridge to WebSocket clients
hardware.on('connection', (conn) => {
  broadcast({
    type: 'HARDWARE_STATUS',
    data: {
      connected: conn.connected,
      isMock: conn.isMock,
      port: conn.port,
      outputs: hardware.statusCache.outputs
    }
  });
});

hardware.on('tx_stage', (stageInfo) => {
  broadcast({
    type: 'HARDWARE_STAGE',
    data: stageInfo
  });
});

hardware.on('raw_tx', (txData) => {
  const log = {
    timestamp: txData.timestamp,
    direction: 'TX',
    hex: txData.rawHex,
    length: txData.length
  };
  addHardwareLog(log);
  broadcast({ type: 'HARDWARE_LOG', data: log });
});

hardware.on('raw_rx', (rxData) => {
  const log = {
    timestamp: rxData.timestamp,
    direction: 'RX',
    hex: rxData.rawHex,
    typeName: rxData.typeName,
    cmdName: rxData.cmdName,
    seq: rxData.seq,
    len: rxData.len,
    data: rxData.data,
    crc: rxData.crc
  };
  addHardwareLog(log);
  broadcast({ type: 'HARDWARE_LOG', data: log });
});

hardware.on('hardware_log', (logEntry) => {
  broadcast({
    type: 'HARDWARE_INTERNAL_LOG',
    data: logEntry
  });
});

// Periodic Cloud Sync Simulator (updates timestamp every 60 seconds)
setInterval(() => {
  cloudState.lastSyncAt = new Date().toISOString();
  broadcast({
    type: 'CLOUD_STATUS',
    data: cloudState
  });
}, 60000);

// WebSocket Client Connection Handler
wss.on('connection', (ws) => {
  // Send Initial Snapshot
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    data: {
      categories: db.getCategories(),
      products: db.getProducts('all'),
      medicines: db.getProducts('all'),
      systemErrors: db.getSystemErrors(),
      transactions: db.getTransactions(),
      auditLogs: db.getInventoryAuditLogs(20),
      system: SYSTEM_VERSIONS,
      cloud: cloudState,
      hardware: {
        connected: hardware.isConnected,
        isMock: hardware.isMock,
        port: hardware.isMock ? 'ATMEGA_VIRTUAL_MOCK' : hardware.portPath,
        outputs: hardware.statusCache.outputs,
        lastPingLatencyMs: hardware.statusCache.lastPingLatencyMs
      },
      recentLogs
    }
  }));

  // Handle Incoming Client Messages
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed JSON' }));
    }

    switch (msg.type) {
      // ---------------------------------------------------------
      // CUSTOMER FLOW: TRANSACTIONS & DISPENSE
      // ---------------------------------------------------------

      // Screen 3: Register transaction in SELECTED state
      case 'CREATE_TRX':
      case 'CREATE_TRANSACTION': {
        const { productId, slotId, amount } = msg;
        const trx = db.createTransaction(productId, slotId, amount);
        ws.send(JSON.stringify({
          type: 'TRX_CREATED',
          data: trx
        }));
        broadcast({
          type: 'TRANSACTIONS_UPDATED',
          data: { transactions: db.getTransactions() }
        });
        break;
      }

      // Screen 4 & 5: Transition state (e.g. WAITING_PAYMENT, REFUND_PENDING, etc.)
      case 'UPDATE_TRX_STATUS': {
        const { trxCode, status, paymentMethod, errorCode, module: mod } = msg;
        const updated = db.updateTransactionStatus(trxCode, status, {
          paymentMethod,
          errorCode,
          module: mod
        });
        broadcast({
          type: 'TRX_UPDATED',
          data: updated
        });
        broadcast({
          type: 'TRANSACTIONS_UPDATED',
          data: { transactions: db.getTransactions() }
        });
        break;
      }

      // Screen 5: Hardware Dispense Request with Two-Phase Execution
      case 'DISPENSE_REQUEST': {
        const { trxCode, medicineId, slotId, simulateFailure } = msg;
        const prod = db.getProductById(medicineId) || db.getProductBySlot(slotId);

        if (!prod || prod.stock <= 0) {
          if (trxCode) {
            db.updateTransactionStatus(trxCode, 'FAILED', { errorCode: 'E005', module: 'DSP' });
          }
          ws.send(JSON.stringify({
            type: 'DISPENSE_FAILED',
            data: {
              trxCode,
              medicineId,
              slotId,
              reason: 'OUT_OF_STOCK',
              errorCode: 'E005',
              message_fa: 'متاسفانه موجودی این دارو به اتمام رسیده است.'
            }
          }));
          return;
        }

        // Phase 1: Motor Rotation
        broadcast({
          type: 'DISPENSE_STAGE',
          data: {
            trxCode,
            stage: 1,
            phase: 'MOTOR_ROTATION',
            message_fa: 'در حال آماده‌سازی و چرخش موتور اسپیرال...'
          }
        });

        // Forced simulated failure if requested (for testing auto-refund E001/E002/E003)
        if (simulateFailure) {
          setTimeout(() => {
            const errCode = simulateFailure === 'TIMEOUT' ? 'E003' : 'E002';
            db.triggerSystemError(errCode);
            if (trxCode) {
              db.updateTransactionStatus(trxCode, 'REFUND_PENDING', {
                errorCode: errCode,
                module: 'DSP'
              });
            }
            broadcast({
              type: 'DISPENSE_FAILED',
              data: {
                trxCode,
                medicineId,
                slotId,
                reason: errCode === 'E003' ? 'MOTOR_TIMEOUT' : 'DROP_SENSOR_FAILED',
                errorCode: errCode,
                refundPending: true,
                message_fa: 'متاسفانه کالا تحویل نشد؛ مبلغ پرداختی شما به صورت خودکار مسترد می‌گردد (Refund Pending)',
                supportPhone: '۰۲۱-۸۸۸۸۴۴۴۴'
              }
            });
            broadcast({
              type: 'SYSTEM_ERRORS_UPDATED',
              data: { errors: db.getSystemErrors() }
            });
            broadcast({
              type: 'TRANSACTIONS_UPDATED',
              data: { transactions: db.getTransactions() }
            });
          }, 2500);
          return;
        }

        try {
          // Delay briefly to allow UI to show Phase 1
          await new Promise(r => setTimeout(r, 1200));

          // Phase 2: Drop Sensor Verification
          broadcast({
            type: 'DISPENSE_STAGE',
            data: {
              trxCode,
              stage: 2,
              phase: 'DROP_SENSOR_CHECK',
              message_fa: 'بررسی سنسور سقوط کالا (Drop Sensor)...'
            }
          });

          // Run hardware motor command via ATmega protocol
          const result = await hardware.dispense(slotId, 1);

          // Decrement stock in database atomically & log SHA-256 audit
          const remainingStock = db.decrementStock(slotId, 1);

          // Update transaction to DISPENSED
          if (trxCode) {
            db.updateTransactionStatus(trxCode, 'DISPENSED', { module: 'DSP' });
          }

          broadcast({
            type: 'DISPENSE_COMPLETE',
            data: {
              trxCode,
              medicineId: prod.id,
              slotId,
              remainingStock,
              seq: result.seq,
              durationMs: result.durationMs,
              product_name_fa: prod.name_fa
            }
          });

          broadcast({
            type: 'STOCK_UPDATED',
            data: {
              slotId,
              productId: prod.id,
              newStock: remainingStock,
              products: db.getProducts('all')
            }
          });

          broadcast({
            type: 'AUDIT_LOG_ADDED',
            data: { logs: db.getInventoryAuditLogs(20) }
          });

          broadcast({
            type: 'TRANSACTIONS_UPDATED',
            data: { transactions: db.getTransactions() }
          });

        } catch (err) {
          // Hardware error -> Transition to REFUND_PENDING
          const errCode = err.message.includes('TIMEOUT') ? 'E003' : 'E001';
          db.triggerSystemError(errCode);

          if (trxCode) {
            db.updateTransactionStatus(trxCode, 'REFUND_PENDING', {
              errorCode: errCode,
              module: 'DSP'
            });
          }

          broadcast({
            type: 'DISPENSE_FAILED',
            data: {
              trxCode,
              medicineId: prod.id,
              slotId,
              reason: err.message,
              errorCode: errCode,
              refundPending: true,
              message_fa: 'متاسفانه کالا تحویل نشد؛ مبلغ پرداختی شما به صورت خودکار مسترد می‌گردد (Refund Pending)',
              supportPhone: '۰۲۱-۸۸۸۸۴۴۴۴'
            }
          });

          broadcast({
            type: 'SYSTEM_ERRORS_UPDATED',
            data: { errors: db.getSystemErrors() }
          });

          broadcast({
            type: 'TRANSACTIONS_UPDATED',
            data: { transactions: db.getTransactions() }
          });
        }
        break;
      }

      // ---------------------------------------------------------
      // ADMIN & OPERATOR ACTIONS
      // ---------------------------------------------------------

      // Tab 1: Adjust Inventory Stock (+ / -) with SHA-256 Audit Trail
      case 'ADMIN_ADJUST_STOCK': {
        const { slotId, delta, user } = msg;
        const res = db.adjustStock(slotId, delta, user || 'operator');
        if (res) {
          broadcast({
            type: 'STOCK_UPDATED',
            data: {
              slotId: res.slot_id,
              productId: res.product_id,
              newStock: res.new_stock,
              delta: res.delta,
              hash: res.hash,
              products: db.getProducts('all')
            }
          });
          broadcast({
            type: 'AUDIT_LOG_ADDED',
            data: { logs: db.getInventoryAuditLogs(20) }
          });
        }
        break;
      }

      // Tab 1: Toggle Slot Enabled / Disabled
      case 'ADMIN_TOGGLE_SLOT': {
        const { slotId, isActive } = msg;
        const updated = db.toggleSlotActive(slotId, isActive);
        broadcast({
          type: 'SLOT_UPDATED',
          data: {
            slotId,
            isActive: updated ? updated.is_active : (isActive ? 1 : 0),
            products: db.getProducts('all')
          }
        });
        break;
      }

      // Tab 2: Trigger System Error (E001 - E010)
      case 'ADMIN_TRIGGER_ERROR': {
        const { code } = msg;
        const errors = db.triggerSystemError(code);
        broadcast({
          type: 'SYSTEM_ERRORS_UPDATED',
          data: { errors }
        });
        break;
      }

      // Tab 2: Resolve / Acknowledge System Error
      case 'ADMIN_RESOLVE_ERROR': {
        const { code } = msg;
        const errors = db.resolveSystemError(code);
        broadcast({
          type: 'SYSTEM_ERRORS_UPDATED',
          data: { errors }
        });
        break;
      }

      // Tab 4: Simulate OTA Firmware / Software Check
      case 'ADMIN_CHECK_OTA': {
        // Return OTA status simulation
        ws.send(JSON.stringify({
          type: 'ADMIN_OTA_STATUS',
          data: {
            currentVersion: SYSTEM_VERSIONS.appVersion,
            mcuFirmware: SYSTEM_VERSIONS.mcuFirmware,
            latestVersion: SYSTEM_VERSIONS.appVersion,
            updateAvailable: false,
            channel: 'production-stable',
            lastCheck: new Date().toISOString(),
            status: 'UP_TO_DATE'
          }
        }));
        break;
      }

      // Tab 4: Test Speaker & Audio Prompt
      case 'ADMIN_TEST_AUDIO': {
        broadcast({
          type: 'AUDIO_PLAY_REQUEST',
          data: {
            sound: 'test_chime',
            text_fa: 'تست سیستم صوتی کیوسک داروخانه، بلندگوها فعال و شفاف هستند.'
          }
        });
        break;
      }

      // Admin Modal: PING ATmega
      case 'ADMIN_PING': {
        try {
          const res = await hardware.ping();
          ws.send(JSON.stringify({
            type: 'ADMIN_PING_RESULT',
            data: { success: true, latency: res.latency, seq: res.seq }
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'ADMIN_PING_RESULT',
            data: { success: false, error: err.message }
          }));
        }
        break;
      }

      // Admin Modal: SET_OUTPUT (Relay Toggle)
      case 'ADMIN_SET_OUTPUT': {
        const { outputId, state } = msg;
        try {
          await hardware.setOutput(outputId, state);
          broadcast({
            type: 'ADMIN_OUTPUT_CHANGED',
            data: { outputId, state, outputs: hardware.statusCache.outputs }
          });
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: `SET_OUTPUT failed: ${err.message}`
          }));
        }
        break;
      }

      // Admin Modal: Test Dispense Slot (Mechanical diagnostic without decrementing stock)
      case 'ADMIN_TEST_DISPENSE': {
        const { slotId } = msg;
        try {
          const res = await hardware.dispense(slotId, 1);
          ws.send(JSON.stringify({
            type: 'ADMIN_TEST_DISPENSE_RESULT',
            data: { success: true, slotId, seq: res.seq, durationMs: res.durationMs }
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'ADMIN_TEST_DISPENSE_RESULT',
            data: { success: false, slotId, error: err.message }
          }));
        }
        break;
      }

      // Admin Modal: Emergency Stop
      case 'ADMIN_STOP': {
        try {
          await hardware.stop();
          broadcast({ type: 'ADMIN_STOPPED' });
        } catch (err) {
          ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        }
        break;
      }

      // Admin Modal: Restock All Slots
      case 'ADMIN_RESET_STOCK': {
        const prods = db.restockAll(20);
        broadcast({
          type: 'STOCK_RESTOCKED',
          data: {
            products: prods,
            medicines: prods
          }
        });
        broadcast({
          type: 'AUDIT_LOG_ADDED',
          data: { logs: db.getInventoryAuditLogs(20) }
        });
        break;
      }

      // Admin Refresh Data
      case 'ADMIN_GET_DATA': {
        ws.send(JSON.stringify({
          type: 'ADMIN_DATA_REFRESH',
          data: {
            products: db.getProducts('all'),
            systemErrors: db.getSystemErrors(),
            transactions: db.getTransactions(),
            auditLogs: db.getInventoryAuditLogs(50),
            system: SYSTEM_VERSIONS,
            cloud: cloudState,
            hardware: {
              connected: hardware.isConnected,
              isMock: hardware.isMock,
              port: hardware.isMock ? 'ATMEGA_VIRTUAL_MOCK' : hardware.portPath,
              outputs: hardware.statusCache.outputs,
              lastPingLatencyMs: hardware.statusCache.lastPingLatencyMs
            }
          }
        }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'UNKNOWN_COMMAND' }));
        break;
    }
  });
});

// Start Server & Hardware
async function start(port = PORT, host = HOST) {
  await hardware.init();

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`====================================================`);
      console.log(`🚀 PHARMACY VENDING KIOSK BACKEND RUNNING`);
      console.log(`📡 URL: http://${host}:${port}`);
      console.log(`⚡ WebSocket: ws://${host}:${port}`);
      console.log(`🔌 Hardware Mode: ${hardware.isMock ? 'VIRTUAL ATMEGA SIMULATOR (Mock)' : `SERIAL (${hardware.portPath})`}`);
      console.log(`🖥️  Display Target: 21.5-inch Vertical (1080 x 1920 portrait)`);
      console.log(`🏎️  Target Engine: 60 FPS Zero-Overhead`);
      console.log(`====================================================`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}

module.exports = { server, hardware, db, start };
