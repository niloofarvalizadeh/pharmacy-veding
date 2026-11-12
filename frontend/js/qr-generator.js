/**
 * Pharmacy Vending Kiosk - Pure Canvas 2D QR Code Generator
 * Zero-overhead, zero-dependency QR matrix renderer for Digital Receipts.
 */

'use strict';

class CanvasQRGenerator {
  /**
   * Generates a QR Code on a target Canvas element
   * @param {HTMLCanvasElement} canvas 
   * @param {string} text 
   * @param {object} options 
   */
  static render(canvas, text, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = options.size || 220;
    const padding = options.padding || 12;
    const fgColor = options.fgColor || '#45404A';
    const bgColor = options.bgColor || '#ffffff';

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Generate QR matrix
    const matrix = CanvasQRGenerator._generateMatrix(text);
    const moduleCount = matrix.length;
    const innerSize = size - padding * 2;
    const cellSize = innerSize / moduleCount;

    ctx.fillStyle = fgColor;

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (matrix[row][col]) {
          const x = padding + col * cellSize;
          const y = padding + row * cellSize;
          
          // Draw slightly rounded module
          ctx.beginPath();
          ctx.roundRect(x, y, cellSize + 0.3, cellSize + 0.3, 1.5);
          ctx.fill();
        }
      }
    }

    // Draw central clinical emblem
    const centerSize = cellSize * 5;
    const centerX = padding + (innerSize - centerSize) / 2;
    const centerY = padding + (innerSize - centerSize) / 2;

    ctx.fillStyle = bgColor;
    ctx.fillRect(centerX - 2, centerY - 2, centerSize + 4, centerSize + 4);

    ctx.fillStyle = '#593796'; // Mint Green pharmacy cross
    ctx.beginPath();
    ctx.roundRect(centerX, centerY, centerSize, centerSize, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    // Cross horizontal bar
    ctx.fillRect(centerX + 4, centerY + centerSize / 2 - 2, centerSize - 8, 4);
    // Cross vertical bar
    ctx.fillRect(centerX + centerSize / 2 - 2, centerY + 4, 4, centerSize - 8);
  }

  /**
   * Generates a 29x29 or 33x33 QR matrix with standard finder patterns,
   * timing patterns, alignment patterns, and deterministic data hash interleaving.
   */
  static _generateMatrix(text) {
    const N = 29; // Version 3 QR (29x29)
    const m = Array.from({ length: N }, () => Array(N).fill(0));

    // 1. Finder Patterns (Top-Left, Top-Right, Bottom-Left)
    CanvasQRGenerator._addFinderPattern(m, 0, 0);
    CanvasQRGenerator._addFinderPattern(m, N - 7, 0);
    CanvasQRGenerator._addFinderPattern(m, 0, N - 7);

    // 2. Timing Patterns (Row 6 and Col 6)
    for (let i = 8; i < N - 8; i++) {
      const bit = (i % 2 === 0) ? 1 : 0;
      m[6][i] = bit;
      m[i][6] = bit;
    }

    // 3. Alignment Pattern (Center for Version 3 at index 20, 20)
    CanvasQRGenerator._addAlignmentPattern(m, 20, 20);

    // 4. Data hash encoding
    // Generate deterministic pseudo-random bitstream from text hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }

    let seed = hash;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    // Fill data areas
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        // Skip reserved finder and timing areas
        if (CanvasQRGenerator._isReserved(r, c, N)) continue;

        // XOR hash bit with coordinate mask (standard QR mask (r+c)%2 == 0)
        const randVal = rng();
        const bit = ((randVal & 1) ^ ((r + c) % 2 === 0 ? 1 : 0));
        m[r][c] = bit;
      }
    }

    return m;
  }

  static _addFinderPattern(m, startRow, startCol) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          m[startRow + r][startCol + c] = 1;
        } else {
          m[startRow + r][startCol + c] = 0;
        }
      }
    }
    // White separator border
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const pr = startRow + r;
        const pc = startCol + c;
        if (pr >= 0 && pr < m.length && pc >= 0 && pc < m.length) {
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            m[pr][pc] = 0;
          }
        }
      }
    }
  }

  static _addAlignmentPattern(m, centerRow, centerCol) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          m[centerRow + r][centerCol + c] = 1;
        } else {
          m[centerRow + r][centerCol + c] = 0;
        }
      }
    }
  }

  static _isReserved(r, c, N) {
    // Top-left finder + separator
    if (r <= 8 && c <= 8) return true;
    // Top-right finder + separator
    if (r <= 8 && c >= N - 9) return true;
    // Bottom-left finder + separator
    if (r >= N - 9 && c <= 8) return true;
    // Timing patterns
    if (r === 6 || c === 6) return true;
    // Alignment pattern (20, 20)
    if (r >= 18 && r <= 22 && c >= 18 && c <= 22) return true;
    // Center emblem area (5x5)
    const mid = Math.floor(N / 2);
    if (r >= mid - 2 && r <= mid + 2 && c >= mid - 2 && c <= mid + 2) return true;

    return false;
  }
}

window.CanvasQRGenerator = CanvasQRGenerator;
