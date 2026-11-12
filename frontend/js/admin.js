/**
 * Operator Admin Console & Direct Hardware Diagnostic Modal
 * Triggered by 5 rapid clicks on the center status pill.
 */

'use strict';

class AdminManager {
  constructor() {
    this.adminModal = document.getElementById('adminModal');
    this.triggerBtn = document.getElementById('kioskStatusPill');
    this.clickCount = 0;
    this.clickTimer = null;

    this.logConsole = document.getElementById('adminLogConsole');
    this.pingResult = document.getElementById('adminPingResult');
    this.portName = document.getElementById('adminPortName');
    this.relaysContainer = document.getElementById('adminRelaysContainer');
    this.slotsContainer = document.getElementById('adminSlotsContainer');

    this._bindTrigger();
    this._bindActions();
    this._subscribeToStore();
    this._renderRelayToggles();
    this._renderSlotButtons();
  }

  _bindTrigger() {
    if (!this.triggerBtn) return;

    this.triggerBtn.addEventListener('click', () => {
      this.clickCount++;
      if (this.clickTimer) clearTimeout(this.clickTimer);

      this.clickTimer = setTimeout(() => {
        this.clickCount = 0;
      }, 2000);

      if (this.clickCount >= 5) {
        this.clickCount = 0;
        clearTimeout(this.clickTimer);
        this.open();
      }
    });

    const closeBtn = document.getElementById('closeAdminBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (this.adminModal) {
      this.adminModal.addEventListener('click', (e) => {
        if (e.target === this.adminModal) this.close();
      });
    }
  }

  _bindActions() {
    const pingBtn = document.getElementById('btnAdminPing');
    if (pingBtn) {
      pingBtn.addEventListener('click', () => {
        this.pingResult.textContent = '... Pinging ...';
        if (window.socketClient) {
          window.socketClient.send({ type: 'ADMIN_PING' });
        }
      });
    }

    const stopBtn = document.getElementById('btnAdminStop');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        if (window.socketClient) {
          window.socketClient.send({ type: 'ADMIN_STOP' });
        }
      });
    }

    const clearLogsBtn = document.getElementById('btnClearLogs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        if (this.logConsole) this.logConsole.innerHTML = '';
      });
    }

    const restockBtn = document.getElementById('btnAdminRestock');
    if (restockBtn) {
      restockBtn.addEventListener('click', () => {
        if (window.socketClient) {
          window.socketClient.send({ type: 'ADMIN_RESET_STOCK' });
        }
      });
    }
  }

  _subscribeToStore() {
    if (!window.storeSubscribe) return;

    window.storeSubscribe('hardwareOutputs', (outputs) => {
      this._updateRelayStates(outputs);
    });

    window.storeSubscribe('lastPingLatency', (lat) => {
      if (this.pingResult && lat !== null) {
        this.pingResult.textContent = `${lat} ms`;
      }
    });

    window.storeSubscribe('hardwarePort', (port) => {
      if (this.portName) {
        this.portName.textContent = port;
      }
    });
  }

  _renderRelayToggles() {
    if (!this.relaysContainer) return;
    let html = '';
    for (let i = 1; i <= 8; i++) {
      html += `
        <div class="relay-card" id="relayCard${i}">
          <div class="relay-title">Relay #${i}</div>
          <button type="button" class="btn-relay-toggle" data-output="${i}">
            <span class="relay-status">OFF</span>
          </button>
        </div>
      `;
    }
    this.relaysContainer.innerHTML = html;

    const btns = this.relaysContainer.querySelectorAll('.btn-relay-toggle');
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        const outId = parseInt(b.dataset.output, 10);
        const currentState = b.classList.contains('active');
        const newState = !currentState;

        if (window.socketClient) {
          window.socketClient.send({
            type: 'ADMIN_SET_OUTPUT',
            outputId: outId,
            state: newState
          });
        }
      });
    });
  }

  _updateRelayStates(outputs) {
    if (!outputs || !this.relaysContainer) return;
    for (let i = 1; i <= 8; i++) {
      const state = outputs[i - 1];
      const card = document.getElementById(`relayCard${i}`);
      if (card) {
        const btn = card.querySelector('.btn-relay-toggle');
        const statusSpan = card.querySelector('.relay-status');
        if (btn) {
          btn.classList.toggle('active', !!state);
          statusSpan.textContent = state ? 'ON' : 'OFF';
        }
      }
    }
  }

  _renderSlotButtons() {
    if (!this.slotsContainer) return;
    let html = '';
    for (let s = 1; s <= 18; s++) {
      html += `
        <button type="button" class="btn-test-slot" data-slot="${s}">
          <span>Slot #${s.toString().padStart(2, '0')}</span>
          <span class="slot-run-badge">RUN 0x06</span>
        </button>
      `;
    }
    this.slotsContainer.innerHTML = html;

    const sBtns = this.slotsContainer.querySelectorAll('.btn-test-slot');
    sBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const slot = parseInt(b.dataset.slot, 10);
        b.classList.add('loading');
        if (window.socketClient) {
          window.socketClient.send({
            type: 'ADMIN_TEST_DISPENSE',
            slotId: slot
          });
        }
        setTimeout(() => b.classList.remove('loading'), 1600);
      });
    });
  }

  appendLog(log) {
    if (!this.logConsole) return;
    const item = document.createElement('div');
    item.className = `log-line line-${log.direction ? log.direction.toLowerCase() : 'sys'}`;

    const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
    const dir = log.direction || 'SYS';
    const hex = log.hex || '';
    const desc = log.typeName ? `${log.typeName} (${log.cmdName || ''}) SEQ=${log.seq}` : '';

    item.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-dir">[${dir}]</span>
      <span class="log-hex">${hex}</span>
      <span class="log-desc">${desc}</span>
    `;

    this.logConsole.appendChild(item);

    while (this.logConsole.children.length > 200) {
      this.logConsole.removeChild(this.logConsole.firstChild);
    }

    this.logConsole.scrollTop = this.logConsole.scrollHeight;
  }

  open() {
    if (this.adminModal) {
      this.adminModal.classList.add('open');
    }
    if (window.store) {
      window.store.adminModalOpen = true;
    }
  }

  close() {
    if (this.adminModal) {
      this.adminModal.classList.remove('open');
    }
    if (window.store) {
      window.store.adminModalOpen = false;
    }
  }
}

window.AdminManager = AdminManager;
