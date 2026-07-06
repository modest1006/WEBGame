class NeonDriveGame {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed || 8108;
    this.listeners = [];
    this.bestScore = 0;
    this.bestDistance = 0;
    try {
      this.bestScore = Number(localStorage.getItem(ND_STORAGE.bestScore) || 0);
      this.bestDistance = Number(localStorage.getItem(ND_STORAGE.bestDistance) || 0);
    } catch (_) {}
    this.resetCourse();
    this.state = 'title';
    this.resetRun();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) {
    for (const fn of this.listeners) {
      try { fn(type, data || {}); } catch (err) { console.error('[neondrive event]', type, err); }
    }
  }

  resetCourse() {
    this.courseRng = new NDRng(this.seedValue);
    this.segments = [];
    this.courseCursor = 0;
    this.courseCurve = 0;
    this.courseHill = 0;
    this._sectionLeft = 0;
    this._section = null;
    this.ensureSegments(0);
  }

  resetRun() {
    this.runRng = new NDRng(this.seedValue ^ 0x9e3779b9);
    this.acc = 0;
    this.time = 0;
    this.distance = 0;
    this.speed = this.state === 'title' ? 92 : 0;
    this.playerX = 0;
    this.steerInput = 0;
    this.brakeInput = false;
    this.boostQueued = false;
    this.boost = 0.22;
    this.boostTime = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.remaining = ND.rules.startTime;
    this.nextCheckpoint = ND.rules.checkpointDistance;
    this.crashes = 0;
    this.lastCountdown = 99;
    this.cars = [];
    this.nextCarId = 1;
    this.spawnAhead = 70;
    this.shake = 0;
    this.slowmo = 0;
    this.offroad = 0;
    this.spark = 0;
    this.gameOverSaved = false;
    this.ensureSegments(this.distance + 2400);
    this.seedTraffic();
  }

  start() {
    this.state = 'playing';
    this.resetRun();
    this.speed = 42;
    this.emit('start');
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.emit('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); }
  }

  createSection() {
    const r = this.courseRng;
    const templates = [
      { len: [34, 78], curve: [0, 0.0008], hill: [-0.02, 0.02] },
      { len: [46, 98], curve: [0.0015, 0.0042], hill: [-0.025, 0.035] },
      { len: [34, 70], curve: [0.0045, 0.008], hill: [-0.015, 0.035] },
      { len: [58, 104], curve: [-0.006, 0.006], hill: [0.035, 0.075], s: true },
      { len: [44, 84], curve: [-0.004, 0.004], hill: [-0.08, -0.035] },
    ];
    const t = r.pick(templates);
    const len = r.int(t.len[0], t.len[1]);
    let targetCurve = r.range(t.curve[0], t.curve[1]);
    if (Math.abs(targetCurve) > 0.0001) targetCurve *= r.sign();
    if (t.s) targetCurve = Math.abs(targetCurve || 0.004) * r.sign();
    return {
      len,
      age: 0,
      curve0: this.courseCurve,
      curve1: targetCurve,
      hill0: this.courseHill,
      hill1: r.range(t.hill[0], t.hill[1]),
      s: !!t.s,
      sideBias: r.sign(),
    };
  }

  ensureSegments(untilDistance) {
    const targetIndex = Math.ceil(untilDistance / ND.road.segmentLength) + ND.road.drawDistance + 40;
    while (this.segments.length <= targetIndex) {
      if (!this._section || this._sectionLeft <= 0) {
        this._section = this.createSection();
        this._sectionLeft = this._section.len;
      }
      const sec = this._section;
      const t = sec.age / Math.max(1, sec.len - 1);
      let curve = ndLerp(sec.curve0, sec.curve1, ndSmooth(t));
      if (sec.s) curve *= Math.sin(t * Math.PI * 2);
      const hill = ndLerp(sec.hill0, sec.hill1, ndSmooth(t));
      const i = this.segments.length;
      this.segments.push({
        i,
        z: i * ND.road.segmentLength,
        curve,
        hill,
        y: Math.sin(i * 0.037) * 0.12 + hill * 18,
        checkpoint: i > 0 && (i * ND.road.segmentLength) % ND.rules.checkpointDistance < ND.road.segmentLength,
        propSeed: this.courseRng.next(),
      });
      this.courseCurve = curve;
      this.courseHill = hill;
      sec.age++;
      this._sectionLeft--;
    }
  }

  seedTraffic() {
    this.cars.length = 0;
    for (let i = 0; i < 13; i++) this.spawnTraffic(80 + i * 75 + this.runRng.range(0, 45));
  }

  spawnTraffic(distAhead, lane) {
    const palette = ['cyan', 'magenta', 'yellow', 'blue', 'white'];
    const laneIndex = lane == null ? this.runRng.int(0, 2) : ndClamp(Math.floor(lane), 0, 2);
    const car = {
      id: this.nextCarId++,
      z: this.distance + distAhead,
      lane: laneIndex,
      x: ND.lanes[laneIndex],
      speed: this.runRng.range(54, 105),
      dir: this.runRng.next() < 0.17 ? -1 : 1,
      color: this.runRng.pick(palette),
      near: false,
      wobble: this.runRng.range(-0.04, 0.04),
    };
    car.x = ND.lanes[car.lane] + car.wobble;
    this.cars.push(car);
    return car;
  }

  setSteer(x) { this.steerInput = ndClamp(Number(x) || 0, -1, 1); }
  setBrake(on) { this.brakeInput = !!on; }
  requestBoost() { this.boostQueued = true; }

  update(dtMs, force) {
    if (!force && (this.state === 'paused' || this.state === 'dead')) return;
    const active = force || this.state === 'playing' || this.state === 'title';
    if (!active) return;
    const cap = this.slowmo > 0 ? 34 : 80;
    this.acc += Math.min(dtMs, cap) / 1000;
    while (this.acc >= ND.physics.step) {
      this.tick(ND.physics.step);
      this.acc -= ND.physics.step;
    }
  }

  tick(dt) {
    const attract = this.state === 'title';
    this.time += dt;
    this.ensureSegments(this.distance + 2600);
    const seg = this.getSegmentAt(this.distance);
    const steer = attract ? Math.sin(this.time * 0.9) * 0.42 : this.steerInput;
    const boostOn = this.boostTime > 0;
    if (this.boostQueued && this.boost >= 0.32 && this.state === 'playing') {
      this.boostQueued = false;
      this.boostTime = Math.min(4.1, 1.35 + this.boost * 2.4);
      this.boost = Math.max(0, this.boost - 0.32);
      this.emit('boost', { power: this.boostTime });
    } else {
      this.boostQueued = false;
    }

    const maxSpeed = boostOn ? ND.physics.boostMaxSpeed : ND.physics.maxSpeed;
    let accel = attract ? 10 : ND.physics.accel;
    if (this.brakeInput && !attract) accel -= ND.physics.brake;
    if (Math.abs(this.playerX) > 1) {
      if (this.speed > ND.physics.offroadMinSpeed) accel -= ND.physics.offroadSlow;
      this.offroad = Math.min(1, this.offroad + dt * 4);
      this.spark = Math.max(this.spark, Math.min(1, (Math.abs(this.playerX) - 1) * 2));
      if (this.time % 0.16 < dt) this.emit('offroad', { side: Math.sign(this.playerX) });
    } else {
      this.offroad = Math.max(0, this.offroad - dt * 3);
    }
    this.speed += accel * dt;
    this.speed -= this.speed * ND.physics.drag * dt;
    if (boostOn) this.speed += 30 * dt;
    this.speed = ndClamp(this.speed, 0, maxSpeed);
    this.distance += this.speed * dt * (this.slowmo > 0 ? 0.55 : 1);

    const curveForce = seg.curve * this.speed * ND.physics.centrifugal;
    this.playerX += steer * ND.physics.steerSpeed * dt * (0.65 + this.speed / 120);
    this.playerX -= curveForce * dt;
    if (Math.abs(this.playerX) > 1.25) this.playerX = ndLerp(this.playerX, Math.sign(this.playerX) * 1.25, dt * 8);

    this.updateCars(dt);
    this.updateRules(dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.boost = ndClamp(this.boost + dt * (this.speed > 112 ? 0.038 : 0.015), 0, 1);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.shake = Math.max(0, this.shake - dt * 2.7);
    this.spark = Math.max(0, this.spark - dt * 5);
    this.slowmo = Math.max(0, this.slowmo - dt);
  }

  updateCars(dt) {
    for (const car of this.cars) {
      const relative = car.dir < 0 ? this.speed + car.speed * 0.72 : this.speed - car.speed;
      car.z -= relative * dt;
      const dz = car.z - this.distance;
      const lateral = Math.abs(car.x - this.playerX);
      if (this.state === 'playing' && dz > -0.4 && dz < ND.rules.crashRadiusZ && lateral < ND.rules.crashLateral) {
        this.crash(car);
      } else if (this.state === 'playing' && !car.near && dz > -1.2 && dz < ND.rules.nearMissDistance && lateral < ND.rules.nearMissLateral && lateral > 0.18) {
        car.near = true;
        const bonus = Math.floor(450 + this.speed * 14 + this.combo * 120);
        this.score += bonus;
        this.combo++;
        this.comboTimer = 2.8;
        this.boost = ndClamp(this.boost + 0.17 + this.combo * 0.012, 0, 1);
        this.shake = Math.max(this.shake, 0.35);
        this.emit('nearmiss', { bonus, combo: this.combo, side: Math.sign(car.x - this.playerX), dz, x: car.x });
      }
    }
    this.cars = this.cars.filter((c) => c.z > this.distance - 80 && c.z < this.distance + 1800);
    while (this.cars.length < 18) this.spawnTraffic(this.runRng.range(220, 1450));
  }

  updateRules(dt) {
    if (this.state !== 'playing') return;
    this.remaining -= dt * (this.slowmo > 0 ? 0.35 : 1);
    // floorしない（tick毎にfloorすると中速以下で毎回0点になる）。表示側でfloorする
    this.score += (this.speed * dt) * (1 + (this.speed > 118 ? 1.2 : 0.25)) + this.combo * dt * 38;
    if (this.distance >= this.nextCheckpoint) {
      const bonus = Math.max(ND.rules.checkpointBonusMin, ND.rules.checkpointBonus - Math.floor(this.nextCheckpoint / 4500));
      this.remaining += bonus;
      this.nextCheckpoint += ND.rules.checkpointDistance;
      this.score += 2500 + this.combo * 250;
      this.boost = ndClamp(this.boost + 0.28, 0, 1);
      this.emit('checkpoint', { bonus, next: this.nextCheckpoint });
    }
    const countdown = Math.ceil(this.remaining);
    if (countdown <= 10 && countdown > 0 && countdown !== this.lastCountdown) {
      this.lastCountdown = countdown;
      this.emit('countdown', { time: countdown });
    }
    if (this.remaining <= 0) this.gameOver();
  }

  crash(car) {
    if (this.slowmo > 0.25) return;
    this.crashes++;
    this.speed *= ND.physics.crashSlow;
    this.remaining = Math.max(0, this.remaining - 4.5);
    this.combo = 0;
    this.comboTimer = 0;
    this.boost = Math.max(0, this.boost - 0.22);
    this.shake = 1.4;
    this.slowmo = 0.9;
    if (car) car.z = this.distance - 20;
    this.emit('crash', { crashes: this.crashes, x: car ? car.x : this.playerX });
  }

  gameOver() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.saveBest();
    this.emit('dead', { score: this.score, distance: this.distance, bestScore: this.bestScore, bestDistance: this.bestDistance });
  }

  saveBest() {
    if (this.gameOverSaved) return;
    this.gameOverSaved = true;
    this.bestScore = Math.max(this.bestScore, Math.floor(this.score));
    this.bestDistance = Math.max(this.bestDistance, Math.floor(this.distance));
    try {
      localStorage.setItem(ND_STORAGE.bestScore, String(this.bestScore));
      localStorage.setItem(ND_STORAGE.bestDistance, String(this.bestDistance));
    } catch (_) {}
  }

  getSegmentAt(dist) {
    this.ensureSegments(dist + 200);
    return this.segments[Math.max(0, Math.floor(dist / ND.road.segmentLength))] || this.segments[0];
  }

  getForwardSegments(count) {
    const base = Math.floor(this.distance / ND.road.segmentLength);
    this.ensureSegments(this.distance + count * ND.road.segmentLength + 400);
    return this.segments.slice(base, base + count);
  }

  setSpeed(v) { this.speed = ndClamp(Number(v) || 0, 0, ND.physics.boostMaxSpeed); }
  setX(x) { this.playerX = ndClamp(Number(x) || 0, -1.25, 1.25); }
  setTime(s) { this.remaining = Math.max(0, Number(s) || 0); }
  addScore(n) { this.score += Math.floor(Number(n) || 0); }
  teleport(dist) {
    this.distance = Math.max(0, Number(dist) || 0);
    this.ensureSegments(this.distance + 2600);
    this.nextCheckpoint = (Math.floor(this.distance / ND.rules.checkpointDistance) + 1) * ND.rules.checkpointDistance;
    this.cars.length = 0;
    this.seedTraffic();
  }

  spawnCar(lane, distAhead) {
    const car = this.spawnTraffic(Number(distAhead) || 60, Number(lane) || 0);
    car.z = this.distance + (Number(distAhead) || 60);
    return car;
  }

  getSnapshot() {
    const seg = this.getSegmentAt(this.distance);
    return {
      state: this.state,
      speed: Math.round(this.speed * 3.6),
      speedRaw: Math.round(this.speed * 100) / 100,
      distance: Math.floor(this.distance),
      remaining: Math.max(0, Math.round(this.remaining * 10) / 10),
      score: Math.floor(this.score),
      bestScore: this.bestScore,
      bestDistance: this.bestDistance,
      boost: Math.round(this.boost * 100) / 100,
      boostTime: Math.round(this.boostTime * 100) / 100,
      combo: this.combo,
      crashes: this.crashes,
      playerX: Math.round(this.playerX * 100) / 100,
      offroad: Math.round(this.offroad * 100) / 100,
      curve: Math.round(seg.curve * 100000) / 100000,
      hill: Math.round(seg.hill * 1000) / 1000,
      cars: this.cars
        .map((c) => ({ id: c.id, lane: c.lane, x: Math.round(c.x * 100) / 100, dz: Math.round((c.z - this.distance) * 10) / 10, color: c.color, dir: c.dir }))
        .filter((c) => c.dz > -20 && c.dz < 240)
        .sort((a, b) => a.dz - b.dz),
    };
  }

  dump() {
    const segs = this.getForwardSegments(24).map((s) => {
      const mark = s.checkpoint ? 'CP' : '  ';
      return `${String(s.i).padStart(5, '0')} ${mark} c=${s.curve.toFixed(4)} h=${s.hill.toFixed(3)}`;
    });
    const cars = this.getSnapshot().cars.map((c) => `car#${c.id} lane=${c.lane} dz=${c.dz} x=${c.x} ${c.color}`).join('\n') || 'no nearby cars';
    return [`NEON DRIVE state=${this.state} speed=${this.speed.toFixed(1)} dist=${this.distance.toFixed(1)}`, segs.join('\n'), cars].join('\n');
  }
}
