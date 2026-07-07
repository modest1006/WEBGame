// ゲームロジック本体。DOM/Canvas/Audio非依存 — update(dtMs) で決定論的に進む。
// 依存: constants.js, rng.js（読み込み順は index.html 参照）
class Game {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed;
    this.listeners = [];
    this.state = 'title'; // title | playing | levelup | paused | dead | clear
    this.mode = MODE_NORMAL;
    this.save = loadBeatSurvivorSave();
    this.settings = { ...this.save.settings };
    this.meta = normalizeMeta(this.save.meta);
    this.startLoadout = {};
    this.ctrl = { mx: 0, my: 0 }; // 移動入力（-1..1、input.jsが書き込む）
    this.resetRun();
  }

  on(fn) { this.listeners.push(fn); }

  // リスナー（UI/SFX/描画エフェクト）の例外でゲームループを道連れにしない
  emit(type, data = {}) {
    for (const fn of this.listeners) {
      try { fn(type, data); }
      catch (err) { console.error(`[game] listener error on '${type}':`, err); }
    }
  }

  resetRun() {
    this.rng = new RNG(this.seedValue);
    this.rawTime = 0;
    this.time = 0;
    this.beat = 0;
    this.audioBeat = 0;
    this.halfTick = 0;          // 経過した8分音符の数
    this.p = {
      x: 0, y: 0, r: PLAYER.r,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
      facing: 0, hurtCd: 0,
      dashT: 0, dashDx: 0, dashDy: 0, dashDist: 0, iframe: 0, dashCd: 0,
    };
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.weapons = { beatshot: 1 };
    this.passives = { amp: 0, speaker: 0, footwork: 0, battery: 0, metronome: 0 };
    this.runReviveUsed = false;
    this.level = 1;
    this.xp = 0;
    this.groove = 0;
    this.maxGrooveSeen = false;
    this.lastPerfectBeat = 0;
    this.kills = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, maxGroove: 0, dmgDealt: 0, bossRankSum: 0 };
    this.pendingLevels = 0;
    this.choices = [];
    this.spawnAcc = 0;
    this.spawnPressure = 0;
    this.hitStopT = 0;
    this.bossStopT = 0;
    this.bossDefeatPending = null;
    this.deathSlowT = 0;
    this.deathFadeT = 0;
    this.lastEnd = null;
    this._sepHead = null;
    this._sepNext = null;
    this._sepTouched = [];
    this.accentUntil = 0;   // このビートまで全攻撃がアクセント（PERFECTで更新）
    this.echoQueue = [];    // ビート境界で発動する残響攻撃（ノヴァ2連など）
    this.bossSpawned = false;
    this.bossRef = null;
    this.bossSpawns = 0;
    this.nextBossTime = BOSS_TIME;
    this.endlessTitleShown = false;
    this.nextId = 1;
    this.applyMetaLoadout();
  }

  setMode(mode) {
    this.mode = mode === MODE_ENDLESS ? MODE_ENDLESS : MODE_NORMAL;
    if (this.state === 'title' || this.state === 'dead' || this.state === 'clear') this.resetRun();
    return this.mode;
  }

  start(mode = this.mode, loadout = {}) {
    this.mode = mode === MODE_ENDLESS ? MODE_ENDLESS : MODE_NORMAL;
    this.startLoadout = loadout || {};
    this.resetRun();
    this.state = 'playing';
    this.emit('start', { mode: this.mode });
  }

  togglePause() {
    if (this.state === 'playing' || this.state === 'levelup') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'levelup') return false;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.emit('pause');
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = this.pausedFrom || 'playing';
    this.pausedFrom = null;
    this.lastPerfectBeat = this.beat;
    this.emit('resume');
    return true;
  }

  applyMetaLoadout() {
    const recordLv = this.gearLv('record_bag');
    if (recordLv > 0) {
      const weapon = WEAPONS[this.startLoadout?.weapon] ? this.startLoadout.weapon : 'beatshot';
      this.weapons = { [weapon]: recordLv >= 2 ? 2 : 1 };
      if (recordLv >= 3) {
        const passive = PASSIVES[this.startLoadout?.passive] ? this.startLoadout.passive : 'amp';
        this.passives[passive] = Math.max(this.passives[passive] || 0, 1);
      }
    }
    const hpBonus = this.gearLv('power_core') * 10;
    if (hpBonus > 0) {
      this.p.maxHp += hpBonus;
      this.p.hp = this.p.maxHp;
    }
  }

  grooveMult() { return 1 + Math.min(this.groove, GROOVE_MAX) * GROOVE_STEP; }
  tier() { return grooveTierOf(this.groove); }
  isAccent() { return this.beat < this.accentUntil; }
  gearLv(id) { return gearLevel(this.meta, id); }
  dmgMult() { return this.grooveMult() * (1 + this.passives.amp * 0.15 + this.gearLv('tube_amp') * 0.06); }
  attackMult() { return this.dmgMult() * (this.isAccent() ? ACCENT_MULT : 1); }
  moveSpeed() { return PLAYER.speed * (1 + this.passives.footwork * 0.12); }
  pickupR() { return PLAYER.pickupRadius * (1 + this.passives.speaker * 0.45); }
  perfectWindow() { return PERFECT_MS + this.passives.metronome * 25 + this.gearLv('metro_clock') * 8; }
  currentBpm() { return bpmForTime(this.mode, this.time); }
  currentBeatMs() { return 60000 / this.currentBpm(); }
  audioBpm() { return bpmForTime(this.mode, this.rawTime); }
  audioBeatMs() { return 60000 / this.audioBpm(); }
  isEndless() { return this.mode === MODE_ENDLESS; }
  score() { return Math.floor(this.time) + this.kills; }

  currentTimeScale() {
    if (this.bossStopT > 0 || this.hitStopT > 0) return 0;
    if (this.state === 'dying') return this.deathSlowT > 0 ? DEATH_SLOW_SCALE : 0;
    return 1;
  }

  startHitStop(sec) {
    this.hitStopT = Math.max(this.hitStopT, sec);
  }

  setGrooveValue(next, reason = '') {
    const prev = this.groove;
    const prevTier = this.tier();
    this.groove = Math.max(0, Math.min(next, GROOVE_MAX));
    this.stats.maxGroove = Math.max(this.stats.maxGroove, this.groove);
    const nextTier = this.tier();
    if (nextTier > prevTier && nextTier > 0) {
      this.startHitStop(TIER_HITSTOP_SEC);
      this.emit('groove-tier', {
        tier: nextTier,
        groove: this.groove,
        color: TIER_COLORS[Math.min(nextTier, TIER_COLORS.length - 1)],
        reason,
      });
    }
    if (this.groove >= GROOVE_MAX && prev < GROOVE_MAX) {
      const strong = !this.maxGrooveSeen;
      this.maxGrooveSeen = true;
      this.emit('maxgroove', { strong, reason });
    }
  }

  timeForBeat(targetBeat, offsetMs = 0) {
    let lo = Math.max(0, this.time - 1);
    let hi = Math.max(lo + 1, this.time + 2);
    const target = targetBeat + offsetMs / this.currentBeatMs();
    while (beatAtTime(this.mode, hi) < target) hi += 2;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (beatAtTime(this.mode, mid) < target) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  // ===== リズムアクション: ダッシュ =====
  dash() {
    if (this.state !== 'playing') return null;
    const p = this.p;
    if (p.dashCd > 0) return null;
    const offset = (this.beat - Math.round(this.beat)) * this.currentBeatMs(); // ビートからのズレms
    const abs = Math.abs(offset);
    let judge;
    if (abs <= this.perfectWindow()) {
      judge = 'perfect';
      this.setGrooveValue(this.groove + 1, 'perfect');
      this.stats.perfect++;
      this.lastPerfectBeat = this.beat;
      // PERFECT直後はしばらく全攻撃がアクセント（強化）される
      this.accentUntil = Math.floor(this.beat) + ACCENT_BEATS;
      // PERFECTダッシュは小衝撃波つき
      this.areaDamage(p.x, p.y, 100, 10 * this.dmgMult(), 160);
    } else if (abs <= GOOD_MS) {
      judge = 'good';
      this.stats.good++;
    } else {
      judge = 'miss';
      this.stats.miss++;
      this.setGrooveValue(this.groove - MISS_PENALTY, 'miss');
    }
    // ダッシュ方向 = 移動入力（なければ向いている方向）
    let dx = this.ctrl.mx, dy = this.ctrl.my;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
    else { dx /= len; dy /= len; }
    p.dashDx = dx; p.dashDy = dy;
    p.dashT = PLAYER.dashTime;
    p.dashDist = judge === 'perfect' ? PLAYER.dashPerfectDist : PLAYER.dashDist;
    p.iframe = Math.max(p.iframe, PLAYER.dashIframe);
    p.dashCd = PLAYER.dashCooldown;
    this.emit('dash', { judge, offset: Math.round(offset), groove: this.groove });
    return judge;
  }

  // ===== 更新 =====
  update(dtMs) {
    if (this.state !== 'playing' && this.state !== 'levelup' && this.state !== 'dying') return;
    let acc = Math.min(dtMs, 100) / 1000;
    const STEP = 1 / 120;
    while (acc > 0 && (this.state === 'playing' || this.state === 'levelup' || this.state === 'dying')) {
      const h = Math.min(acc, STEP);
      this.rawTime += h;
      this.audioBeat = beatAtTime(this.mode, this.rawTime);
      this.updateCinematics(h);
      if (this.state !== 'playing' && this.state !== 'levelup' && this.state !== 'dying') break;
      const scale = this.currentTimeScale();
      if (scale > 0) this.tick(h * scale);
      acc -= h;
    }
  }

  updateCinematics(dt) {
    this.hitStopT = Math.max(0, this.hitStopT - dt);
    if (this.bossStopT > 0) {
      this.bossStopT = Math.max(0, this.bossStopT - dt);
      if (this.bossStopT === 0 && this.bossDefeatPending) this.resolveBossDefeat();
    }
    if (this.state === 'dying') {
      if (this.deathSlowT > 0) this.deathSlowT = Math.max(0, this.deathSlowT - dt);
      else {
        this.deathFadeT = Math.max(0, this.deathFadeT - dt);
        if (this.deathFadeT === 0) this.finish('dead');
      }
    }
  }

  tick(dt) {
    this.time += dt;
    this.beat = beatAtTime(this.mode, this.time);

    // 8分音符境界を横断したら発火
    const half = Math.floor(this.beat * 2);
    while (this.halfTick < half) {
      this.halfTick++;
      this.onHalfTick(this.halfTick);
    }

    if (this.state !== 'playing') return; // levelup中はビートのみ進行

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateGems(dt);
    this.spawnLogic(dt);

    if (!this.isEndless() && this.time >= SESSION_CLEAR_TIME && this.state === 'playing') this.finish('clear');
    if (this.isEndless() && !this.endlessTitleShown && this.time >= 600) {
      this.endlessTitleShown = true;
      this.emit('titlecard', { title: 'NIGHT RIDER' });
    }
  }

  onHalfTick(ht) {
    const onBeat = ht % 2 === 0;
    // levelup中はゲームプレイを発動せず、演出用のビートイベントだけ流す
    if (this.state === 'levelup') {
      this.emit(onBeat ? 'beat' : 'halfbeat', { index: ht / 2, ht });
      return;
    }
    // 残響攻撃（ノヴァ2連など）はビート境界で発動
    this.echoQueue = this.echoQueue.filter((e) => {
      if (ht < e.at) return true;
      this.areaDamage(e.x, e.y, e.radius, e.dmg, e.kb);
      this.emit('nova', { radius: e.radius, echo: true });
      return false;
    });
    // レーザーは8分音符ごと
    if (this.weapons.laser) this.fireLaser();
    if (!onBeat) { this.emit('halfbeat', { ht }); return; }

    const beatIndex = ht / 2;
    this.emit('beat', { index: beatIndex });

    // 武器発動（ビート量子化）
    if (this.weapons.beatshot && beatIndex % WEAPONS.beatshot.everyBeats === 0) this.fireBeatshot();
    if (this.weapons.bass && beatIndex % WEAPONS.bass.everyBeats === 0) this.fireBass();
    if (this.weapons.nova && beatIndex % WEAPONS.nova.everyBeats === 0) this.fireNova();

    // GROOVE減衰: PERFECTが途切れると1ビートごとに減衰
    if (this.groove > 0 && this.beat - this.lastPerfectBeat > GROOVE_DECAY_BEATS + this.gearLv('booth_monitor') * 2) {
      this.setGrooveValue(this.groove - GROOVE_DECAY_PER_BEAT, 'decay');
      this.emit('groovedecay', { groove: this.groove });
    }

    // ビート同期の特殊スポーン
    if (this.time > 45 && beatIndex % 8 === 0) this.spawnBurst('swarm', 5 + Math.floor(this.time / 50) + (this.isEndless() ? Math.floor(this.bossSpawns * 1.5) : 0));
    if (this.time > 100 && beatIndex % 16 === 0) this.spawnBurst('tank', 1 + Math.floor(this.time / 140) + (this.isEndless() ? Math.floor(this.bossSpawns / 2) : 0));
    // ボスの突進テレグラフ
    if (this.bossRef && beatIndex % 8 === 4) {
      this.bossRef.charge = 2; // 2ビートぶん突進
      this.emit('bosscharge');
    }
  }

  // ===== プレイヤー =====
  updatePlayer(dt) {
    const p = this.p;
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.iframe = Math.max(0, p.iframe - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);

    if (p.dashT > 0) {
      const speed = p.dashDist / PLAYER.dashTime;
      p.x += p.dashDx * speed * dt;
      p.y += p.dashDy * speed * dt;
      p.dashT -= dt;
    } else {
      let { mx, my } = this.ctrl;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      p.x += mx * this.moveSpeed() * dt;
      p.y += my * this.moveSpeed() * dt;
      if (len > 0.05) p.facing = Math.atan2(my, mx);
    }
    // 円形アリーナに制限
    const d = Math.hypot(p.x, p.y);
    if (d > ARENA_R - p.r) {
      p.x *= (ARENA_R - p.r) / d;
      p.y *= (ARENA_R - p.r) / d;
    }
  }

  // ===== 敵 =====
  spawnEnemy(type, x, y, opts = {}) {
    if (this.enemies.length >= ENEMY_CAP && type !== 'boss') {
      if (this.isEndless()) this.boostExistingEnemies(type);
      return null;
    }
    const def = ENEMIES[type];
    const minutes = this.time / 60;
    const bossRank = opts.bossRank ?? 1;
    const endlessBoost = this.isEndless() ? Math.max(0, minutes - 5) : 0;
    const hpScale = type === 'boss' && this.isEndless() ? 1 + (bossRank - 1) * 0.65 : 1;
    const speedScale = this.isEndless() ? 1 + Math.min(0.75, endlessBoost * 0.035) + (type === 'boss' ? (bossRank - 1) * 0.12 : 0) : 1;
    const e = {
      id: this.nextId++,
      type, x, y,
      r: def.r,
      hp: (def.hp + def.hpGrow * minutes) * hpScale,
      maxHp: (def.hp + def.hpGrow * minutes) * hpScale,
      dmg: def.dmg, xp: def.xp, speed: def.speed * speedScale,
      kbx: 0, kby: 0, flash: 0, charge: 0,
    };
    this.enemies.push(e);
    return e;
  }

  spawnAround(type, dist = null, opts = {}) {
    const a = this.rng.range(0, Math.PI * 2);
    const r = dist ?? this.rng.range(650, 900);
    let x = this.p.x + Math.cos(a) * r;
    let y = this.p.y + Math.sin(a) * r;
    const d = Math.hypot(x, y);
    if (d > ARENA_R - 30) { x *= (ARENA_R - 30) / d; y *= (ARENA_R - 30) / d; }
    return this.spawnEnemy(type, x, y, opts);
  }

  spawnBurst(type, n) {
    for (let i = 0; i < n; i++) this.spawnAround(type);
    this.emit('burst', { type, n });
  }

  spawnLogic(dt) {
    this.spawnAcc += spawnRate(this.time) * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawnAround('chaser');
    }
    if (!this.isEndless() && !this.bossSpawned && this.time >= BOSS_TIME) {
      this.bossSpawned = true;
      this.bossRef = this.spawnAround('boss', 750);
      this.emit('boss');
    }
    if (this.isEndless()) {
      while (this.time + 0.001 >= this.nextBossTime) {
        this.spawnEndlessBoss();
        this.nextBossTime += ENDLESS_BOSS_INTERVAL;
      }
    }
  }

  boostExistingEnemies(type) {
    this.spawnPressure++;
    const every = Math.max(1, Math.floor(this.spawnPressure / 8) + 1);
    for (let i = this.enemies.length - 1; i >= 0; i -= every) {
      const e = this.enemies[i];
      if (e.type === 'boss') continue;
      e.maxHp *= 1.01;
      e.hp *= 1.01;
      e.speed *= 1.0025;
    }
  }

  spawnEndlessBoss() {
    this.bossSpawns++;
    const rank = this.bossSpawns;
    if (this.enemies.length >= ENEMY_CAP) {
      this.boostExistingEnemies('boss');
      const idx = this.enemies.findIndex((e) => e.type !== 'boss');
      if (idx >= 0) this.enemies.splice(idx, 1);
    }
    this.bossRef = this.spawnAround('boss', 750, { bossRank: rank });
    this.spawnBurst('swarm', 8 + rank * 3);
    const tankN = Math.floor(rank / 2);
    if (tankN > 0) this.spawnBurst('tank', tankN);
    this.emit('boss', { rank });
  }

  updateEnemies(dt) {
    const p = this.p;
    const beatPulse = Math.max(0, 1 - (this.beat % 1) * 3); // ビート直後に加速（脈動）
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let sp = e.speed * (1 + 0.35 * beatPulse);
      if (e.charge > 0) { sp *= 3.2; e.charge -= dt * (this.currentBpm() / 60); }
      e.x += (dx / d) * sp * dt + e.kbx * dt;
      e.y += (dy / d) * sp * dt + e.kby * dt;
      e.kbx *= Math.max(0, 1 - dt * 6);
      e.kby *= Math.max(0, 1 - dt * 6);

      // プレイヤー接触ダメージ
      if (p.hurtCd <= 0 && p.iframe <= 0 && d < e.r + p.r) {
        const dmg = e.dmg * (1 - this.gearLv('isolator') * 0.05);
        p.hp -= dmg;
        p.hurtCd = PLAYER.hurtCooldown;
        this.emit('hurt', { dmg, hp: p.hp });
        if (p.hp <= 0) {
          if (this.tryRevive()) return;
          this.startDeath(); return;
        }
      }
    }
    this.separateEnemiesGrid();
  }

  separatePair(a, b) {
    const dx = b.x - a.x;
    if (dx > 40 || dx < -40) return;
    const dy = b.y - a.y;
    if (dy > 40 || dy < -40) return;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.01 && d2 < rr * rr) {
      const d = Math.sqrt(d2);
      const push = (rr - d) / d * 0.5;
      a.x -= dx * push; a.y -= dy * push;
      b.x += dx * push; b.y += dy * push;
    }
  }

  separateEnemiesGrid() {
    const es = this.enemies;
    const cell = ENEMY_GRID_CELL;
    const dim = 128;
    const offset = 64;
    if (!this._sepHead) {
      this._sepHead = new Int32Array(dim * dim);
      this._sepHead.fill(-1);
    }
    if (!this._sepNext || this._sepNext.length < es.length) this._sepNext = new Int32Array(Math.max(ENEMY_CAP + 8, es.length));
    const head = this._sepHead;
    const next = this._sepNext;
    const touched = this._sepTouched;
    touched.length = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const gx = Math.floor(e.x / cell);
      const gy = Math.floor(e.y / cell);
      const cx = Math.max(0, Math.min(dim - 1, gx + offset));
      const cy = Math.max(0, Math.min(dim - 1, gy + offset));
      const idx = cx + cy * dim;
      const lx = e.x - gx * cell;
      const ly = e.y - gy * cell;
      const xs = [cx];
      const ys = [cy];
      if (lx < 40 && cx > 0) xs.push(cx - 1);
      else if (lx > cell - 40 && cx < dim - 1) xs.push(cx + 1);
      if (ly < 40 && cy > 0) ys.push(cy - 1);
      else if (ly > cell - 40 && cy < dim - 1) ys.push(cy + 1);
      for (const nx of xs) {
        for (const ny of ys) {
          for (let j = head[nx + ny * dim]; j !== -1; j = next[j]) this.separatePair(es[j], e);
        }
      }
      if (head[idx] === -1) touched.push(idx);
      next[i] = head[idx];
      head[idx] = i;
    }
    for (const idx of touched) head[idx] = -1;
  }

  separateEnemiesBruteForce() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) this.separatePair(es[i], es[j]);
    }
  }

  damageEnemy(e, dmg, kbx = 0, kby = 0) {
    e.hp -= dmg;
    e.flash = 0.08;
    e.kbx += kbx; e.kby += kby;
    this.stats.dmgDealt += dmg;
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.kills++;
    this.gems.push({ x: e.x, y: e.y, xp: e.xp, vx: 0, vy: 0 });
    this.emit('kill', { x: e.x, y: e.y, type: e.type, groove: this.groove });
    if (e.type === 'boss') {
      this.stats.bossRankSum += this.isEndless() ? Math.max(1, this.bossSpawns) : 1;
      this.bossRef = null;
      this.startBossDefeat(e);
    }
  }

  tryRevive() {
    const lv = this.gearLv('ups');
    if (lv <= 0 || this.runReviveUsed) return false;
    this.runReviveUsed = true;
    this.p.hp = 30;
    if (lv >= 2) this.p.iframe = Math.max(this.p.iframe, 1);
    if (lv >= 3) {
      this.areaDamage(this.p.x, this.p.y, 190, 28 * this.dmgMult(), 220);
      this.emit('nova', { radius: 190, accent: true });
    }
    this.emit('revive', { hp: this.p.hp, level: lv });
    return true;
  }

  startBossDefeat(e) {
    this.bossStopT = BOSS_DEFEAT_STOP_SEC;
    this.bossDefeatPending = { x: e.x, y: e.y, mode: this.mode, rank: this.bossSpawns };
    this.emit('bossdefeat-start', this.bossDefeatPending);
  }

  resolveBossDefeat() {
    const data = this.bossDefeatPending;
    this.bossDefeatPending = null;
    this.emit('bossdead', data || {});
    this.emit('bossdefeat-explode', data || {});
    if (this.isEndless()) {
      this.setGrooveValue(GROOVE_MAX, 'boss');
      const bonus = xpForLevel(this.level);
      this.addXp(bonus);
      this.emit('bossreward', { groove: this.groove, xp: bonus, rank: data?.rank ?? this.bossSpawns });
    } else {
      this.finish('clear');
    }
  }

  startDeath() {
    if (this.state === 'dying' || this.state === 'dead') return;
    this.p.hp = 0;
    this.state = 'dying';
    this.deathSlowT = DEATH_SLOW_SEC;
    this.deathFadeT = DEATH_FADE_SEC;
    this.emit('deathstart', { x: this.p.x, y: this.p.y });
  }

  areaDamage(x, y, radius, dmg, kb = 0) {
    for (const e of [...this.enemies]) {
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d < radius + e.r) {
        const kx = d > 1 ? (dx / d) * kb : 0;
        const ky = d > 1 ? (dy / d) * kb : 0;
        this.damageEnemy(e, dmg, kx, ky);
      }
    }
  }

  // ===== 武器 =====
  nearestEnemies(n) {
    const p = this.p;
    return [...this.enemies]
      .map((e) => ({ e, d: (e.x - p.x) ** 2 + (e.y - p.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map((o) => o.e);
  }

  fireBeatshot() {
    const conf = WEAPONS.beatshot.lv[this.weapons.beatshot - 1];
    const tier = this.tier();
    const accent = this.isAccent();
    const count = conf.count + (tier >= 1 ? 1 : 0); // ティア1+: 弾数+1
    const targets = this.nearestEnemies(count);
    if (targets.length === 0) return;
    for (const t of targets) {
      const dx = t.x - this.p.x, dy = t.y - this.p.y;
      const d = Math.hypot(dx, dy) || 1;
      this.bullets.push({
        x: this.p.x, y: this.p.y,
        vx: (dx / d) * 540, vy: (dy / d) * 540,
        dmg: conf.dmg * this.attackMult(), life: 1.4,
        r: accent ? 7.5 : 5,
        pierce: tier >= 3 ? 2 : 1, // ティア3+: 貫通
      });
    }
    this.emit('shot', { count: targets.length, accent });
  }

  fireNova() {
    const conf = WEAPONS.nova.lv[this.weapons.nova - 1];
    const accent = this.isAccent();
    this.areaDamage(this.p.x, this.p.y, conf.radius, conf.dmg * this.attackMult(), 140);
    this.emit('nova', { radius: conf.radius, accent });
    // ティア2+: 半拍遅れの2発目（残響）
    if (this.tier() >= 2) {
      this.echoQueue.push({
        at: this.halfTick + 1, x: this.p.x, y: this.p.y,
        radius: conf.radius * 0.8, dmg: conf.dmg * 0.6 * this.attackMult(), kb: 100,
      });
    }
  }

  fireBeatshot() {
    const conf = WEAPONS.beatshot.lv[this.weapons.beatshot - 1];
    const tier = this.tier();
    const accent = this.isAccent();
    const tw = this.gearLv('tweeter');
    const count = conf.count + (tier >= 1 ? 1 : 0) + (tw >= 3 ? 1 : 0);
    const targets = this.nearestEnemies(count);
    if (targets.length === 0) return;
    for (const t of targets) {
      const dx = t.x - this.p.x, dy = t.y - this.p.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 540 * (tw >= 1 ? 1.2 : 1);
      this.bullets.push({
        x: this.p.x, y: this.p.y,
        vx: (dx / d) * speed, vy: (dy / d) * speed,
        dmg: conf.dmg * this.attackMult(), life: 1.4,
        r: accent ? 7.5 : 5,
        pierce: (tier >= 3 ? 2 : 1) + (tw >= 2 ? 1 : 0),
      });
    }
    this.emit('shot', { count: targets.length, accent });
  }

  fireNova() {
    const conf = WEAPONS.nova.lv[this.weapons.nova - 1];
    const accent = this.isAccent();
    const radius = conf.radius * (1 + this.gearLv('bass_reflex') * 0.1);
    this.areaDamage(this.p.x, this.p.y, radius, conf.dmg * this.attackMult(), 140);
    this.emit('nova', { radius, accent });
    if (this.tier() >= 2) {
      this.echoQueue.push({
        at: this.halfTick + 1, x: this.p.x, y: this.p.y,
        radius: radius * 0.8, dmg: conf.dmg * 0.6 * this.attackMult(), kb: 100,
      });
    }
  }

  fireBass() {
    const conf = WEAPONS.bass.lv[this.weapons.bass - 1];
    const tier = this.tier();
    const accent = this.isAccent();
    const arc = conf.arc * (tier >= 1 ? 1.2 : 1);     // ティア1+: 幅+20%
    const range = conf.range * (tier >= 3 ? 1.3 : 1); // ティア3+: 射程+30%
    const p = this.p;
    const dir = p.facing;
    for (const e of [...this.enemies]) {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      let da = Math.atan2(dy, dx) - dir;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= arc / 2) {
        this.damageEnemy(e, conf.dmg * this.attackMult(), (dx / d) * conf.kb, (dy / d) * conf.kb);
      }
    }
    this.emit('bass', { dir, range, arc, accent });
  }

  // GROOVEティアを反映したレーザー構成（描画側もこれを使う）
  laserConf() {
    const conf = WEAPONS.laser.lv[this.weapons.laser - 1];
    const tier = this.tier();
    return {
      beams: conf.beams + (tier >= 2 ? 1 : 0),        // ティア2+: ビーム+1
      len: conf.len * (tier >= 4 ? 1.4 : 1),          // ティア4: 長さ+40%
      dmg: conf.dmg,
    };
  }

  laserAngles() {
    const conf = this.laserConf();
    const base = this.beat * 0.9; // ビートと共に回転
    return Array.from({ length: conf.beams }, (_, i) => base + (Math.PI * 2 * i) / conf.beams);
  }

  fireLaser() {
    const conf = this.laserConf();
    const p = this.p;
    for (const ang of this.laserAngles()) {
      const cs = Math.cos(ang), sn = Math.sin(ang);
      for (const e of [...this.enemies]) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const along = dx * cs + dy * sn;         // ビーム方向の距離
        if (along < 0 || along > conf.len) continue;
        const across = Math.abs(-dx * sn + dy * cs); // ビームからの垂直距離
        if (across < e.r + 7) this.damageEnemy(e, conf.dmg * this.attackMult());
      }
    }
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        for (const e of this.enemies) {
          const dx = e.x - b.x, dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.r + b.r) ** 2) {
            this.damageEnemy(e, b.dmg, b.vx * 0.06, b.vy * 0.06);
            b.pierce = (b.pierce ?? 1) - 1;
            if (b.pierce <= 0) dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  // ===== XPとレベルアップ =====
  updateGems(dt) {
    const p = this.p;
    const pr = this.pickupR();
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x, dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < pr) {
        const pull = 420 * (1 - d / pr) + 120;
        g.vx += (dx / d) * pull * dt * 4;
        g.vy += (dy / d) * pull * dt * 4;
      }
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.max(0, 1 - dt * 2);
      g.vy *= Math.max(0, 1 - dt * 2);
      if (d < PLAYER.collectRadius) {
        this.gems.splice(i, 1);
        this.addXp(g.xp);
        this.emit('gem', { xp: g.xp });
      }
    }
    if (this.gems.length > 400) this.gems.splice(0, this.gems.length - 400);
  }

  addXp(n) {
    this.xp += n;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
  }

  upgradePool() {
    const pool = [];
    for (const [key, def] of Object.entries(WEAPONS)) {
      const lv = this.weapons[key] ?? 0;
      if (lv < def.maxLv) {
        pool.push({ kind: 'weapon', key, lv: lv + 1, name: def.name, icon: def.icon, desc: def.desc, isNew: lv === 0 });
      }
    }
    for (const [key, def] of Object.entries(PASSIVES)) {
      const lv = this.passives[key];
      if (lv < def.maxLv) {
        pool.push({ kind: 'passive', key, lv: lv + 1, name: def.name, icon: def.icon, desc: def.desc, isNew: lv === 0 });
      }
    }
    return pool;
  }

  openLevelUp() {
    this.echoQueue = []; // 積み残しの残響がlevelup明けに古い位置で発動しないように
    const pool = this.upgradePool();
    if (pool.length === 0) { this.pendingLevels = 0; return; }
    this.choices = [];
    const copy = [...pool];
    for (let i = 0; i < 3 && copy.length > 0; i++) {
      const idx = Math.floor(this.rng.next() * copy.length);
      this.choices.push(copy.splice(idx, 1)[0]);
    }
    this.state = 'levelup';
    this.emit('levelup-open', { choices: this.choices, level: this.level });
  }

  pick(i) {
    if (this.state !== 'levelup' || !this.choices[i]) return false;
    const c = this.choices[i];
    if (c.kind === 'weapon') this.weapons[c.key] = (this.weapons[c.key] ?? 0) + 1;
    else {
      this.passives[c.key]++;
      if (c.key === 'battery') {
        this.p.maxHp += 25;
        this.p.hp = this.p.maxHp;
      }
    }
    this.pendingLevels--;
    this.emit('levelup-pick', { choice: c });
    if (this.pendingLevels > 0) this.openLevelUp();
    else {
      this.state = 'playing';
      this.choices = [];
      // levelup中に経過したビートでGROOVEが即減衰しないように猶予をリセット
      this.lastPerfectBeat = this.beat;
    }
    return true;
  }

  achievementsForResult(result) {
    const ids = [];
    if (!this.isEndless() && result === 'clear') ids.push('stage_clear');
    if (this.stats.maxGroove >= GROOVE_MAX) ids.push('groove_max');
    if (this.isEndless() && this.time >= 300) ids.push('endless_5');
    if (this.isEndless() && this.time >= 600) ids.push('night_rider');
    if (this.isEndless() && this.stats.bossRankSum >= 1 + 2 + 3) ids.push('boss_triple');
    if (isRackComplete(this.meta)) ids.push('rack_complete');
    return ids;
  }

  finish(result) {
    this.state = result;
    const bpm = this.currentBpm();
    const chipBreakdown = calculateChipReward({
      kills: this.kills,
      maxGroove: this.stats.maxGroove,
      bossRankSum: this.stats.bossRankSum,
      time: this.time,
    });
    const unlocked = this.achievementsForResult(result);
    const save = updateBeatSurvivorSave((s) => {
      if (this.isEndless() && result === 'dead') s.best.endlessTime = Math.max(s.best.endlessTime || 0, Math.floor(this.time));
      if (!this.isEndless() && result === 'clear') s.best.normalTime = Math.max(s.best.normalTime || 0, Math.floor(this.time));
      s.settings = { ...this.settings };
      s.meta = normalizeMeta(s.meta);
      s.meta.chips += chipBreakdown.total;
      for (const id of unlocked) {
        if (!s.meta.achievements.includes(id)) s.meta.achievements.push(id);
      }
    });
    this.save = save;
    this.meta = normalizeMeta(save.meta);
    const data = {
      time: Math.round(this.time), level: this.level, kills: this.kills,
      mode: this.mode, score: this.score(), bpm: Math.round(bpm), bestTime: save.best.endlessTime || 0,
      chips: chipBreakdown.total, chipBreakdown, achievementsUnlocked: unlocked,
      meta: this.meta,
      ...this.stats,
    };
    this.lastEnd = data;
    this.emit(result, data);
  }

  // ===== デバッグ/検証用 =====
  getSnapshot() {
    return {
      state: this.state,
      mode: this.mode,
      time: Math.round(this.time * 100) / 100,
      rawTime: Math.round(this.rawTime * 100) / 100,
      beat: Math.round(this.beat * 100) / 100,
      audioBeat: Math.round(this.audioBeat * 100) / 100,
      bpm: Math.round(this.currentBpm() * 100) / 100,
      audioBpm: Math.round(this.audioBpm() * 100) / 100,
      timeScale: this.currentTimeScale(),
      timers: {
        hitStop: Math.round(this.hitStopT * 1000),
        bossStop: Math.round(this.bossStopT * 1000),
        deathSlow: Math.round(this.deathSlowT * 1000),
        deathFade: Math.round(this.deathFadeT * 1000),
      },
      beatOffsetMs: Math.round((this.beat - Math.round(this.beat)) * this.currentBeatMs()),
      hp: Math.round(this.p.hp), maxHp: this.p.maxHp,
      pos: { x: Math.round(this.p.x), y: Math.round(this.p.y) },
      level: this.level, xp: this.xp, xpNext: xpForLevel(this.level),
      groove: this.groove, grooveMult: Math.round(this.grooveMult() * 100) / 100,
      tier: this.tier(), accent: this.isAccent(),
      kills: this.kills, stats: { ...this.stats },
      score: this.score(), spawnRate: Math.round(spawnRate(this.time) * 100) / 100,
      bossSpawns: this.bossSpawns, nextBossTime: this.nextBossTime,
      enemies: this.enemies.length, bullets: this.bullets.length, gems: this.gems.length,
      weapons: { ...this.weapons }, passives: { ...this.passives },
      settings: { ...this.settings },
      meta: normalizeMeta(this.meta),
      boss: this.bossRef ? { hp: Math.round(this.bossRef.hp), x: Math.round(this.bossRef.x), y: Math.round(this.bossRef.y) } : null,
      pendingLevels: this.pendingLevels,
      choices: this.choices.map((c) => `${c.name} Lv${c.lv}`),
    };
  }

  dump() {
    const s = this.getSnapshot();
    const near = this.nearestEnemies(5).map((e) =>
      `${e.type}(hp${Math.round(e.hp)}) @${Math.round(e.x - this.p.x)},${Math.round(e.y - this.p.y)}`);
    return [
      `state=${s.state} t=${s.time}s beat=${s.beat} hp=${s.hp}/${s.maxHp}`,
      `lv=${s.level} groove=${s.groove}(x${s.grooveMult}) kills=${s.kills}`,
      `enemies=${s.enemies} bullets=${s.bullets} gems=${s.gems}`,
      `near: ${near.join(' / ') || 'none'}`,
    ].join('\n');
  }
}
