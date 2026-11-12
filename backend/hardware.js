/**
 * Hardware Controller for ATmega Vending Board
 * Implements the full 5-stage serial protocol lifecycle, retries, auto-mock fallback,
 * and real-time transaction event emission.
 */

'use strict';

const EventEmitter = require('node:events');
const { PROTOCOL, TYPE_NAMES, CMD_NAMES, buildFrame, StreamParser } = require('./protocol');
const { MockAtmega } = require('./mock-atmega');

let SerialPort = null;
try {
  SerialPort = require('serialport').SerialPort;
} catch {
  // Graceful fallback if native serialport is not present
}

class HardwareManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.portPath = options.port || process.env.SERIAL_PORT || '/dev/ttyUSB0';
    this.baudRate = options.baudRate || 115200;
    this.ackTimeoutMs = options.ackTimeoutMs || 600; // Timeout waiting for COMMAND_RECEIVED
    this.maxRetries = options.maxRetries || 3;        // Max 3 retries
    this.executionTimeoutMs = options.executionTimeoutMs || 8000; // Timeout waiting for DONE

    this.port = null;
    this.mock = null;
    this.isMock = false;
    this.isConnected = false;

    this.parser = new StreamParser();
    this.parser.on('frame', (frame) => this._onFrameReceived(frame));
    this.parser.on('crc_error', (err) => {
      this.emit('log', { level: 'error', text: `CRC Error detected!`, detail: err });
    });

    // Sequence Number Generator (1 to 65535)
    this._currentSeq = 0;

    // Transaction Queue & Active Transaction
    this.queue = [];
    this.activeTx = null;

    // Last known hardware state cache
    this.statusCache = {
      isMock: false,
      portName: this.portPath,
      connected: false,
      outputs: new Array(8).fill(0),
      lastPingLatencyMs: null,
      temperatureC: 24.0,
      busVoltageV: 12.0
    };
  }

  /**
   * Allocate next sequence number
   */
  _nextSeq() {
    this._currentSeq = (this._currentSeq + 1) & 0xFFFF;
    if (this._currentSeq === 0) this._currentSeq = 1;
    return this._currentSeq;
  }

  /**
   * Initialize Serial Connection with auto-detection and Mock fallback
   */
  async init() {
    this.emit('log', { level: 'info', text: `Initializing Hardware Controller on ${this.portPath}...` });

    if (SerialPort) {
      try {
        const opened = await this._tryOpenSerial();
        if (opened) {
          this.isConnected = true;
          this.isMock = false;
          this.statusCache.connected = true;
          this.statusCache.isMock = false;
          this.emit('connection', { connected: true, isMock: false, port: this.portPath });
          this.emit('log', { level: 'success', text: `Physical serial port connected: ${this.portPath} @ ${this.baudRate} baud` });
          return;
        }
      } catch (err) {
        this.emit('log', { level: 'warn', text: `Could not open physical port ${this.portPath}: ${err.message}` });
      }
    }

    // Fallback to High-Fidelity Mock ATmega Simulator
    this._startMock();
  }

  /**
   * Attempt to open physical serial port
   */
  _tryOpenSerial() {
    return new Promise((resolve) => {
      const port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        autoOpen: false
      });

      port.open((err) => {
        if (err) {
          return resolve(false);
        }

        this.port = port;
        port.on('data', (chunk) => {
          this.parser.push(chunk);
          this.emit('raw_rx_chunk', chunk);
        });

        port.on('error', (portErr) => {
          this.emit('log', { level: 'error', text: `SerialPort error: ${portErr.message}` });
          if (!this.isMock) {
            this._startMock();
          }
        });

        port.on('close', () => {
          this.emit('log', { level: 'warn', text: `Serial port ${this.portPath} closed.` });
          this.isConnected = false;
          this.statusCache.connected = false;
          this.emit('connection', { connected: false, isMock: this.isMock, port: this.portPath });
        });

        resolve(true);
      });
    });
  }

  /**
   * Start built-in ATmega Simulator
   */
  _startMock() {
    this.isMock = true;
    this.isConnected = true;
    this.statusCache.connected = true;
    this.statusCache.isMock = true;

    this.mock = new MockAtmega();
    this.mock.on('data', (chunk) => {
      this.parser.push(chunk);
      this.emit('raw_rx_chunk', chunk);
    });

    this.mock.on('log', (entry) => {
      this.emit('hardware_log', entry);
    });

    this.emit('connection', { connected: true, isMock: true, port: 'VIRTUAL_ATMEGA_MOCK' });
    this.emit('log', { level: 'info', text: 'Hardware Mock Simulator started successfully (Automatic Fallback Active).' });
  }

  /**
   * Send raw byte buffer to either physical serial port or mock MCU
   * @param {Buffer} buffer 
   */
  _writeRaw(buffer) {
    if (this.isMock && this.mock) {
      this.mock.write(buffer);
    } else if (this.port && this.port.isOpen) {
      this.port.write(buffer);
    } else {
      throw new Error('Hardware connection unavailable (Neither serial port nor mock is ready)');
    }

    this.emit('raw_tx', {
      timestamp: Date.now(),
      rawHex: buffer.toString('hex').toUpperCase(),
      length: buffer.length
    });
  }

  /**
   * Frame parser callback
   * @param {object} frame Parsed incoming frame
   */
  _onFrameReceived(frame) {
    this.emit('raw_rx', {
      timestamp: Date.now(),
      rawHex: frame.rawHex,
      type: frame.type,
      typeName: frame.typeName,
      cmd: frame.cmd,
      cmdName: frame.cmdName,
      seq: frame.seq,
      len: frame.len,
      data: Array.from(frame.data),
      crc: frame.crc
    });

    // Route to active transaction if SEQ matches
    if (this.activeTx && this.activeTx.seq === frame.seq) {
      this._handleActiveTxFrame(frame);
    } else {
      this.emit('log', {
        level: 'warn',
        text: `Received unhandled frame: ${frame.typeName} CMD=${frame.cmdName} SEQ=${frame.seq}`
      });
    }
  }

  /**
   * Core 5-Stage Transaction Executor
   * Executes a command through the full ATmega binary protocol lifecycle
   *
   * @param {number} cmd Protocol CMD code
   * @param {Buffer|Array<number>} [data] Payload bytes
   * @returns {Promise<object>} Resolves with final response on COMMAND_DONE
   */
  execute(cmd, data = null) {
    return new Promise((resolve, reject) => {
      const seq = this._nextSeq();
      const tx = {
        seq,
        cmd,
        cmdName: CMD_NAMES[cmd] || `CMD_0x${cmd.toString(16)}`,
        data: data ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : Buffer.alloc(0),
        retries: 0,
        startTime: Date.now(),
        stage: 1, // 1: SENDING_COMMAND
        timer: null,
        resolve,
        reject
      };

      this.queue.push(tx);
      this._processQueue();
    });
  }

  /**
   * Process pending transaction queue sequentially
   */
  _processQueue() {
    if (this.activeTx || this.queue.length === 0) {
      return;
    }

    this.activeTx = this.queue.shift();
    this._beginStage1(this.activeTx);
  }

  /**
   * Stage 1: Send COMMAND (0x01) with unique SEQ
   */
  _beginStage1(tx) {
    tx.stage = 1;
    this.emit('tx_stage', {
      stage: 1,
      stageName: 'SENDING_COMMAND',
      seq: tx.seq,
      cmd: tx.cmd,
      cmdName: tx.cmdName,
      attempt: tx.retries + 1
    });

    const frame = buildFrame(PROTOCOL.TYPE.COMMAND, tx.cmd, tx.seq, tx.data);
    try {
      this._writeRaw(frame);
    } catch (err) {
      return this._finishTx(new Error(`Failed to transmit frame: ${err.message}`));
    }

    // Set timeout for Stage 2: Waiting for COMMAND_RECEIVED (0x02)
    tx.timer = setTimeout(() => {
      this._handleAckTimeout(tx);
    }, this.ackTimeoutMs);
  }

  /**
   * Handle ACK timeout (Stage 2 retry logic, up to 3 retries)
   */
  _handleAckTimeout(tx) {
    if (tx.retries < this.maxRetries) {
      tx.retries++;
      this.emit('log', {
        level: 'warn',
        text: `[Hardware] ACK timeout for SEQ=${tx.seq} CMD=${tx.cmdName}. Retrying (${tx.retries}/${this.maxRetries})...`
      });
      this._beginStage1(tx);
    } else {
      this.emit('log', {
        level: 'error',
        text: `[Hardware] Transaction failed: No COMMAND_RECEIVED response after ${this.maxRetries} retries (SEQ=${tx.seq}).`
      });
      this._finishTx(new Error(`ATmega ACK timeout after ${this.maxRetries} retries for SEQ=${tx.seq}`));
    }
  }

  /**
   * Process frame received for active transaction
   */
  _handleActiveTxFrame(frame) {
    const tx = this.activeTx;
    if (!tx) return;

    // Stage 2: Received COMMAND_RECEIVED (0x02)
    if (frame.type === PROTOCOL.TYPE.COMMAND_RECEIVED && tx.stage === 1) {
      if (tx.timer) clearTimeout(tx.timer);

      tx.stage = 3; // Stage 3: WAITING_FOR_EXECUTION
      this.emit('tx_stage', {
        stage: 2,
        stageName: 'COMMAND_RECEIVED',
        seq: tx.seq,
        cmd: tx.cmd,
        cmdName: tx.cmdName,
        latencyMs: Date.now() - tx.startTime
      });

      // Set timeout for MCU execution completion
      tx.timer = setTimeout(() => {
        this._finishTx(new Error(`Execution timeout: ATmega did not return DONE/ERROR within ${this.executionTimeoutMs}ms for SEQ=${tx.seq}`));
      }, this.executionTimeoutMs);

      return;
    }

    // Stage 4: Received COMMAND_DONE (0x03) or COMMAND_ERROR (0x04)
    if (frame.type === PROTOCOL.TYPE.COMMAND_DONE || frame.type === PROTOCOL.TYPE.COMMAND_ERROR) {
      if (tx.timer) clearTimeout(tx.timer);

      const isSuccess = frame.type === PROTOCOL.TYPE.COMMAND_DONE;
      tx.stage = 4;

      this.emit('tx_stage', {
        stage: 4,
        stageName: isSuccess ? 'COMMAND_DONE' : 'COMMAND_ERROR',
        seq: tx.seq,
        cmd: tx.cmd,
        cmdName: tx.cmdName,
        success: isSuccess,
        data: Array.from(frame.data),
        durationMs: Date.now() - tx.startTime
      });

      // Stage 5: Send immediate DATA_RECEIVED (0x05) frame with the SAME SEQ to MCU
      try {
        const ackFrame = buildFrame(PROTOCOL.TYPE.DATA_RECEIVED, tx.cmd, tx.seq);
        this._writeRaw(ackFrame);

        this.emit('tx_stage', {
          stage: 5,
          stageName: 'DATA_RECEIVED_SENT',
          seq: tx.seq,
          cmd: tx.cmd,
          cmdName: tx.cmdName
        });
      } catch (sendErr) {
        this.emit('log', { level: 'error', text: `Failed to send DATA_RECEIVED ack: ${sendErr.message}` });
      }

      // Conclude transaction
      if (isSuccess) {
        this._finishTx(null, {
          seq: tx.seq,
          cmd: tx.cmd,
          cmdName: tx.cmdName,
          data: frame.data,
          durationMs: Date.now() - tx.startTime
        });
      } else {
        const errorCode = frame.data && frame.data.length > 0 ? frame.data[0] : 0xFF;
        this._finishTx(new Error(`ATmega command execution returned error code 0x${errorCode.toString(16)} for SEQ=${tx.seq}`));
      }
    }
  }

  /**
   * Finalize active transaction, resolve/reject promise, process next queued item
   */
  _finishTx(error, result = null) {
    const tx = this.activeTx;
    if (!tx) return;

    if (tx.timer) {
      clearTimeout(tx.timer);
      tx.timer = null;
    }

    this.activeTx = null;

    if (error) {
      tx.reject(error);
    } else {
      tx.resolve(result);
    }

    // Process next queued command
    setImmediate(() => this._processQueue());
  }

  // --- High-Level Convenience API Methods ---

  /**
   * Ping the microcontroller
   * @returns {Promise<number>} Round-trip latency in ms
   */
  async ping() {
    const t0 = Date.now();
    const res = await this.execute(PROTOCOL.CMD.PING);
    const latency = Date.now() - t0;
    this.statusCache.lastPingLatencyMs = latency;
    return { latency, seq: res.seq };
  }

  /**
   * Query status
   */
  async getStatus() {
    const res = await this.execute(PROTOCOL.CMD.GET_STATUS);
    return res;
  }

  /**
   * Query sensor states
   */
  async getSensors() {
    const res = await this.execute(PROTOCOL.CMD.GET_SENSORS);
    return res;
  }

  /**
   * Set hardware output (Relay 1 to 8)
   * @param {number} outputId 1 to 8
   * @param {boolean|number} state true/1 = ON, false/0 = OFF
   */
  async setOutput(outputId, state) {
    const id = Number(outputId);
    const val = state ? 1 : 0;
    const res = await this.execute(PROTOCOL.CMD.SET_OUTPUT, [id, val]);
    if (id >= 1 && id <= 8) {
      this.statusCache.outputs[id - 1] = val;
    }
    return res;
  }

  /**
   * Dispense medication from physical slot
   * @param {number} slotId Physical slot number (1 - 24)
   * @param {number} [count=1] Number of items to drop
   */
  async dispense(slotId, count = 1) {
    const res = await this.execute(PROTOCOL.CMD.DISPENSE, [slotId, count]);
    return res;
  }

  /**
   * Emergency Stop
   */
  async stop() {
    return await this.execute(PROTOCOL.CMD.STOP);
  }

  /**
   * Turn all outputs and motors OFF
   */
  async allOff() {
    const res = await this.execute(PROTOCOL.CMD.ALL_OFF);
    this.statusCache.outputs.fill(0);
    return res;
  }
}

module.exports = {
  HardwareManager
};
