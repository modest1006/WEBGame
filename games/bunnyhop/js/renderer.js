// Canvas描画・カメラ・エフェクト。ゲームロジックには一切干渉しない。
// 依存: constants.js
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.camX = 0;
    this.camY = 0;
    this.particles = [];
    this.floatTexts = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.squash = 0;      // 着地スクワッシュ
    this.runPhase = 0;    // 足の振りアニメーション位相
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    // レベルの高さ(448px)が画面に気持ちよく収まるようにズーム
    this.zoom = Math.max(1, Math.min(this.canvas.height / 620, this.canvas.width / 900)) * this.dpr;
    if (this.zoom < this.dpr * 0.9) this.zoom = this.dpr * 0.9;
  }

  viewW() { return this.canvas.width / this.zoom; }
  viewH() { return this.canvas.height / this.zoom; }

  handleEvent(type, data, game) {
    const p = game.p;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    switch (type) {
      case 'land':
        this.squash = Math.min(0.35, Math.abs(data.impact) / 3000);
        this.burst(cx, p.y + p.h, 5 + Math.min(8, data.impact / 120), '#c98d5f', { spread: 0.6, up: 0.35 });
        break;
      case 'bhop': {
        this.floatTexts.push({ x: cx, y: p.y - 14, text: `HOP ×${data.combo}`, t: 0, color: '#ffd23e' });
        this.burst(cx, p.y + p.h, 10, '#ffd23e', { spread: 1, up: 0.5 });
        this.shakeT = 120; this.shakeMag = Math.min(3 + data.combo, 8);
        break;
      }
      case 'slideboost':
        this.burst(cx - p.facing * 14, p.y + p.h - 6, 8, '#fff1d6', { spread: 0.5, up: 0.2 });
        break;
      case 'carrot':
        this.burst((data.x + 0.5) * TILE, (data.y + 0.5) * TILE, 12, '#ff8c42', { spread: 1, up: 0.6 });
        this.floatTexts.push({ x: (data.x + 0.5) * TILE, y: data.y * TILE, text: '+🥕', t: 0, color: '#ff8c42' });
        break;
      case 'death':
        this.burst(data.x + p.w / 2, data.y + p.h / 2, 26, '#ffffff', { spread: 1.6, up: 1 });
        this.shakeT = 300; this.shakeMag = 9;
        break;
      case 'checkpoint':
        this.floatTexts.push({ x: (data.x + 0.5) * TILE, y: (data.y - 1) * TILE, text: 'CHECKPOINT!', t: 0, color: '#7ce07c' });
        this.burst((data.x + 0.5) * TILE, (data.y + 0.5) * TILE, 14, '#7ce07c', { spread: 1, up: 0.8 });
        break;
      case 'finish':
        this.shakeT = 200; this.shakeMag = 5;
        break;
    }
  }

  burst(x, y, n, color, { spread = 1, up = 0.5 } = {}) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 320 * spread,
        vy: -Math.random() * 380 * up - 30,
        g: 900,
        life: 0.45 + Math.random() * 0.4,
        age: 0,
        size: 2.5 + Math.random() * 3.5,
        color,
      });
    }
  }

  render(game, dtMs) {
    const dt = dtMs / 1000;
    const { ctx } = this;
    const p = game.p;
    const vw = this.viewW(), vh = this.viewH();

    // カメラ: 速度に応じた先読み＋スムーズ追従（狭い画面では先読みを抑える）
    const lookahead = Math.max(-vw * 0.22, Math.min(p.vx * 0.28, vw * 0.22));
    const tx = p.x + p.w / 2 + lookahead - vw * 0.42;
    const maxCamX = game.level.w * TILE - vw;
    const targetX = Math.max(0, Math.min(tx, maxCamX));
    this.camX += (targetX - this.camX) * Math.min(1, dt * 8);
    const targetY = Math.min(p.y + p.h / 2 - vh * 0.58, game.level.h * TILE - vh + 60);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 6);

    ctx.setTransform(this.zoom, 0, 0, this.zoom, 0, 0);

    // --- 背景（夕焼けキャニオン、パララックス） ---
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, '#2b1a4e');
    sky.addColorStop(0.42, '#8f3a6d');
    sky.addColorStop(0.72, '#e8703a');
    sky.addColorStop(1, '#f7b64e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    // 太陽
    const sunX = vw * 0.68 - this.camX * 0.02;
    const sunY = vh * 0.42;
    const sun = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 90);
    sun.addColorStop(0, 'rgba(255,236,180,1)');
    sun.addColorStop(0.5, 'rgba(255,180,90,0.55)');
    sun.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200);
    ctx.fillStyle = '#ffe9b8';
    ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2); ctx.fill();

    // 遠景メサ（2層）
    this.drawMesas(ctx, vw, vh, 0.15, vh * 0.66, 90, 'rgba(84,42,86,0.85)');
    this.drawMesas(ctx, vw, vh, 0.32, vh * 0.76, 60, 'rgba(122,55,74,0.9)');

    // --- ワールド描画 ---
    ctx.save();
    let shX = 0, shY = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dtMs;
      const k = Math.max(this.shakeT, 0) / 300 * this.shakeMag;
      shX = (Math.random() - 0.5) * k; shY = (Math.random() - 0.5) * k;
    }
    ctx.translate(-this.camX + shX, -this.camY + shY);

    this.drawTiles(ctx, game);
    this.drawHints(ctx, game);
    this.drawPlayer(ctx, game, dt);
    this.drawParticles(ctx, dt);
    this.drawFloatTexts(ctx, dt);
    ctx.restore();

    // スピードライン（高速時の疾走感）
    const sp = Math.abs(p.vx);
    if (sp > 400 && game.state === 'playing') {
      const n = Math.floor((sp - 400) / 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < n; i++) {
        const y = ((i * 137 + performance.now() * 0.4) % vh);
        const len = 30 + (sp - 400) * 0.2;
        const x = (i * 263 + performance.now() * -sp * 0.002) % vw;
        ctx.beginPath();
        ctx.moveTo(((x % vw) + vw) % vw, y);
        ctx.lineTo(((x % vw) + vw) % vw - len * Math.sign(p.vx), y);
        ctx.stroke();
      }
    }
  }

  drawMesas(ctx, vw, vh, parallax, baseY, height, color) {
    ctx.fillStyle = color;
    const off = this.camX * parallax;
    const seg = 260;
    const start = Math.floor(off / seg) - 1;
    for (let i = start; i < start + Math.ceil(vw / seg) + 2; i++) {
      const h = height * (0.6 + 0.4 * Math.abs(Math.sin(i * 12.9898)));
      const x = i * seg - off;
      const w = seg * (0.55 + 0.3 * Math.abs(Math.sin(i * 5.7)));
      ctx.beginPath();
      ctx.moveTo(x, vh);
      ctx.lineTo(x, baseY - h + 20);
      ctx.quadraticCurveTo(x + w * 0.08, baseY - h, x + w * 0.2, baseY - h);
      ctx.lineTo(x + w * 0.8, baseY - h);
      ctx.quadraticCurveTo(x + w * 0.92, baseY - h, x + w, baseY - h + 20);
      ctx.lineTo(x + w, vh);
      ctx.fill();
    }
  }

  drawTiles(ctx, game) {
    const x0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const x1 = Math.min(game.level.w - 1, Math.ceil((this.camX + this.viewW()) / TILE) + 1);
    for (let y = 0; y < game.level.h; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = game.tiles[y][x];
        if (t === T_EMPTY) continue;
        const px = x * TILE, py = y * TILE;
        if (t === T_SOLID) {
          // 岩ブロック（位置ハッシュで色に揺らぎ）
          const hash = Math.abs(Math.sin(x * 127.1 + y * 311.7)) * 18;
          ctx.fillStyle = `rgb(${168 - hash}, ${92 - hash * 0.6}, ${58 - hash * 0.4})`;
          ctx.fillRect(px, py, TILE, TILE);
          // 上面が空いていれば明るい縁（夕日が当たる面）
          if (game.tileAt(x, y - 1) !== T_SOLID) {
            ctx.fillStyle = '#f2a65a';
            ctx.fillRect(px, py, TILE, 6);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
        } else if (t === T_SPIKE) {
          ctx.fillStyle = '#5c2b3f';
          for (let i = 0; i < 2; i++) {
            const sx = px + i * 16;
            ctx.beginPath();
            ctx.moveTo(sx + 2, py + TILE);
            ctx.lineTo(sx + 8, py + 8);
            ctx.lineTo(sx + 14, py + TILE);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,120,120,0.35)';
          ctx.beginPath();
          ctx.moveTo(px + 2, py + TILE); ctx.lineTo(px + 8, py + 8); ctx.lineTo(px + 8, py + TILE);
          ctx.fill();
        } else if (t === T_CARROT) {
          const bob = Math.sin(performance.now() * 0.004 + x) * 3;
          ctx.save();
          ctx.translate(px + TILE / 2, py + TILE / 2 + bob);
          ctx.rotate(0.5);
          ctx.fillStyle = '#ff8c42';
          ctx.beginPath();
          ctx.moveTo(-5, -8); ctx.lineTo(5, -8); ctx.lineTo(0, 10);
          ctx.fill();
          ctx.fillStyle = '#5fae4a';
          ctx.fillRect(-4, -13, 3, 6);
          ctx.fillRect(0, -14, 3, 7);
          ctx.restore();
        } else if (t === T_CHECK || t === T_GOAL) {
          const isGoal = t === T_GOAL;
          const active = !isGoal && game.respawn.x === x * TILE;
          ctx.fillStyle = '#7a5230';
          ctx.fillRect(px + 13, py - TILE, 5, TILE * 2);
          const wave = Math.sin(performance.now() * 0.005 + x) * 3;
          ctx.fillStyle = isGoal ? '#ffd23e' : (active ? '#7ce07c' : '#cccccc');
          ctx.beginPath();
          ctx.moveTo(px + 18, py - TILE + 2);
          ctx.lineTo(px + 18 + 24, py - TILE + 9 + wave);
          ctx.lineTo(px + 18, py - TILE + 17);
          ctx.fill();
          if (isGoal) {
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#7a3f1d';
            ctx.fillText('GOAL', px + 20, py - TILE + 13);
          }
        }
      }
    }
  }

  drawHints(ctx, game) {
    ctx.font = 'bold 15px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'left';
    for (const h of game.level.hints) {
      ctx.fillStyle = 'rgba(60,25,50,0.55)';
      const tw = ctx.measureText(h.text).width;
      ctx.fillRect(h.x * TILE - 8, h.y * TILE - 16, tw + 16, 24);
      ctx.fillStyle = '#ffe9c8';
      ctx.fillText(h.text, h.x * TILE, h.y * TILE + 1);
    }
  }

  drawPlayer(ctx, game, dt) {
    const p = game.p;
    if (game.state === 'dead') return; // 死亡中はパーティクルのみ

    this.squash = Math.max(0, this.squash - dt * 2.2);
    const speed = Math.abs(p.vx);
    this.runPhase += speed * dt * 0.06;

    let sx = 1, sy = 1;
    if (!p.onGround) {
      const stretch = Math.min(0.22, Math.abs(p.vy) / 3500);
      sy = 1 + stretch; sx = 1 - stretch * 0.7;
    } else if (this.squash > 0) {
      sy = 1 - this.squash; sx = 1 + this.squash * 0.8;
    }

    const cx = p.x + p.w / 2;
    const feetY = p.y + p.h;
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale(p.facing * sx, sy);

    const white = '#fdf6ec';
    const shade = '#e8d8c4';
    const pink = '#f7a8b8';

    if (p.sliding) {
      // スライディング姿勢（低く長く、耳を寝かせる）
      ctx.fillStyle = white;
      this.rounded(ctx, -16, -22, 34, 20, 9);
      // 耳（後方へ）
      ctx.fillStyle = white;
      this.rounded(ctx, -30, -26, 18, 7, 3.5);
      this.rounded(ctx, -28, -18, 16, 6, 3);
      // 顔
      ctx.fillStyle = '#3a2430';
      ctx.beginPath(); ctx.arc(12, -15, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pink;
      ctx.beginPath(); ctx.arc(17, -12, 2, 0, Math.PI * 2); ctx.fill();
      // しっぽ
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.arc(-15, -8, 4.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const legSwing = p.onGround && speed > 30 ? Math.sin(this.runPhase) * 6 : 0;
      const legSwing2 = p.onGround && speed > 30 ? Math.sin(this.runPhase + Math.PI) * 6 : (p.onGround ? 0 : 4);
      // 後足
      ctx.fillStyle = shade;
      this.rounded(ctx, -9 + legSwing2 * 0.5, -10, 8, 10, 3.5);
      // 体
      ctx.fillStyle = white;
      this.rounded(ctx, -11, -34, 22, 26, 9);
      // 前足
      ctx.fillStyle = white;
      this.rounded(ctx, 1 + legSwing * 0.5, -10, 8, 10, 3.5);
      // 頭
      ctx.beginPath(); ctx.arc(4, -38, 10, 0, Math.PI * 2); ctx.fill();
      // 耳（速度と上下動で角度が変わる）
      const earTilt = -p.vx * 0.0009 * p.facing - p.vy * 0.0004;
      ctx.save();
      ctx.translate(2, -45);
      ctx.rotate(-0.35 + earTilt);
      ctx.fillStyle = white;
      this.rounded(ctx, -3, -16, 6, 18, 3);
      ctx.fillStyle = pink;
      this.rounded(ctx, -1.5, -13, 3, 12, 1.5);
      ctx.restore();
      ctx.save();
      ctx.translate(7, -44);
      ctx.rotate(0.05 + earTilt);
      ctx.fillStyle = white;
      this.rounded(ctx, -3, -15, 6, 17, 3);
      ctx.fillStyle = pink;
      this.rounded(ctx, -1.5, -12, 3, 11, 1.5);
      ctx.restore();
      // 顔
      ctx.fillStyle = '#3a2430';
      ctx.beginPath(); ctx.arc(8, -39, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pink;
      ctx.beginPath(); ctx.arc(13, -36, 2, 0, Math.PI * 2); ctx.fill();
      // しっぽ
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.arc(-12, -16, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 走行/スライディングの砂埃
    if (p.onGround && speed > 120 && Math.random() < (p.sliding ? 0.5 : 0.18)) {
      this.particles.push({
        x: cx - p.facing * 10, y: feetY - 2,
        vx: -p.facing * (30 + Math.random() * 50), vy: -Math.random() * 60,
        g: 300, life: 0.3 + Math.random() * 0.25, age: 0,
        size: 2 + Math.random() * 3, color: 'rgba(222,170,120,0.8)',
      });
    }
  }

  rounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  drawParticles(ctx, dt) {
    this.particles = this.particles.filter((pt) => pt.age < pt.life);
    for (const pt of this.particles) {
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.g * dt;
      ctx.globalAlpha = 1 - pt.age / pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  drawFloatTexts(ctx, dt) {
    this.floatTexts = this.floatTexts.filter((t) => t.t < 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "M PLUS Rounded 1c", sans-serif';
    for (const t of this.floatTexts) {
      t.t += dt * 1.2;
      ctx.globalAlpha = 1 - t.t;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - t.t * 34);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
