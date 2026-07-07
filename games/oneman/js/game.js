(function () {
  'use strict';

  const Phase = {
    TITLE: 'TITLE',
    RUN_INTRO: 'RUN_INTRO',
    DEPART: 'DEPART',
    CRUISE: 'CRUISE',
    APPROACH: 'APPROACH',
    FINAL: 'FINAL',
    STOPPED: 'STOPPED',
    OVERRUN: 'OVERRUN',
    CREEP: 'CREEP',
    STATION_RESULT: 'STATION_RESULT',
    DOORS: 'DOORS',
    FINAL_RESULT: 'FINAL_RESULT',
    PAUSE: 'PAUSE'
  };

  const Shot = { COCKPIT: 'COCKPIT', SIDE_STOP: 'SIDE_STOP', CINE_SIDE: 'CINE_SIDE', CINE_FRONT: 'CINE_FRONT', CINE_AERIAL: 'CINE_AERIAL', CINE_TAIL: 'CINE_TAIL', PLATFORM: 'PLATFORM' };
  const STEP_MS = 16.6667;
  const BRAKE_TAU = 0.6;
  const NOTCHES = ['N', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'EB'];
  const DECEL = [0, 0.25, 0.32, 0.42, 0.54, 0.68, 0.84, 0.98, 1.10, 1.60];
  const ROUTE = [
    { name: 'たばがわ', kanji: '田場川', theme: '田園', length: 920 },
    { name: 'こもれび台', kanji: '木漏台', theme: '住宅地', length: 1040 },
    { name: 'みやま口', kanji: '深山口', theme: '山間', length: 1120 },
    { name: 'うみかぜ浜', kanji: '海風浜', theme: '海沿い', length: 980 }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x6d2b79f5;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function conditionFor(seed, index) {
    const rnd = makeRng((seed || 0) + index * 0x9e3779b9);
    const startDist = 420 + rnd() * 100;
    const startKmh = 62 + rnd() * 13;
    const gradePermille = -10 + rnd() * 20;
    return {
      index: index,
      startDist: startDist,
      startKmh: startKmh,
      gradePermille: gradePermille,
      gradeFrom: startDist * (0.28 + rnd() * 0.12),
      gradeTo: startDist * (0.62 + rnd() * 0.16)
    };
  }
  function gradeAt(dist, condition) {
    if (!condition) return 0;
    if (dist <= condition.gradeTo && dist >= condition.gradeFrom) return condition.gradePermille;
    return 0;
  }
  function eventSink() {}

  function OneManGame(opts) {
    opts = opts || {};
    this.seed = opts.seed || 0;
    this.listeners = [];
    this.best = 0;
    this.runSerial = 0;
    this.reset();
    this.validation = opts.skipValidate ? null : this.validate();
  }

  OneManGame.Phase = Phase;
  OneManGame.Shot = Shot;
  OneManGame.NOTCHES = NOTCHES;
  OneManGame.DECEL = DECEL;
  OneManGame.STEP_MS = STEP_MS;
  OneManGame.conditionFor = conditionFor;
  OneManGame.ROUTE = ROUTE;

  OneManGame.prototype.on = function (fn) { this.listeners.push(fn || eventSink); };
  OneManGame.prototype.emit = function (type, data) {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i](type, data || {});
  };
  OneManGame.prototype.reset = function () {
    this.phase = Phase.TITLE;
    this.prevPhase = null;
    this.shot = Shot.COCKPIT;
    this.condition = conditionFor(this.seed, this.runSerial);
    this.startDist = this.condition.startDist;
    this.sectionLength = ROUTE[0].length;
    this.routePos = this.sectionLength - this.startDist;
    this.dist = this.startDist;
    this.x = 0;
    this.v = this.condition.startKmh / 3.6;
    this.commandNotch = 0;
    this.effectiveBrake = 0;
    this.notchMoves = 0;
    this.usedEb = false;
    this.usedCreep = false;
    this.jerkStop = false;
    this.lastStopDecel = 0;
    this.firstStopError = null;
    this.result = null;
    this.stationScores = [];
    this.stationIndex = 0;
    this.cruiseDurationMs = 14000;
    this.cineShots = [];
    this.cineShotIndex = 0;
    this.cineShotMs = 0;
    this.timeMs = 0;
    this.phaseTimeMs = 0;
    this.transition = { type: 'fade', t: 1, duration: 0.35 };
    this.dimensionFlash = 0;
    this.creepTarget = null;
  };
  OneManGame.prototype.start = function () {
    this.reset();
    this.stationIndex = 0;
    this.stationScores = [];
    this.prepareSection(0, true);
    this.setPhase(Phase.RUN_INTRO);
  };
  OneManGame.prototype.prepareSection = function (index, keepScores) {
    this.stationIndex = clamp(index, 0, ROUTE.length - 1);
    this.condition = conditionFor(this.seed, this.stationIndex + 1);
    this.sectionLength = ROUTE[this.stationIndex].length;
    this.startDist = this.condition.startDist;
    this.dist = this.sectionLength;
    this.routePos = 0;
    this.x = 0;
    this.v = 0;
    this.commandNotch = 0;
    this.effectiveBrake = 0;
    this.notchMoves = 0;
    this.usedEb = false;
    this.usedCreep = false;
    this.jerkStop = false;
    this.lastStopDecel = 0;
    this.firstStopError = null;
    this.result = null;
    this.dimensionFlash = 0;
    if (!keepScores) this.stationScores = [];
    this.makeCinePlan();
  };
  OneManGame.prototype.makeCinePlan = function () {
    const rnd = makeRng(this.seed + 1000 + this.stationIndex * 97);
    const shots = [Shot.CINE_SIDE, Shot.CINE_FRONT, Shot.CINE_AERIAL, Shot.CINE_TAIL];
    for (let i = shots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = shots[i]; shots[i] = shots[j]; shots[j] = t;
    }
    this.cineShots = shots.map(function (shot) { return { shot: shot, durationMs: 4000 + Math.floor(rnd() * 3000) }; });
    this.cineShotIndex = 0;
    this.cineShotMs = 0;
    this.cruiseDurationMs = this.cineShots.reduce(function (a, s) { return a + s.durationMs; }, 0);
  };
  OneManGame.prototype.resetRun = function (condition) {
    if (!condition) {
      this.runSerial++;
      condition = conditionFor(this.seed, this.runSerial);
    }
    this.phase = Phase.APPROACH;
    this.prevPhase = null;
    this.shot = Shot.COCKPIT;
    this.condition = condition;
    this.startDist = condition.startDist;
    this.sectionLength = ROUTE[this.stationIndex] ? ROUTE[this.stationIndex].length : 980;
    this.dist = this.startDist;
    this.routePos = this.sectionLength - this.dist;
    this.x = 0;
    this.v = condition.startKmh / 3.6;
    this.commandNotch = 0;
    this.effectiveBrake = 0;
    this.notchMoves = 0;
    this.usedEb = false;
    this.usedCreep = false;
    this.jerkStop = false;
    this.lastStopDecel = 0;
    this.firstStopError = null;
    this.result = null;
    this.timeMs = 0;
    this.phaseTimeMs = 0;
    this.dimensionFlash = 0;
    this.transition = { type: 'fade', t: 1, duration: 0.35 };
  };
  OneManGame.prototype.setPhase = function (phase) {
    if (this.phase === phase) return;
    const old = this.phase;
    this.prevPhase = old;
    this.phase = phase;
    this.phaseTimeMs = 0;
    if (phase === Phase.FINAL) {
      this.shot = Shot.SIDE_STOP;
      this.transition = { type: 'swish', t: 0, duration: 0.4 };
    } else if (phase === Phase.CRUISE) {
      this.shot = this.cineShots[0] ? this.cineShots[0].shot : Shot.CINE_SIDE;
      this.cineShotIndex = 0;
      this.cineShotMs = 0;
      if (old !== null) this.transition = { type: 'fade', t: 0, duration: 0.35 };
    } else if (phase === Phase.DEPART || phase === Phase.APPROACH) {
      this.shot = Shot.COCKPIT;
      if (old !== null) this.transition = { type: 'fade', t: 0, duration: 0.35, warning: old === Phase.CRUISE && phase === Phase.APPROACH };
    } else if (phase === Phase.STATION_RESULT || phase === Phase.DOORS || phase === Phase.FINAL_RESULT) {
      this.shot = Shot.PLATFORM;
      if (old !== null) this.transition = { type: 'fade', t: 0, duration: 0.35 };
    } else if (old !== null && old !== phase) {
      this.transition = { type: 'fade', t: 0, duration: 0.35 };
    }
    if (phase === Phase.STOPPED || phase === Phase.OVERRUN) this.finishByPhysics(phase);
    this.emit('phase', { from: old, to: phase });
  };
  OneManGame.prototype.brake = function (n) {
    n = clamp(Math.round(Number(n) || 0), 0, 9);
    const old = this.commandNotch;
    if (n === old) return;
    this.commandNotch = n;
    this.notchMoves++;
    if (n === 9) this.usedEb = true;
    this.emit(n < old ? 'brakeRelease' : 'brake', { notch: n });
  };
  OneManGame.prototype.adjustBrake = function (delta) { this.brake(this.commandNotch + delta); };
  OneManGame.prototype.update = function (dtMs) { this.step(dtMs); };
  OneManGame.prototype.step = function (dtMs) {
    let rest = dtMs === undefined ? STEP_MS : Math.max(0, Number(dtMs) || 0);
    while (rest > 0) {
      const d = Math.min(rest, STEP_MS);
      this.stepFixed(d / 1000);
      rest -= d;
    }
    return this.getState();
  };
  OneManGame.prototype.stepFixed = function (dt) {
    this.timeMs += dt * 1000;
    this.phaseTimeMs += dt * 1000;
    this.dimensionFlash = Math.max(0, this.dimensionFlash - dt);
    if (this.transition && this.transition.t < 1) this.transition.t = Math.min(1, this.transition.t + dt / this.transition.duration);
    if (this.phase === Phase.RUN_INTRO) {
      if (this.phaseTimeMs > 3000) this.setPhase(Phase.DEPART);
      return;
    }
    if (this.phase === Phase.DEPART) {
      this.v = Math.min(75 / 3.6, this.v + 0.82 * dt);
      this.routePos = Math.min(this.sectionLength - this.condition.startDist - 160, this.routePos + this.v * dt);
      this.dist = this.sectionLength - this.routePos;
      if (this.phaseTimeMs > 4200) this.setPhase(Phase.CRUISE);
      return;
    }
    if (this.phase === Phase.CRUISE) {
      this.v += ((75 / 3.6) - this.v) * Math.min(1, dt * 1.5);
      this.routePos = Math.min(this.sectionLength - this.condition.startDist, this.routePos + this.v * dt);
      this.dist = this.sectionLength - this.routePos;
      this.cineShotMs += dt * 1000;
      const current = this.cineShots[this.cineShotIndex];
      if (current && this.cineShotMs >= current.durationMs) {
        this.cineShotMs = 0;
        this.cineShotIndex = (this.cineShotIndex + 1) % this.cineShots.length;
        this.shot = this.cineShots[this.cineShotIndex].shot;
      }
      if (this.phaseTimeMs >= this.cruiseDurationMs || this.routePos >= this.sectionLength - this.condition.startDist) this.enterApproach();
      return;
    }
    if (this.phase === Phase.STOPPED || this.phase === Phase.OVERRUN) {
      if (this.phaseTimeMs > 1200) this.setPhase(Phase.STATION_RESULT);
      return;
    }
    if (this.phase === Phase.TITLE || this.phase === Phase.STATION_RESULT || this.phase === Phase.DOORS || this.phase === Phase.FINAL_RESULT) {
      if (this.phase === Phase.STATION_RESULT && this.phaseTimeMs > 4000) this.setPhase(Phase.DOORS);
      if (this.phase === Phase.DOORS && this.phaseTimeMs > 3200) {
        if (this.stationIndex >= ROUTE.length - 1) this.setPhase(Phase.FINAL_RESULT);
        else {
          this.prepareSection(this.stationIndex + 1, true);
          this.setPhase(Phase.DEPART);
        }
      }
      if (this.phase === Phase.FINAL_RESULT && this.phaseTimeMs > 6000) this.setPhase(Phase.TITLE);
      return;
    }
    if (this.phase === Phase.CREEP) {
      this.commandNotch = 0;
      this.effectiveBrake += (0 - this.effectiveBrake) * (1 - Math.exp(-dt / BRAKE_TAU));
      this.v = 0.85;
      this.x += this.v * dt;
      this.dist = this.startDist - this.x;
      this.routePos = this.sectionLength - this.dist;
      if (this.dist <= 0.04) {
        this.v = 0;
        this.setPhase(Phase.STOPPED);
      }
      return;
    }
    if (this.phase !== Phase.APPROACH && this.phase !== Phase.FINAL) return;
    const target = DECEL[this.commandNotch];
    this.effectiveBrake += (target - this.effectiveBrake) * (1 - Math.exp(-dt / BRAKE_TAU));
    const gAccel = -9.80665 * gradeAt(this.dist, this.condition) / 1000;
    const accel = -this.effectiveBrake + gAccel;
    const oldV = this.v;
    const newV = Math.max(0, oldV + accel * dt);
    const avgV = (oldV + newV) * 0.5;
    this.x += avgV * dt;
    this.dist = this.startDist - this.x;
    this.routePos = this.sectionLength - this.dist;
    this.v = newV;
    if (this.dist <= 15 && this.v < 25 / 3.6 && this.phase === Phase.APPROACH) this.setPhase(Phase.FINAL);
    if (this.dist < -10 && this.phase !== Phase.OVERRUN) {
      this.usedEb = true;
      this.commandNotch = 9;
      this.setPhase(Phase.OVERRUN);
      return;
    }
    if (oldV > 0 && this.v <= 0.0001) {
      this.v = 0;
      this.lastStopDecel = this.effectiveBrake - gAccel;
      this.jerkStop = this.lastStopDecel > 0.5;
      this.firstStopError = -this.dist;
      if (this.dist > 1) {
        this.usedCreep = true;
        this.setPhase(Phase.CREEP);
      } else {
        this.setPhase(Phase.STOPPED);
      }
    }
  };
  OneManGame.prototype.enterApproach = function () {
    this.resetRun(this.condition);
    this.dist = this.condition.startDist;
    this.startDist = this.condition.startDist;
    this.x = 0;
    this.routePos = this.sectionLength - this.dist;
    this.v = this.condition.startKmh / 3.6;
    this.setPhase(Phase.APPROACH);
    this.emit('approach', { station: this.stationIndex, condition: this.condition });
  };
  OneManGame.prototype.skipCruise = function () {
    if (this.phase === Phase.RUN_INTRO) {
      this.setPhase(Phase.DEPART);
    } else if (this.phase === Phase.CRUISE || this.phase === Phase.DEPART) {
      this.enterApproach();
    }
    return this.getState();
  };
  OneManGame.prototype.finishByPhysics = function (phase) {
    const error = this.usedCreep && this.firstStopError !== null ? this.firstStopError : -this.dist;
    const r = scoreStation(error, {
      jerk: this.jerkStop,
      eb: this.usedEb,
      overrun: phase === Phase.OVERRUN,
      creep: this.usedCreep,
      moves: this.notchMoves
    });
    this.result = r;
    this.stationScores[this.stationIndex] = r;
    this.dimensionFlash = 1.6;
    this.emit(this.jerkStop ? 'jerkStop' : 'stop', r);
  };
  function scoreStation(errorM, flags) {
    const abs = Math.abs(errorM);
    let base = abs <= 0.30 ? 100 : abs <= 1 ? 80 : abs <= 2 ? 55 : abs <= 5 ? 30 : 10;
    let rank = abs <= 0.30 ? 'ピタリ!!' : abs <= 1 ? '上出来' : abs <= 2 ? 'まずまず' : abs <= 5 ? '要修正' : '大外し';
    if (flags.creep) { base = Math.min(base, 10); rank = 'CREEP'; }
    let penalty = 0;
    if (flags.jerk) penalty += 15;
    if (flags.eb) penalty += 30;
    let bonus = flags.moves <= 6 ? 5 : 0;
    let score = clamp(base - penalty + bonus, 0, 100);
    if (flags.overrun) { score = 0; rank = 'OVERRUN'; bonus = 0; }
    return { errorM: errorM, absM: abs, base: base, penalty: penalty, bonus: bonus, score: score, rank: rank, jerk: !!flags.jerk, eb: !!flags.eb, creep: !!flags.creep, overrun: !!flags.overrun, moves: flags.moves };
  }
  OneManGame.prototype.finishStation = function (errorM) {
    this.dist = -Number(errorM || 0);
    this.v = 0;
    this.finishByPhysics(Math.abs(errorM) > 10 ? Phase.OVERRUN : Phase.STOPPED);
    return this.result;
  };
  OneManGame.prototype.resultSummary = function () {
    const total = this.stationScores.reduce(function (a, r) { return a + r.score; }, 0);
    let title = total >= 380 ? '名人運転士' : total >= 300 ? 'ベテラン' : total >= 200 ? '一人前' : total >= 100 ? '見習い' : '研修やり直し';
    return { total: total, title: title, stations: this.stationScores.slice() };
  };
  OneManGame.prototype.getState = function () {
    return {
      phase: this.phase,
      phaseTimeMs: this.phaseTimeMs,
      x: this.x,
      v: this.v,
      kmh: this.v * 3.6,
      notch: this.commandNotch,
      notchName: NOTCHES[this.commandNotch],
      effectiveBrake: this.effectiveBrake,
      targetBrake: DECEL[this.commandNotch],
      dist: this.dist,
      error: -this.dist,
      score: this.result ? this.result.score : 0,
      stationIndex: this.stationIndex,
      stationCount: ROUTE.length,
      station: ROUTE[this.stationIndex],
      routePos: this.routePos,
      sectionLength: this.sectionLength,
      shot: this.shot,
      gradePermille: gradeAt(this.dist, this.condition),
      condition: {
        index: this.condition.index,
        startDist: this.condition.startDist,
        startKmh: this.condition.startKmh,
        gradePermille: this.condition.gradePermille,
        gradeFrom: this.condition.gradeFrom,
        gradeTo: this.condition.gradeTo
      },
      jerkStop: this.jerkStop,
      lastStopDecel: this.lastStopDecel,
      firstStopError: this.firstStopError,
      moves: this.notchMoves,
      result: this.result,
      finalResult: this.resultSummary(),
      stationScores: this.stationScores.slice(),
      cineShotIndex: this.cineShotIndex,
      cineShotMs: this.cineShotMs,
      transition: this.transition,
      dimensionFlash: this.dimensionFlash
    };
  };
  OneManGame.prototype.dump = function () {
    const s = this.getState();
    const width = 60;
    const pos = clamp(Math.round((this.startDist - s.dist) / this.startDist * width), 0, width);
    const line = Array(width + 1).fill('-');
    line[width] = '|';
    line[pos] = 'T';
    return [
      'ONE-MAN DRIVER',
      line.join(''),
      'phase=' + s.phase + ' shot=' + s.shot + ' dist=' + s.dist.toFixed(2) + 'm v=' + s.kmh.toFixed(1) + 'km/h notch=' + s.notchName + ' effB=' + s.effectiveBrake.toFixed(3) + ' grade=' + s.gradePermille.toFixed(1)
    ].join('\n');
  };
  OneManGame.prototype.setSpeed = function (kmh) { this.v = Math.max(0, Number(kmh) || 0) / 3.6; return this.getState(); };
  OneManGame.prototype.setDist = function (m) { this.dist = Number(m) || 0; this.x = this.startDist - this.dist; return this.getState(); };
  OneManGame.prototype.skipTo = function (phase) { this.setPhase(Phase[phase] || phase); return this.getState(); };
  OneManGame.prototype.simulatePattern = function (pattern, limitMs, condition, options) {
    const sim = new OneManGame({ seed: this.seed, skipValidate: true });
    sim.resetRun(condition || this.condition);
    sim.setPhase(Phase.APPROACH);
    let t = 0, idx = 0;
    pattern = pattern || [{ at: 0, notch: 5 }];
    limitMs = limitMs || 180000;
    options = options || {};
    while (t < limitMs && sim.phase !== Phase.STATION_RESULT && sim.phase !== Phase.FINAL_RESULT) {
      while (idx < pattern.length && t >= pattern[idx].at) { sim.brake(pattern[idx].notch); idx++; }
      sim.step(STEP_MS);
      t += STEP_MS;
      if (options.stopOnCreep && sim.phase === Phase.CREEP) break;
      if (options.stopOnStopped && (sim.phase === Phase.STOPPED || sim.phase === Phase.OVERRUN)) break;
    }
    const st = sim.getState();
    const error = sim.result ? sim.result.errorM : (st.firstStopError !== null ? st.firstStopError : st.error);
    const pseudo = !sim.result && st.phase === Phase.CREEP ? scoreStation(error, { jerk: st.jerkStop, eb: sim.usedEb, overrun: false, creep: true, moves: sim.notchMoves }) : null;
    return { ok: !!sim.result || st.firstStopError !== null, timeMs: t, phase: st.phase, errorM: error, score: sim.result ? sim.result.score : (pseudo ? pseudo.score : 0), result: sim.result || pseudo, state: st };
  };
  OneManGame.prototype.simulateCondition = function (condition, pattern, limitMs) {
    return this.simulatePattern(pattern, limitMs || 180000, condition, { stopOnCreep: true, stopOnStopped: true });
  };
  OneManGame.prototype.bestConstantFor = function (condition) {
    let best = null;
    for (let n = 1; n <= 8; n++) {
      const r = this.simulateCondition(condition, [{ at: 0, notch: n }], 180000);
      const miss = Math.abs(r.errorM);
      const row = { notch: n, errorM: r.errorM, score: r.score, phase: r.phase, result: r.result, miss: miss };
      if (!best || row.score > best.score || (row.score === best.score && row.miss < best.miss)) best = row;
    }
    return best;
  };
  OneManGame.prototype.bestTwoStepFor = function (condition, constantNotch) {
    let best = null;
    let boundary = constantNotch;
    for (let n = 1; n <= 8; n++) {
      const r = this.simulateCondition(condition, [{ at: 0, notch: n }], 180000);
      if (r.errorM < 0) { boundary = n; break; }
    }
    const firsts = [];
    for (let n = Math.max(1, boundary - 1); n <= Math.min(8, boundary + 1); n++) firsts.push(n);
    const seconds = [0, 1, 2];
    for (let f = 0; f < firsts.length; f++) {
      for (let s = 0; s < seconds.length; s++) {
        let lo = 0, hi = 90000;
        for (let it = 0; it < 12; it++) {
          const t = Math.round((lo + hi) * 0.5 / 100) * 100;
          const r = this.simulateCondition(condition, [{ at: 0, notch: firsts[f] }, { at: t, notch: seconds[s] }], 140000);
          const miss = r.result && !r.result.creep && !r.result.overrun ? Math.abs(r.errorM) : Math.abs(r.errorM) + 1000;
          const row = { first: firsts[f], second: seconds[s], switchMs: t, errorM: r.errorM, score: r.score, phase: r.phase, result: r.result, miss: miss };
          if (!best || row.miss < best.miss) best = row;
          if (best && best.miss <= 0.03) return best;
          if (r.errorM > 0) lo = t + 100;
          else hi = t - 100;
        }
      }
    }
    return best;
  };
  OneManGame.prototype.sampleConditions = function (count) {
    const arr = [];
    for (let i = 1; i <= (count || ROUTE.length); i++) arr.push(conditionFor(this.seed, i));
    return arr;
  };
  OneManGame.prototype.constantDistribution = function (count) {
    const self = this;
    return this.sampleConditions(count || ROUTE.length).map(function (condition) {
      const best = self.bestConstantFor(condition);
      return {
        condition: condition,
        notch: best.notch,
        errorM: best.errorM,
        score: best.score,
        rank: best.result ? best.result.rank : best.phase,
        creep: !!(best.result && best.result.creep),
        overrun: !!(best.result && best.result.overrun)
      };
    });
  };
  OneManGame.prototype.validate = function () {
    const samples = this.sampleConditions(ROUTE.length);
    const rows = [];
    let ok = true;
    for (let i = 0; i < samples.length; i++) {
      const condition = samples[i];
      const b1 = this.simulateCondition(condition, [{ at: 0, notch: 1 }], 180000);
      const eb = this.simulateCondition(condition, [{ at: 0, notch: 9 }], 180000);
      const constant = this.bestConstantFor(condition);
      const two = this.bestTwoStepFor(condition, constant.notch);
      const b1Overruns = b1.phase === Phase.OVERRUN || b1.errorM > 0;
      const ebShort = eb.phase === Phase.CREEP || eb.errorM < 0 || (eb.result && eb.result.creep);
      const twoOk = !!(two && two.result && !two.result.creep && !two.result.overrun && Math.abs(two.errorM) <= 0.30);
      ok = ok && b1Overruns && ebShort && twoOk;
      rows.push({
        index: condition.index,
        startDist: condition.startDist,
        startKmh: condition.startKmh,
        gradePermille: condition.gradePermille,
        b1ErrorM: b1.errorM,
        ebErrorM: eb.errorM,
        bracketOk: b1Overruns && ebShort,
        constantNotch: constant.notch,
        constantErrorM: constant.errorM,
        constantScore: constant.score,
        twoStep: two ? { first: two.first, second: two.second, switchMs: two.switchMs, errorM: two.errorM, score: two.score } : null,
        twoStepOk: twoOk
      });
    }
    return { ok: ok, scenario: '4 route sections: B1 overruns, EB stops short, two-step reaches +/-30cm', samples: rows };
  };
  OneManGame.prototype.autoPlayRoute = function () {
    this.start();
    const log = [];
    let guard = 0;
    while (this.phase !== Phase.FINAL_RESULT && guard < 1200000) {
      if (this.phase === Phase.RUN_INTRO || this.phase === Phase.DEPART || this.phase === Phase.CRUISE) this.skipCruise();
      if (this.phase === Phase.APPROACH || this.phase === Phase.FINAL) {
        const best = this.bestTwoStepFor(this.condition, this.bestConstantFor(this.condition).notch);
        this.brake(best.first);
        let local = 0;
        while ((this.phase === Phase.APPROACH || this.phase === Phase.FINAL) && local < 160000) {
          if (local >= best.switchMs) this.brake(best.second);
          this.step(STEP_MS);
          local += STEP_MS;
          guard += STEP_MS;
        }
        log.push({ section: this.stationIndex + 1, condition: this.condition, plan: best, result: this.result });
      } else {
        this.step(STEP_MS);
        guard += STEP_MS;
      }
    }
    return { ok: this.phase === Phase.FINAL_RESULT, phase: this.phase, total: this.resultSummary().total, title: this.resultSummary().title, log: log, state: this.getState() };
  };

  window.OneManGame = OneManGame;
})();
