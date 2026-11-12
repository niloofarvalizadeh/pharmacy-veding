/**
 * ATmega Microcontroller Hardware Simulator (Mock Mode)
 * Emulates the embedded firmware behavior of the vending machine controller board.
 * Allows full hardware testing and demo execution without physical serial cables.
 */

'use strict';

const EventEmitter = require('node:events');
const { PROTOCOL, buildFrame, StreamParser } = require('./protocol');

class MockAtmega extends EventEmitter {
  constructor() {
    super();
    this.parser = new StreamParser();
    this.parser.on('frame', (frame) => this._handleIncomingFrame(frame));

    // Internal simulated hardware state
    this.outputs = new Uint8Array(8); // 8 Relay outputs (0 = OFF, 1 = ON)
    this.sensors = {
      dropSensorActive: false,
      doorClosed: true,
      trayReady: true,
      temperatureC: 24.5,
      busVoltageV: 12.1
    };

    this.activeMotorTimer = null;
    this.waitingForAckSeq = null;

    // Simulated latency settings (ms)
    this.ackLatencyMs = 20;
    this.dispenseDurationMs = 1200; // Time for coil motor to rotate 360 deg
  }

  /**
   * Feed bytes from PC into Mock ATmega
   * @param {Buffer} chunk 
   */
  write(chunk) {
    this.parser.push(chunk);
  }

  /**
   * Send bytes back to PC
   * @param {Buffer} buffer 
   */
  _sendToHost(buffer) {
    this.emit('data', buffer);
  }

  /**
   * Process a parsed protocol frame received from the Host PC
   * @param {object} frame 
   */
  _handleIncomingFrame(frame) {
    // Stage 5 acknowledgment from Host PC
    if (frame.type === PROTOCOL.TYPE.DATA_RECEIVED) {
      if (this.waitingForAckSeq === frame.seq) {
        this.emit('log', {
          role: 'MCU',
          text: `[MCU] Handshake complete: Host confirmed DATA_RECEIVED for SEQ=${frame.seq}`
        });
        this.waitingForAckSeq = null;
      }
      return;
    }

    // Only process COMMAND frames from Host PC
    if (frame.type !== PROTOCOL.TYPE.COMMAND) {
      return;
    }

    const { cmd, seq, data } = frame;

    // Stage 2: Immediately send COMMAND_RECEIVED (0x02) ACK within 20ms
    setTimeout(() => {
      const ackFrame = buildFrame(PROTOCOL.TYPE.COMMAND_RECEIVED, cmd, seq);
      this._sendToHost(ackFrame);
      this.emit('log', {
        role: 'MCU',
        text: `[MCU] Sent COMMAND_RECEIVED (0x02) for CMD=0x${cmd.toString(16).padStart(2, '0')} SEQ=${seq}`
      });

      // Stage 3 & 4: Execute command and send COMMAND_DONE (0x03) or COMMAND_ERROR (0x04)
      this._executeCommand(cmd, seq, data);
    }, this.ackLatencyMs);
  }

  /**
   * Execute simulated hardware action
   */
  _executeCommand(cmd, seq, data) {
    switch (cmd) {
      case PROTOCOL.CMD.PING: {
        setTimeout(() => {
          this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from([0x01]));
        }, 15);
        break;
      }

      case PROTOCOL.CMD.GET_STATUS: {
        setTimeout(() => {
          // Status payload: [statusFlags, tempC, volt*10]
          const statusBuf = Buffer.from([
            0x00, // 0x00 = All Systems Normal
            Math.round(this.sensors.temperatureC),
            Math.round(this.sensors.busVoltageV * 10)
          ]);
          this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, statusBuf);
        }, 20);
        break;
      }

      case PROTOCOL.CMD.GET_SENSORS: {
        setTimeout(() => {
          const sBuf = Buffer.from([
            this.sensors.dropSensorActive ? 0x01 : 0x00,
            this.sensors.doorClosed ? 0x01 : 0x00,
            this.sensors.trayReady ? 0x01 : 0x00
          ]);
          this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, sBuf);
        }, 20);
        break;
      }

      case PROTOCOL.CMD.SET_OUTPUT: {
        setTimeout(() => {
          if (!data || data.length < 2) {
            this._finishCommand(PROTOCOL.TYPE.COMMAND_ERROR, cmd, seq, Buffer.from([0x01])); // Err: Invalid params
            return;
          }
          const outputId = data[0]; // 1-8
          const state = data[1] ? 1 : 0;
          if (outputId >= 1 && outputId <= 8) {
            this.outputs[outputId - 1] = state;
            this.emit('log', {
              role: 'MCU',
              text: `[MCU] Output #${outputId} set to ${state ? 'ON' : 'OFF'}`
            });
            this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from([outputId, state]));
          } else {
            this._finishCommand(PROTOCOL.TYPE.COMMAND_ERROR, cmd, seq, Buffer.from([0x02])); // Err: Output out of range
          }
        }, 30);
        break;
      }

      case PROTOCOL.CMD.GET_OUTPUTS: {
        setTimeout(() => {
          this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from(this.outputs));
        }, 20);
        break;
      }

      case PROTOCOL.CMD.DISPENSE: {
        const slotId = data && data.length > 0 ? data[0] : 1;
        const count = data && data.length > 1 ? data[1] : 1;

        this.emit('log', {
          role: 'MCU',
          text: `[MCU] Motor starting for Slot #${slotId} (Count: ${count}). Rotating spiral coil...`
        });

        // Test error injection: Slot 99 simulates spiral jam
        if (slotId === 99) {
          setTimeout(() => {
            this.emit('log', {
              role: 'MCU',
              text: `[MCU] Motor stall/jam detected on Slot #${slotId}! Dispense failed.`
            });
            this._finishCommand(PROTOCOL.TYPE.COMMAND_ERROR, cmd, seq, Buffer.from([slotId, 0xEE])); // 0xEE = Jammed
          }, 800);
          return;
        }

        // Simulate mechanical rotation duration
        this.activeMotorTimer = setTimeout(() => {
          // Infrared drop sensor trips as medication falls through chute
          this.sensors.dropSensorActive = true;
          this.emit('log', {
            role: 'MCU',
            text: `[MCU] IR Drop Sensor tripped! Medication fell into delivery tray from Slot #${slotId}.`
          });

          // Reset IR drop sensor after 200ms
          setTimeout(() => {
            this.sensors.dropSensorActive = false;
          }, 200);

          // Send COMMAND_DONE (0x03) with [slotId, 0x00 (SUCCESS)]
          this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from([slotId, 0x00]));
        }, this.dispenseDurationMs);
        break;
      }

      case PROTOCOL.CMD.STOP: {
        if (this.activeMotorTimer) {
          clearTimeout(this.activeMotorTimer);
          this.activeMotorTimer = null;
        }
        this.emit('log', { role: 'MCU', text: '[MCU] Emergency STOP executed. Motors halted.' });
        this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from([0x00]));
        break;
      }

      case PROTOCOL.CMD.ALL_OFF: {
        this.outputs.fill(0);
        if (this.activeMotorTimer) {
          clearTimeout(this.activeMotorTimer);
          this.activeMotorTimer = null;
        }
        this.emit('log', { role: 'MCU', text: '[MCU] ALL_OFF executed. All outputs and motors powered down.' });
        this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, Buffer.from([0x00]));
        break;
      }

      case PROTOCOL.CMD.GET_RTC: {
        const nowSec = Math.floor(Date.now() / 1000);
        const rtcBuf = Buffer.alloc(4);
        rtcBuf.writeUInt32BE(nowSec, 0);
        this._finishCommand(PROTOCOL.TYPE.COMMAND_DONE, cmd, seq, rtcBuf);
        break;
      }

      default: {
        this._finishCommand(PROTOCOL.TYPE.COMMAND_ERROR, cmd, seq, Buffer.from([0xFF])); // Unknown command
        break;
      }
    }
  }

  /**
   * Finalize command execution with DONE or ERROR frame and prepare for Host ACK
   */
  _finishCommand(type, cmd, seq, payload) {
    this.waitingForAckSeq = seq;
    const frame = buildFrame(type, cmd, seq, payload);
    this._sendToHost(frame);
    this.emit('log', {
      role: 'MCU',
      text: `[MCU] Sent ${type === PROTOCOL.TYPE.COMMAND_DONE ? 'COMMAND_DONE (0x03)' : 'COMMAND_ERROR (0x04)'} for CMD=0x${cmd.toString(16).padStart(2, '0')} SEQ=${seq}`
    });
  }
}

module.exports = {
  MockAtmega
};
