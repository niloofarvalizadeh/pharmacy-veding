/**
 * Pharmacy Vending Kiosk - 360° Medicine Package 3D Canvas Inspector
 * Pure 2D Canvas rendering of a 3D medical package box with 60 FPS zero-overhead projection.
 * Enables customers to rotate the box 360 degrees to inspect active ingredients,
 * dosage guidelines, batch info, and physical slot attribution.
 */

'use strict';

class MedicineBox360Viewer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // 3D Box dimensions (half-dimensions)
    this.boxW = 105; // width
    this.boxH = 145; // height
    this.boxD = 55;  // depth

    // Angles in radians
    this.yaw = 0.35;
    this.pitch = 0.15;
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.autoRotate = true;
    this.animId = null;

    // Current product data
    this.product = null;

    // Offscreen face pre-renders (cached textures for maximum 60fps performance)
    this.faceCanvases = {
      front: document.createElement('canvas'),
      back: document.createElement('canvas'),
      left: document.createElement('canvas'),
      right: document.createElement('canvas'),
      top: document.createElement('canvas'),
      bottom: document.createElement('canvas')
    };

    this._setupCanvas();
    this._bindEvents();
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 420;
    const h = rect.height || 420;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = w;
    this.displayHeight = h;
  }

  setProduct(product) {
    this.product = product;
    this.yaw = 0.35;
    this.pitch = 0.15;
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.autoRotate = true;
    this._renderFaceTextures();
    this.start();
  }

  _renderFaceTextures() {
    if (!this.product) return;

    const p = this.product;
    const accentColor = p.category === 'head' ? '#D9A0C0' :
                        p.category === 'chest' ? '#593796' :
                        p.category === 'stomach' ? '#B4317F' : '#C277D6';

    // 1. FRONT FACE (Width x Height)
    const fc = this.faceCanvases.front;
    fc.width = this.boxW * 2;
    fc.height = this.boxH * 2;
    const fctx = fc.getContext('2d');
    fctx.fillStyle = '#2E2A33';
    fctx.fillRect(0, 0, fc.width, fc.height);

    // Accent header band
    fctx.fillStyle = accentColor;
    fctx.fillRect(0, 0, fc.width, 18);

    // Clinical brand mark
    fctx.fillStyle = '#ffffff';
    fctx.font = 'bold 15px Vazirmatn, Tahoma, sans-serif';
    fctx.textAlign = 'right';
    fctx.fillText('داروسازی سلامت', fc.width - 14, 42);

    // Product Code & Slot badge
    fctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    fctx.fillRect(14, 28, 70, 22);
    fctx.fillStyle = '#F1C5D8';
    fctx.font = '11px monospace';
    fctx.textAlign = 'center';
    fctx.fillText(p.product_code || 'PRD', 49, 43);

    // Product Name (Fa)
    fctx.fillStyle = '#F8F6FD';
    fctx.font = 'bold 16px Vazirmatn, Tahoma, sans-serif';
    fctx.textAlign = 'right';
    const shortName = p.name_fa.length > 20 ? p.name_fa.slice(0, 20) + '...' : p.name_fa;
    fctx.fillText(shortName, fc.width - 14, 80);

    // English Name & dosage
    fctx.fillStyle = '#8A8394';
    fctx.font = '11px sans-serif';
    fctx.textAlign = 'right';
    fctx.fillText(p.name_en || 'Pharmaceuticals', fc.width - 14, 102);

    // Central Pill / Capsule Graphic
    fctx.save();
    fctx.translate(fc.width / 2, 160);
    fctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    fctx.beginPath();
    fctx.arc(0, 0, 40, 0, Math.PI * 2);
    fctx.fill();

    // Stylized capsule
    fctx.fillStyle = accentColor;
    fctx.beginPath();
    fctx.roundRect(-22, -10, 22, 20, [10, 0, 0, 10]);
    fctx.fill();
    fctx.fillStyle = '#F8F6FD';
    fctx.beginPath();
    fctx.roundRect(0, -10, 22, 20, [0, 10, 10, 0]);
    fctx.fill();
    fctx.restore();

    // Indication bottom text
    fctx.fillStyle = '#D3CAE6';
    fctx.font = '10px Vazirmatn, Tahoma, sans-serif';
    fctx.textAlign = 'center';
    fctx.fillText('داروی مجاز OTC کیوسک هوشمند', fc.width / 2, 240);
    fctx.fillStyle = accentColor;
    fctx.fillText(`اسلات فیزیکی ${p.slot_id} | قیمت: ${p.price.toLocaleString('fa-IR')} ت`, fc.width / 2, 262);

    // Border
    fctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    fctx.lineWidth = 2;
    fctx.strokeRect(1, 1, fc.width - 2, fc.height - 2);

    // 2. BACK FACE (Width x Height - Ingredients & Drug Facts)
    const bc = this.faceCanvases.back;
    bc.width = this.boxW * 2;
    bc.height = this.boxH * 2;
    const bctx = bc.getContext('2d');
    bctx.fillStyle = '#2A262F';
    bctx.fillRect(0, 0, bc.width, bc.height);

    // Back Header
    bctx.fillStyle = '#F1C5D8';
    bctx.font = 'bold 13px Vazirmatn, Tahoma, sans-serif';
    bctx.textAlign = 'right';
    bctx.fillText('جدول ترکیبات و حقایق دارویی', bc.width - 14, 28);

    // Table line
    bctx.strokeStyle = 'rgba(241, 197, 216, 0.3)';
    bctx.beginPath();
    bctx.moveTo(14, 36);
    bctx.lineTo(bc.width - 14, 36);
    bctx.stroke();

    // Ingredients
    bctx.fillStyle = '#8A8394';
    bctx.font = '10px Vazirmatn, Tahoma, sans-serif';
    bctx.fillText('ترکیبات فعال و کمکی:', bc.width - 14, 56);

    bctx.fillStyle = '#F2EFFB';
    bctx.font = '9px Vazirmatn, Tahoma, sans-serif';
    const ingrLines = this._wrapText(bctx, p.ingredients_fa || 'ترکیب استاندارد دارویی', bc.width - 28);
    let curY = 74;
    for (const line of ingrLines.slice(0, 5)) {
      bctx.fillText(line, bc.width - 14, curY);
      curY += 16;
    }

    // Dosage & Storage Info
    bctx.fillStyle = '#D9A0C0';
    bctx.font = '10px Vazirmatn, Tahoma, sans-serif';
    bctx.fillText('شرایط نگهداری و مصرف:', bc.width - 14, 175);

    bctx.fillStyle = '#8A8394';
    bctx.font = '9px Vazirmatn, Tahoma, sans-serif';
    bctx.fillText('• دمای زیر ۲۵ درجه، دور از رطوبت و نور مستقیم', bc.width - 14, 195);
    bctx.fillText('• دور از دید و دسترس کودکان نگهداری شود', bc.width - 14, 213);
    bctx.fillText('• مصرف با یک لیوان آب کامل', bc.width - 14, 231);

    // Barcode Graphic
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(20, 250, 170, 26);
    bctx.fillStyle = '#000000';
    for (let x = 25; x < 185; x += 4) {
      if ((x % 3) !== 0) {
        bctx.fillRect(x, 252, (x % 5 === 0) ? 3 : 1.5, 22);
      }
    }

    bctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    bctx.lineWidth = 2;
    bctx.strokeRect(1, 1, bc.width - 2, bc.height - 2);

    // 3. SIDES (Depth x Height)
    ['left', 'right'].forEach(side => {
      const sc = this.faceCanvases[side];
      sc.width = this.boxD * 2;
      sc.height = this.boxH * 2;
      const sctx = sc.getContext('2d');
      sctx.fillStyle = '#2E2A33';
      sctx.fillRect(0, 0, sc.width, sc.height);

      sctx.fillStyle = accentColor;
      sctx.fillRect(0, 0, sc.width, 10);

      sctx.save();
      sctx.translate(sc.width / 2, sc.height / 2);
      sctx.rotate(-Math.PI / 2);
      sctx.fillStyle = '#6B6574';
      sctx.font = 'bold 11px sans-serif';
      sctx.textAlign = 'center';
      sctx.fillText(`${p.product_code || 'MED'} • SLOT ${p.slot_id}`, 0, 4);
      sctx.restore();

      sctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      sctx.lineWidth = 1.5;
      sctx.strokeRect(1, 1, sc.width - 2, sc.height - 2);
    });

    // 4. TOP & BOTTOM (Width x Depth)
    ['top', 'bottom'].forEach(side => {
      const tc = this.faceCanvases[side];
      tc.width = this.boxW * 2;
      tc.height = this.boxD * 2;
      const tctx = tc.getContext('2d');
      tctx.fillStyle = '#2E2A33';
      tctx.fillRect(0, 0, tc.width, tc.height);

      tctx.fillStyle = '#5A5462';
      tctx.font = '10px monospace';
      tctx.textAlign = 'center';
      tctx.fillText(side === 'top' ? 'EXP: 2028/08 • LOT: K890' : 'PHARMA KIOSK PACK', tc.width / 2, tc.height / 2 + 3);

      tctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      tctx.lineWidth = 1.5;
      tctx.strokeRect(1, 1, tc.width - 2, tc.height - 2);
    });
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  _bindEvents() {
    const startDrag = (x, y) => {
      this.isDragging = true;
      this.autoRotate = false;
      this.lastPointerX = x;
      this.lastPointerY = y;
      this.yawVelocity = 0;
      this.pitchVelocity = 0;
    };

    const moveDrag = (x, y) => {
      if (!this.isDragging) return;
      const dx = x - this.lastPointerX;
      const dy = y - this.lastPointerY;

      this.yaw += dx * 0.008;
      this.pitch += dy * 0.008;

      // Limit pitch to prevent box inversion
      this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch));

      this.yawVelocity = dx * 0.008;
      this.pitchVelocity = dy * 0.008;

      this.lastPointerX = x;
      this.lastPointerY = y;
    };

    const endDrag = () => {
      this.isDragging = false;
    };

    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    // Touch events for 21.5" touchscreen
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', endDrag);
  }

  start() {
    if (this.animId) cancelAnimationFrame(this.animId);

    const render = () => {
      this._updatePhysics();
      this._renderScene();
      this.animId = requestAnimationFrame(render);
    };

    this.animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  _updatePhysics() {
    if (this.autoRotate) {
      this.yaw += 0.009; // Slow attractive 360 preview
    } else if (!this.isDragging) {
      // Inertia & damping
      this.yaw += this.yawVelocity;
      this.pitch += this.pitchVelocity;
      this.yawVelocity *= 0.92;
      this.pitchVelocity *= 0.92;

      // Pitch boundaries
      this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch));

      if (Math.abs(this.yawVelocity) < 0.0005 && Math.abs(this.pitchVelocity) < 0.0005) {
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
      }
    }
  }

  _renderScene() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    // Draw floor pedestal shadow
    ctx.save();
    ctx.translate(w / 2, h / 2 + 160);
    ctx.scale(1, 0.35);
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 140);
    grad.addColorStop(0, 'rgba(217, 160, 192, 0.25)');
    grad.addColorStop(0.5, 'rgba(46, 42, 51, 0.6)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 8 box vertices
    const hw = this.boxW;
    const hh = this.boxH;
    const hd = this.boxD;

    const vertices = [
      { x: -hw, y: -hh, z: -hd }, // 0
      { x:  hw, y: -hh, z: -hd }, // 1
      { x:  hw, y:  hh, z: -hd }, // 2
      { x: -hw, y:  hh, z: -hd }, // 3
      { x: -hw, y: -hh, z:  hd }, // 4
      { x:  hw, y: -hh, z:  hd }, // 5
      { x:  hw, y:  hh, z:  hd }, // 6
      { x: -hw, y:  hh, z:  hd }  // 7
    ];

    // Trigonometric rotation
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

    const projected = vertices.map(v => {
      // Rotate Yaw around Y axis
      const x1 = v.x * cosY + v.z * sinY;
      const z1 = -v.x * sinY + v.z * cosY;

      // Rotate Pitch around X axis
      const y2 = v.y * cosP - z1 * sinP;
      const z2 = v.y * sinP + z1 * cosP;

      // Perspective projection
      const cameraDistance = 550;
      const factor = cameraDistance / (cameraDistance + z2);

      return {
        x: w / 2 + x1 * factor,
        y: h / 2 + y2 * factor,
        z: z2
      };
    });

    // 6 Faces defined by vertex indices & normal z-order
    const faces = [
      { name: 'front', indices: [4, 5, 6, 7], tex: this.faceCanvases.front },
      { name: 'back',  indices: [1, 0, 3, 2], tex: this.faceCanvases.back },
      { name: 'top',   indices: [0, 1, 5, 4], tex: this.faceCanvases.top },
      { name: 'bottom',indices: [7, 6, 2, 3], tex: this.faceCanvases.bottom },
      { name: 'left',  indices: [0, 4, 7, 3], tex: this.faceCanvases.left },
      { name: 'right', indices: [5, 1, 2, 6], tex: this.faceCanvases.right }
    ];

    // Compute average depth and normal orientation for back-face culling & sorting
    const visibleFaces = [];

    for (const f of faces) {
      const p0 = projected[f.indices[0]];
      const p1 = projected[f.indices[1]];
      const p2 = projected[f.indices[2]];
      const p3 = projected[f.indices[3]];

      // Cross product in screen coordinates (2D winding test)
      const normalZ = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);

      if (normalZ > 0) {
        const avgZ = (p0.z + p1.z + p2.z + p3.z) / 4;
        visibleFaces.push({
          face: f,
          pts: [p0, p1, p2, p3],
          avgZ,
          normalZ
        });
      }
    }

    // Sort back-to-front
    visibleFaces.sort((a, b) => b.avgZ - a.avgZ);

    // Draw visible faces using polygon clipping and texture mapping
    for (const item of visibleFaces) {
      const pts = item.pts;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();

      // Clip to projected quad
      ctx.clip();

      // Draw texture transformed to match vertices
      this._drawQuadTexture(ctx, item.face.tex, pts[0], pts[1], pts[2], pts[3]);

      // Lighting overlay based on depth/angle
      const lightFactor = Math.max(0, Math.min(0.4, (item.avgZ + 100) / 350));
      ctx.fillStyle = `rgba(0, 0, 0, ${lightFactor})`;
      ctx.fill();

      ctx.restore();

      // 1px shiny wireframe edge
      ctx.strokeStyle = 'rgba(217, 160, 192, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawQuadTexture(ctx, image, p0, p1, p2, p3) {
    // Affine two-triangle decomposition for fast zero-overhead texture mapping
    this._drawTriangle(ctx, image,
      0, 0, image.width, 0, 0, image.height,
      p0.x, p0.y, p1.x, p1.y, p3.x, p3.y
    );
    this._drawTriangle(ctx, image,
      image.width, 0, image.width, image.height, 0, image.height,
      p1.x, p1.y, p2.x, p2.y, p3.x, p3.y
    );
  }

  _drawTriangle(ctx, im, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    const delta = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
    if (Math.abs(delta) < 0.0001) {
      ctx.restore();
      return;
    }

    const deltaA = x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1);
    const deltaB = u0 * (x1 - x2) - x0 * (u1 - u2) + (u1 * x2 - u2 * x1);
    const deltaC = u0 * (v1 * x2 - v2 * x1) - v0 * (u1 * x2 - u2 * x1) + x0 * (u1 * v2 - u2 * v1);

    const deltaD = y0 * (v1 - v2) - v0 * (y1 - y2) + (y1 * v2 - y2 * v1);
    const deltaE = u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1);
    const deltaF = u0 * (v1 * y2 - v2 * y1) - v0 * (u1 * y2 - u2 * y1) + y0 * (u1 * v2 - u2 * v1);

    ctx.transform(
      deltaA / delta, deltaD / delta,
      deltaB / delta, deltaE / delta,
      deltaC / delta, deltaF / delta
    );

    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }
}

window.MedicineBox360Viewer = MedicineBox360Viewer;
