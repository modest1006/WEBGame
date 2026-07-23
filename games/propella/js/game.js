(function () {
  'use strict';

  const FIXED_STEP = 1000 / 60;
  const DEG = Math.PI / 180;
  const SEA_Y = 2;
  const CEILING_Y = 300;
  const BASE_SPEED = 60;
  const BOOST_SPEED = 120;
  const RING_RADIUS = 21;
  const MAX_X = 160;
  const MAX_SLIDE_X = 90;
  const MAX_SLIDE_Y = 70;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function length3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  function copyPosition(p) { return { x: p.x, y: p.y, z: p.z }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function distance(a, b) { return length3(a.x - b.x, a.y - b.y, a.z - b.z); }

  function comboMultiplier(streak) {
    if (streak <= 1) return 1;
    if (streak === 2) return 1.5;
    return Math.min(5, streak - 1);
  }

  function PropellaGame(options) {
    options = options || {};
    this.seed = Number(options.seed) || 1;
    this.bestScore = Math.max(0, Number(options.bestScore) || 0);
    this.listeners = [];
    this.restart();
  }

  PropellaGame.prototype.on = function (listener) {
    if (typeof listener === 'function') this.listeners.push(listener);
  };

  PropellaGame.prototype.emit = function (type, data) {
    for (let i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](type, data || {}); }
      catch (error) { if (typeof console !== 'undefined') console.error('[PROPELLA event]', type, error); }
    }
  };

  PropellaGame.prototype.restart = function () {
    this.rng = new PropellaRng(this.seed);
    this.mode = 'ready';
    this.timeMs = 90000;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.ringsPassed = 0;
    this.ringsMissed = 0;
    this.balloonsPopped = 0;
    this.speed = BASE_SPEED;
    this.boostFuel = 1;
    this.boosting = false;
    this.speedPenaltyMs = 0;
    this.bounceVelocity = 0;
    this.position = { x:0, y:82, z:0 };
    this.previousPosition = copyPosition(this.position);
    this.slideVelocity = { x:0, y:0 };
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.input = { pitch:0, roll:0, boost:false };
    this.autopilot = false;
    this.rings = [];
    this.balloons = [];
    this.mountains = [];
    this.clouds = [];
    this.nextEntityId = 1;
    this.nextRingOrder = 0;
    this.courseCursor = copyPosition(this.position);
    this.ringAudit = {
      generated:0,
      maxAbsDx:0,
      maxAbsDy:0,
      minDz:Infinity,
      maxDz:0,
      violations:0
    };
    this.skimTimer = 0;
    this.countdownSecond = -1;
    this.elapsedMs = 0;
    this.generateAhead();
    this.emit('restart', {});
  };

  PropellaGame.prototype.start = function () {
    if (this.mode !== 'ready') return;
    this.mode = 'play';
    this.emit('start', {});
  };

  PropellaGame.prototype.setInput = function (input, preserveAutopilot) {
    input = input || {};
    if (!preserveAutopilot) this.autopilot = false;
    if (input.pitch != null) this.input.pitch = clamp(Number(input.pitch) || 0, -1, 1);
    if (input.roll != null) this.input.roll = clamp(Number(input.roll) || 0, -1, 1);
    if (input.boost != null) this.input.boost = !!input.boost;
  };

  PropellaGame.prototype.generateAhead = function () {
    let future = 0;
    for (let i = 0; i < this.rings.length; i++) if (this.rings[i].status === 'active') future++;
    while (future < 8) {
      const previous = this.rings.length ? this.rings[this.rings.length - 1] : null;
      const distanceToNext = previous ? this.rng.range(150, 250) : 185;
      const origin = previous ? previous.position : this.courseCursor;
      const xDelta = previous ? this.rng.range(-110, 110) : this.rng.range(-70, 70);
      const yDelta = previous ? this.rng.range(-70, 70) : this.rng.range(-45, 45);
      const position = {
        x:clamp(origin.x + xDelta, -140, 140),
        y:clamp(origin.y + yDelta, 20, 260),
        z:origin.z + distanceToNext
      };
      const actualDx = position.x - origin.x;
      const actualDy = position.y - origin.y;
      const actualDz = position.z - origin.z;
      this.ringAudit.generated++;
      this.ringAudit.maxAbsDx = Math.max(this.ringAudit.maxAbsDx, Math.abs(actualDx));
      this.ringAudit.maxAbsDy = Math.max(this.ringAudit.maxAbsDy, Math.abs(actualDy));
      this.ringAudit.minDz = Math.min(this.ringAudit.minDz, actualDz);
      this.ringAudit.maxDz = Math.max(this.ringAudit.maxDz, actualDz);
      if (Math.abs(position.x) > 140.0001 || position.y < 19.9999 || position.y > 260.0001 ||
          Math.abs(actualDx) > 110.0001 || Math.abs(actualDy) > 70.0001 ||
          actualDz < 149.9999 || actualDz > 250.0001) {
        this.ringAudit.violations++;
      }
      const ring = {
        id:this.nextEntityId++,
        order:this.nextRingOrder++,
        position:position,
        forward:{ x:0, y:0, z:1 },
        radius:RING_RADIUS,
        gold:this.rng.next() < 0.15,
        status:'active'
      };
      this.rings.push(ring);
      this.courseCursor = copyPosition(position);
      this.generateSceneryForRing(ring, origin);
      future++;
    }
    if (this.rings.length > 18) {
      const removable = this.rings.length - 18;
      this.rings.splice(0, removable);
    }
    this.cleanupScenery();
  };

  PropellaGame.prototype.generateSceneryForRing = function (ring, origin) {
    const side = this.rng.next() < 0.5 ? -1 : 1;
    if (this.rng.next() < 0.64) {
      const corridorMountain = this.rng.next() < .12;
      const radius = corridorMountain ? this.rng.range(14, 24) : this.rng.range(32, 68);
      this.mountains.push({
        id:this.nextEntityId++,
        x:corridorMountain ? this.rng.range(-135, 135) : this.rng.range(210, 390) * side,
        z:ring.position.z + this.rng.range(-80, 80),
        radius:radius,
        height:corridorMountain ? this.rng.range(12, 28) : this.rng.range(48, 112),
        beach:radius * this.rng.range(1.08, 1.24),
        corridor:corridorMountain
      });
    }
    if (this.rng.next() < 0.5) {
      this.balloons.push({
        id:this.nextEntityId++,
        position:{
          x:clamp(lerp(origin.x, ring.position.x, this.rng.range(.28, .74)) + this.rng.range(-55, 55), -150, 150),
          y:clamp(lerp(origin.y, ring.position.y, .5) + this.rng.range(-28, 35), 24, 270),
          z:lerp(origin.z, ring.position.z, this.rng.range(.28, .74))
        },
        radius:9,
        color:this.rng.next() < .5 ? '#d84e3d' : '#edb83f',
        alive:true
      });
    }
    if (this.rng.next() < .66) {
      this.clouds.push({
        id:this.nextEntityId++,
        position:{
          x:clamp(lerp(origin.x, ring.position.x, this.rng.range(.2, .8)) + this.rng.range(-100, 100), -220, 220),
          y:clamp(lerp(origin.y, ring.position.y, .5) + this.rng.range(-20, 30), 35, 270),
          z:lerp(origin.z, ring.position.z, this.rng.range(.2, .8))
        },
        radius:this.rng.range(22, 38),
        inside:false
      });
    }
  };

  PropellaGame.prototype.cleanupScenery = function () {
    const p = this.position;
    this.balloons = this.balloons.filter(function (b) {
      return b.alive && distance(p, b.position) < 2400;
    });
    this.mountains = this.mountains.filter(function (m) {
      return length3(p.x - m.x, 0, p.z - m.z) < 2600;
    });
    this.clouds = this.clouds.filter(function (c) {
      return distance(p, c.position) < 2400;
    });
  };

  PropellaGame.prototype.update = function (dtMs) {
    dtMs = clamp(Number(dtMs) || 0, 0, 120000);
    let remaining = dtMs;
    while (remaining > .0001 && this.mode === 'play') {
      const slice = Math.min(FIXED_STEP, remaining);
      this.fixedStep(slice);
      remaining -= slice;
    }
  };

  PropellaGame.prototype.updateAutopilot = function () {
    const ring = this.nextRing();
    if (!ring) {
      this.input.pitch = 0;
      this.input.roll = 0;
      return false;
    }
    const dz = Math.max(.25, ring.position.z - this.position.z);
    const timeToRing = Math.max(.3, dz / Math.max(1, this.speed));
    const desiredX = clamp((ring.position.x - this.position.x) / Math.max(.3, timeToRing * .78), -MAX_SLIDE_X, MAX_SLIDE_X);
    const desiredY = clamp((ring.position.y - this.position.y) / Math.max(.3, timeToRing * .78), -MAX_SLIDE_Y, MAX_SLIDE_Y);
    this.input.roll = desiredX / MAX_SLIDE_X;
    this.input.pitch = desiredY / MAX_SLIDE_Y;
    return true;
  };

  PropellaGame.prototype.fixedStep = function (dtMs) {
    const dt = dtMs / 1000;
    this.elapsedMs += dtMs;
    this.timeMs -= dtMs;
    if (this.timeMs <= 0) {
      this.timeMs = 0;
      this.finish();
      return;
    }

    const secondsLeft = Math.ceil(this.timeMs / 1000);
    if (secondsLeft <= 10 && secondsLeft !== this.countdownSecond) {
      this.countdownSecond = secondsLeft;
      this.emit('countdown', { second:secondsLeft });
    }

    if (this.autopilot) this.updateAutopilot();

    let targetSlideX = this.input.roll * MAX_SLIDE_X;
    let targetSlideY = this.input.pitch * MAX_SLIDE_Y;
    if (this.position.x > 136 && targetSlideX > 0) {
      targetSlideX *= clamp((MAX_X - this.position.x) / (MAX_X - 136), 0, 1);
    } else if (this.position.x < -136 && targetSlideX < 0) {
      targetSlideX *= clamp((MAX_X + this.position.x) / (MAX_X - 136), 0, 1);
    }
    if (this.position.y > 276 && targetSlideY > 0) {
      targetSlideY *= clamp((CEILING_Y - this.position.y) / (CEILING_Y - 276), 0, 1);
    } else if (this.position.y < 24 && targetSlideY < 0) {
      targetSlideY *= clamp((this.position.y - SEA_Y) / (24 - SEA_Y), 0, 1);
    }
    const slideEase = 1 - Math.exp(-dt * 4.6);
    this.slideVelocity.x = lerp(this.slideVelocity.x, targetSlideX, slideEase);
    this.slideVelocity.y = lerp(this.slideVelocity.y, targetSlideY, slideEase);

    const targetPitch = (this.slideVelocity.y / MAX_SLIDE_Y) * 20 * DEG;
    const targetRoll = (this.slideVelocity.x / MAX_SLIDE_X) * 30 * DEG;
    const attitudeEase = 1 - Math.exp(-dt * 4.8);
    this.pitch = lerp(this.pitch, targetPitch, attitudeEase);
    this.roll = lerp(this.roll, targetRoll, attitudeEase);
    this.yaw = 0;

    if (this.speedPenaltyMs > 0) this.speedPenaltyMs = Math.max(0, this.speedPenaltyMs - dtMs);
    this.boosting = this.input.boost && this.boostFuel > .001 && this.speedPenaltyMs <= 0;
    if (this.boosting) this.boostFuel = Math.max(0, this.boostFuel - dt / 3);
    else this.boostFuel = Math.min(1, this.boostFuel + dt * .08);

    let targetSpeed = this.boosting ? BOOST_SPEED : BASE_SPEED;
    if (this.speedPenaltyMs > 0) targetSpeed *= .52;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * 3.1));

    this.previousPosition = copyPosition(this.position);
    this.position.x += this.slideVelocity.x * dt;
    this.position.y += this.slideVelocity.y * dt;
    this.position.z += this.speed * dt;
    if (this.bounceVelocity !== 0) {
      this.position.y += this.bounceVelocity * dt;
      this.bounceVelocity -= 36 * dt;
      if (this.bounceVelocity < 0 && this.position.y <= SEA_Y + 1) this.bounceVelocity = 0;
    }
    if (this.position.x < -MAX_X || this.position.x > MAX_X) {
      this.position.x = clamp(this.position.x, -MAX_X, MAX_X);
      if ((this.position.x <= -MAX_X && this.slideVelocity.x < 0) ||
          (this.position.x >= MAX_X && this.slideVelocity.x > 0)) {
        this.slideVelocity.x *= .35;
      }
    }
    if (this.position.y < SEA_Y) {
      this.position.y = SEA_Y;
      if (this.slideVelocity.y < 0) this.slideVelocity.y *= .35;
    }
    if (this.position.y > CEILING_Y) {
      this.position.y = CEILING_Y;
      if (this.slideVelocity.y > 0) this.slideVelocity.y *= .35;
    }

    this.checkRingCrossings();
    this.checkBalloons();
    this.checkMountains();
    this.checkClouds();
    this.checkSeaSkim(dt);
    this.generateAhead();
  };

  PropellaGame.prototype.nextRing = function () {
    for (let i = 0; i < this.rings.length; i++) {
      if (this.rings[i].status === 'active') return this.rings[i];
    }
    return null;
  };

  PropellaGame.prototype.checkRingCrossings = function () {
    const ring = this.nextRing();
    if (!ring) return;
    const rel0 = {
      x:this.previousPosition.x - ring.position.x,
      y:this.previousPosition.y - ring.position.y,
      z:this.previousPosition.z - ring.position.z
    };
    const rel1 = {
      x:this.position.x - ring.position.x,
      y:this.position.y - ring.position.y,
      z:this.position.z - ring.position.z
    };
    const d0 = dot(rel0, ring.forward);
    const d1 = dot(rel1, ring.forward);
    if (d0 <= 0 && d1 >= 0 && d1 !== d0) {
      const t = clamp(-d0 / (d1 - d0), 0, 1);
      const cross = {
        x:lerp(this.previousPosition.x, this.position.x, t),
        y:lerp(this.previousPosition.y, this.position.y, t),
        z:lerp(this.previousPosition.z, this.position.z, t)
      };
      const rel = {
        x:cross.x - ring.position.x,
        y:cross.y - ring.position.y,
        z:cross.z - ring.position.z
      };
      const along = dot(rel, ring.forward);
      const radial = length3(
        rel.x - ring.forward.x * along,
        rel.y - ring.forward.y * along,
        rel.z - ring.forward.z * along
      );
      if (radial <= ring.radius - 2.2) this.passRing(ring);
      else this.missRing(ring);
    } else if (d1 > 34) {
      this.missRing(ring);
    }
  };

  PropellaGame.prototype.passRing = function (ring) {
    ring = ring || this.nextRing();
    if (!ring || ring.status !== 'active') return false;
    ring.status = 'passed';
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.ringsPassed++;
    const multiplier = comboMultiplier(this.combo);
    const base = ring.gold ? 500 : 100;
    const gain = Math.round(base * multiplier);
    const timeGain = ring.gold ? 5000 : 2000;
    this.score += gain;
    this.timeMs += timeGain;
    this.boostFuel = Math.min(1, this.boostFuel + .3);
    this.emit('ring', {
      id:ring.id,
      gold:ring.gold,
      score:gain,
      timeMs:timeGain,
      combo:this.combo,
      multiplier:multiplier,
      position:copyPosition(ring.position)
    });
    this.generateAhead();
    return true;
  };

  PropellaGame.prototype.missRing = function (ring) {
    ring = ring || this.nextRing();
    if (!ring || ring.status !== 'active') return false;
    ring.status = 'missed';
    this.ringsMissed++;
    const lostCombo = this.combo;
    this.combo = 0;
    this.emit('miss', { id:ring.id, lostCombo:lostCombo, position:copyPosition(ring.position) });
    this.generateAhead();
    return true;
  };

  PropellaGame.prototype.checkBalloons = function () {
    for (let i = 0; i < this.balloons.length; i++) {
      const balloon = this.balloons[i];
      if (!balloon.alive) continue;
      if (distance(this.position, balloon.position) <= balloon.radius + 4) {
        balloon.alive = false;
        this.score += 50;
        this.balloonsPopped++;
        this.emit('balloon', {
          id:balloon.id,
          score:50,
          color:balloon.color,
          position:copyPosition(balloon.position)
        });
      }
    }
  };

  PropellaGame.prototype.checkMountains = function () {
    for (let i = 0; i < this.mountains.length; i++) {
      const mountain = this.mountains[i];
      const dx = this.position.x - mountain.x;
      const dz = this.position.z - mountain.z;
      const horizontal = Math.sqrt(dx * dx + dz * dz);
      if (horizontal >= mountain.radius + 3) continue;
      const normalizedRadius = clamp(horizontal / mountain.radius, 0, 1);
      const surface = SEA_Y + mountain.height * Math.pow(1 - normalizedRadius, .72);
      if (this.position.y > surface + 4) continue;
      const inv = 1 / (horizontal || 1);
      const nx = horizontal < .001 ? (mountain.x >= 0 ? -1 : 1) : dx * inv;
      this.position.x = clamp(mountain.x + nx * (mountain.radius + 5), -MAX_X, MAX_X);
      this.position.z = Math.min(this.position.z, mountain.z - mountain.radius * .55);
      this.position.y = Math.max(this.position.y, surface + 7);
      this.pitch = Math.max(this.pitch, 15 * DEG);
      this.slideVelocity.x = nx * 55;
      this.slideVelocity.y = Math.max(this.slideVelocity.y, 24);
      this.bounceVelocity = 31;
      this.speedPenaltyMs = 2000;
      this.speed *= .48;
      this.emit('mountain', {
        id:mountain.id,
        position:{ x:this.position.x, y:this.position.y, z:this.position.z },
        penaltyMs:2000
      });
      break;
    }
  };

  PropellaGame.prototype.checkClouds = function () {
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const inside = distance(this.position, cloud.position) < cloud.radius;
      if (inside && !cloud.inside) {
        cloud.inside = true;
        this.emit('cloud', { id:cloud.id, position:copyPosition(cloud.position) });
      } else if (!inside && cloud.inside) {
        cloud.inside = false;
      }
    }
  };

  PropellaGame.prototype.checkSeaSkim = function (dt) {
    if (this.position.y < 11 && this.speed > 45) {
      this.skimTimer -= dt;
      if (this.skimTimer <= 0) {
        this.skimTimer = .12;
        this.emit('seaSkim', { position:copyPosition(this.position), speed:this.speed });
      }
    } else {
      this.skimTimer = 0;
    }
  };

  PropellaGame.prototype.finish = function () {
    if (this.mode === 'result') return;
    this.mode = 'result';
    this.input.boost = false;
    this.boosting = false;
    this.autopilot = false;
    if (this.score > this.bestScore) this.bestScore = this.score;
    this.emit('finish', {
      score:this.score,
      rings:this.ringsPassed,
      maxCombo:this.maxCombo,
      bestScore:this.bestScore
    });
  };

  PropellaGame.prototype.teleport = function (x, y, z) {
    this.position.x = Number(x) || 0;
    this.position.y = clamp(Number(y) || SEA_Y, SEA_Y, CEILING_Y);
    this.position.z = Number(z) || 0;
    this.previousPosition = copyPosition(this.position);
    this.slideVelocity.x = 0;
    this.slideVelocity.y = 0;
    this.autopilot = false;
    this.emit('teleport', { position:copyPosition(this.position) });
  };

  PropellaGame.prototype.aimAtNextRing = function () {
    const ring = this.nextRing();
    if (!ring) return false;
    this.autopilot = true;
    return this.updateAutopilot();
  };

  PropellaGame.prototype.setTime = function (seconds) {
    this.timeMs = Math.max(0, Number(seconds) * 1000 || 0);
    if (this.mode === 'ready') this.start();
  };

  PropellaGame.prototype.forceBalloon = function () {
    for (let i = 0; i < this.balloons.length; i++) {
      if (!this.balloons[i].alive) continue;
      this.teleport(
        this.balloons[i].position.x,
        this.balloons[i].position.y,
        this.balloons[i].position.z
      );
      this.checkBalloons();
      return true;
    }
    return false;
  };

  PropellaGame.prototype.forceMountain = function () {
    const mountain = this.mountains[0];
    if (!mountain) return false;
    this.teleport(mountain.x, SEA_Y + Math.min(12, mountain.height * .2), mountain.z);
    this.checkMountains();
    return true;
  };

  PropellaGame.prototype.getState = function () {
    const next = this.nextRing();
    return {
      mode:this.mode,
      seed:this.seed,
      position:copyPosition(this.position),
      attitude:{ yaw:this.yaw, pitch:this.pitch, roll:this.roll },
      slideVelocity:{ x:this.slideVelocity.x, y:this.slideVelocity.y },
      autopilot:this.autopilot,
      speed:this.speed,
      baseSpeed:BASE_SPEED,
      boostSpeed:BOOST_SPEED,
      boostFuel:this.boostFuel,
      boosting:this.boosting,
      speedPenaltyMs:this.speedPenaltyMs,
      input:{ pitch:this.input.pitch, roll:this.input.roll, boost:this.input.boost },
      score:this.score,
      combo:this.combo,
      multiplier:comboMultiplier(this.combo),
      maxCombo:this.maxCombo,
      remainingMs:Math.max(0, Math.round(this.timeMs)),
      ringsPassed:this.ringsPassed,
      ringsMissed:this.ringsMissed,
      balloonsPopped:this.balloonsPopped,
      bestScore:this.bestScore,
      ringAudit:{
        generated:this.ringAudit.generated,
        maxAbsDx:this.ringAudit.maxAbsDx,
        maxAbsDy:this.ringAudit.maxAbsDy,
        minDz:isFinite(this.ringAudit.minDz) ? this.ringAudit.minDz : 0,
        maxDz:this.ringAudit.maxDz,
        violations:this.ringAudit.violations
      },
      nextRingId:next ? next.id : null,
      rings:this.rings.map(function (ring) {
        return {
          id:ring.id,
          order:ring.order,
          position:copyPosition(ring.position),
          forward:copyPosition(ring.forward),
          radius:ring.radius,
          gold:ring.gold,
          status:ring.status
        };
      }),
      balloons:this.balloons.filter(function (b) { return b.alive; }).map(function (b) {
        return { id:b.id, position:copyPosition(b.position), radius:b.radius, color:b.color };
      }),
      mountains:this.mountains.map(function (m) {
        return { id:m.id, x:m.x, z:m.z, radius:m.radius, height:m.height, beach:m.beach, corridor:!!m.corridor };
      }),
      clouds:this.clouds.map(function (c) {
        return { id:c.id, position:copyPosition(c.position), radius:c.radius };
      })
    };
  };

  PropellaGame.prototype.dump = function () {
    const next = this.nextRing();
    const lines = [
      'PROPELLA seed=' + this.seed + ' mode=' + this.mode,
      'pos=(' + this.position.x.toFixed(1) + ',' + this.position.y.toFixed(1) + ',' + this.position.z.toFixed(1) + ') speed=' + this.speed.toFixed(1),
      'slide=(' + this.slideVelocity.x.toFixed(1) + ',' + this.slideVelocity.y.toFixed(1) + ') attitude pitch=' + (this.pitch / DEG).toFixed(1) + ' roll=' + (this.roll / DEG).toFixed(1),
      'score=' + this.score + ' combo=' + this.combo + ' x' + comboMultiplier(this.combo) + ' time=' + (this.timeMs / 1000).toFixed(2),
      next ? 'NEXT #' + next.id + (next.gold ? ' GOLD' : '') + ' @ (' + next.position.x.toFixed(0) + ',' + next.position.y.toFixed(0) + ',' + next.position.z.toFixed(0) + ')' : 'NEXT none',
      'future rings=' + this.rings.filter(function (r) { return r.status === 'active'; }).length + ' balloons=' + this.balloons.filter(function (b) { return b.alive; }).length + ' islands=' + this.mountains.length
    ];
    return lines.join('\n');
  };

  PropellaGame.constants = {
    FIXED_STEP:FIXED_STEP,
    SEA_Y:SEA_Y,
    CEILING_Y:CEILING_Y,
    BASE_SPEED:BASE_SPEED,
    BOOST_SPEED:BOOST_SPEED,
    MAX_X:MAX_X,
    MAX_SLIDE_X:MAX_SLIDE_X,
    MAX_SLIDE_Y:MAX_SLIDE_Y,
    RING_RADIUS:RING_RADIUS,
    DEG:DEG
  };
  PropellaGame.comboMultiplier = comboMultiplier;
  window.PropellaGame = PropellaGame;
})();
