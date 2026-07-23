(function () {
  'use strict';

  const DEG = Math.PI / 180;
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function shortestDegrees(value) {
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
  }
  function deadzone(value, zone, full) {
    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.abs(value);
    if (magnitude <= zone) return 0;
    return sign * clamp((magnitude - zone) / (full - zone), 0, 1);
  }
  function expo(value) {
    return (value < 0 ? -1 : 1) * value * value;
  }
  function quaternion(x, y, z, w) {
    return { x:x, y:y, z:z, w:w };
  }
  function normalizeQuaternion(q) {
    const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
    return quaternion(q.x / length, q.y / length, q.z / length, q.w / length);
  }
  function multiplyQuaternion(a, b) {
    return quaternion(
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    );
  }
  function inverseUnitQuaternion(q) {
    return quaternion(-q.x, -q.y, -q.z, q.w);
  }
  function axisAngleQuaternion(x, y, z, angle) {
    const half = angle * .5;
    const sine = Math.sin(half);
    return quaternion(x * sine, y * sine, z * sine, Math.cos(half));
  }
  function quaternionFromEulerZXY(alpha, beta, gamma) {
    const qz = axisAngleQuaternion(0, 0, 1, (Number(alpha) || 0) * DEG);
    const qx = axisAngleQuaternion(1, 0, 0, (Number(beta) || 0) * DEG);
    const qy = axisAngleQuaternion(0, 1, 0, (Number(gamma) || 0) * DEG);
    return normalizeQuaternion(multiplyQuaternion(multiplyQuaternion(qz, qx), qy));
  }
  function rotateVector(q, vector) {
    const pure = quaternion(vector.x, vector.y, vector.z, 0);
    const rotated = multiplyQuaternion(multiplyQuaternion(q, pure), inverseUnitQuaternion(q));
    return { x:rotated.x, y:rotated.y, z:rotated.z };
  }
  function horizontalLength(vector) {
    return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  }
  function elevationDegrees(vector) {
    return Math.atan2(vector.z, horizontalLength(vector)) / DEG;
  }
  function azimuthDegrees(vector) {
    return Math.atan2(vector.x, -vector.y) / DEG;
  }
  function quaternionToEulerZXY(q) {
    q = normalizeQuaternion(q);
    const xx = q.x * q.x;
    const yy = q.y * q.y;
    const zz = q.z * q.z;
    const xy = q.x * q.y;
    const xz = q.x * q.z;
    const yz = q.y * q.z;
    const wx = q.w * q.x;
    const wy = q.w * q.y;
    const wz = q.w * q.z;
    const m12 = 2 * (xy - wz);
    const m22 = 1 - 2 * (xx + zz);
    const m31 = 2 * (xz - wy);
    const m32 = 2 * (yz + wx);
    const m33 = 1 - 2 * (xx + yy);
    const beta = Math.asin(clamp(m32, -1, 1));
    const cosineBeta = Math.cos(beta);
    let alpha;
    let gamma;
    if (Math.abs(cosineBeta) > .00001) {
      alpha = Math.atan2(-m12, m22);
      gamma = Math.atan2(-m31, m33);
    } else {
      alpha = Math.atan2(2 * (xy + wz), 1 - 2 * (yy + zz));
      gamma = 0;
    }
    return {
      alpha:shortestDegrees(alpha / DEG),
      beta:beta / DEG,
      gamma:shortestDegrees(gamma / DEG)
    };
  }
  function cloneQuaternion(q) {
    return q ? quaternion(q.x, q.y, q.z, q.w) : null;
  }

  function PropellaInput(options) {
    options = options || {};
    this.surface = options.surface;
    this.boostButton = options.boostButton;
    this.stick = options.stick;
    this.onOrientationChange = options.onOrientationChange || function () {};
    this.keys = {};
    this.mouse = { x:0, y:0, active:false };
    this.drag = { active:false, id:null, x:0, y:0, originX:0, originY:0 };
    this.boostPointer = false;
    this.gyro = {
      supported:typeof window.DeviceOrientationEvent !== 'undefined',
      enabled:false,
      permission:'unknown',
      alpha:null,
      beta:null,
      gamma:null,
      quaternion:null,
      neutralQuaternion:null,
      relativeQuaternion:null,
      neutralNormal:null,
      neutralTurnVector:null,
      neutralPitchDegrees:0,
      neutralTurnDegrees:0,
      rawPitchDegrees:0,
      rawTurnDegrees:0,
      filteredPitch:0,
      filteredRoll:0,
      calibrated:false
    };
    this.keyboardAxis = { pitch:0, roll:0 };
    this.debugOverride = null;
    this.bound = {};
    this.bind();
  }

  PropellaInput.prototype.bind = function () {
    const self = this;
    this.bound.keydown = function (event) {
      self.keys[event.code] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(event.code) >= 0) event.preventDefault();
    };
    this.bound.keyup = function (event) {
      self.keys[event.code] = false;
    };
    this.bound.mousemove = function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      self.mouse.x = clamp((event.clientX / Math.max(1, window.innerWidth) - .5) * 2, -1, 1);
      self.mouse.y = clamp((.5 - event.clientY / Math.max(1, window.innerHeight)) * 2, -1, 1);
      self.mouse.active = true;
    };
    this.bound.mouseleave = function () {
      self.mouse.active = false;
      self.mouse.x = self.mouse.y = 0;
    };
    this.bound.orientation = function (event) {
      if (event.beta == null || event.gamma == null) return;
      const alpha = event.alpha == null ? 0 : Number(event.alpha);
      const beta = Number(event.beta);
      const gamma = Number(event.gamma);
      if (!isFinite(alpha) || !isFinite(beta) || !isFinite(gamma)) return;
      self.gyro.alpha = alpha;
      self.gyro.beta = beta;
      self.gyro.gamma = gamma;
      self.gyro.quaternion = quaternionFromEulerZXY(alpha, beta, gamma);
    };
    this.bound.orientationchange = function () {
      if (self.gyro.enabled) {
        self.gyro.calibrated = false;
        self.onOrientationChange();
      }
    };
    this.bound.surfaceDown = function (event) {
      if (event.pointerType === 'mouse') return;
      if (event.target && event.target.closest && event.target.closest('button, .overlay, .dashboard')) return;
      event.preventDefault();
      self.drag.active = true;
      self.drag.id = event.pointerId;
      self.drag.originX = event.clientX;
      self.drag.originY = event.clientY;
      self.drag.x = self.drag.y = 0;
      if (self.surface.setPointerCapture) self.surface.setPointerCapture(event.pointerId);
      if (self.stick) {
        self.stick.style.left = event.clientX + 'px';
        self.stick.style.top = event.clientY + 'px';
        self.stick.style.setProperty('--sx', '0px');
        self.stick.style.setProperty('--sy', '0px');
        self.stick.classList.add('show');
      }
    };
    this.bound.surfaceMove = function (event) {
      if (!self.drag.active || event.pointerId !== self.drag.id) return;
      event.preventDefault();
      const radius = 52;
      let dx = event.clientX - self.drag.originX;
      let dy = event.clientY - self.drag.originY;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > radius) { dx = dx / length * radius; dy = dy / length * radius; }
      self.drag.x = dx / radius;
      self.drag.y = -dy / radius;
      if (self.stick) {
        self.stick.style.setProperty('--sx', dx + 'px');
        self.stick.style.setProperty('--sy', dy + 'px');
      }
    };
    this.bound.surfaceUp = function (event) {
      if (!self.drag.active || event.pointerId !== self.drag.id) return;
      self.drag.active = false;
      self.drag.id = null;
      self.drag.x = self.drag.y = 0;
      if (self.stick) self.stick.classList.remove('show');
    };
    this.bound.boostDown = function (event) {
      event.preventDefault();
      event.stopPropagation();
      self.boostPointer = true;
      self.boostButton.classList.add('active');
      if (self.boostButton.setPointerCapture) self.boostButton.setPointerCapture(event.pointerId);
    };
    this.bound.boostUp = function (event) {
      event.preventDefault();
      self.boostPointer = false;
      self.boostButton.classList.remove('active');
    };

    window.addEventListener('keydown', this.bound.keydown, { passive:false });
    window.addEventListener('keyup', this.bound.keyup);
    window.addEventListener('pointermove', this.bound.mousemove);
    document.documentElement.addEventListener('mouseleave', this.bound.mouseleave);
    window.addEventListener('orientationchange', this.bound.orientationchange);
    this.surface.addEventListener('pointerdown', this.bound.surfaceDown, { passive:false });
    this.surface.addEventListener('pointermove', this.bound.surfaceMove, { passive:false });
    this.surface.addEventListener('pointerup', this.bound.surfaceUp, { passive:false });
    this.surface.addEventListener('pointercancel', this.bound.surfaceUp, { passive:false });
    this.boostButton.addEventListener('pointerdown', this.bound.boostDown, { passive:false });
    this.boostButton.addEventListener('pointerup', this.bound.boostUp, { passive:false });
    this.boostButton.addEventListener('pointercancel', this.bound.boostUp, { passive:false });
    this.boostButton.addEventListener('lostpointercapture', this.bound.boostUp, { passive:false });
  };

  PropellaInput.prototype.requestGyro = function () {
    const self = this;
    if (!this.gyro.supported) {
      this.gyro.permission = 'unsupported';
      return Promise.resolve(false);
    }
    let permissionRequest = Promise.resolve('granted');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { permissionRequest = DeviceOrientationEvent.requestPermission(); }
      catch (error) { permissionRequest = Promise.reject(error); }
    }
    return permissionRequest.then(function (permission) {
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

  PropellaInput.prototype.calibrate = function () {
    if (!this.gyro.enabled || !this.gyro.quaternion) return false;
    const neutral = cloneQuaternion(this.gyro.quaternion);
    const normal = rotateVector(neutral, { x:0, y:0, z:1 });
    const top = rotateVector(neutral, { x:0, y:1, z:0 });
    const turnVector = horizontalLength(normal) >= .25 ? normal : top;
    this.gyro.neutralQuaternion = neutral;
    this.gyro.relativeQuaternion = quaternion(0, 0, 0, 1);
    this.gyro.neutralNormal = normal;
    this.gyro.neutralTurnVector = turnVector;
    this.gyro.neutralPitchDegrees = elevationDegrees(normal);
    this.gyro.neutralTurnDegrees = azimuthDegrees(turnVector);
    this.gyro.rawPitchDegrees = 0;
    this.gyro.rawTurnDegrees = 0;
    this.gyro.filteredPitch = 0;
    this.gyro.filteredRoll = 0;
    this.gyro.calibrated = true;
    return true;
  };

  PropellaInput.prototype.gyroAxes = function () {
    const gyro = this.gyro;
    if (!gyro.calibrated || !gyro.quaternion || !gyro.neutralQuaternion) {
      return { pitchDegrees:0, turnDegrees:0 };
    }
    const relative = normalizeQuaternion(multiplyQuaternion(
      gyro.quaternion,
      inverseUnitQuaternion(gyro.neutralQuaternion)
    ));
    gyro.relativeQuaternion = relative;
    const normal = rotateVector(relative, gyro.neutralNormal);
    const turnVector = rotateVector(relative, gyro.neutralTurnVector);
    return {
      pitchDegrees:gyro.neutralPitchDegrees - elevationDegrees(normal),
      turnDegrees:shortestDegrees(azimuthDegrees(turnVector) - gyro.neutralTurnDegrees)
    };
  };

  PropellaInput.prototype.setDebugInput = function (input) {
    input = input || {};
    this.debugOverride = {
      pitch:clamp(Number(input.pitch) || 0, -1, 1),
      roll:clamp(Number(input.roll) || 0, -1, 1),
      boost:!!input.boost
    };
  };

  PropellaInput.prototype.clearDebugInput = function () {
    this.debugOverride = null;
  };

  PropellaInput.prototype.resetPointer = function () {
    this.mouse.active = false;
    this.mouse.x = 0;
    this.mouse.y = 0;
    this.drag.active = false;
    this.drag.id = null;
    this.drag.x = 0;
    this.drag.y = 0;
    this.keyboardAxis.pitch = 0;
    this.keyboardAxis.roll = 0;
    if (this.stick) this.stick.classList.remove('show');
  };

  PropellaInput.prototype.update = function (dtMs) {
    if (this.debugOverride) return {
      pitch:this.debugOverride.pitch,
      roll:this.debugOverride.roll,
      boost:this.debugOverride.boost
    };

    const dt = Math.min(Math.max(Number(dtMs) || 16.7, 0), 100) / 1000;
    const keyPitch = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    const keyRoll = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
    const keyEase = 1 - Math.exp(-dt * 9);
    this.keyboardAxis.pitch += (keyPitch - this.keyboardAxis.pitch) * keyEase;
    this.keyboardAxis.roll += (keyRoll - this.keyboardAxis.roll) * keyEase;

    let pitch = 0;
    let roll = 0;
    if (this.drag.active) {
      pitch = this.drag.y;
      roll = this.drag.x;
    } else if (Math.abs(this.keyboardAxis.pitch) > .02 || Math.abs(this.keyboardAxis.roll) > .02) {
      pitch = this.keyboardAxis.pitch;
      roll = this.keyboardAxis.roll;
    } else if (this.gyro.enabled && this.gyro.calibrated) {
      const axes = this.gyroAxes();
      this.gyro.rawPitchDegrees = axes.pitchDegrees;
      this.gyro.rawTurnDegrees = axes.turnDegrees;
      const rawPitch = expo(deadzone(axes.pitchDegrees, 2, 25));
      const rawRoll = expo(deadzone(axes.turnDegrees, 3, 35));
      const filter = 1 - Math.exp(-dt * 8);
      this.gyro.filteredPitch += (rawPitch - this.gyro.filteredPitch) * filter;
      this.gyro.filteredRoll += (rawRoll - this.gyro.filteredRoll) * filter;
      pitch = this.gyro.filteredPitch;
      roll = this.gyro.filteredRoll;
    } else if (this.mouse.active) {
      pitch = Math.abs(this.mouse.y) < .06 ? 0 : clamp(this.mouse.y * 1.18, -1, 1);
      roll = Math.abs(this.mouse.x) < .06 ? 0 : clamp(this.mouse.x * 1.18, -1, 1);
    }
    return {
      pitch:clamp(pitch, -1, 1),
      roll:clamp(roll, -1, 1),
      boost:this.boostPointer || !!this.keys.ShiftLeft || !!this.keys.ShiftRight || !!this.keys.Space
    };
  };

  PropellaInput.prototype.getState = function () {
    return {
      gyroSupported:this.gyro.supported,
      gyroEnabled:this.gyro.enabled,
      gyroPermission:this.gyro.permission,
      calibrated:this.gyro.calibrated,
      alpha:this.gyro.alpha,
      beta:this.gyro.beta,
      gamma:this.gyro.gamma,
      quaternion:cloneQuaternion(this.gyro.quaternion),
      neutralQuaternion:cloneQuaternion(this.gyro.neutralQuaternion),
      relativeQuaternion:cloneQuaternion(this.gyro.relativeQuaternion),
      pitchDegrees:this.gyro.rawPitchDegrees,
      turnDegrees:this.gyro.rawTurnDegrees,
      filteredPitch:this.gyro.filteredPitch,
      filteredRoll:this.gyro.filteredRoll,
      debugOverride:!!this.debugOverride
    };
  };

  window.PropellaOrientationMath = {
    fromEulerZXY:quaternionFromEulerZXY,
    toEulerZXY:quaternionToEulerZXY,
    multiply:multiplyQuaternion,
    inverse:inverseUnitQuaternion,
    axisAngle:axisAngleQuaternion,
    rotateVector:rotateVector,
    shortestDegrees:shortestDegrees
  };
  window.PropellaInput = PropellaInput;
})();
