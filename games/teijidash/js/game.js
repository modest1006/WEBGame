class TeijiDashGame {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed || 20260707;
    this.listeners = [];
    this.best = 0;
    try { this.best = Number(localStorage.getItem(BEST_KEY) || 0); } catch (_) {}
    this.resetWeek();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) {
    for (const fn of this.listeners) {
      try { fn(type, data || {}); } catch (err) { console.error('[game event]', type, err); }
    }
  }

  resetWeek() {
    this.rng = new RNG(this.seedValue);
    this.day = 0;
    this.weekScore = 0;
    this.weekResults = [];
    this.paused = false;
    this.initDay();
    this.act = ACT.TITLE;
  }

  initDay() {
    this.time = 0;
    this.dayScore = 0;
    this.prep = 0;
    this.prepStage = 0;
    this.prepAnim = { stage: 0, age: 9999, serial: 0 };
    this.inputDown = false;
    this.bossLooking = false;
    this.bossForced = null;
    this.bossTimer = 0;
    this.bossWarn = 0;
    this.caught = 0;
    this.justPresses = 0;
    this.justJudge = null;
    this.justOffset = null;
    this.justSlow = 0;
    this.justClockMs = -10000;
    this.justStamp = '';
    this.runX = 0;
    this.speed = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.qtes = [];
    this.nextQteX = 700;
    this.directorSpawned = false;
    this.finaleStarted = false;
    this.finaleGrade = 'normal';
    this.flashText = '';
    this.flashMs = 0;
    this.dayResult = null;
    this.resultLines = 0;
    this.scheduleBoss();
    this.emit('dayStart', { day: this.day });
  }

  start() {
    this.resetWeek();
    this.enterInterlude(ACT.PREP);
    this.emit('start');
  }

  enterInterlude(targetAct) {
    this.act = ACT.INTERLUDE;
    this.time = 0;
    this.interludeTarget = targetAct;
    this.inputDown = false;
    this.say(ACT_TITLES[targetAct] || '', TUNING.interludeMs);
    this.emit('interlude', { target: targetAct, title: ACT_TITLES[targetAct] || '' });
  }

  completeInterlude() {
    const target = this.interludeTarget;
    if (target === ACT.PREP) this.enterPrep();
    else if (target === ACT.JUST) this.enterJust();
    else if (target === ACT.DASH) this.enterDash();
  }

  enterPrep() {
    this.act = ACT.PREP;
    this.time = 0;
    this.inputDown = false;
    this.emit('act', { act: this.act });
  }

  scheduleBoss() {
    const level = this.day;
    this.bossTimer = this.rng.range(1200 - level * 70, 2500 - level * 120);
    this.bossWarn = 0;
  }

  update(dtMs) {
    if (this.paused || this.act === ACT.TITLE) return;
    let rest = Math.min(Math.max(dtMs, 0), 250);
    while (rest > 0) {
      const dt = Math.min(rest, 33.333);
      this.tick(dt);
      rest -= dt;
    }
  }

  tick(dt) {
    this.time += dt;
    this.flashMs = Math.max(0, this.flashMs - dt);
    this.prepAnim.age += dt;
    if (this.act === ACT.INTERLUDE && this.time >= TUNING.interludeMs) this.completeInterlude();
    else if (this.act === ACT.PREP) this.tickPrep(dt);
    else if (this.act === ACT.JUST) this.tickJust(dt);
    else if (this.act === ACT.JUST_SLOW) this.tickJustSlow(dt);
    else if (this.act === ACT.DASH) this.tickDash(dt);
    else if (this.act === ACT.FINALE) this.tickFinale(dt);
    else if (this.act === ACT.DAY_RESULT) this.resultLines = clamp(Math.floor((this.time - 900) / 420), 0, 4);
  }

  tickPrep(dt) {
    if (this.bossForced === null) {
      this.bossTimer -= dt;
      if (!this.bossLooking && this.bossTimer <= 0 && this.bossWarn <= 0) {
        this.bossWarn = this.rng.range(300, 600);
        this.emit('bossWarn', { kind: this.rng.pick(['shoulder', 'coffee', 'fake']) });
      } else if (this.bossWarn > 0) {
        this.bossWarn -= dt;
        if (this.bossWarn <= 0) {
          this.bossLooking = true;
          this.bossTimer = this.rng.range(720, 1150 + this.day * 90);
          this.emit('bossLook', { on: true });
        }
      } else if (this.bossLooking && this.bossTimer <= 0) {
        this.bossLooking = false;
        this.emit('bossLook', { on: false });
        this.scheduleBoss();
      }
    } else {
      this.bossLooking = !!this.bossForced;
    }

    if (this.inputDown) {
      if (this.bossLooking) {
        this.inputDown = false;
        this.prep = clamp(this.prep - TUNING.prepPenalty, 0, 100);
        this.time += TUNING.caughtPenaltyMs;
        this.caught++;
        this.say('発見!!', 900);
        this.emit('caught', { prep: this.prep });
      } else {
        const oldStage = this.prepStage;
        this.prep = clamp(this.prep + TUNING.prepRate * dt, 0, 100);
        this.prepStage = clamp(Math.floor(this.prep / 25), 0, 3);
        if (oldStage !== this.prepStage || this.prepAnim.age > 420) {
          this.prepAnim = { stage: this.prepStage, age: 0, serial: this.prepAnim.serial + 1 };
          this.emit('prepAction', { stage: this.prepStage, prep: this.prep, serial: this.prepAnim.serial });
        }
      }
    }
    if (this.prep >= 100 || this.time >= TUNING.prepMs) this.enterInterlude(ACT.JUST);
  }

  enterJust() {
    this.act = ACT.JUST;
    this.time = 0;
    this.inputDown = false;
    this.bossLooking = false;
    this.justPresses = 0;
    this.justJudge = null;
    this.justOffset = null;
    this.justStamp = '';
    this.say('17:59:50', 900);
    this.emit('act', { act: this.act });
  }

  tickJust() {
    this.justClockMs = -10000 + this.time;
    if (this.time >= TUNING.justMs && !this.justJudge) this.resolveJust(5000);
  }

  resolveJust(offset) {
    this.justPresses++;
    if (offset < -300 && this.justPresses < 2) {
      this.say('おや? 早いね', 1100);
      this.time = 0;
      this.justClockMs = -10000;
      this.emit('flying');
      return;
    }
    const abs = Math.abs(offset);
    let judge = 'LATE';
    if (offset < -300) judge = 'GOOD';
    else if (abs <= 50) judge = 'PERFECT';
    else if (abs <= 150) judge = 'GREAT';
    else if (abs <= 300) judge = 'GOOD';
    this.justOffset = Math.round(offset);
    this.justJudge = judge;
    this.justSlow = judge === 'PERFECT' ? 2500 : judge === 'GREAT' ? 2000 : judge === 'GOOD' ? 1600 : 1400;
    this.justStamp = fmtStamp(this.justOffset);
    this.act = ACT.JUST_SLOW;
    this.time = 0;
    this.inputDown = false;
    this.say(judge === 'PERFECT' ? '音速定時!!' : judge, this.justSlow + 900);
    this.emit('just', { judge, offset: this.justOffset, slow: this.justSlow, stamp: this.justStamp });
  }

  tickJustSlow() {
    const total = TUNING.justFlashMs + TUNING.justFreezeMs + this.justSlow;
    if (this.time >= total) this.enterInterlude(ACT.DASH);
  }

  enterDash() {
    this.act = ACT.DASH;
    this.time = 0;
    const judgeBonus = { PERFECT: 360, GREAT: 260, GOOD: 170, LATE: 90 }[this.justJudge] || 90;
    this.speed = 330 + judgeBonus + this.prep * 3.1;
    this.runX = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.qtes = [];
    this.nextQteX = 560 - this.day * 28;
    this.directorSpawned = false;
    this.emit('act', { act: this.act });
  }

  tickDash(dt) {
    const bind = this.qtes.some((q) => q.failedBind > 0);
    if (bind) this.speed = Math.max(90, this.speed - dt * 0.32);
    else this.speed = lerp(this.speed, 620 + this.combo * 18, 0.008);
    this.runX += this.speed * dt / 1000;
    for (const q of this.qtes) {
      q.age += dt;
      q.dist = q.x - this.runX;
      q.failedBind = Math.max(0, q.failedBind - dt);
      if (!q.done && q.dist < -TUNING.qteWindowMs * this.speed / 1000) this.failQte(q);
    }
    // Keep failed QTEs while their bind animation is active; dropping them early skips slowdown feedback.
    this.qtes = this.qtes.filter((q) => q.failedBind > 0 || (!q.done && q.age < 3600));
    const qteStop = this.day === 4 ? 4100 : 3700;
    if (this.runX > this.nextQteX && this.runX < qteStop) this.spawnQTE();
    if (this.day === 4 && this.runX > 3920 && !this.directorSpawned) this.spawnQTE('director');
    const finaleStart = this.day === 4 ? 4920 : 4520;
    if (this.runX >= finaleStart || this.time >= TUNING.dashMs) this.enterFinale();
  }

  enterFinale() {
    if (this.act === ACT.FINALE || this.act === ACT.DAY_RESULT || this.act === ACT.WEEK_RESULT) return;
    this.act = ACT.FINALE;
    this.time = 0;
    this.inputDown = false;
    this.qtes = [];
    this.finaleStarted = true;
    this.finaleGrade = this.hits === 0 ? 'perfect' : 'messy';
    this.speed = Math.max(this.speed, 820 + this.maxCombo * 24 + (this.day === 4 ? 120 : 0));
    this.say(this.finaleGrade === 'perfect' ? '完全退社!!' : '退社!!', 2200);
    this.emit('finale', { grade: this.finaleGrade, friday: this.day === 4, combo: this.maxCombo, hits: this.hits, judge: this.justJudge });
  }

  tickFinale(dt) {
    const t = clamp(this.time / TUNING.finaleMs, 0, 1);
    const sprint = this.time < TUNING.finaleFreezeStartMs;
    if (sprint) this.speed = lerp(this.speed, 1180 + this.maxCombo * 34 + (this.day === 4 ? 180 : 0), 0.025);
    else this.speed = lerp(this.speed, 360, 0.03);
    this.runX += this.speed * dt / 1000 * (this.time < TUNING.finaleFreezeStartMs ? 1 : 0.38);
    if (t >= 1) this.finishDay(true);
  }

  spawnQTE(type) {
    type = type || this.rng.pick(QTE_TYPES);
    if (this.day === 4 && this.runX > 4000 && !this.directorSpawned) type = 'director';
    if (type === 'director') this.directorSpawned = true;
    const q = {
      id: Math.floor(this.rng.next() * 1e9),
      type,
      x: this.runX + this.speed * TUNING.qteLeadMs / 1000,
      age: 0,
      dist: 999,
      done: false,
      failedBind: 0,
      taps: type === 'director' ? 3 : 1,
      variant: this.rng.int(0, 3),
      pair: type === 'coworker' && this.rng.next() < 0.35,
      wobble: this.rng.range(0, Math.PI * 2),
    };
    this.qtes.push(q);
    this.nextQteX += this.rng.range(560 - this.day * 20, 800 - this.day * 28);
    this.emit('qte', { qte: q });
    return q;
  }

  handleQtePress() {
    const active = this.qtes.filter((q) => !q.done).sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist))[0];
    if (!active) {
      this.combo = 0;
      this.say('空振り!', 420);
      this.emit('missPress');
      return false;
    }
    const msOff = active.dist / Math.max(1, this.speed) * 1000;
    if (Math.abs(msOff) <= TUNING.qteWindowMs) {
      active.taps--;
      if (active.taps <= 0) this.successQte(active, msOff);
      else {
        this.say('もう一発!', 360);
        this.emit('qteTap', { qte: active, left: active.taps });
      }
      return true;
    }
    this.failQte(active);
    return false;
  }

  successQte(q, msOff) {
    q.done = true;
    q.successAge = 0;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.speed += 105 + this.combo * 14;
    const text = q.type === 'coworker' ? 'お疲れ様でした!' : q.type === 'elevator' ? '滑り込み!' : q.type === 'director' ? '部長突破!!' : 'ジャスト!';
    this.say(text, 720);
    this.emit('qteSuccess', { qte: q, combo: this.combo, offset: Math.round(msOff) });
  }

  failQte(q) {
    if (q.done) return;
    q.done = true;
    q.failedBind = 1600;
    this.combo = 0;
    this.hits++;
    this.speed = Math.max(80, this.speed * 0.34);
    this.say(q.type === 'coworker' || q.type === 'director' ? 'まだ帰らないよね?' : '紙吹雪爆発!', 900);
    this.emit('qteFail', { qte: q, hits: this.hits });
  }

  press(down) {
    if (down === false) return this.release();
    if (this.act === ACT.TITLE || this.act === ACT.WEEK_RESULT) { this.start(); return; }
    if (this.act === ACT.INTERLUDE || this.act === ACT.JUST_SLOW || this.act === ACT.FINALE) return;
    if (this.act === ACT.DAY_RESULT) {
      if (this.time < TUNING.resultInputLockMs) return;
      this.nextDay();
      return;
    }
    if (this.paused) return;
    if (this.act === ACT.PREP) this.inputDown = true;
    else if (this.act === ACT.JUST && !this.justJudge) this.resolveJust(this.justClockMs);
    else if (this.act === ACT.DASH) this.handleQtePress();
  }

  release() { this.inputDown = false; }

  pressAt(offsetMs) {
    this.act = ACT.JUST;
    this.time = 10000 + Number(offsetMs || 0);
    this.justClockMs = Number(offsetMs || 0);
    this.resolveJust(this.justClockMs);
    return this.justJudge;
  }

  setAct(n) {
    n = Number(n);
    if (n === 1) { this.initDay(); this.enterPrep(); }
    else if (n === 2) this.enterJust();
    else if (n === 3) this.enterDash();
    else if (n === 4) this.act = ACT.JUST_SLOW;
    else if (n === 8) this.enterFinale();
    else this.act = clamp(Math.floor(n), 0, 8);
    return this.act;
  }

  setDay(n) { this.day = clamp(Math.floor(Number(n) || 0), 0, 4); this.initDay(); this.enterInterlude(ACT.PREP); return this.day; }
  setPrep(pct) { this.prep = clamp(Number(pct) || 0, 0, 100); this.prepStage = clamp(Math.floor(this.prep / 25), 0, 3); return this.prep; }
  bossLook(on) { this.bossForced = !!on; this.bossLooking = !!on; this.emit('bossLook', { on: this.bossLooking }); return this.bossLooking; }

  finishDay(fromFinale) {
    if (this.act === ACT.DAY_RESULT || this.act === ACT.WEEK_RESULT) return;
    if (!fromFinale && this.act === ACT.DASH) { this.enterFinale(); return; }
    const precision = this.justJudge === 'PERFECT' ? 1.25 : this.justJudge === 'GREAT' ? 1.05 : this.justJudge === 'GOOD' ? 0.82 : 0.55;
    const latePenalty = this.justOffset > 0 ? Math.min(0.35, this.justOffset / 3000) : 0;
    const prepMul = 0.55 + this.prep / 100 * 0.75;
    const dashMul = 0.72 + this.maxCombo * 0.08 - this.hits * 0.12;
    const score = Math.max(100, Math.round(10000 * (precision - latePenalty) * prepMul * Math.max(0.25, dashMul)));
    const rank = score >= 12000 ? 'S 音速定時' : score >= 9500 ? 'A' : score >= 7200 ? 'B' : score >= 4800 ? 'C' : 'D';
    this.dayScore = score;
    this.weekScore += score;
    this.dayResult = { day: this.day, score, rank, prep: Math.round(this.prep), judge: this.justJudge, offset: this.justOffset || 0, stamp: this.justStamp || fmtStamp(this.justOffset || 0), combo: this.maxCombo, hits: this.hits };
    this.weekResults[this.day] = this.dayResult;
    this.act = ACT.DAY_RESULT;
    this.time = 0;
    this.resultLines = 0;
    this.inputDown = false;
    this.say(rank, 1600);
    this.emit('dayResult', this.dayResult);
  }

  nextDay() {
    if (this.act !== ACT.DAY_RESULT) return;
    if (this.day >= 4) {
      this.act = ACT.WEEK_RESULT;
      this.time = 0;
      if (this.weekScore > this.best) {
        this.best = this.weekScore;
        try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (_) {}
      }
      this.emit('weekResult', this.result());
      return;
    }
    this.day++;
    this.initDay();
    this.enterInterlude(ACT.PREP);
    this.emit('act', { act: this.act });
  }

  result() {
    const title = this.weekScore >= 60000 ? '定時の鬼' : this.weekScore >= 47000 ? '帰宅レーサー' : this.weekScore >= 34000 ? '残業回避班' : '明日こそ定時';
    return { weekScore: this.weekScore, best: this.best, title, overtime: '0:00.000', days: this.weekResults.slice(), current: this.dayResult };
  }

  say(text, ms) { this.flashText = text; this.flashMs = ms || 900; }

  getState() {
    return {
      act: ACT_NAMES[this.act] || this.act,
      actId: this.act,
      interludeTarget: this.interludeTarget || null,
      day: this.day,
      dayName: DAYS[this.day],
      prep: Math.round(this.prep),
      prepStage: PREP_STAGES[this.prepStage],
      prepAnim: { stage: this.prepAnim.stage, age: Math.round(this.prepAnim.age), serial: this.prepAnim.serial },
      bossLooking: this.bossLooking,
      bossWarnMs: Math.round(this.bossWarn),
      clockMs: Math.round(this.justClockMs),
      slowMs: this.act === ACT.JUST_SLOW ? Math.round(this.time) : 0,
      finaleMs: this.act === ACT.FINALE ? Math.round(this.time) : 0,
      finaleGrade: this.finaleGrade,
      slowTotalMs: this.justSlow,
      score: this.weekScore + (this.act === ACT.DAY_RESULT || this.act === ACT.WEEK_RESULT ? 0 : this.dayScore),
      dayScore: this.dayScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      runX: Math.round(this.runX),
      speed: Math.round(this.speed),
      qte: this.qtes.filter((q) => !q.done).map((q) => ({ type: q.type, dist: Math.round(q.dist), taps: q.taps, variant: q.variant, pair: q.pair })),
      judge: this.justJudge,
      offset: this.justOffset,
      stamp: this.justStamp,
      resultLocked: this.act === ACT.DAY_RESULT && this.time < TUNING.resultInputLockMs,
      paused: this.paused,
    };
  }

  dump() {
    const s = this.getState();
    return `${s.dayName} ${s.act} prep=${s.prep}% boss=${s.bossLooking ? 'LOOK' : 'BACK'} clock=${s.clockMs}ms combo=${s.combo} run=${s.runX} qte=${s.qte.map((q) => q.type + ':' + q.dist).join(',')}`;
  }
}
