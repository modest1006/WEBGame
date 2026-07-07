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
    this.bubbles = [];
    this.markers = [];
    this.stamps = [];
    for (let i = 0; i < 42; i++) {
      this.bubbles.push({ x: Math.random(), y: Math.random(), r: 0.003 + Math.random() * 0.014, v: 0.00003 + Math.random() * 0.00008, a: Math.random() * 6.28 });
    }
    this.resize();
  }

  PetriRenderer.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = rect.width, h = rect.height;
    this.size = Math.min(w, h) * 0.92;
    this.cell = this.size / 144 * this.zoom;
    this.offsetX = (w - this.cell * 144) / 2;
    this.offsetY = (h - this.cell * 144) / 2;
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

    this.renderBubbles(ctx, w, h, rad, dt);
    this.renderCells(ctx, game);
    ctx.restore();

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

    this.renderMarkers(ctx, dt);
    this.renderLens(ctx, w, h);
    this.renderStamp(ctx, w, h, dt);
  };

  PetriRenderer.prototype.renderCells = function (ctx, game) {
    const cells = game.cells, decay = game.decay;
    const sp = PetriGame.SPECIES;
    const c = this.cell, ox = this.offsetX, oy = this.offsetY;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    for (let y = 0; y < 144; y++) {
      for (let x = 0; x < 144; x++) {
        const idx = y * 144 + x;
        const v = cells[idx];
        if (v > 0 && v !== PetriGame.WALL) {
          ctx.fillStyle = sp[v].color;
          ctx.globalAlpha = 1;
          const px = ox + x * c;
          const py = oy + y * c;
          const s = Math.max(1.8, c * 0.94);
          ctx.fillRect(px + (c - s) * 0.5, py + (c - s) * 0.5, s, s);
        } else if (v === PetriGame.WALL) {
          ctx.fillStyle = 'rgba(30,26,22,.82)';
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
          ctx.fillRect(ox + x * c, oy + y * c, Math.max(1, c), Math.max(1, c));
        } else if (decay[idx]) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(50,85,72,' + (decay[idx] / 26) + ')';
          ctx.fillRect(ox + x * c, oy + y * c, Math.max(1, c * 0.8), Math.max(1, c * 0.8));
        }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let y = 0; y < 144; y++) {
      for (let x = 0; x < 144; x++) {
        const idx = y * 144 + x;
        const v = cells[idx];
        if (v > 0 && v !== PetriGame.WALL) {
          ctx.fillStyle = sp[v].color;
          ctx.shadowColor = sp[v].color;
          ctx.shadowBlur = c * 3.2;
          ctx.globalAlpha = 0.34;
          ctx.beginPath();
          ctx.arc(ox + (x + 0.5) * c, oy + (y + 0.5) * c, Math.max(1.2, c * 0.72), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
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
