// Canvas描画・カメラ・エフェクト。ゲームロジックには一切干渉しない。
// 依存: constants.js
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.camX = 0; this.camY = 0;
    this.particles = [];
    this.rings = [];      // ノヴァ/PERFECT衝撃波
    this.cones = [];      // サブウーファー
    this.texts = [];      // 判定・キル数など
    this.trail = [];      // ダッシュ残像
    this.shakeT = 0; this.shakeMag = 0;
    this.hurtFlash = 0;
    this.fullPulse = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.zoom = Math.max(0.85, Math.min(this.canvas.width / 1100, this.canvas.height / 800)) * 1;
    if (this.canvas.width < 700) this.zoom = this.canvas.width / 760; // モバイルは広めに見せる
  }

  handleEvent(type, data, game) {
    const p = game.p;
    switch (type) {
      case 'dash': {
        if (data.judge === 'perfect') {
          this.rings.push({ x: p.x, y: p.y, r: 20, max: 110, life: 0.3, age: 0, color: '#ffd23e', w: 4 });
          this.texts.push({ x: p.x, y: p.y - 30, text: 'PERFECT', color: '#ffd23e', age: 0, size: 18 });
          this.shakeT = 100; this.shakeMag = 3;
        } else if (data.judge === 'good') {
          this.texts.push({ x: p.x, y: p.y - 30, text: 'GOOD', color: '#7ce0ff', age: 0, size: 14 });
        } else {
          this.texts.push({ x: p.x, y: p.y - 30, text: 'MISS…', color: '#8a8aa8', age: 0, size: 13 });
        }
        break;
      }
      case 'shot':
        // 発射の瞬間のマズルリング（ビートを視覚化）
        this.rings.push({
          x: p.x, y: p.y, r: p.r + 2, max: p.r + (data.accent ? 34 : 20),
          life: 0.18, age: 0, color: data.accent ? '#ffd23e' : '#ffe9b0', w: data.accent ? 3.5 : 2,
        });
        break;
      case 'nova':
        this.rings.push({
          x: data.echo ? this.lastNovaX ?? p.x : p.x, y: data.echo ? this.lastNovaY ?? p.y : p.y,
          r: 30, max: data.radius, life: 0.35, age: 0,
          color: data.echo ? 'rgba(59,232,240,0.6)' : (data.accent ? '#ffd23e' : '#3be8f0'),
          w: data.accent ? 8 : 5,
        });
        if (!data.echo) { this.lastNovaX = p.x; this.lastNovaY = p.y; }
        break;
      case 'bass':
        this.cones.push({ x: p.x, y: p.y, dir: data.dir, range: data.range, arc: data.arc, age: 0, life: 0.28, accent: data.accent });
        this.shakeT = 80; this.shakeMag = data.accent ? 4 : 2.5;
        break;
      case 'kill': {
        const color = ENEMIES[data.type]?.color ?? '#ffffff';
        for (let i = 0; i < (data.type === 'boss' ? 60 : 8); i++) {
          this.particles.push({
            x: data.x, y: data.y,
            vx: (Math.random() - 0.5) * 380, vy: (Math.random() - 0.5) * 380,
            life: 0.4 + Math.random() * 0.4, age: 0,
            size: 2 + Math.random() * 3.5, color,
          });
        }
        if (data.type === 'boss') { this.shakeT = 500; this.shakeMag = 12; }
        break;
      }
      case 'hurt':
        this.hurtFlash = 0.35;
        this.shakeT = 200; this.shakeMag = 7;
        break;
      case 'boss':
        this.texts.push({ x: p.x, y: p.y - 80, text: '⚠ BOSS ⚠', color: '#ffd23e', age: 0, size: 26 });
        this.shakeT = 400; this.shakeMag = 6;
        break;
      case 'groove-tier':
        this.rings.push({ x: p.x, y: p.y, r: 24, max: 170, life: 0.42, age: 0, color: data.color, w: 7 });
        this.texts.push({ x: p.x, y: p.y - 52, text: `TIER ${data.tier}`, color: data.color, age: 0, size: 20 });
        this.shakeT = 140; this.shakeMag = 4;
        break;
      case 'maxgroove':
        this.fullPulse = { age: 0, life: data.strong ? 0.6 : 0.34, strong: data.strong };
        this.texts.push({ x: p.x, y: p.y - 70, text: 'MAX GROOVE', color: '#ffd23e', age: 0, size: data.strong ? 28 : 20 });
        this.shakeT = data.strong ? 260 : 120; this.shakeMag = data.strong ? 7 : 3;
        break;
      case 'bossdefeat-start':
        this.texts.push({ x: data.x ?? p.x, y: (data.y ?? p.y) - 80, text: 'OVERLOAD', color: '#ffffff', age: 0, size: 24, life: 1.2 });
        this.rings.push({ x: data.x ?? p.x, y: data.y ?? p.y, r: 32, max: 120, life: 1.2, age: 0, color: '#ffffff', w: 9 });
        this.shakeT = 1200; this.shakeMag = 5;
        break;
      case 'bossdefeat-explode':
        this.rings.push({ x: data.x ?? p.x, y: data.y ?? p.y, r: 30, max: 900, life: 0.75, age: 0, color: '#ffffff', w: 12 });
        for (let i = 0; i < 90; i++) {
          this.particles.push({
            x: data.x ?? p.x, y: data.y ?? p.y,
            vx: (Math.random() - 0.5) * 760, vy: (Math.random() - 0.5) * 760,
            life: 0.55 + Math.random() * 0.65, age: 0,
            size: 3 + Math.random() * 6, color: i % 3 === 0 ? '#ffffff' : '#ffd23e',
          });
        }
        this.fullPulse = { age: 0, life: 0.45, strong: true };
        this.shakeT = 620; this.shakeMag = 14;
        break;
      case 'deathstart':
        for (let i = 0; i < 56; i++) {
          this.particles.push({
            x: data.x ?? p.x, y: data.y ?? p.y,
            vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420,
            life: 0.7 + Math.random() * 0.6, age: 0,
            size: 2 + Math.random() * 4, color: i % 2 ? '#3be8f0' : '#f04dd8',
          });
        }
        this.hurtFlash = 0.55;
        this.shakeT = 420; this.shakeMag = 9;
        break;
      case 'titlecard':
        this.texts.push({ x: p.x, y: p.y - 120, text: data.title, color: '#ffd23e', age: 0, size: 34, life: 1.6 });
        this.shakeT = 500; this.shakeMag = 5;
        break;
      case 'levelup-open':
        this.rings.push({ x: p.x, y: p.y, r: 10, max: 90, life: 0.4, age: 0, color: '#7cff9e', w: 3 });
        break;
    }
  }

  render(game, dtMs) {
    const dt = dtMs / 1000;
    const { ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;
    const p = game.p;
    const reducedFlash = game.settings?.reducedFlash === true;
    const allowShake = game.settings?.screenShake !== false;
    const beatFrac = ((game.beat % 1) + 1) % 1;
    const pulse = Math.max(0, 1 - beatFrac * 2.6); // ビート直後1→0
    const grooveN = Math.min(game.groove, GROOVE_MAX) / GROOVE_MAX;

    // カメラ
    this.camX += (p.x - this.camX) * Math.min(1, dt * 10);
    this.camY += (p.y - this.camY) * Math.min(1, dt * 10);

    // 背景（ビートで明滅する暗色）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.isEndless && game.isEndless() && game.time >= OVERDRIVE_TIME) {
      const hue = (210 + (game.time - OVERDRIVE_TIME) * 9) % 360;
      ctx.fillStyle = `hsl(${hue} 54% ${8 + pulse * 3 + grooveN * 4}%)`;
    } else {
      ctx.fillStyle = `rgb(${8 + pulse * 5 + grooveN * 6}, ${6 + pulse * 3}, ${18 + pulse * 8 + grooveN * 10})`;
    }
    ctx.fillRect(0, 0, W, H);

    let shX = 0, shY = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dtMs;
      const k = Math.max(this.shakeT, 0) / 300 * this.shakeMag * this.dpr;
      if (allowShake) {
        shX = (Math.random() - 0.5) * k; shY = (Math.random() - 0.5) * k;
      }
    }
    const z = this.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, W / 2 - this.camX * z + shX, H / 2 - this.camY * z + shY);
    const viewR = Math.hypot(W, H) / (2 * z) + 60;

    // グリッド（ビートで脈動）
    const gs = 90;
    ctx.strokeStyle = `rgba(110, 90, 255, ${0.06 + pulse * 0.09 + grooveN * 0.05})`;
    ctx.lineWidth = 1;
    const gx0 = Math.floor((this.camX - viewR) / gs) * gs;
    const gy0 = Math.floor((this.camY - viewR) / gs) * gs;
    ctx.beginPath();
    for (let x = gx0; x < this.camX + viewR; x += gs) { ctx.moveTo(x, this.camY - viewR); ctx.lineTo(x, this.camY + viewR); }
    for (let y = gy0; y < this.camY + viewR; y += gs) { ctx.moveTo(this.camX - viewR, y); ctx.lineTo(this.camX + viewR, y); }
    ctx.stroke();

    // アリーナ境界
    ctx.strokeStyle = `rgba(240, 77, 216, ${0.35 + pulse * 0.3})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2); ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';

    // XPジェム（ビートで跳ねる）
    const gemS = 1 + pulse * 0.35;
    for (const g of game.gems) {
      const bob = Math.sin(game.time * 5 + g.x) * 2 - pulse * 3;
      ctx.fillStyle = 'rgba(80, 240, 220, 0.9)';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 6 * gemS + bob); ctx.lineTo(g.x + 4.5 * gemS, g.y + bob);
      ctx.lineTo(g.x, g.y + 6 * gemS + bob); ctx.lineTo(g.x - 4.5 * gemS, g.y + bob);
      ctx.fill();
    }

    // レーザー（GROOVEティア反映）
    if (game.weapons.laser) {
      const conf = game.laserConf();
      const halfFrac = ((game.beat * 2) % 1 + 1) % 1;
      const lp = Math.max(0.35, 1 - halfFrac * 2);
      for (const ang of game.laserAngles()) {
        ctx.strokeStyle = `rgba(200, 140, 255, ${0.35 + 0.5 * lp})`;
        ctx.lineWidth = 7 * lp + 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(ang) * conf.len, p.y + Math.sin(ang) * conf.len);
        ctx.stroke();
      }
    }

    // 敵
    for (const e of game.enemies) {
      if (Math.abs(e.x - this.camX) > viewR || Math.abs(e.y - this.camY) > viewR) continue;
      const def = ENEMIES[e.type];
      const sides = e.type === 'chaser' ? 5 : e.type === 'swarm' ? 3 : e.type === 'tank' ? 6 : 8;
      const rr = e.r * (1 + pulse * 0.12);
      const rot = game.time * (e.type === 'swarm' ? 3 : 0.8) + e.id;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (Math.PI * 2 * i) / sides;
        const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // タンク/ボスのHPバー
      if (e.type === 'tank' || e.type === 'boss') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 5);
        ctx.fillStyle = def.color;
        ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * Math.max(0, e.hp / e.maxHp), 5);
        ctx.globalCompositeOperation = 'lighter';
      }
    }

    // 弾（ビートで脈動）
    const bulletS = 1 + pulse * 0.35;
    for (const b of game.bullets) {
      ctx.fillStyle = 'rgba(255, 240, 180, 0.95)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * bulletS, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 80, 0.35)';
      ctx.beginPath(); ctx.arc(b.x - b.vx * 0.012, b.y - b.vy * 0.012, b.r * 1.8 * bulletS, 0, Math.PI * 2); ctx.fill();
    }

    // サブウーファー扇形
    this.cones = this.cones.filter((c) => c.age < c.life);
    for (const c of this.cones) {
      c.age += dt;
      const a = 1 - c.age / c.life;
      ctx.fillStyle = c.accent ? `rgba(255, 210, 62, ${0.4 * a})` : `rgba(255, 140, 66, ${0.3 * a})`;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, c.range * (0.4 + 0.6 * (c.age / c.life)), c.dir - c.arc / 2, c.dir + c.arc / 2);
      ctx.closePath(); ctx.fill();
    }

    // リング（ノヴァ等）
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const r of this.rings) {
      r.age += dt;
      const k = r.age / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ダッシュ残像
    if (p.dashT > 0) this.trail.push({ x: p.x, y: p.y, age: 0 });
    this.trail = this.trail.filter((t) => t.age < 0.25);
    for (const t of this.trail) {
      t.age += dt;
      ctx.fillStyle = `rgba(120, 230, 255, ${(1 - t.age / 0.25) * 0.3})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, p.r * 0.9, 0, Math.PI * 2); ctx.fill();
    }

    // ビートリング（タイミングガイド: ビート丁度で自機サイズに収束）
    if (game.state === 'playing' || game.state === 'levelup') {
      const ringR = p.r + 4 + (1 - beatFrac) * 55;
      const col = grooveN > 0.5 ? '255, 210, 62' : '120, 230, 255';
      ctx.strokeStyle = `rgba(${col}, ${0.25 + pulse * 0.55})`;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2); ctx.stroke();
    }

    // プレイヤー（GROOVEオーラ＋本体）
    if (game.state !== 'dead' && game.state !== 'dying') {
      if (game.groove > 0) {
        ctx.fillStyle = `rgba(255, 210, 62, ${0.05 + grooveN * 0.12 + pulse * 0.06})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 + grooveN * 18, 0, Math.PI * 2); ctx.fill();
      }
      // アクセント中（PERFECT直後）は黄金のオーラ
      if (game.isAccent()) {
        ctx.strokeStyle = `rgba(255, 210, 62, ${0.5 + pulse * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
      }
      const blink = p.iframe > 0 && Math.floor(game.time * 20) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255,255,255,0.5)' : '#eafcff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + pulse * 0.1), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3be8f0';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2); ctx.fill();
      // 向きインジケータ
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.facing) * (p.r + 7), p.y + Math.sin(p.facing) * (p.r + 7), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // パーティクル
    this.particles = this.particles.filter((pt) => pt.age < pt.life);
    for (const pt of this.particles) {
      pt.age += dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.97; pt.vy *= 0.97;
      ctx.globalAlpha = 1 - pt.age / pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // フロートテキスト
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    this.texts = this.texts.filter((t) => t.age < (t.life ?? 0.8));
    for (const t of this.texts) {
      t.age += dt;
      const life = t.life ?? 0.8;
      ctx.font = `900 ${t.size}px 'M PLUS Rounded 1c', sans-serif`;
      ctx.globalAlpha = 1 - t.age / life;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - t.age * 40);
    }
    ctx.globalAlpha = 1;

    // 被弾ビネット
    if (this.fullPulse) {
      this.fullPulse.age += dt;
      const k = this.fullPulse.age / this.fullPulse.life;
      if (k >= 1) this.fullPulse = null;
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const alpha = (this.fullPulse.strong ? 0.32 : 0.16) * (1 - k) * (reducedFlash ? 0.35 : 1);
        ctx.fillStyle = `rgba(255, 242, 180, ${alpha})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      v.addColorStop(0, 'rgba(255,0,60,0)');
      v.addColorStop(1, `rgba(255,0,60,${this.hurtFlash * (reducedFlash ? 0.28 : 0.9)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
