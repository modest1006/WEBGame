(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const DRAG_THRESHOLD_PX = 8;
  const FLICK_THRESHOLD_PX_PER_SEC = 1200;
  const FLICK_MAX_DEG_PER_SEC = 300;
  const INERTIA_TIME_CONSTANT_SEC = .4;
  const INERTIA_MAX_SEC = .9;
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function shortestDegrees(v) {
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  }
  function quaternion(x, y, z, w) { return { x:x, y:y, z:z, w:w }; }
  function normalize(q) {
    const length = Math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w) || 1;
    return quaternion(q.x/length, q.y/length, q.z/length, q.w/length);
  }
  function multiply(a, b) {
    return quaternion(
      a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
      a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
      a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
      a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z
    );
  }
  function inverse(q) { return quaternion(-q.x, -q.y, -q.z, q.w); }
  function axisAngle(x, y, z, angle) {
    const half = angle * .5;
    const s = Math.sin(half);
    return quaternion(x*s, y*s, z*s, Math.cos(half));
  }
  function fromEulerZXY(alpha, beta, gamma) {
    const qz = axisAngle(0, 0, 1, (Number(alpha) || 0) * DEG);
    const qx = axisAngle(1, 0, 0, (Number(beta) || 0) * DEG);
    const qy = axisAngle(0, 1, 0, (Number(gamma) || 0) * DEG);
    return normalize(multiply(multiply(qz, qx), qy));
  }
  function rotateVector(q, v) {
    const p = quaternion(v.x, v.y, v.z, 0);
    const r = multiply(multiply(q, p), inverse(q));
    return { x:r.x, y:r.y, z:r.z };
  }
  function elevation(v) { return Math.atan2(v.z, Math.sqrt(v.x*v.x + v.y*v.y)) / DEG; }
  function azimuth(v) { return Math.atan2(v.x, -v.y) / DEG; }
  function clone(q) { return q ? quaternion(q.x,q.y,q.z,q.w) : null; }

  function GhostLensInput(options) {
    options = options || {};
    this.surface = options.surface;
    this.onShutter = options.onShutter || function () {};
    this.onToggleDebug = options.onToggleDebug || function () {};
    this.isPlaying = options.isPlaying || function () { return false; };
    this.keys = {};
    this.pose = { yaw:0, pitch:0 };
    this.targetPose = { yaw:0, pitch:0 };
    this.dragOffset = { yaw:0, pitch:0 };
    this.inertia = { yawVelocity:0, ageSec:0 };
    this.pointer = {
      active:false,
      id:null,
      startX:0,
      startY:0,
      x:0,
      y:0,
      moved:0,
      dragStarted:false,
      velocityX:0,
      lastTime:0,
      type:''
    };
    this.ignoreMouseUntil = 0;
    this.gyro = {
      supported:typeof window.DeviceOrientationEvent !== 'undefined',
      enabled:false,
      permission:'unknown',
      calibrated:false,
      alpha:null, beta:null, gamma:null,
      quaternion:null,
      neutralQuaternion:null,
      neutralNormal:null,
      neutralTurnVector:null,
      neutralElevation:0,
      neutralAzimuth:0,
      rawYaw:0,
      rawPitch:0
    };
    this.bound = {};
    this.bind();
  }

  GhostLensInput.prototype.bind = function () {
    const self = this;
    this.bound.orientation = function (event) {
      if (event.beta == null || event.gamma == null) return;
      const alpha = event.alpha == null ? 0 : Number(event.alpha);
      const beta = Number(event.beta);
      const gamma = Number(event.gamma);
      if (!isFinite(alpha) || !isFinite(beta) || !isFinite(gamma)) return;
      self.gyro.alpha = alpha;
      self.gyro.beta = beta;
      self.gyro.gamma = gamma;
      self.gyro.quaternion = fromEulerZXY(alpha, beta, gamma);
    };
    this.bound.orientationChange = function () {
      if (self.gyro.enabled) self.gyro.calibrated = false;
    };
    this.bound.keyDown = function (event) {
      self.keys[event.code] = true;
      if (event.code === 'Space' && !event.repeat && self.isPlaying()) self.onShutter();
      if (event.code === 'Backquote' && !event.repeat) self.onToggleDebug();
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(event.code) >= 0) event.preventDefault();
    };
    this.bound.keyUp = function (event) { self.keys[event.code] = false; };
    this.bound.pointerDown = function (event) {
      if (!self.isPlaying()) return;
      if (event.target && event.target.closest && event.target.closest('button,.overlay')) return;
      if (event.target !== self.surface) return;
      event.preventDefault();
      const now = event.timeStamp == null ? performance.now() : Number(event.timeStamp);
      self.pointer.active = true;
      self.pointer.id = event.pointerId;
      self.pointer.startX = event.clientX;
      self.pointer.startY = event.clientY;
      self.pointer.x = event.clientX;
      self.pointer.y = event.clientY;
      self.pointer.moved = 0;
      self.pointer.dragStarted = false;
      self.pointer.velocityX = 0;
      self.pointer.lastTime = isFinite(now) ? now : performance.now();
      self.pointer.type = event.pointerType || 'mouse';
      self.inertia.yawVelocity = 0;
      self.inertia.ageSec = 0;
      if (self.surface.setPointerCapture) self.surface.setPointerCapture(event.pointerId);
    };
    this.bound.pointerMove = function (event) {
      if (!self.isPlaying()) return;
      if (self.pointer.active && event.pointerId === self.pointer.id) {
        event.preventDefault();
        const totalX = event.clientX - self.pointer.startX;
        const totalY = event.clientY - self.pointer.startY;
        self.pointer.moved = Math.hypot(totalX, totalY);
        const nowValue = event.timeStamp == null ? performance.now() : Number(event.timeStamp);
        const now = isFinite(nowValue) ? nowValue : performance.now();
        let dx = event.clientX - self.pointer.x;
        let dy = event.clientY - self.pointer.y;
        const velocityDx = dx;
        const elapsed = Math.max(1, now - self.pointer.lastTime);
        if (!self.pointer.dragStarted && self.pointer.moved >= DRAG_THRESHOLD_PX) {
          self.pointer.dragStarted = true;
          dx = totalX;
          dy = totalY;
        }
        if (self.pointer.dragStarted) {
          self.applyPointerDelta(dx, dy);
          self.pointer.velocityX = velocityDx / elapsed * 1000;
        }
        self.pointer.x = event.clientX;
        self.pointer.y = event.clientY;
        self.pointer.lastTime = now;
        return;
      }
      if ((event.pointerType || 'mouse') === 'mouse' && event.target === self.surface &&
          performance.now() > self.ignoreMouseUntil && (Math.abs(event.movementX) + Math.abs(event.movementY) < 100)) {
        self.applyPointerDelta(event.movementX, event.movementY);
      }
    };
    this.bound.pointerUp = function (event) {
      if (!self.pointer.active || event.pointerId !== self.pointer.id) return;
      event.preventDefault();
      const wasTap = !self.pointer.dragStarted && self.pointer.moved < DRAG_THRESHOLD_PX;
      const wasMouse = self.pointer.type === 'mouse';
      const nowValue = event.timeStamp == null ? performance.now() : Number(event.timeStamp);
      const now = isFinite(nowValue) ? nowValue : performance.now();
      const recentVelocity = now - self.pointer.lastTime <= 100 ? self.pointer.velocityX : 0;
      if (self.pointer.dragStarted && self.gyro.enabled && self.gyro.calibrated &&
          Math.abs(recentVelocity) >= FLICK_THRESHOLD_PX_PER_SEC) {
        const width = Math.max(1, window.innerWidth);
        self.inertia.yawVelocity = clamp(-recentVelocity / width * 180, -FLICK_MAX_DEG_PER_SEC, FLICK_MAX_DEG_PER_SEC);
        self.inertia.ageSec = 0;
      }
      self.pointer.active = false;
      self.pointer.id = null;
      self.ignoreMouseUntil = performance.now() + 80;
      if (wasTap && self.isPlaying()) self.onShutter({ pointerType:wasMouse ? 'mouse' : 'touch' });
    };
    window.addEventListener('keydown', this.bound.keyDown, { passive:false });
    window.addEventListener('keyup', this.bound.keyUp);
    window.addEventListener('orientationchange', this.bound.orientationChange);
    this.surface.addEventListener('pointerdown', this.bound.pointerDown, { passive:false });
    this.surface.addEventListener('pointermove', this.bound.pointerMove, { passive:false });
    this.surface.addEventListener('pointerup', this.bound.pointerUp, { passive:false });
    this.surface.addEventListener('pointercancel', this.bound.pointerUp, { passive:false });
  };

  GhostLensInput.prototype.applyPointerDelta = function (dx, dy) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    if (this.gyro.enabled && this.gyro.calibrated) {
      const yawDelta = -dx / width * 180;
      const pitchDelta = -dy / height * 120;
      const gyroPose = this.gyroPose() || { yaw:0, pitch:0 };
      this.dragOffset.yaw = shortestDegrees(this.dragOffset.yaw + yawDelta);
      const combinedPitch = clamp(gyroPose.pitch + this.dragOffset.pitch + pitchDelta, -60, 60);
      this.dragOffset.pitch = combinedPitch - gyroPose.pitch;
      this.pose.yaw = shortestDegrees(this.pose.yaw + yawDelta);
      this.pose.pitch = combinedPitch;
      return;
    }
    this.targetPose.yaw = shortestDegrees(this.targetPose.yaw - dx / width * 180);
    this.targetPose.pitch = clamp(this.targetPose.pitch - dy / height * 120, -60, 60);
    this.pose.yaw = this.targetPose.yaw;
    this.pose.pitch = this.targetPose.pitch;
  };

  GhostLensInput.prototype.requestGyro = function () {
    const self = this;
    if (!this.gyro.supported) {
      this.gyro.permission = 'unsupported';
      return Promise.resolve(false);
    }
    let request = Promise.resolve('granted');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { request = DeviceOrientationEvent.requestPermission(); }
      catch (error) { request = Promise.reject(error); }
    }
    return request.then(function (permission) {
      if (permission !== 'granted') {
        self.gyro.permission = 'denied';
        return false;
      }
      self.gyro.permission = 'granted';
      self.gyro.enabled = true;
      window.addEventListener('deviceorientation', self.bound.orientation, true);
      return true;
    }).catch(function () {
      self.gyro.permission = 'denied';
      return false;
    });
  };

  GhostLensInput.prototype.debugEnableGyro = function () {
    this.gyro.supported = true;
    this.gyro.permission = 'granted';
    this.gyro.enabled = true;
    window.addEventListener('deviceorientation', this.bound.orientation, true);
    return true;
  };

  GhostLensInput.prototype.calibrate = function () {
    if (!this.gyro.enabled || !this.gyro.quaternion) return false;
    this.resetDragOffset();
    const neutral = clone(this.gyro.quaternion);
    const normal = rotateVector(neutral, { x:0, y:0, z:1 });
    const top = rotateVector(neutral, { x:0, y:1, z:0 });
    const turnVector = Math.sqrt(normal.x*normal.x + normal.y*normal.y) >= .25 ? normal : top;
    this.gyro.neutralQuaternion = neutral;
    this.gyro.neutralNormal = normal;
    this.gyro.neutralTurnVector = turnVector;
    this.gyro.neutralElevation = elevation(normal);
    this.gyro.neutralAzimuth = azimuth(turnVector);
    this.gyro.rawYaw = 0;
    this.gyro.rawPitch = 0;
    this.gyro.calibrated = true;
    this.pose.yaw = this.targetPose.yaw = 0;
    this.pose.pitch = this.targetPose.pitch = 0;
    return true;
  };

  GhostLensInput.prototype.gyroPose = function () {
    const g = this.gyro;
    if (!g.calibrated || !g.quaternion || !g.neutralQuaternion) return null;
    const relative = normalize(multiply(g.quaternion, inverse(g.neutralQuaternion)));
    const normal = rotateVector(relative, g.neutralNormal);
    const turnVector = rotateVector(relative, g.neutralTurnVector);
    const yaw = shortestDegrees(azimuth(turnVector) - g.neutralAzimuth);
    const pitch = clamp(g.neutralElevation - elevation(normal), -60, 60);
    g.rawYaw = yaw;
    g.rawPitch = pitch;
    return { yaw:yaw, pitch:pitch };
  };

  GhostLensInput.prototype.update = function (dtMs) {
    const dt = clamp(Number(dtMs) || 16.7, 0, 100) / 1000;
    const keyYaw = (this.keys.ArrowLeft || this.keys.KeyA ? 1 : 0) - (this.keys.ArrowRight || this.keys.KeyD ? 1 : 0);
    const keyPitch = (this.keys.ArrowUp || this.keys.KeyW ? 1 : 0) - (this.keys.ArrowDown || this.keys.KeyS ? 1 : 0);
    if (!this.gyro.enabled || !this.gyro.calibrated) {
      this.targetPose.yaw = shortestDegrees(this.targetPose.yaw + keyYaw * 72 * dt);
      this.targetPose.pitch = clamp(this.targetPose.pitch + keyPitch * 58 * dt, -60, 60);
    }
    const gyroPose = this.gyroPose();
    if (gyroPose) {
      if (this.inertia.yawVelocity) {
        const yawDelta = this.inertia.yawVelocity * dt;
        this.dragOffset.yaw = shortestDegrees(this.dragOffset.yaw + yawDelta);
        this.pose.yaw = shortestDegrees(this.pose.yaw + yawDelta);
        this.inertia.ageSec += dt;
        this.inertia.yawVelocity *= Math.exp(-dt / INERTIA_TIME_CONSTANT_SEC);
        if (this.inertia.ageSec + 1e-6 >= INERTIA_MAX_SEC || Math.abs(this.inertia.yawVelocity) < 1) {
          this.inertia.yawVelocity = 0;
        }
      }
      this.targetPose.yaw = shortestDegrees(gyroPose.yaw + this.dragOffset.yaw);
      this.targetPose.pitch = clamp(gyroPose.pitch + this.dragOffset.pitch, -60, 60);
      const ease = 1 - Math.exp(-dt * 12);
      this.pose.yaw = shortestDegrees(this.pose.yaw + shortestDegrees(this.targetPose.yaw - this.pose.yaw) * ease);
      this.pose.pitch += (this.targetPose.pitch - this.pose.pitch) * ease;
    } else {
      this.pose.yaw = this.targetPose.yaw;
      this.pose.pitch = this.targetPose.pitch;
    }
    return { yaw:this.pose.yaw, pitch:this.pose.pitch };
  };

  GhostLensInput.prototype.resetDragOffset = function () {
    this.dragOffset.yaw = 0;
    this.dragOffset.pitch = 0;
    this.inertia.yawVelocity = 0;
    this.inertia.ageSec = 0;
  };

  GhostLensInput.prototype.setPose = function (yaw, pitch) {
    this.resetDragOffset();
    this.pose.yaw = this.targetPose.yaw = shortestDegrees(Number(yaw) || 0);
    this.pose.pitch = this.targetPose.pitch = clamp(Number(pitch) || 0, -60, 60);
  };

  GhostLensInput.prototype.getState = function () {
    return {
      pose:{ yaw:this.pose.yaw, pitch:this.pose.pitch },
      gyroSupported:this.gyro.supported,
      gyroEnabled:this.gyro.enabled,
      permission:this.gyro.permission,
      calibrated:this.gyro.calibrated,
      alpha:this.gyro.alpha,
      beta:this.gyro.beta,
      gamma:this.gyro.gamma,
      rawYaw:this.gyro.rawYaw,
      rawPitch:this.gyro.rawPitch,
      dragOffset:{ yaw:this.dragOffset.yaw, pitch:this.dragOffset.pitch },
      inertia:{ yawVelocity:this.inertia.yawVelocity, ageSec:this.inertia.ageSec },
      quaternion:clone(this.gyro.quaternion),
      neutralQuaternion:clone(this.gyro.neutralQuaternion)
    };
  };

  window.GhostLensOrientationMath = {
    fromEulerZXY:fromEulerZXY,
    multiply:multiply,
    inverse:inverse,
    rotateVector:rotateVector,
    shortestDegrees:shortestDegrees,
    constants:{
      dragThresholdPx:DRAG_THRESHOLD_PX,
      flickThresholdPxPerSec:FLICK_THRESHOLD_PX_PER_SEC,
      inertiaTimeConstantSec:INERTIA_TIME_CONSTANT_SEC,
      inertiaMaxSec:INERTIA_MAX_SEC
    }
  };
  window.GhostLensInput = GhostLensInput;
})();
