(function () {
  'use strict';

  const FIXED_STEP = 1000 / 60;
  const DEG = Math.PI / 180;
  const SEA_Y = 2;
  const CEILING_Y = 300;
  const BASE_SPEED = 60;
  const BOOST_SPEED = 120;
  const RING_RADIUS = 21;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function length3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  function copyPosition(p) { return { x: p.x, y: p.y, z: p.z }; }
  function angleWrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function normalized(x, y, z) {
    const len = length3(x, y, z) || 1;
    return { x:x / len, y:y / len, z:z / len };
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function distance(a, b) { return length3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }

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
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.input = { pitch:0, roll:0, boost:false };
    this.rings = [];
    this.balloons = [];
    this.mountains = [];
    this.clouds = [];
    this.nextEntityId = 1;
    this.courseHeading = 0;
    this.courseCursor = copyPosition(this.position);
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

  PropellaGame.prototype.setInput = function (input) {
    input = input || {};
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
      const turn = previous ? this.rng.range(-40, 40) * DEG : 0;
      this.courseHeading = angleWrap(this.courseHeading + turn);
      const yDelta = previous ? this.rng.range(-60, 60) : 0;
      const origin = previous ? previous.position : this.courseCursor;
      const nextY = clamp(origin.y + yDelta, 30, 265);
      const position = {
        x:origin.x + Math.sin(this.courseHeading) * distanceToNext,
        y:nextY,
        z:origin.z + Math.cos(this.courseHeading) * distanceToNext
      };
      const forward = normalized(position.x - origin.x, position.y - origin.y, position.z - origin.z);
      const ring = {
        id:this.nextEntityId++,
        order:this.rings.length,
        position:position,
        forward:forward,
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
    const lateralX = Math.cos(this.courseHeading);
    const lateralZ = -Math.sin(this.courseHeading);
    if (this.rng.next() < 0.64) {
      const offset = this.rng.range(75, 155) * side;
      const radius = this.rng.range(30, 62);
      this.mountains.push({
        id:this.nextEntityId++,
        x:ring.position.x + lateralX * offset,
        z:ring.position.z + lateralZ * offset,
        radius:radius,
        height:this.rng.range(45, 105),
        beach:radius * this.rng.range(1.08, 1.24)
      });
    }
    if (this.rng.next() < 0.5) {
      this.balloons.push({
        id:this.nextEntityId++,
        position:{
          x:lerp(origin.x, ring.position.x, this.rng.range(.28, .74)) + lateralX * this.rng.range(-45, 45),
          y:clamp(lerp(origin.y, ring.position.y, .5) + this.rng.range(-28, 35), 24, 270),
          z:lerp(origin.z, ring.position.z, this.rng.range(.28, .74)) + lateralZ * this.rng.range(-45, 45)
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
          x:lerp(origin.x, ring.position.x, this.rng.range(.2, .8)) + lateralX * this.rng.range(-80, 80),
          y:clamp(lerp(origin.y, ring.position.y, .5) + this.rng.range(-20, 30), 35, 270),
          z:lerp(origin.z, ring.position.z, this.rng.range(.2, .8)) + lateralZ * this.rng.range(-80, 80)
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

    const targetPitch = this.input.pitch * 35 * DEG;
    const targetRoll = this.input.roll * 55 * DEG;
    const attitudeEase = 1 - Math.exp(-dt * 4.8);
    this.pitch = lerp(this.pitch, targetPitch, attitudeEase);
    this.roll = lerp(this.roll, targetRoll, attitudeEase);

    if (this.position.y < 24) {
      const lift = (24 - this.position.y) / 22;
      this.pitch = lerp(this.pitch, 22 * DEG, clamp(lift * dt * 6, 0, 1));
    } else if (this.position.y > 278) {
      const down = (this.position.y - 278) / 22;
      this.pitch = lerp(this.pitch, -22 * DEG, clamp(down * dt * 6, 0, 1));
    }

    const maxYawRate = 55 * DEG;
    this.yaw = angleWrap(this.yaw + (this.roll / (55 * DEG)) * maxYawRate * dt);

    if (this.speedPenaltyMs > 0) this.speedPenaltyMs = Math.max(0, this.speedPenaltyMs - dtMs);
    this.boosting = this.input.boost && this.boostFuel > .001 && this.speedPenaltyMs <= 0;
    if (this.boosting) this.boostFuel = Math.max(0, this.boostFuel - dt / 3);
    else this.boostFuel = Math.min(1, this.boostFuel + dt * .08);

    let targetSpeed = this.boosting ? BOOST_SPEED : BASE_SPEED;
    if (this.speedPenaltyMs > 0) targetSpeed *= .52;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * 3.1));

    this.previousPosition = copyPosition(this.position);
    const cp = Math.cos(this.pitch);
    this.position.x += Math.sin(this.yaw) * cp * this.speed * dt;
    this.position.z += Math.cos(this.yaw) * cp * this.speed * dt;
    this.position.y += Math.sin(this.pitch) * this.speed * dt;
    if (this.bounceVelocity !== 0) {
      this.position.y += this.bounceVelocity * dt;
      this.bounceVelocity -= 36 * dt;
      if (this.bounceVelocity < 0 && this.position.y <= SEA_Y + 1) this.bounceVelocity = 0;
    }
    if (this.position.y < SEA_Y) {
      this.position.y += (SEA_Y - this.position.y) * Math.min(1, dt * 10);
      if (this.position.y < SEA_Y - .05) this.position.y = SEA_Y - .05;
    }
    if (this.position.y > CEILING_Y) {
      this.position.y += (CEILING_Y - this.position.y) * Math.min(1, dt * 10);
      if (this.position.y > CEILING_Y + .05) this.position.y = CEILING_Y + .05;
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
      const nx = horizontal < .001 ? Math.cos(this.yaw) : dx * inv;
      const nz = horizontal < .001 ? -Math.sin(this.yaw) : dz * inv;
      this.position.x = mountain.x + nx * (mountain.radius + 5);
      this.position.z = mountain.z + nz * (mountain.radius + 5);
      this.position.y = Math.max(this.position.y, surface + 7);
      this.yaw = angleWrap(Math.atan2(nx, nz) + this.rng.range(-.22, .22));
      this.pitch = Math.max(this.pitch, 15 * DEG);
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
    this.emit('teleport', { position:copyPosition(this.position) });
  };

  PropellaGame.prototype.aimAtNextRing = function () {
    const ring = this.nextRing();
    if (!ring) return false;
    const dx = ring.position.x - this.position.x;
    const dy = ring.position.y - this.position.y;
    const dz = ring.position.z - this.position.z;
    const horizontal = Math.sqrt(dx * dx + dz * dz) || 1;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, horizontal);
    this.roll = 0;
    this.input.pitch = clamp(this.pitch / (35 * DEG), -1, 1);
    this.input.roll = 0;
    return true;
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
        return { id:m.id, x:m.x, z:m.z, radius:m.radius, height:m.height, beach:m.beach };
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
      'attitude yaw=' + (this.yaw / DEG).toFixed(1) + ' pitch=' + (this.pitch / DEG).toFixed(1) + ' roll=' + (this.roll / DEG).toFixed(1),
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
    RING_RADIUS:RING_RADIUS,
    DEG:DEG
  };
  PropellaGame.comboMultiplier = comboMultiplier;
  window.PropellaGame = PropellaGame;
})();
