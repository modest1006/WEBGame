// ゲームロジック本体。DOM/Canvas/Audio非依存 — update(dtMs) で決定論的に進む。
// 依存: constants.js, rng.js（読み込み順は index.html 参照）
class Game {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed;
    this.listeners = [];
    this.state = 'title'; // title | playing | levelup | paused | dead | clear
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
    this.time = 0;
    this.beat = 0;
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
    this.level = 1;
    this.xp = 0;
    this.groove = 0;
    this.lastPerfectBeat = 0;
    this.kills = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, maxGroove: 0, dmgDealt: 0 };
    this.pendingLevels = 0;
    this.choices = [];
    this.spawnAcc = 0;
    this.accentUntil = 0;   // このビートまで全攻撃がアクセント（PERFECTで更新）
    this.echoQueue = [];    // ビート境界で発動する残響攻撃（ノヴァ2連など）
    this.bossSpawned = false;
    this.bossRef = null;
    this.nextId = 1;
  }

  start() {
    this.resetRun();
    this.state = 'playing';
    this.emit('start');
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.emit('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); }
  }

  grooveMult() { return 1 + Math.min(this.groove, GROOVE_MAX) * GROOVE_STEP; }
  tier() { return grooveTierOf(this.groove); }
  isAccent() { return this.beat < this.accentUntil; }
  dmgMult() { return this.grooveMult() * (1 + this.passives.amp * 0.15); }
  attackMult() { return this.dmgMult() * (this.isAccent() ? ACCENT_MULT : 1); }
  moveSpeed() { return PLAYER.speed * (1 + this.passives.footwork * 0.12); }
  pickupR() { return PLAYER.pickupRadius * (1 + this.passives.speaker * 0.45); }
  perfectWindow() { return PERFECT_MS + this.passives.metronome * 25; }

  // ===== リズムアクション: ダッシュ =====
  dash() {
    if (this.state !== 'playing') return null;
    const p = this.p;
    if (p.dashCd > 0) return null;
    const offset = (this.beat - Math.round(this.beat)) * BEAT_MS; // ビートからのズレms
    const abs = Math.abs(offset);
    let judge;
    if (abs <= this.perfectWindow()) {
      judge = 'perfect';
      this.groove = Math.min(this.groove + 1, GROOVE_MAX);
      this.stats.perfect++;
      this.stats.maxGroove = Math.max(this.stats.maxGroove, this.groove);
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
      this.groove = Math.max(0, this.groove - MISS_PENALTY);
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
    // levelup中もビートクロックだけは進める（音楽と演出を止めないため）
    if (this.state !== 'playing' && this.state !== 'levelup') return;
    let acc = Math.min(dtMs, 100) / 1000;
    const STEP = 1 / 120;
    while (acc > 0 && (this.state === 'playing' || this.state === 'levelup')) {
      const h = Math.min(acc, STEP);
      this.tick(h);
      acc -= h;
    }
  }

  tick(dt) {
    this.time += dt;
    this.beat = this.time * (BPM / 60);

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

    if (this.time >= SESSION_CLEAR_TIME && this.state === 'playing') this.finish('clear');
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
    if (this.groove > 0 && this.beat - this.lastPerfectBeat > GROOVE_DECAY_BEATS) {
      this.groove = Math.max(0, this.groove - GROOVE_DECAY_PER_BEAT);
      this.emit('groovedecay', { groove: this.groove });
    }

    // ビート同期の特殊スポーン
    if (this.time > 45 && beatIndex % 8 === 0) this.spawnBurst('swarm', 5 + Math.floor(this.time / 50));
    if (this.time > 100 && beatIndex % 16 === 0) this.spawnBurst('tank', 1 + Math.floor(this.time / 140));
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
  spawnEnemy(type, x, y) {
    if (this.enemies.length >= ENEMY_CAP && type !== 'boss') return null;
    const def = ENEMIES[type];
    const minutes = this.time / 60;
    const e = {
      id: this.nextId++,
      type, x, y,
      r: def.r,
      hp: def.hp + def.hpGrow * minutes,
      maxHp: def.hp + def.hpGrow * minutes,
      dmg: def.dmg, xp: def.xp, speed: def.speed,
      kbx: 0, kby: 0, flash: 0, charge: 0,
    };
    this.enemies.push(e);
    return e;
  }

  spawnAround(type, dist = null) {
    const a = this.rng.range(0, Math.PI * 2);
    const r = dist ?? this.rng.range(650, 900);
    let x = this.p.x + Math.cos(a) * r;
    let y = this.p.y + Math.sin(a) * r;
    const d = Math.hypot(x, y);
    if (d > ARENA_R - 30) { x *= (ARENA_R - 30) / d; y *= (ARENA_R - 30) / d; }
    return this.spawnEnemy(type, x, y);
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
    if (!this.bossSpawned && this.time >= BOSS_TIME) {
      this.bossSpawned = true;
      this.bossRef = this.spawnAround('boss', 750);
      this.emit('boss');
    }
  }

  updateEnemies(dt) {
    const p = this.p;
    const beatPulse = Math.max(0, 1 - (this.beat % 1) * 3); // ビート直後に加速（脈動）
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let sp = e.speed * (1 + 0.35 * beatPulse);
      if (e.charge > 0) { sp *= 3.2; e.charge -= dt * (BPM / 60); }
      e.x += (dx / d) * sp * dt + e.kbx * dt;
      e.y += (dy / d) * sp * dt + e.kby * dt;
      e.kbx *= Math.max(0, 1 - dt * 6);
      e.kby *= Math.max(0, 1 - dt * 6);

      // プレイヤー接触ダメージ
      if (p.hurtCd <= 0 && p.iframe <= 0 && d < e.r + p.r) {
        p.hp -= e.dmg;
        p.hurtCd = PLAYER.hurtCooldown;
        this.emit('hurt', { dmg: e.dmg, hp: p.hp });
        if (p.hp <= 0) { this.finish('dead'); return; }
      }
    }
    // 敵同士の押し合い（重なり防止）
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        const dx = b.x - a.x;
        if (dx > 40 || dx < -40) continue;
        const dy = b.y - a.y;
        if (dy > 40 || dy < -40) continue;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / d * 0.5;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
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
      this.bossRef = null;
      this.emit('bossdead');
      this.finish('clear');
    }
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

  finish(result) {
    this.state = result;
    this.emit(result, {
      time: Math.round(this.time), level: this.level, kills: this.kills,
      ...this.stats,
    });
  }

  // ===== デバッグ/検証用 =====
  getSnapshot() {
    return {
      state: this.state,
      time: Math.round(this.time * 100) / 100,
      beat: Math.round(this.beat * 100) / 100,
      beatOffsetMs: Math.round((this.beat - Math.round(this.beat)) * BEAT_MS),
      hp: Math.round(this.p.hp), maxHp: this.p.maxHp,
      pos: { x: Math.round(this.p.x), y: Math.round(this.p.y) },
      level: this.level, xp: this.xp, xpNext: xpForLevel(this.level),
      groove: this.groove, grooveMult: Math.round(this.grooveMult() * 100) / 100,
      tier: this.tier(), accent: this.isAccent(),
      kills: this.kills, stats: { ...this.stats },
      enemies: this.enemies.length, bullets: this.bullets.length, gems: this.gems.length,
      weapons: { ...this.weapons }, passives: { ...this.passives },
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
