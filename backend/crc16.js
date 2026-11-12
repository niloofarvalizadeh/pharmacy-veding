/**
 * CRC-16/CCITT-FALSE Implementation
 * Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 * Initial Value: 0xFFFF
 * RefIn: false, RefOut: false
 * XorOut: 0x0000
 *
 * Test Vector:
 * Input (hex): AA 01 04 00 64 02 07 01
 * Expected CRC: 0xEC9E (High: 0xEC, Low: 0x9E)
 */

'use strict';

const CRC_POLYNOMIAL = 0x1021;
const CRC_INITIAL = 0xFFFF;

// Precompute CRC-16 lookup table for maximum performance (Zero-Overhead)
const CRC_TABLE = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let curr = (i << 8) & 0xFFFF;
  for (let j = 0; j < 8; j++) {
    if ((curr & 0x8000) !== 0) {
      curr = ((curr << 1) ^ CRC_POLYNOMIAL) & 0xFFFF;
    } else {
      curr = (curr << 1) & 0xFFFF;
    }
  }
  CRC_TABLE[i] = curr;
}

/**
 * Calculates CRC-16/CCITT-FALSE over a Buffer or Uint8Array
 * @param {Buffer|Uint8Array} buffer 
 * @param {number} [offset=0]
 * @param {number} [length]
 * @returns {number} 16-bit unsigned integer (0x0000 - 0xFFFF)
 */
function computeCRC16(buffer, offset = 0, length = null) {
  const len = length !== null ? length : (buffer.length - offset);
  let crc = CRC_INITIAL;
  
  for (let i = 0; i < len; i++) {
    const byte = buffer[offset + i];
    const tableIndex = ((crc >> 8) ^ byte) & 0xFF;
    crc = ((crc << 8) ^ CRC_TABLE[tableIndex]) & 0xFFFF;
  }
  
  return crc;
}

/**
 * Verifies that the CRC16 stored at the end of a buffer matches the computed CRC16
 * @param {Buffer} buffer Complete frame including the 2-byte CRC at the end
 * @returns {boolean} True if CRC is valid
 */
function verifyCRC16(buffer) {
  if (!buffer || buffer.length < 2) return false;
  const payloadLen = buffer.length - 2;
  const computed = computeCRC16(buffer, 0, payloadLen);
  const received = buffer.readUInt16BE(payloadLen);
  return computed === received;
}

module.exports = {
  computeCRC16,
  verifyCRC16,
  CRC_POLYNOMIAL,
  CRC_INITIAL
};
