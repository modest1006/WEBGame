(function () {
  'use strict';

  function PetriRenderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.size = 1;
    this.cell = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.baseCache = document.createElement('canvas');
    this.topCache = document.createElement('canvas');
    this.cellCanvas = document.createElement('canvas');
    this.cellCanvas.width = 144;
    this.cellCanvas.height = 144;
    this.cellCtx = this.cellCanvas.getContext('2d', { willReadFrequently: false });
    this.cellImage = this.cellCtx.createImageData(144, 144);
    this.glowSmall = document.createElement('canvas');
    this.glowSmall.width = 72;
    this.glowSmall.height = 72;
    this.lastCellGeneration = -1;
    this.lastDecayKey = -1;
    this.bubbles = [];
    this.markers = [];
    this.stamps = [];
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const bubbleCount = coarse ? 20 : 42;
    for (let i = 0; i < bubbleCount; i++) {
      this.bubbles.push({ x: Math.random(), y: Math.random(), r: 0.003 + Math.random() * 0.014, v: 0.00003 + Math.random() * 0.00008, a: Math.random() * 6.28 });
    }
    this.resize();
  }

  PetriRenderer.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.dpr = coarse ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = rect.width, h = rect.height;
    this.size = Math.min(w, h) * 0.92;
    this.cell = this.size / 144 * this.zoom;
    this.offsetX = (w - this.cell * 144) / 2;
    this.offsetY = (h - this.cell * 144) / 2;
    this.rebuildStaticCaches(w, h);
  };

  PetriRenderer.prototype.prepareCache = function (canvas, w, h) {
    canvas.width = Math.max(1, Math.floor(w * this.dpr));
    canvas.height = Math.max(1, Math.floor(h * this.dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  };

  PetriRenderer.prototype.rebuildStaticCaches = function (w, h) {
    const cx = w / 2, cy = h / 2, rad = this.cell * 69.5;
    let ctx = this.prepareCache(this.baseCache, w, h);
    const bg = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, Math.max(w, h) * 0.65);
    bg.addColorStop(0, '#27303a');
    bg.addColorStop(0.58, '#101216');
    bg.addColorStop(1, '#030406');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.clip();
    const medium = ctx.createRadialGradient(cx - rad * 0.2, cy - rad * 0.25, rad * 0.1, cx, cy, rad);
    medium.addColorStop(0, '#bfc7b7');
    medium.addColorStop(0.62, '#9fae9f');
    medium.addColorStop(1, '#76877e');
    ctx.fillStyle = medium;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    ctx.restore();

    ctx = this.prepareCache(this.topCache, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(2, rad * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, rad + ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(121,215,255,.18)';
    ctx.lineWidth = Math.max(1, rad * 0.05);
    ctx.beginPath();
    ctx.arc(cx - rad * 0.03, cy - rad * 0.02, rad * 0.96, -0.6, 2.7);
    ctx.stroke();
    ctx.restore();
    this.renderLens(ctx, w, h);
  };

  PetriRenderer.prototype.screenToGrid = function (clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.offsetX) / this.cell,
      y: (clientY - r.top - this.offsetY) / this.cell
    };
  };

  PetriRenderer.prototype.handleEvent = function (type, data) {
    if (type === 'discover') {
      this.markers.push({ x: data.x, y: data.y, t: 1.2, name: data.name });
      this.stamps.push({ t: 1.6, name: data.name });
    } else if (type === 'spore') {
      this.markers.push({ x: data.x, y: data.y, t: 0.9, name: 'floating spore' });
    }
  };

  PetriRenderer.prototype.render = function (game, dt) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, rad = this.cell * 69.5;
    ctx.drawImage(this.baseCache, 0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.clip();

    this.renderBubbles(ctx, w, h, rad, dt);
    this.renderCells(ctx, game);
    ctx.restore();

    ctx.drawImage(this.topCache, 0, 0, w, h);
    this.renderMarkers(ctx, dt);
    this.renderStamp(ctx, w, h, dt);
  };

  PetriRenderer.prototype.rebuildCells = function (game) {
    const data = this.cellImage.data;
    const cells = game.cells, decay = game.decay, mask = game.mask;
    const sp = PetriGame.SPECIES;
    for (let i = 0, p = 0; i < cells.length; i++, p += 4) {
      const v = cells[i];
      if (v > 0 && v !== PetriGame.WALL) {
        const hex = sp[v].color;
        data[p] = parseInt(hex.slice(1, 3), 16);
        data[p + 1] = parseInt(hex.slice(3, 5), 16);
        data[p + 2] = parseInt(hex.slice(5, 7), 16);
        data[p + 3] = 255;
      } else if (v === PetriGame.WALL) {
        data[p] = 30; data[p + 1] = 26; data[p + 2] = 22; data[p + 3] = 230;
      } else if (decay[i]) {
        data[p] = 42; data[p + 1] = 78; data[p + 2] = 68; data[p + 3] = decay[i] * 18;
      } else {
        data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; data[p + 3] = mask[i] ? 0 : 0;
      }
    }
    this.cellCtx.putImageData(this.cellImage, 0, 0);
    const gctx = this.glowSmall.getContext('2d');
    gctx.clearRect(0, 0, 72, 72);
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(this.cellCanvas, 0, 0, 72, 72);
    this.lastCellGeneration = game.generation;
  };

  PetriRenderer.prototype.renderCells = function (ctx, game) {
    if (this.lastCellGeneration !== game.generation) this.rebuildCells(game);
    const c = this.cell, ox = this.offsetX, oy = this.offsetY;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.cellCanvas, ox, oy, c * 144, c * 144);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.42 + Math.sin(Date.now() * 0.003) * 0.04;
    ctx.drawImage(this.glowSmall, ox - c * 3, oy - c * 3, c * 150, c * 150);
    ctx.restore();
  };

  PetriRenderer.prototype.renderBubbles = function (ctx, w, h, rad, dt) {
    const cx = w / 2, cy = h / 2;
    ctx.save();
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.y -= b.v * dt;
      b.x += Math.sin(Date.now() * 0.0002 + b.a) * 0.00001 * dt;
      if (b.y < 0.08) b.y = 0.92;
      const x = cx - rad + b.x * rad * 2;
      const y = cy - rad + b.y * rad * 2;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rad * rad) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, b.r * rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  PetriRenderer.prototype.renderMarkers = function (ctx, dt) {
    const c = this.cell, ox = this.offsetX, oy = this.offsetY;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t -= dt / 1000;
      if (m.t <= 0) { this.markers.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.min(1, m.t);
      ctx.strokeStyle = '#ff3d5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox + m.x * c, oy + m.y * c, (1.3 - m.t * 0.2) * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  PetriRenderer.prototype.renderLens = function (ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.66, 'rgba(34,41,50,.05)');
    g.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#42d7ff';
    ctx.fillRect(0, 0, w * 0.004, h);
    ctx.fillStyle = '#ff4d7d';
    ctx.fillRect(w * 0.996, 0, w * 0.004, h);
    ctx.globalAlpha = 1;
  };

  PetriRenderer.prototype.renderStamp = function (ctx, w, h, dt) {
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      const s = this.stamps[i];
      s.t -= dt / 1000;
      if (s.t <= 0) { this.stamps.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(w / 2, h * 0.18);
      ctx.rotate(-0.12);
      ctx.globalAlpha = Math.min(1, s.t);
      ctx.strokeStyle = '#e33b4f';
      ctx.fillStyle = '#e33b4f';
      ctx.lineWidth = 5;
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeRect(-150, -34, 300, 58);
      ctx.fillText('新種発見!', 0, 7);
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(s.name, 0, 29);
      ctx.restore();
    }
  };

  window.PetriRenderer = PetriRenderer;
})();
