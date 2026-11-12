/**
 * 3D Holographic Anatomy Engine on 2D HTML5 Canvas
 * Pure Zero-Overhead Mathematical Projection (No Three.js, No WebGL, 60 FPS on Intel HD 5500)
 * Features: Yaw/Pitch 3D Matrix Rotation, Z-Sorting, Holographic Wireframe Mannequin,
 * Internal Glowing Organs (Brain, Heart/Lungs, Stomach), Floating AI Energy Orb,
 * and 4 Interactive 3D Hotspots (Head, Chest, Stomach, Skin/Muscles).
 */

'use strict';

class Anatomy3DEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2 + 10;

    // Projection Constants
    this.focalLength = 360;
    this.cameraDistance = 440;

    // Rotation State (Radians)
    this.yaw = 0.15;        // Y-axis rotation
    this.pitch = 0.05;      // X-axis rotation
    this.targetYaw = 0.15;
    this.targetPitch = 0.05;

    // Interaction State
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.velocityYaw = 0;
    this.velocityPitch = 0;
    this.lastInteractionTime = Date.now();
    this.autoRotateSpeed = 0.006;

    // Active Selection State
    this.activeZone = 'all'; // 'all' | 'head' | 'chest' | 'stomach' | 'skin'
    this.hoveredHotspot = null;

    // Animation & Organ Pulse Timing
    this.time = 0;
    this.lastFrameTime = performance.now();
    this.fps = 60;
    this.frameCount = 0;
    this.fpsTimer = performance.now();

    // Hotspot Definitions in 3D Space (x, y, z)
    this.hotspots = [
      { id: 'head', zone: 'head', x: 0, y: -115, z: 20, labelKey: 'filterHead' },
      { id: 'chest', zone: 'chest', x: 0, y: -45, z: 22, labelKey: 'filterChest' },
      { id: 'stomach', zone: 'stomach', x: 2, y: -5, z: 20, labelKey: 'filterStomach' },
      { id: 'skin', zone: 'skin', x: 38, y: 35, z: 18, labelKey: 'filterSkin' }
    ];

    // Screen-projected Hotspot hit areas
    this.projectedHotspots = [];

    // Initialize 3D Geometry
    this._buildMannequinGeometry();
    this._bindEvents();
    this._startLoop();
  }

  /**
   * Pre-build Mannequin Skeleton, Organs, and AI Orb Vertices and Edges
   */
  _buildMannequinGeometry() {
    this.vertices = [];
    this.lines = [];

    // Helper to add vertex and return index
    const addV = (x, y, z) => {
      this.vertices.push({ x, y, z });
      return this.vertices.length - 1;
    };

    // Helper to add line segment
    const addL = (i1, i2, style = 'body') => {
      this.lines.push({ i1, i2, style });
    };

    // 1. Head (Spherical Wireframe Rings)
    const headCenterY = -115;
    const headRadius = 22;
    const ringSteps = 10;
    const headRingIndices = [];

    // Latitudes (horizontal rings)
    for (let lat = -1; lat <= 1; lat += 0.5) {
      const r = Math.sqrt(Math.max(0, 1 - lat * lat)) * headRadius;
      const y = headCenterY + lat * (headRadius * 1.15);
      const ring = [];
      for (let i = 0; i < ringSteps; i++) {
        const theta = (i / ringSteps) * Math.PI * 2;
        ring.push(addV(Math.cos(theta) * r, y, Math.sin(theta) * r));
      }
      headRingIndices.push(ring);
      // Connect horizontal ring
      for (let i = 0; i < ringSteps; i++) {
        addL(ring[i], ring[(i + 1) % ringSteps], 'head');
      }
    }

    // Connect vertical lines across head rings
    for (let r = 0; r < headRingIndices.length - 1; r++) {
      for (let i = 0; i < ringSteps; i++) {
        addL(headRingIndices[r][i], headRingIndices[r + 1][i], 'head');
      }
    }

    // 2. Neck & Spine
    const neckTop = addV(0, -90, 0);
    const neckBase = addV(0, -75, 0);
    addL(neckTop, neckBase, 'spine');

    const spineNodes = [];
    spineNodes.push(neckBase);
    for (let y = -65; y <= 35; y += 15) {
      const sNode = addV(0, y, -4);
      spineNodes.push(sNode);
    }
    for (let i = 0; i < spineNodes.length - 1; i++) {
      addL(spineNodes[i], spineNodes[i + 1], 'spine');
    }

    // 3. Shoulders & Arms
    const shoulderL = addV(-42, -72, -2);
    const shoulderR = addV(42, -72, -2);
    addL(neckBase, shoulderL, 'body');
    addL(neckBase, shoulderR, 'body');

    const elbowL = addV(-50, -25, 4);
    const elbowR = addV(50, -25, 4);
    addL(shoulderL, elbowL, 'body');
    addL(shoulderR, elbowR, 'body');

    const wristL = addV(-52, 20, 8);
    const wristR = addV(52, 20, 8);
    addL(elbowL, wristL, 'body');
    addL(elbowR, wristR, 'body');

    const handL = addV(-53, 36, 10);
    const handR = addV(53, 36, 10);
    addL(wristL, handL, 'body');
    addL(wristR, handR, 'body');

    // 4. Ribcage (Curved chest arcs)
    const ribHeights = [-60, -48, -36, -24];
    for (const ry of ribHeights) {
      const spinePt = addV(0, ry, -5);
      const sternumPt = addV(0, ry + 3, 18);
      const ribL = addV(-28, ry + 1, 8);
      const ribR = addV(28, ry + 1, 8);
      addL(spinePt, ribL, 'chest');
      addL(ribL, sternumPt, 'chest');
      addL(spinePt, ribR, 'chest');
      addL(ribR, sternumPt, 'chest');
    }

    // 5. Pelvis & Hips
    const pelvisCenter = addV(0, 40, 0);
    const hipL = addV(-26, 44, 2);
    const hipR = addV(26, 44, 2);
    addL(spineNodes[spineNodes.length - 1], pelvisCenter, 'body');
    addL(pelvisCenter, hipL, 'body');
    addL(pelvisCenter, hipR, 'body');

    // 6. Legs & Feet
    const kneeL = addV(-24, 105, 4);
    const kneeR = addV(24, 105, 4);
    addL(hipL, kneeL, 'body');
    addL(hipR, kneeR, 'body');

    const ankleL = addV(-20, 160, 0);
    const ankleR = addV(20, 160, 0);
    addL(kneeL, ankleL, 'body');
    addL(kneeR, ankleR, 'body');

    const toeL = addV(-20, 168, 14);
    const toeR = addV(20, 168, 14);
    addL(ankleL, toeL, 'body');
    addL(ankleR, toeR, 'body');
  }

  /**
   * Event listeners for touch, mouse, and resize
   */
  _bindEvents() {
    const el = this.canvas;

    const onPointerDown = (e) => {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.velocityYaw = 0;
      this.velocityPitch = 0;
      this.lastInteractionTime = Date.now();
      el.setPointerCapture(e.pointerId);

      // Check if clicked directly on an interactive hotspot
      const rect = el.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      this._checkHotspotClick(clickX, clickY);
    };

    const onPointerMove = (e) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Update hover check
      this._checkHotspotHover(mx, my);

      if (!this.isDragging) return;

      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;

      this.velocityYaw = dx * 0.008;
      this.velocityPitch = -dy * 0.006;

      this.yaw += this.velocityYaw;
      this.pitch = Math.max(-0.45, Math.min(0.45, this.pitch + this.velocityPitch));

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.lastInteractionTime = Date.now();
    };

    const onPointerUp = (e) => {
      this.isDragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    // Sync with external state changes
    if (window.storeSubscribe) {
      window.storeSubscribe('category', (cat) => {
        this.activeZone = cat || 'all';
      });
    }
  }

  _checkHotspotHover(x, y) {
    let hovered = null;
    for (const h of this.projectedHotspots) {
      const dist = Math.hypot(x - h.sx, y - h.sy);
      if (dist < 26) {
        hovered = h;
        break;
      }
    }
    this.hoveredHotspot = hovered;
    this.canvas.style.cursor = hovered ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
  }

  _checkHotspotClick(x, y) {
    for (const h of this.projectedHotspots) {
      const dist = Math.hypot(x - h.sx, y - h.sy);
      if (dist < 32) {
        // Tapped hotspot!
        this.activeZone = h.zone;
        if (window.store) {
          window.store.category = h.zone;
        }

        // Smoothly bring target zone towards frontal orientation
        this.targetYaw = 0.0;
        this.velocityYaw = (this.targetYaw - this.yaw) * 0.1;
        break;
      }
    }
  }

  /**
   * 3D Matrix Rotation (Yaw then Pitch)
   */
  _rotatePoint(x, y, z) {
    // 1. Yaw rotation (around Y axis)
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const x1 = x * cosY + z * sinY;
    const y1 = y;
    const z1 = -x * sinY + z * cosY;

    // 2. Pitch rotation (around X axis)
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const x2 = x1;
    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;

    return { x: x2, y: y2, z: z2 };
  }

  /**
   * Perspective Projection from 3D space to 2D Canvas pixels
   */
  _project(pt) {
    const scale = this.focalLength / (this.cameraDistance + pt.z);
    return {
      sx: this.centerX + pt.x * scale,
      sy: this.centerY + pt.y * scale,
      scale,
      z: pt.z
    };
  }

  /**
   * Main Render Loop (Strict 60 FPS Composite-friendly)
   */
  _startLoop() {
    const loop = (now) => {
      const delta = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      this.time += delta;

      // FPS Calculation
      this.frameCount++;
      if (now - this.fpsTimer >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsTimer = now;
      }

      this._updatePhysics();
      this._render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * Update rotation physics, auto-spin, and momentum damping
   */
  _updatePhysics() {
    // Idle auto-rotation after 2.5 seconds of untouched state
    const idleTime = Date.now() - this.lastInteractionTime;
    if (!this.isDragging && idleTime > 2500) {
      this.yaw += this.autoRotateSpeed;
      if (this.yaw > Math.PI * 2) this.yaw -= Math.PI * 2;
    } else if (!this.isDragging) {
      // Damping momentum
      this.yaw += this.velocityYaw;
      this.pitch = Math.max(-0.45, Math.min(0.45, this.pitch + this.velocityPitch));
      this.velocityYaw *= 0.92;
      this.velocityPitch *= 0.92;
    }
  }

  /**
   * Render Hologram Frame
   */
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Transform all vertices to rotated camera space
    const projectedVerts = this.vertices.map((v) => {
      const rot = this._rotatePoint(v.x, v.y, v.z);
      return this._project(rot);
    });

    // 2. Prepare Draw Queue for Z-Sorting
    const drawQueue = [];

    // Queue Mannequin Lines
    for (const line of this.lines) {
      const p1 = projectedVerts[line.i1];
      const p2 = projectedVerts[line.i2];
      const avgZ = (p1.z + p2.z) / 2;

      drawQueue.push({
        type: 'line',
        avgZ,
        p1,
        p2,
        style: line.style
      });
    }

    // Queue Internal Organs
    this._queueOrgans(drawQueue);

    // Queue AI Energy Orb
    this._queueAIOrb(drawQueue);

    // Queue Hotspots
    this.projectedHotspots = [];
    for (const h of this.hotspots) {
      const rot = this._rotatePoint(h.x, h.y, h.z);
      const proj = this._project(rot);
      this.projectedHotspots.push({
        ...h,
        sx: proj.sx,
        sy: proj.sy,
        scale: proj.scale,
        z: proj.z
      });

      drawQueue.push({
        type: 'hotspot',
        avgZ: proj.z,
        hotspot: { ...h, sx: proj.sx, sy: proj.sy, scale: proj.scale, z: proj.z }
      });
    }

    // 3. Sort back-to-front (Largest Z first)
    drawQueue.sort((a, b) => b.avgZ - a.avgZ);

    // 4. Render Sorted Primitives
    for (const item of drawQueue) {
      switch (item.type) {
        case 'line':
          this._renderLine(item);
          break;
        case 'brain':
          this._renderBrain(item);
          break;
        case 'heart':
          this._renderHeart(item);
          break;
        case 'stomach':
          this._renderStomach(item);
          break;
        case 'orb':
          this._renderAIOrb(item);
          break;
        case 'hotspot':
          this._renderHotspot(item.hotspot);
          break;
      }
    }

    // 5. Draw HUD Overlay (FPS, Rotation degree indicator)
    this._renderHUD();
  }

  /**
   * Queue Internal Organs into draw list
   */
  _queueOrgans(drawQueue) {
    // 1. Brain (situated in cranial vault: y = -115)
    const brainRot = this._rotatePoint(0, -115, 0);
    const brainProj = this._project(brainRot);
    drawQueue.push({ type: 'brain', avgZ: brainProj.z, proj: brainProj });

    // 2. Heart (cardiac mediastinum: x = -6, y = -45, z = 6)
    const heartRot = this._rotatePoint(-6, -45, 6);
    const heartProj = this._project(heartRot);
    drawQueue.push({ type: 'heart', avgZ: heartProj.z, proj: heartProj });

    // 3. Stomach (epigastric abdominal zone: x = 4, y = -8, z = 8)
    const stomachRot = this._rotatePoint(4, -8, 8);
    const stomachProj = this._project(stomachRot);
    drawQueue.push({ type: 'stomach', avgZ: stomachProj.z, proj: stomachProj });
  }

  /**
   * Queue Floating AI Energy Orb hovering above crown
   */
  _queueAIOrb(drawQueue) {
    // Floating harmonic oscillation: y = -160 + sin(t*2)*4
    const floatY = -158 + Math.sin(this.time * 2.2) * 5;
    const orbRot = this._rotatePoint(0, floatY, 0);
    const orbProj = this._project(orbRot);
    drawQueue.push({ type: 'orb', avgZ: orbProj.z, proj: orbProj });
  }

  /**
   * Render wireframe mannequin line with depth-based opacity
   */
  _renderLine(item) {
    const ctx = this.ctx;
    const { p1, p2, style, avgZ } = item;

    // Depth-based fade (zero overhead)
    const depthAlpha = Math.max(0.15, Math.min(0.85, 0.55 - (avgZ / 450)));

    let strokeColor = `rgba(217, 160, 192, ${depthAlpha * 0.7})`;
    let lineWidth = 1.0;

    if (style === 'head') {
      strokeColor = (this.activeZone === 'head')
        ? `rgba(217, 160, 192, ${depthAlpha * 1.5})`
        : `rgba(217, 160, 192, ${depthAlpha * 0.6})`;
      lineWidth = (this.activeZone === 'head') ? 1.6 : 1.0;
    } else if (style === 'chest') {
      strokeColor = (this.activeZone === 'chest')
        ? `rgba(207, 40, 70, ${depthAlpha * 1.5})`
        : `rgba(217, 160, 192, ${depthAlpha * 0.7})`;
      lineWidth = (this.activeZone === 'chest') ? 1.8 : 1.1;
    } else if (style === 'spine') {
      strokeColor = `rgba(194, 119, 214, ${depthAlpha * 0.9})`;
      lineWidth = 1.4;
    }

    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  /**
   * Render Glowing Neural Brain Organ
   */
  _renderBrain(item) {
    const ctx = this.ctx;
    const { sx, sy, scale, z } = item.proj;
    const isSelected = (this.activeZone === 'head');

    const brainR = 14 * scale;
    const pulse = Math.sin(this.time * 3.5) * 1.5;

    // Outer Neural Aura
    const grad = ctx.createRadialGradient(sx, sy, 2 * scale, sx, sy, (brainR + 4) * scale);
    grad.addColorStop(0, isSelected ? 'rgba(217, 160, 192, 0.85)' : 'rgba(217, 160, 192, 0.55)');
    grad.addColorStop(1, 'rgba(217, 160, 192, 0.0)');

    ctx.beginPath();
    ctx.arc(sx, sy, (brainR + pulse) * scale, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Neural Synapse nodes
    ctx.fillStyle = isSelected ? '#ffffff' : '#F1C5D8';
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + this.time * 0.8;
      const nx = sx + Math.cos(angle) * (brainR * 0.6);
      const ny = sy + Math.sin(angle) * (brainR * 0.5);
      ctx.beginPath();
      ctx.arc(nx, ny, 1.8 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Render Glowing Pulsing Heart & Pulmonary Organ
   */
  _renderHeart(item) {
    const ctx = this.ctx;
    const { sx, sy, scale } = item.proj;
    const isSelected = (this.activeZone === 'chest');

    // Physiological cardiac heartbeat easing: lub-dub pulse
    const beatTime = (this.time * 4) % (Math.PI * 2);
    const beat = Math.pow(Math.sin(beatTime), 4) * 0.35;
    const heartR = (11 + beat * 5) * scale;

    // Glowing Heart aura
    const grad = ctx.createRadialGradient(sx, sy, 2 * scale, sx, sy, heartR * 1.8);
    grad.addColorStop(0, isSelected ? 'rgba(207, 40, 70, 0.95)' : 'rgba(207, 40, 70, 0.65)');
    grad.addColorStop(0.7, 'rgba(180, 49, 127, 0.25)');
    grad.addColorStop(1, 'rgba(207, 40, 70, 0.0)');

    ctx.beginPath();
    ctx.arc(sx, sy, heartR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner cardiac core
    ctx.beginPath();
    ctx.arc(sx, sy, heartR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#ffffff' : '#F1C5D8';
    ctx.fill();

    // Pulmonary contours (Lungs)
    const lungAlpha = isSelected ? 0.65 : 0.3;
    ctx.strokeStyle = `rgba(241, 197, 216, ${lungAlpha})`;
    ctx.lineWidth = 1.2;

    // Left Lung
    ctx.beginPath();
    ctx.ellipse(sx - 16 * scale, sy, 10 * scale, 18 * scale, -0.2, 0, Math.PI * 2);
    ctx.stroke();

    // Right Lung
    ctx.beginPath();
    ctx.ellipse(sx + 20 * scale, sy, 10 * scale, 18 * scale, 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Render Glowing Amber Stomach / Digestive Organ
   */
  _renderStomach(item) {
    const ctx = this.ctx;
    const { sx, sy, scale } = item.proj;
    const isSelected = (this.activeZone === 'stomach');

    const stomachR = 12 * scale;
    const wave = Math.sin(this.time * 2.5) * 1.2;

    const grad = ctx.createRadialGradient(sx, sy, 2 * scale, sx, sy, stomachR * 1.6);
    grad.addColorStop(0, isSelected ? 'rgba(180, 49, 127, 0.95)' : 'rgba(180, 49, 127, 0.65)');
    grad.addColorStop(1, 'rgba(180, 49, 127, 0.0)');

    ctx.beginPath();
    // Curved kidney/bean stomach shape
    ctx.ellipse(sx, sy, stomachR + wave, stomachR * 0.75, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#F1C5D8' : '#D9A0C0';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  /**
   * Render AI Energy Orb Hovering Above Crown
   */
  _renderAIOrb(item) {
    const ctx = this.ctx;
    const { sx, sy, scale } = item.proj;

    const coreR = 8 * scale;
    const pulse = Math.sin(this.time * 3) * 1.5;

    // Glowing core
    const grad = ctx.createRadialGradient(sx, sy, 1, sx, sy, (coreR + 6 + pulse) * scale);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(217, 160, 192, 0.85)');
    grad.addColorStop(0.7, 'rgba(128, 54, 151, 0.4)');
    grad.addColorStop(1, 'rgba(128, 54, 151, 0.0)');

    ctx.beginPath();
    ctx.arc(sx, sy, (coreR + 6 + pulse) * scale, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Two tilted rotating orbital rings
    ctx.strokeStyle = 'rgba(217, 160, 192, 0.65)';
    ctx.lineWidth = 1.1;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.time * 1.4);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(Math.PI / 2.5);
    ctx.strokeStyle = 'rgba(194, 119, 214, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Render Interactive 3D Hotspot Reticle
   */
  _renderHotspot(h) {
    const ctx = this.ctx;
    const { sx, sy, scale, zone, labelKey } = h;
    const isSelected = (this.activeZone === zone);
    const isHovered = (this.hoveredHotspot && this.hoveredHotspot.zone === zone);

    const baseRadius = (isSelected || isHovered ? 16 : 12) * scale;
    const pulse = Math.sin(this.time * 4 + sx * 0.01) * 3;

    // Color theme per zone
    let themeColor = '#D9A0C0';
    let themeGlow = 'rgba(217, 160, 192, ';
    if (zone === 'chest') {
      themeColor = '#CF2846';
      themeGlow = 'rgba(207, 40, 70, ';
    } else if (zone === 'stomach') {
      themeColor = '#B4317F';
      themeGlow = 'rgba(180, 49, 127, ';
    } else if (zone === 'skin') {
      themeColor = '#593796';
      themeGlow = 'rgba(89, 55, 150, ';
    }

    // Outer Target Reticle Ring
    ctx.beginPath();
    ctx.arc(sx, sy, baseRadius + pulse, 0, Math.PI * 2);
    ctx.strokeStyle = themeGlow + (isSelected ? '0.85)' : '0.45)');
    ctx.lineWidth = isSelected ? 2.0 : 1.2;
    ctx.stroke();

    // Inner Glowing Pip
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#ffffff' : themeColor;
    ctx.fill();

    // Hotspot Label Badge
    const lang = (window.store && window.store.lang) || 'fa';
    const label = window.t ? window.t(labelKey, lang) : zone;

    ctx.font = '600 11px system-ui, -apple-system, Vazirmatn, sans-serif';
    const metrics = ctx.measureText(label);
    const badgeW = metrics.width + 14;
    const badgeH = 20;
    const badgeX = (sx > this.centerX) ? (sx + 14) : (sx - badgeW - 14);
    const badgeY = sy - badgeH / 2;

    // Fake Glassmorphism badge background
    ctx.fillStyle = isSelected ? 'rgba(46, 42, 51, 0.92)' : 'rgba(46, 42, 51, 0.75)';
    ctx.strokeStyle = isSelected ? themeColor : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    // Draw rounded badge rect
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    // Badge Text
    ctx.fillStyle = isSelected ? themeColor : '#E3DDF1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  /**
   * HUD Overlay: FPS Counter & 360 Hint
   */
  _renderHUD() {
    const ctx = this.ctx;
    const lang = (window.store && window.store.lang) || 'fa';

    // 60 FPS Gauge in top-left
    ctx.font = '10px monospace';
    ctx.fillStyle = (this.fps >= 55) ? '#593796' : '#B4317F';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.fps} ${window.t ? window.t('fps', lang) : 'FPS'} (Hardware Composite)`, 16, 20);

    // Subtle 360 degree indicator
    const deg = Math.round((((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(`ANGLE: ${deg}°`, 16, 34);
  }
}

window.Anatomy3DEngine = Anatomy3DEngine;
