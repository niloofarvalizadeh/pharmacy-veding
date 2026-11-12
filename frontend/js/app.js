/**
 * Main Application Bootstrapper & WebSocket Event Broker
 * 21.5" Vertical Kiosk (1080x1920) Full HD
 */

'use strict';

class KioskSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('⚡ Connected to Kiosk Backend WebSocket');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket closed. Reconnecting in 2 seconds...');
      if (window.store) {
        window.store.hardwareConnected = false;
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE': {
        const { categories, medicines, hardware, recentLogs } = msg.data;
        if (window.store) {
          window.store.categories = categories || [];
          window.store.medicines = medicines || [];
          window.store.hardwareConnected = hardware.connected;
          window.store.hardwareIsMock = hardware.isMock;
          window.store.hardwarePort = hardware.port;
          window.store.hardwareOutputs = hardware.outputs || [0,0,0,0,0,0,0,0];
          window.store.lastPingLatency = hardware.lastPingLatencyMs;
        }
        if (recentLogs && window.Admin && window.Admin.appendLog) {
          recentLogs.forEach(l => window.Admin.appendLog(l));
        }
        break;
      }

      case 'HARDWARE_STATUS': {
        if (window.store) {
          window.store.hardwareConnected = msg.data.connected;
          window.store.hardwareIsMock = msg.data.isMock;
          window.store.hardwarePort = msg.data.port;
          window.store.hardwareOutputs = msg.data.outputs;
        }
        break;
      }

      case 'HARDWARE_STAGE': {
        if (window.store) {
          window.store.hardwareCurrentStage = msg.data;
        }
        const stageEl = document.getElementById('hardwareStageText');
        if (stageEl) {
          stageEl.textContent = `Stage ${msg.data.stage}/5: ${msg.data.stageName} (SEQ=${msg.data.seq})`;
        }
        break;
      }

      case 'HARDWARE_LOG': {
        if (window.Admin && window.Admin.appendLog) {
          window.Admin.appendLog(msg.data);
        }
        break;
      }

      case 'DISPENSE_COMPLETE': {
        console.log('✅ Dispense Complete event received from ATmega:', msg.data);
        // Update stock in local store
        if (window.store && window.store.medicines) {
          const meds = [...window.store.medicines];
          const target = meds.find(m => m.slot_id === msg.data.slotId);
          if (target) {
            target.stock = msg.data.remainingStock;
            window.store.medicines = meds;
          }
        }

        // Show Shutter opening animation for 1.8 seconds, then show Complete screen!
        window.cartHelpers.navigateTo('shutter');
        setTimeout(() => {
          window.cartHelpers.navigateTo('complete');
        }, 1800);
        break;
      }

      case 'DISPENSE_FAILED': {
        console.error('❌ Dispense failed:', msg.data);
        window.cartHelpers.navigateTo('pos_error');
        break;
      }

      case 'ADMIN_PING_RESULT': {
        if (window.store) {
          window.store.lastPingLatency = msg.data.latency;
        }
        break;
      }

      case 'ADMIN_OUTPUT_CHANGED': {
        if (window.store) {
          window.store.hardwareOutputs = msg.data.outputs;
        }
        break;
      }

      case 'STOCK_RESTOCKED': {
        if (window.store) {
          window.store.medicines = msg.data.medicines;
        }
        break;
      }
    }
  }
}

// Boot application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Booting 21.5" Portrait Pharmacy Vending Kiosk (1080x1920)');

  // 1. WebSocket Client
  window.socketClient = new KioskSocketClient();

  // 2. Admin Manager
  window.Admin = new AdminManager();

  // 3. Master UI Controller
  window.KioskUI = new KioskUIController();

  // 4. Initial store sync
  window.cartHelpers.navigateTo('idle');
});
