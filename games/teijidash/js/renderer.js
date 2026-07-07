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
    if (type === 'caught') { this.smallBurst(604, 184, '発見!!', '#ff4d4d'); this.shake = 24; }
    if (type === 'bossWarn') this.smallBurst(658, 150, 'ピクッ', '#fff8df');
    if (type === 'just') this.shake = data.judge === 'PERFECT' ? 32 : 20;
    if (type === 'qteSuccess') { this.smallBurst(480, 270, data.qte.type === 'coworker' ? 'はやっ…' : 'OK!', '#fff2a4'); this.shake = 10; }
    if (type === 'qteFail') { this.smallBurst(480, 270, data.qte.type === 'coworker' ? '捕獲!' : 'ドサッ!', '#ff7b7b'); this.shake = 22; }
  }

  smallBurst(x, y, text, color) {
    this.effects.push({ kind: 'text', x, y, text, color, size: 18, life: 600, max: 600 });
    for (let i = 0; i < 12; i++) this.effects.push({ kind: 'bit', x, y, vx: Math.cos(i) * 120, vy: Math.sin(i * 2.2) * 90 - 40, color, life: 520, max: 520 });
  }

  render(game, dtMs) {
    this.shake = Math.max(0, this.shake - dtMs * 0.06);
    const c = this.ctx;
    c.save();
    c.clearRect(0, 0, innerWidth, innerHeight);
    c.translate(this.ox, this.oy);
    c.scale(this.scale, this.scale);
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawScene(c, game);
    this.drawEffects(c, dtMs);
    c.restore();
  }

  drawScene(c, game) {
    this.drawSky(c, game);
    if (game.act === ACT.DASH) this.drawDash(c, game);
    else if (game.act === ACT.FINALE) this.drawFinale(c, game);
    else if (game.act === ACT.DAY_RESULT) this.drawDayResult(c, game);
    else if (game.act === ACT.WEEK_RESULT) this.drawWeekResult(c, game);
    else this.drawOffice(c, game);
    this.drawForeground(c, game);
    if (game.act === ACT.INTERLUDE) this.drawInterlude(c, game);
  }

  drawSky(c, game) {
    const dash = game.act === ACT.DASH || game.act === ACT.FINALE || game.act === ACT.DAY_RESULT || game.act === ACT.WEEK_RESULT;
    const g = c.createLinearGradient(0, 0, 0, WORLD.h);
    g.addColorStop(0, dash ? '#ff9c65' : '#526f8c');
    g.addColorStop(0.58, dash ? '#ffd184' : '#e3a35b');
    g.addColorStop(1, '#29313b');
    c.fillStyle = g;
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    if (dash) {
      c.globalAlpha = 0.28 + clamp(game.maxCombo / 10, 0, 0.42);
      c.fillStyle = '#fff2a1';
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.moveTo(760, 48);
        c.lineTo(40 + i * 120, 540);
        c.lineTo(105 + i * 120, 540);
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
    if (game.act === ACT.JUST_SLOW) this.drawJustSlow(c, game);
    else {
      this.drawPlayer(c, 360, 312, game);
      if (game.act === ACT.JUST) this.drawClock(c, game);
    }
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
    const freeze = game.bossLooking;
    const pcJitter = game.inputDown && !freeze && game.prepStage === 0 ? Math.sin(game.time * 0.09) * 9 : 0;
    c.fillRect(x - 84 + pcJitter, y - 18 - Math.abs(pcJitter) * 0.4, 76, 56);
    c.fillStyle = game.prepStage > 0 ? '#101010' : '#96d7ff';
    c.fillRect(x - 76 + pcJitter, y - 10 - Math.abs(pcJitter) * 0.4, 60, 34);
    if (game.inputDown && game.prepStage === 0 && game.prepAnim.age < 260) {
      c.fillStyle = 'rgba(60,60,60,0.45)';
      c.fillRect(x - 25, y - 34 - game.prepAnim.age * 0.08, 18, 10);
      c.fillRect(x - 8, y - 44 - game.prepAnim.age * 0.06, 13, 8);
    }
    c.fillStyle = '#fff8df';
    const wobble = freeze && game.caught ? Math.sin(game.time * 0.045) * 4 : 0;
    for (let i = 0; i < 7; i++) c.fillRect(x + 42 + wobble, y + 30 - i * 8, 80, 7);
    c.fillStyle = '#2b2220';
    c.fillRect(x + 122, y + 18, 44, 28);
  }

  drawPlayer(c, x, y, game) {
    const freeze = game.bossLooking;
    const moving = game.inputDown && !freeze;
    if (moving && game.prepStage === 1) this.drawFlyingPapers(c, x, y, game, false);
    this.drawHuman(c, x, y, { suit: '#2f75bd', hair: '#35251f', pose: freeze ? 'work' : moving ? 'wild' : 'stand', t: game.time });
    if (moving) this.drawPrepStageAnimation(c, x, y, game);
    if (freeze) {
      c.fillStyle = '#66d7ff';
      c.fillRect(x + 40, y - 46, 12, 20);
      c.fillRect(x + 55, y - 28, 8, 14);
      this.drawFlyingPapers(c, x, y, game, true);
    }
  }

  drawPrepStageAnimation(c, x, y, game) {
    const age = game.prepAnim.age;
    const pulse = Math.sin(game.time * 0.05);
    if (game.prepStage === 1) return;
    if (game.prepStage === 2) {
      const inflate = 1 + 0.18 * Math.sin(game.time * 0.035);
      c.fillStyle = '#2b2220';
      c.fillRect(x + 54, y + 18 - inflate * 8, 70 * inflate, 48 * inflate);
      c.strokeStyle = '#ffe05d';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x + 58, y + 24);
      c.lineTo(x + 120 + pulse * 8, y + 2 + pulse * 4);
      c.stroke();
    } else if (game.prepStage === 3) {
      const t = (age % 640) / 640;
      c.save();
      c.translate(x - 8, y - 50);
      c.rotate(t * Math.PI * 2);
      c.fillStyle = '#d44335';
      c.fillRect(-72, -14, 144, 28);
      c.restore();
      if (t > 0.72) {
        c.fillStyle = '#d44335';
        c.fillRect(x - 42, y - 6, 86, 58);
      }
    }
  }

  drawFlyingPapers(c, x, y, game, frozen) {
    const age = frozen ? 360 : game.prepAnim.age;
    c.fillStyle = '#fff8df';
    for (let i = 0; i < 12; i++) {
      const local = (age + i * 90) % 900;
      const t = local / 900;
      const sx = x - 70 + i * 4;
      const sy = y - 60 + (i % 3) * 8;
      const bx = x + 126;
      const by = y + 38;
      const px = lerp(sx, bx, easeInOut(t)) + Math.sin(t * Math.PI * 2 + i) * 28;
      const py = lerp(sy, by, t) - Math.sin(t * Math.PI) * 140;
      c.save();
      c.translate(px, py);
      c.rotate((frozen ? 0.8 : t * 8) + i);
      c.fillRect(-13, -5, 26, 10);
      c.restore();
    }
  }

  drawHuman(c, x, y, opt) {
    const t = opt.t || 0;
    const run = Math.sin(t * 0.045);
    const wild = opt.pose === 'wild';
    const work = opt.pose === 'work';
    c.fillStyle = '#2b2220';
    const legA = wild ? run * 12 : 0;
    c.fillRect(x - 18, y + 54, 16, 44 + legA);
    c.fillRect(x + 15, y + 54, 16, 44 - legA);
    c.fillStyle = opt.suit || '#2f75bd';
    c.fillRect(x - 28, y + 2, 62, 62);
    c.fillStyle = '#f1c6a0';
    c.fillRect(x - 20, y - 50, 44, 44);
    c.fillStyle = opt.hair || '#35251f';
    c.fillRect(x - 24, y - 58, 52, 18);
    c.fillStyle = '#fff';
    c.fillRect(x - 8, y - 33, 8, 7);
    c.fillRect(x + 12, y - 33, 8, 7);
    c.fillStyle = '#2b2220';
    c.fillRect(x - 3, y - 18, work ? 20 : 16, 5);
    c.fillStyle = opt.suit || '#2f75bd';
    if (work) {
      c.fillRect(x - 64, y + 8, 36, 12);
      c.fillRect(x + 32, y + 8, 36, 12);
    } else if (wild) {
      c.fillRect(x - 72, y - 4 + run * 10, 48, 12);
      c.fillRect(x + 28, y - 6 - run * 10, 52, 12);
    }
  }

  drawClock(c, game) {
    const centerX = 480, centerY = 240;
    const p = clamp(game.time / TUNING.justMs, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    c.fillStyle = '#fff8df';
    c.beginPath(); c.arc(centerX, centerY, 122, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b2220'; c.lineWidth = 8; c.stroke();
    c.save();
    c.translate(centerX, centerY);
    c.rotate(-Math.PI / 2 + p * Math.PI * 2);
    c.strokeStyle = '#d13b2f';
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(94, 0); c.stroke();
    c.restore();
    c.fillStyle = '#2b2220';
    c.font = '900 46px Arial';
    c.textAlign = 'center';
    c.fillText('18:00:00', centerX, centerY + 170);
    c.textAlign = 'left';
  }

  drawJustSlow(c, game) {
    const flash = game.time < TUNING.justFlashMs;
    const freeze = game.time >= TUNING.justFlashMs && game.time < TUNING.justFlashMs + TUNING.justFreezeMs;
    const slowAge = Math.max(0, game.time - TUNING.justFlashMs - TUNING.justFreezeMs);
    const t = clamp(slowAge / Math.max(1, game.justSlow), 0, 1);
    const slowT = freeze ? 0 : t;
    c.fillStyle = 'rgba(0,0,0,0.44)';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    for (let i = 0; i < 6; i++) {
      c.globalAlpha = 0.16 + i * 0.05;
      this.drawRunner(c, 358 - i * (18 + slowT * 18), 326, game, true);
    }
    c.globalAlpha = 1;
    this.drawRunner(c, 368 + slowT * 210, 326 - slowT * 18, game, true);
    c.save();
    c.translate(250 - slowT * 180, 330 - slowT * 120);
    c.rotate(-slowT * 1.2);
    c.fillStyle = '#6b4b34';
    c.fillRect(-28, -16, 56, 32);
    c.fillStyle = '#2b2220';
    c.fillRect(-24, 16, 8, 42);
    c.fillRect(16, 16, 8, 42);
    c.restore();
    c.fillStyle = '#fff8df';
    for (let i = 0; i < 18; i++) {
      c.save();
      c.translate(230 + i * 31 + slowT * (80 + i * 8), 170 + Math.sin(i) * 22 + slowT * (i % 2 ? 38 : -28));
      c.rotate(slowT * 4 + i);
      c.fillRect(-14, -5, 28, 10);
      c.restore();
    }
    this.drawCoworkerHeadTurn(c, 690, 310, slowT);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 8;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(430 + slowT * 120, 292, 55 + slowT * 320, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = '#fff';
    c.strokeStyle = '#2b2220';
    c.lineWidth = 8;
    c.font = '900 58px Arial';
    c.textAlign = 'center';
    const title = game.justJudge === 'PERFECT' ? '音速定時!!' : game.justJudge;
    c.strokeText(title, 480, 118);
    c.fillText(title, 480, 118);
    c.font = '900 30px Arial';
    c.fillStyle = '#fff2a4';
    c.strokeText(game.justStamp || '', 480, 160);
    c.fillText(game.justStamp || '', 480, 160);
    c.textAlign = 'left';
    if (flash) {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, WORLD.w, WORLD.h);
    }
  }

  drawCoworkerHeadTurn(c, x, y, t) {
    this.drawHuman(c, x, y, { suit: '#58a66a', hair: '#4a2e22', pose: 'stand', t: 0 });
    c.fillStyle = '#2b2220';
    c.fillRect(x - 14 + t * 20, y - 34, 8, 7);
    c.fillRect(x + 6 + t * 14, y - 34, 8, 7);
  }

  drawDash(c, game) {
    const cam = game.runX - 260;
    c.fillStyle = '#5a6770';
    c.fillRect(0, 368, WORLD.w, 96);
    for (let x = -((cam * 0.7) % 120); x < WORLD.w; x += 120) {
      c.fillStyle = '#fff8df';
      c.fillRect(x, 406, 50, 6);
    }
    for (let i = 0; i < 36; i++) {
      const wx = i * 220 - cam;
      const zone = i < 10 ? '#7c8a95' : i < 17 ? '#9b8066' : i < 23 ? '#657887' : '#ffb15f';
      c.fillStyle = zone;
      c.fillRect(wx, 110, 180, 240);
      c.fillStyle = '#fff0b8';
      c.fillRect(wx + 24, 145, 42, 62);
      c.fillRect(wx + 94, 145, 42, 62);
    }
    this.drawEntrance(c, TUNING.finaleDoorX - cam, 0, game, 0);
    this.drawRunner(c, 260, 332, game, false);
    for (const q of game.qtes) this.drawObstacle(c, q.x - cam, 318, q, game);
    this.drawDashJudgeHud(c, game);
    if (game.runX > 4550) {
      c.fillStyle = 'rgba(255,255,255,0.72)';
      c.fillRect(760 - (game.runX - 4550) * 0.12, 0, 260, WORLD.h);
      c.fillStyle = '#2b2220';
      c.font = '900 28px Arial';
      c.fillText('EXIT', 790 - (game.runX - 4550) * 0.12, 110);
    }
  }

  drawFinale(c, game) {
    const t = clamp(game.time / TUNING.finaleMs, 0, 1);
    const freezeStart = TUNING.finaleFreezeStartMs / TUNING.finaleMs;
    const freezeEnd = (TUNING.finaleFreezeStartMs + TUNING.finaleFreezeMs) / TUNING.finaleMs;
    const cam = lerp(game.runX - 300, TUNING.finaleDoorX - 470, easeOut(clamp(t * 1.6, 0, 1)));
    c.fillStyle = '#4f5962';
    c.fillRect(0, 368, WORLD.w, 96);
    for (let x = -((cam * 0.8) % 105); x < WORLD.w; x += 105) {
      c.fillStyle = '#fff8df';
      c.fillRect(x, 406, 44, 6);
    }
    for (let i = 0; i < 34; i++) {
      const wx = i * 220 - cam;
      const zone = i < 24 ? '#657887' : '#ffb15f';
      c.fillStyle = zone;
      c.fillRect(wx, 110, 180, 240);
      c.fillStyle = '#fff0b8';
      c.fillRect(wx + 24, 145, 42, 62);
      c.fillRect(wx + 94, 145, 42, 62);
    }
    const doorX = TUNING.finaleDoorX - cam;
    this.drawEntrance(c, doorX, 0, game, t);
    this.drawFinaleLight(c, game, t);
    const runner = this.finaleRunnerPose(t, game);
    for (let i = 1; i <= 7; i++) {
      c.globalAlpha = (game.finaleGrade === 'perfect' ? 0.16 : 0.1) * (1 - i / 8);
      this.drawRunner(c, runner.x - i * (24 + t * 12), runner.y + i * 2, game, true);
    }
    c.globalAlpha = 1;
    if (t >= freezeStart && t <= freezeEnd) this.drawFinaleSilhouette(c, runner.x, runner.y, game);
    else if (t > freezeEnd) this.drawFinaleLanding(c, runner.x, runner.y, game, t);
    else this.drawRunner(c, runner.x, runner.y, game, false);
    this.drawFinaleConfetti(c, game, t);
    if (t >= freezeStart && t <= freezeEnd + 0.12) this.drawFinaleCalligraphy(c, game);
    this.drawDashJudgeHud(c, game);
  }

  finaleRunnerPose(t, game) {
    const freezeStart = TUNING.finaleFreezeStartMs / TUNING.finaleMs;
    const freezeEnd = (TUNING.finaleFreezeStartMs + TUNING.finaleFreezeMs) / TUNING.finaleMs;
    if (t < freezeStart) return { x: lerp(210, 478, easeOut(t / freezeStart)), y: lerp(332, 250, easeOut(t / freezeStart)) };
    if (t < freezeEnd) return { x: 512, y: 214 };
    const landT = clamp((t - freezeEnd) / (1 - freezeEnd), 0, 1);
    return { x: lerp(512, 600, easeOut(landT)), y: lerp(214, game.hits ? 338 : 324, easeOut(landT)) };
  }

  drawEntrance(c, x, y, game, finaleT) {
    if (x < -260 || x > WORLD.w + 260) return;
    c.fillStyle = '#303a45';
    c.fillRect(x - 150, y + 88, 300, 280);
    c.fillStyle = '#fff8df';
    c.fillRect(x - 128, y + 104, 256, 54);
    c.fillStyle = '#2b2220';
    c.font = '900 26px Arial';
    c.textAlign = 'center';
    c.fillText(game.day === 4 ? '定時商事 本社' : '夕焼け商事', x, y + 140);
    const open = clamp((finaleT - 0.18) / 0.22, 0, 1);
    c.fillStyle = 'rgba(170,230,255,0.62)';
    c.fillRect(x - 106, y + 170, 212, 196);
    c.fillStyle = '#bfeaff';
    c.fillRect(x - 106, y + 170, 106 * (1 - open), 196);
    c.fillRect(x + 106 - 106 * (1 - open), y + 170, 106 * (1 - open), 196);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 5;
    c.strokeRect(x - 106, y + 170, 212, 196);
    if (finaleT > 0.28 && finaleT < 0.56) {
      c.strokeStyle = '#fff';
      c.lineWidth = 6;
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.moveTo(x, y + 258);
        c.lineTo(x + Math.cos(i) * 170, y + 258 + Math.sin(i) * 130);
        c.stroke();
      }
    }
  }

  drawFinaleLight(c, game, t) {
    c.globalAlpha = 0.28 + t * 0.44;
    c.fillStyle = '#ffd16d';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    c.globalAlpha = game.finaleGrade === 'perfect' ? 0.36 : 0.2;
    const colors = game.day === 4 || game.finaleGrade === 'perfect' ? ['#ff4d4d', '#ffe05d', '#58d68d', '#76d4ff', '#c77dff'] : ['#fff2a1'];
    for (let i = 0; i < 10; i++) {
      c.fillStyle = colors[i % colors.length];
      c.beginPath();
      c.moveTo(742, 54);
      c.lineTo(i * 110 - 120, 540);
      c.lineTo(i * 110 - 52, 540);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  drawFinaleSilhouette(c, x, y, game) {
    c.save();
    c.translate(x, y);
    c.fillStyle = '#101010';
    c.fillRect(-16, 42, 14, 52);
    c.fillRect(18, 42, 14, 52);
    c.fillRect(-32, -12, 66, 62);
    c.fillRect(-74, -30, 54, 14);
    c.fillRect(24, -46, 58, 14);
    c.fillRect(-22, -62, 46, 46);
    c.restore();
  }

  drawFinaleLanding(c, x, y, game, t) {
    const wobble = game.hits ? Math.sin(t * 44) * 7 : 0;
    this.drawHuman(c, x + wobble, y, { suit: game.hits ? '#2f75bd' : '#d44335', hair: '#35251f', pose: 'work', t: game.time });
    c.fillStyle = '#fff8df';
    c.fillRect(x - 76 + wobble, y - 8, 48, 12);
    c.fillRect(x + 32 + wobble, y - 8, 48, 12);
    if (game.hits) {
      c.fillStyle = '#66d7ff';
      c.fillRect(x + 46 + wobble, y - 54, 12, 18);
    }
  }

  drawFinaleConfetti(c, game, t) {
    const count = (game.day === 4 ? 70 : 42) + (game.finaleGrade === 'perfect' ? 28 : 0);
    const colors = ['#fff8df', '#ffe05d', '#ff7b7b', '#76d4ff', '#91ffb0'];
    for (let i = 0; i < count; i++) {
      const px = (i * 83 + t * 520 * (1 + (i % 5) * 0.1)) % WORLD.w;
      const py = (80 + i * 29 + t * 420) % 420;
      c.save();
      c.translate(px, py);
      c.rotate(i + t * 8);
      c.fillStyle = colors[i % colors.length];
      c.fillRect(-8, -4, 16, 8);
      c.restore();
    }
  }

  drawFinaleCalligraphy(c, game) {
    c.fillStyle = '#fff';
    c.strokeStyle = '#2b2220';
    c.lineWidth = 10;
    c.font = '900 82px Arial';
    c.textAlign = 'center';
    const text = game.finaleGrade === 'perfect' ? '完全退社!!' : '退社!!';
    c.strokeText(text, 480, 134);
    c.fillText(text, 480, 134);
    c.textAlign = 'left';
  }

  drawRunner(c, x, y, game, slow) {
    const oldAlpha = c.globalAlpha;
    const run = Math.sin((game.time || 0) * (slow ? 0.01 : 0.045));
    c.globalAlpha = oldAlpha * 0.9;
    c.fillStyle = '#fff7bf';
    for (let i = 1; i <= 4; i++) c.fillRect(x - i * 22, y - 78 + i * 3, 40, 70);
    c.globalAlpha = oldAlpha;
    c.fillStyle = '#2b2220';
    c.fillRect(x - 16, y + 48, 16, 40 + run * 10);
    c.fillRect(x + 18, y + 48, 16, 40 - run * 10);
    c.fillStyle = '#2f75bd';
    c.fillRect(x - 30, y - 8, 62, 62);
    c.fillStyle = '#f1c6a0';
    c.fillRect(x - 18, y - 56, 42, 42);
    c.fillStyle = '#35251f';
    c.fillRect(x - 22, y - 62, 48, 16);
    c.fillStyle = '#d44335';
    c.fillRect(x - 58, y + 2 + run * 8, 42, 14);
    c.globalAlpha = oldAlpha;
  }

  drawObstacle(c, x, y, q, game) {
    if (x < -180 || x > WORLD.w + 200) return;
    if (q.failedBind > 0) this.drawFailReaction(c, x, y, q);
    else if (q.type === 'coworker') this.drawCoworkerObstacle(c, x, y, q, game);
    else if (q.type === 'papers') this.drawPapersObstacle(c, x, y, q, game);
    else if (q.type === 'elevator') this.drawElevatorObstacle(c, x, y, q, game);
    else if (q.type === 'wax') this.drawWaxObstacle(c, x, y, q, game);
    else this.drawDirectorObstacle(c, x, y, q, game);
    this.drawTimingRing(c, x, y - 86, q);
  }

  drawTimingRing(c, x, y, q) {
    const dist = Math.abs(q.dist);
    const r = 22 + clamp(dist / 260, 0, 1) * 52;
    c.strokeStyle = dist < 65 ? '#fff' : '#ffe05d';
    c.lineWidth = 5;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#2b2220';
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.stroke();
    if (q.taps > 1) {
      c.fillStyle = '#fff';
      c.font = '900 20px Arial';
      c.textAlign = 'center';
      c.fillText('x' + q.taps, x, y + 7);
      c.textAlign = 'left';
    }
  }

  drawCoworkerObstacle(c, x, y, q, game) {
    this.drawHuman(c, x, y, { suit: q.variant % 2 ? '#8e58a6' : '#58a66a', hair: q.variant > 1 ? '#1f1a19' : '#8b5a2b', pose: 'wild', t: game.time + q.wobble * 100 });
    if (q.pair) this.drawHuman(c, x + 44, y + 4, { suit: '#c66c54', hair: '#202020', pose: 'stand', t: game.time });
    this.drawSpeech(c, x, y - 120, 'ちょっといい？');
  }

  drawPapersObstacle(c, x, y, q, game) {
    this.drawHuman(c, x - 80, y + 4, { suit: '#6688aa', hair: '#2b2220', pose: 'stand', t: game.time });
    c.fillStyle = '#6b4b34';
    c.fillRect(x - 36, y + 24, 86, 38);
    c.fillStyle = '#fff8df';
    for (let i = 0; i < 12; i++) c.fillRect(x - 24 + (i % 3) * 24, y - 88 + Math.floor(i / 3) * 24 + Math.sin(game.time * 0.02 + i) * 4, 42, 16);
    for (let i = 0; i < 6; i++) {
      c.save(); c.translate(x - 16 + i * 18, y - 22 + Math.sin(i + game.time * 0.03) * 18); c.rotate(i + game.time * 0.002); c.fillRect(-14, -5, 28, 10); c.restore();
    }
  }

  drawElevatorObstacle(c, x, y, q, game) {
    const close = clamp(1 - Math.abs(q.dist) / 520, 0, 0.86);
    c.fillStyle = '#44505c';
    c.fillRect(x - 70, y - 130, 140, 170);
    c.fillStyle = '#d8dee8';
    c.fillRect(x - 58, y - 116, 116, 148);
    c.fillStyle = '#727d8c';
    c.fillRect(x - 58, y - 116, 58 * close, 148);
    c.fillRect(x + 58 - 58 * close, y - 116, 58 * close, 148);
    c.fillStyle = '#ffe05d';
    c.fillRect(x - 9, y - 142, 18, 10);
    c.fillStyle = '#2b2220';
    c.font = '900 20px Arial';
    c.textAlign = 'center';
    c.fillText('EV', x, y - 150);
    c.textAlign = 'left';
  }

  drawWaxObstacle(c, x, y, q, game) {
    this.drawHuman(c, x - 70, y + 2, { suit: '#4c9b93', hair: '#2b2220', pose: 'stand', t: game.time });
    c.fillStyle = '#ffe05d';
    c.beginPath(); c.moveTo(x - 10, y - 74); c.lineTo(x + 46, y + 26); c.lineTo(x - 66, y + 26); c.fill();
    c.fillStyle = '#2b2220';
    c.font = '900 16px Arial';
    c.textAlign = 'center';
    c.fillText('清掃中', x - 10, y - 12);
    c.textAlign = 'left';
    c.globalAlpha = 0.45;
    c.fillStyle = '#d9fff3';
    c.fillRect(x - 100, y + 38, 200, 28);
    c.globalAlpha = 1;
  }

  drawDirectorObstacle(c, x, y, q, game) {
    c.globalAlpha = 0.32;
    c.fillStyle = '#ff4d4d';
    c.beginPath(); c.arc(x, y - 38, 92 + Math.sin(game.time * 0.02) * 10, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    this.drawHuman(c, x, y - 10, { suit: '#202020', hair: '#111', pose: 'work', t: game.time });
    c.fillStyle = '#fff8df';
    c.fillRect(x - 34, y - 12, 68, 18);
    c.fillStyle = '#2b2220';
    c.font = '900 14px Arial';
    c.textAlign = 'center';
    c.fillText('部長', x, y + 2);
    c.textAlign = 'left';
  }

  drawSpeech(c, x, y, text) {
    c.fillStyle = '#fff8df';
    c.strokeStyle = '#2b2220';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(x - 76, y - 28, 152, 42, 8);
    c.fill(); c.stroke();
    c.fillStyle = '#2b2220';
    c.font = '900 18px Arial';
    c.textAlign = 'center';
    c.fillText(text, x, y - 1);
    c.textAlign = 'left';
  }

  drawFailReaction(c, x, y, q) {
    c.fillStyle = '#fff8df';
    for (let i = 0; i < 22; i++) {
      c.save(); c.translate(x + Math.cos(i) * (20 + i * 3), y - 40 + Math.sin(i * 2) * (20 + i * 2)); c.rotate(i); c.fillRect(-12, -5, 24, 10); c.restore();
    }
    c.fillStyle = '#ff7b7b';
    c.beginPath(); c.arc(x, y - 30, 42, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b2220';
    c.font = '900 28px Arial';
    c.textAlign = 'center';
    c.fillText('×_×', x, y - 20);
    c.textAlign = 'left';
  }

  drawDashJudgeHud(c, game) {
    if (!game.justJudge) return;
    c.fillStyle = 'rgba(43,34,32,0.78)';
    c.fillRect(690, 82, 238, 54);
    c.fillStyle = '#fff2a4';
    c.font = '900 18px Arial';
    c.fillText(game.justJudge, 706, 105);
    c.fillStyle = '#fff';
    c.font = '800 15px Arial';
    c.fillText(game.justStamp || '', 706, 126);
  }

  drawDayResult(c, game) {
    const r = game.dayResult || {};
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    const t = game.time;
    const cardY = lerp(-260, 78, easeOut(clamp(t / 700, 0, 1)));
    c.fillStyle = '#fff8df';
    c.strokeStyle = '#2b2220';
    c.lineWidth = 6;
    c.fillRect(260, cardY, 440, 330);
    c.strokeRect(260, cardY, 440, 330);
    c.fillStyle = '#2b2220';
    c.font = '900 28px Arial';
    c.fillText(`${DAY_JP[r.day || 0]}曜 タイムカード`, 302, cardY + 48);
    c.font = '900 34px Arial';
    c.fillText(r.stamp || fmtStamp(0), 302, cardY + 104);
    if (t > 760) {
      c.save();
      c.translate(522, cardY + 170);
      c.rotate(-0.18);
      c.strokeStyle = (r.rank || '').startsWith('S') ? '#d6a200' : '#d44335';
      c.fillStyle = 'rgba(255,255,255,0.0)';
      c.lineWidth = 8;
      c.strokeRect(-132, -34, 264, 68);
      c.fillStyle = c.strokeStyle;
      c.font = '900 34px Arial';
      c.textAlign = 'center';
      c.fillText(r.rank || '', 0, 12);
      c.restore();
    }
    c.fillStyle = '#2b2220';
    c.font = '900 20px Arial';
    const lines = [
      `支度 ${r.prep || 0}%`,
      `判定 ${r.judge || '-'} ${r.offset >= 0 ? '+' : ''}${r.offset || 0}ms`,
      `最大コンボ ${r.combo || 0} / 被弾 ${r.hits || 0}`,
      `SCORE ${(r.score || 0).toLocaleString('en-US')}`,
    ];
    for (let i = 0; i < Math.min(game.resultLines, lines.length); i++) c.fillText(lines[i], 316, cardY + 214 + i * 30);
    if (t > TUNING.resultInputLockMs) {
      c.fillStyle = '#fff2a4';
      c.font = '900 20px Arial';
      c.textAlign = 'center';
      c.fillText(game.day >= 4 ? '押すと週間リザルトへ' : '押すと翌日へ', 480, 468);
      c.textAlign = 'left';
    }
  }

  drawWeekResult(c, game) {
    const r = game.result();
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    c.fillStyle = '#fff8df';
    c.strokeStyle = '#2b2220';
    c.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      const x = 92 + i * 156;
      c.fillRect(x, 132, 128, 190);
      c.strokeRect(x, 132, 128, 190);
      const d = r.days[i] || {};
      c.fillStyle = '#2b2220';
      c.font = '900 20px Arial';
      c.fillText(DAY_JP[i], x + 16, 166);
      c.font = '900 18px Arial';
      c.fillText(d.rank || '-', x + 16, 210);
      c.font = '800 14px Arial';
      c.fillText(String(d.score || 0), x + 16, 244);
      c.fillStyle = '#fff8df';
    }
    c.save();
    c.translate(480, 388);
    c.rotate(-0.12);
    c.strokeStyle = '#d44335';
    c.lineWidth = 8;
    c.strokeRect(-190, -46, 380, 92);
    c.fillStyle = '#d44335';
    c.font = '900 42px Arial';
    c.textAlign = 'center';
    c.fillText(r.title, 0, 14);
    c.restore();
    c.fillStyle = '#fff';
    c.font = '900 24px Arial';
    c.textAlign = 'center';
    c.fillText(`週間 ${r.weekScore.toLocaleString('en-US')} / BEST ${r.best.toLocaleString('en-US')}`, 480, 468);
    c.fillText(`今週の残業時間 ${r.overtime}`, 480, 502);
    c.textAlign = 'left';
  }

  drawInterlude(c, game) {
    const p = clamp(game.time / TUNING.interludeMs, 0, 1);
    const band = Math.sin(p * Math.PI) * 1.15;
    c.fillStyle = '#050505';
    c.fillRect(0, 0, WORLD.w * band, 120);
    c.fillRect(WORLD.w * (1 - band), 420, WORLD.w * band, 120);
    c.fillRect(0, 190, WORLD.w, 160);
    c.fillStyle = '#fff8df';
    c.strokeStyle = '#4a2d1e';
    c.lineWidth = 8;
    c.font = '900 58px Arial';
    c.textAlign = 'center';
    const title = ACT_TITLES[game.interludeTarget] || '';
    c.strokeText(title, 480, 286);
    c.fillText(title, 480, 286);
    c.textAlign = 'left';
  }

  drawForeground(c, game) {
    if (game.flashMs > 0 && game.flashText && game.act !== ACT.JUST_SLOW && game.act !== ACT.INTERLUDE && game.act !== ACT.DAY_RESULT) {
      c.save();
      c.globalAlpha = clamp(game.flashMs / 260, 0, 1);
      c.fillStyle = '#fff';
      c.strokeStyle = '#2b2220';
      c.lineWidth = 7;
      c.font = '900 34px Arial';
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
        c.lineWidth = 4;
        c.font = `900 ${e.size + (1 - t) * 10}px Arial`;
        c.textAlign = 'center';
        c.strokeText(e.text, e.x, e.y - (1 - t) * 26);
        c.fillText(e.text, e.x, e.y - (1 - t) * 26);
        c.textAlign = 'left';
      } else {
        e.x += e.vx * dtMs / 1000;
        e.y += e.vy * dtMs / 1000;
        e.vy += 300 * dtMs / 1000;
        c.fillStyle = e.color;
        c.fillRect(e.x, e.y, 8, 8);
      }
      c.globalAlpha = 1;
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }
}
