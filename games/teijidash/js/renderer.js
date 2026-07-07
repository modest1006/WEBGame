class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.effects = [];
    this.shake = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(innerWidth / WORLD.w, innerHeight / WORLD.h);
    this.ox = (innerWidth - WORLD.w * this.scale) / 2;
    this.oy = (innerHeight - WORLD.h * this.scale) / 2;
  }

  handleEvent(type, data) {
    if (type === 'prepAction') this.burst(460, 326, data.stage === 0 ? 'ガシャーン!' : data.stage === 1 ? 'バサー!' : data.stage === 2 ? 'ズドン!' : 'バッサー!', '#ffe05d', 18);
    if (type === 'caught') { this.burst(590, 190, '発見!!', '#ff4d4d', 26); this.shake = 28; }
    if (type === 'bossWarn') this.burst(655, 150, 'ピクッ', '#fff8df', 10);
    if (type === 'just') { this.burst(480, 270, data.judge === 'PERFECT' ? '音速定時!!' : data.judge, '#ffffff', 36); this.shake = data.judge === 'PERFECT' ? 34 : 20; }
    if (type === 'qteSuccess') { this.burst(472, 314, data.qte.type === 'coworker' ? 'はやっ…' : data.qte.type === 'elevator' ? '👍' : 'BOOM!', '#fff2a4', 20); this.shake = 10; }
    if (type === 'qteFail') { this.burst(470, 304, data.qte.type === 'coworker' ? 'まだ帰らないよね?' : 'ドサッ!', '#ff7b7b', 24); this.shake = 24; }
    if (type === 'dayResult') this.burst(480, 250, data.rank, '#fff', 28);
  }

  burst(x, y, text, color, size) {
    this.effects.push({ x, y, text, color, size, life: 950, max: 950, kind: 'text' });
    for (let i = 0; i < 18; i++) {
      this.effects.push({ x, y, vx: Math.cos(i) * (80 + i * 9), vy: Math.sin(i * 2.1) * 120 - 50, color, life: 700, max: 700, kind: 'bit' });
    }
  }

  render(game, dtMs) {
    this.shake = Math.max(0, this.shake - dtMs * 0.06);
    const c = this.ctx;
    c.save();
    c.clearRect(0, 0, innerWidth, innerHeight);
    c.translate(this.ox, this.oy);
    c.scale(this.scale, this.scale);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    c.translate(sx, sy);
    this.drawScene(c, game);
    this.drawEffects(c, dtMs);
    c.restore();
  }

  drawScene(c, game) {
    this.drawSky(c, game);
    if (game.act === ACT.DASH) this.drawDash(c, game);
    else this.drawOffice(c, game);
    this.drawForeground(c, game);
  }

  drawSky(c, game) {
    const g = c.createLinearGradient(0, 0, 0, WORLD.h);
    g.addColorStop(0, game.act === ACT.DASH ? '#ff9c65' : '#526f8c');
    g.addColorStop(0.55, game.act === ACT.DASH ? '#ffd184' : '#e3a35b');
    g.addColorStop(1, '#29313b');
    c.fillStyle = g;
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    if (game.act === ACT.DASH) {
      c.globalAlpha = clamp(game.maxCombo / 8, 0.12, 0.72);
      c.fillStyle = '#fff2a1';
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        c.moveTo(760, 70);
        c.lineTo(80 + i * 95, 540);
        c.lineTo(150 + i * 95, 540);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  drawOffice(c, game) {
    c.fillStyle = '#6d5948';
    c.fillRect(0, 378, WORLD.w, 170);
    c.fillStyle = '#ffeab3';
    for (let x = 52; x < 900; x += 180) {
      c.fillRect(x, 62, 122, 102);
      c.fillStyle = 'rgba(255,126,65,0.32)';
      c.fillRect(x + 8, 70, 106, 86);
      c.fillStyle = '#ffeab3';
    }
    this.drawBoss(c, game);
    this.drawDesk(c, 260, 300, game);
    this.drawPlayer(c, 360, 312, game);
    if (game.act === ACT.JUST) this.drawClock(c, game);
  }

  drawBoss(c, game) {
    const x = 670, y = 204;
    c.fillStyle = '#3b2824';
    c.fillRect(x - 58, y + 88, 126, 74);
    c.fillStyle = '#655248';
    c.fillRect(x - 38, y + 64, 86, 44);
    c.fillStyle = '#f0c49c';
    c.fillRect(x - 34, y, 70, 62);
    c.fillStyle = '#2b2220';
    if (game.bossLooking) {
      c.fillRect(x - 20, y + 22, 10, 12);
      c.fillRect(x + 14, y + 22, 10, 12);
      c.fillRect(x - 18, y + 45, 42, 6);
    } else {
      c.fillRect(x - 28, y + 16, 58, 22);
      c.fillStyle = '#4b3327';
      c.fillRect(x - 32, y - 8, 66, 28);
    }
    if (game.bossWarn > 0) {
      c.fillStyle = '#fff';
      c.font = '900 28px Arial';
      c.fillText('!', x + 48, y + 18);
    }
  }

  drawDesk(c, x, y, game) {
    c.fillStyle = '#845b39';
    c.fillRect(x - 122, y + 42, 300, 50);
    c.fillStyle = '#463a40';
    c.fillRect(x - 84, y - 18, 76, 56);
    c.fillStyle = '#96d7ff';
    c.fillRect(x - 76, y - 10, 60, 34);
    c.fillStyle = '#fff8df';
    const wobble = game.bossLooking && game.caught ? Math.sin(game.time * 0.04) * 3 : 0;
    for (let i = 0; i < 5; i++) c.fillRect(x + 42 + wobble, y + 24 - i * 8, 74, 7);
    c.fillStyle = '#2b2220';
    c.fillRect(x + 118, y + 18, 36, 24);
  }

  drawPlayer(c, x, y, game) {
    const act = game.inputDown && !game.bossLooking ? Math.sin(game.time * 0.035) * 14 : 0;
    const freeze = game.bossLooking ? 1 : 0;
    c.fillStyle = '#2b2220';
    c.fillRect(x - 18, y + 54, 16, 44);
    c.fillRect(x + 15, y + 54, 16, 44);
    c.fillStyle = '#2f75bd';
    c.fillRect(x - 28, y + 2, 62, 62);
    c.fillStyle = '#f1c6a0';
    c.fillRect(x - 20, y - 50, 44, 44);
    c.fillStyle = '#35251f';
    c.fillRect(x - 24, y - 58, 52, 18);
    c.fillStyle = '#fff';
    c.fillRect(x - 8, y - 33, 8, 7);
    c.fillRect(x + 12, y - 33, 8, 7);
    c.fillStyle = '#2b2220';
    c.fillRect(x - 3, y - 18, 20, 5);
    if (game.inputDown && !game.bossLooking) {
      c.fillStyle = '#ffe05d';
      const s = game.prepStage;
      if (s === 0) { c.fillRect(x - 82, y - 18 - act, 54, 18); c.fillText('DON!', x - 112, y - 28 - act); }
      if (s === 1) { for (let i = 0; i < 9; i++) c.fillRect(x - 40 + i * 17, y - 150 + (i % 3) * 18, 25, 7); }
      if (s === 2) { c.fillRect(x + 52, y + 10 + act * 0.3, 58, 48); }
      if (s === 3) { c.fillStyle = '#d44335'; c.fillRect(x - 95, y - 40 + act, 114, 26); }
    }
    if (freeze) {
      c.fillStyle = '#66d7ff';
      c.fillRect(x + 38, y - 44, 10, 18);
      c.fillRect(x + 50, y - 28, 7, 13);
    }
  }

  drawClock(c, game) {
    const centerX = 480, centerY = 240;
    const p = clamp(game.time / TUNING.justMs, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    c.fillStyle = '#fff8df';
    c.beginPath(); c.arc(centerX, centerY, 118, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b2220'; c.lineWidth = 8; c.stroke();
    c.save();
    c.translate(centerX, centerY);
    c.rotate(-Math.PI / 2 + p * Math.PI * 2);
    c.strokeStyle = '#d13b2f';
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(92, 0); c.stroke();
    c.restore();
    c.fillStyle = '#2b2220';
    c.font = '900 46px Arial';
    c.textAlign = 'center';
    c.fillText('18:00:00', centerX, centerY + 170);
    c.textAlign = 'left';
    if (game.justJudge) this.drawSlowMo(c, game);
  }

  drawSlowMo(c, game) {
    const t = 1 - clamp(game.time / Math.max(1, game.justSlow), 0, 1);
    c.globalAlpha = 0.8 * t;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 8;
    c.beginPath(); c.arc(390, 330, 60 + (1 - t) * 260, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff8df';
    for (let i = 0; i < 12; i++) c.fillRect(210 + i * 36, 170 + Math.sin(i) * 32, 28, 8);
    c.globalAlpha = 1;
  }

  drawDash(c, game) {
    const cam = game.runX - 260;
    c.fillStyle = '#5a6770';
    c.fillRect(0, 368, WORLD.w, 96);
    for (let x = -((cam * 0.7) % 120); x < WORLD.w; x += 120) {
      c.fillStyle = '#fff8df';
      c.fillRect(x, 406, 50, 6);
    }
    for (let i = 0; i < 34; i++) {
      const wx = i * 220 - cam;
      const zone = i < 10 ? '#7c8a95' : i < 17 ? '#9b8066' : i < 23 ? '#657887' : '#ffb15f';
      c.fillStyle = zone;
      c.fillRect(wx, 110, 180, 240);
      c.fillStyle = '#fff0b8';
      c.fillRect(wx + 24, 145, 42, 62);
      c.fillRect(wx + 94, 145, 42, 62);
    }
    this.drawRunner(c, 260, 332, game);
    for (const q of game.qtes) this.drawQte(c, q.x - cam, 318, q);
    if (game.runX > 4550) {
      c.fillStyle = 'rgba(255,255,255,0.72)';
      c.fillRect(760 - (game.runX - 4550) * 0.12, 0, 260, WORLD.h);
    }
  }

  drawRunner(c, x, y, game) {
    const run = Math.sin(game.time * 0.045);
    c.globalAlpha = 0.22;
    c.fillStyle = '#fff7bf';
    for (let i = 1; i <= 5; i++) c.fillRect(x - i * 24, y - 78 + i * 3, 44, 72);
    c.globalAlpha = 1;
    c.fillStyle = '#2b2220';
    c.fillRect(x - 16, y + 48, 16, 40 + run * 10);
    c.fillRect(x + 18, y + 48, 16, 40 - run * 10);
    c.fillStyle = '#2f75bd';
    c.fillRect(x - 30, y - 8, 62, 62);
    c.fillStyle = '#f1c6a0';
    c.fillRect(x - 18, y - 56, 42, 42);
    c.fillStyle = '#d44335';
    c.fillRect(x - 58, y + 2 + run * 8, 42, 14);
  }

  drawQte(c, x, y, q) {
    if (x < -80 || x > WORLD.w + 120) return;
    const colors = { coworker: '#76d4ff', papers: '#fff8df', elevator: '#ffe05d', wax: '#91ffb0', director: '#ff6b6b' };
    c.fillStyle = colors[q.type] || '#fff';
    c.fillRect(x - 34, y - 72, 68, 68);
    c.fillStyle = '#2b2220';
    c.font = '900 16px Arial';
    c.textAlign = 'center';
    c.fillText(q.type === 'coworker' ? '？' : q.type === 'papers' ? '紙' : q.type === 'elevator' ? 'EV' : q.type === 'director' ? '部' : 'WAX', x, y - 31);
    c.strokeStyle = Math.abs(q.dist) < 90 ? '#fff' : '#2b2220';
    c.lineWidth = 4;
    c.strokeRect(x - 44, y - 82, 88, 88);
    c.textAlign = 'left';
  }

  drawForeground(c, game) {
    if (game.flashMs > 0 && game.flashText) {
      c.save();
      c.globalAlpha = clamp(game.flashMs / 280, 0, 1);
      c.fillStyle = '#fff';
      c.strokeStyle = '#2b2220';
      c.lineWidth = 8;
      c.font = '900 44px Arial';
      c.textAlign = 'center';
      c.strokeText(game.flashText, 480, 104);
      c.fillText(game.flashText, 480, 104);
      c.restore();
    }
  }

  drawEffects(c, dtMs) {
    for (const e of this.effects) {
      e.life -= dtMs;
      const t = clamp(e.life / e.max, 0, 1);
      c.globalAlpha = t;
      if (e.kind === 'text') {
        c.fillStyle = e.color;
        c.strokeStyle = '#2b2220';
        c.lineWidth = 6;
        c.font = `900 ${e.size + (1 - t) * 20}px Arial`;
        c.textAlign = 'center';
        c.strokeText(e.text, e.x, e.y - (1 - t) * 40);
        c.fillText(e.text, e.x, e.y - (1 - t) * 40);
        c.textAlign = 'left';
      } else {
        e.x += e.vx * dtMs / 1000;
        e.y += e.vy * dtMs / 1000;
        e.vy += 300 * dtMs / 1000;
        c.fillStyle = e.color;
        c.fillRect(e.x, e.y, 9, 9);
      }
      c.globalAlpha = 1;
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }
}
