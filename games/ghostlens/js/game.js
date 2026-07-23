(function () {
  'use strict';

  const FIXED_STEP = 1000 / 60;
  const FOCUS_MS = 600;
  const MAX_FILM = 12;
  const RELOAD_MS = 2000;
  const RETICLE_DEG = 5.5;
  const DEG = Math.PI / 180;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function shortestDegrees(v) {
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  }
  function angleError(aYaw, aPitch, bYaw, bPitch) {
    const ay = aYaw * DEG;
    const ap = aPitch * DEG;
    const by = bYaw * DEG;
    const bp = bPitch * DEG;
    const dot = Math.sin(ap) * Math.sin(bp) + Math.cos(ap) * Math.cos(bp) * Math.cos(ay - by);
    return Math.acos(clamp(dot, -1, 1)) / DEG;
  }
  function comboMultiplier(combo) {
    if (combo <= 1) return 1;
    if (combo === 2) return 1.2;
    if (combo === 3) return 1.5;
    if (combo === 4) return 2;
    return Math.min(3, 2 + (combo - 4) * .25);
  }
  function typeName(type) {
    return type === 'crawler' ? '這い寄り' : type === 'gold' ? '金色の残光' : '浮遊霊';
  }

  function RNG(seed) {
    this.state = (Number(seed) || 0x73a91f) >>> 0;
    if (!this.state) this.state = 1;
  }
  RNG.prototype.next = function () {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  };
  RNG.prototype.range = function (min, max) { return min + (max - min) * this.next(); };
  RNG.prototype.int = function (min, max) { return Math.floor(this.range(min, max + 1)); };

  function GhostLensGame(options) {
    options = options || {};
    this.seed = Number(options.seed) || 73191;
    this.rng = new RNG(this.seed);
    this.bestScore = Number(options.bestScore) || 0;
    this.onEvent = options.onEvent || function () {};
    this.nextGhostId = 1;
    this.nextPhotoId = 1;
    this.reset();
  }

  GhostLensGame.prototype.emit = function (type, data) {
    try { this.onEvent(type, data || {}); }
    catch (error) { console.error('[GHOST LENS event]', type, error); }
  };

  GhostLensGame.prototype.reset = function () {
    this.mode = 'ready';
    this.elapsedMs = 0;
    this.timeMs = 90000;
    this.score = 0;
    this.successCount = 0;
    this.blurCount = 0;
    this.missedCount = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.film = MAX_FILM;
    this.reloadMs = 0;
    this.camera = { yaw:0, pitch:0, zoom:false };
    this.ghosts = [];
    this.photos = [];
    this.focusGhostId = null;
    this.focusMs = 0;
    this.interferenceMs = 0;
    this.targetGhostCount = this.rng.int(1, 3);
    this.spawnCooldownMs = 0;
    this.lastQuality = null;
    this.countdownSecond = null;
    this.emit('reset', {});
  };

  GhostLensGame.prototype.start = function () {
    if (this.mode === 'play') return false;
    if (this.mode === 'result') this.reset();
    this.mode = 'play';
    this.timeMs = 90000;
    this.targetGhostCount = this.rng.int(1, 3);
    while (this.activeGhostCount() < this.targetGhostCount) this.spawnRandomGhost();
    this.emit('start', { targetGhostCount:this.targetGhostCount });
    return true;
  };

  GhostLensGame.prototype.activeGhostCount = function () {
    let count = 0;
    for (let i = 0; i < this.ghosts.length; i++) {
      if (this.ghosts[i].state === 'active') count++;
    }
    return count;
  };

  GhostLensGame.prototype.spawnRandomGhost = function () {
    const roll = this.rng.next();
    const type = roll < .1 ? 'gold' : roll < .43 ? 'crawler' : 'drifter';
    return this.spawnGhost(type, this.rng.range(-180, 180), this.rng.range(-30, 45), true);
  };

  GhostLensGame.prototype.spawnGhost = function (type, yawDeg, pitchDeg, automatic) {
    if (['drifter','crawler','gold'].indexOf(type) < 0) type = 'drifter';
    const lifetimeMs = type === 'gold' ? 3000 : this.rng.range(12000, 20000);
    const ghost = {
      id:this.nextGhostId++,
      type:type,
      name:typeName(type),
      yaw:shortestDegrees(Number(yawDeg) || 0),
      pitch:clamp(Number(pitchDeg) || 0, -30, 45),
      ageMs:0,
      lifetimeMs:lifetimeMs,
      remainingMs:lifetimeMs,
      state:'active',
      visible:false,
      observed:false,
      distance:type === 'crawler' ? 10 : this.rng.range(7, 11),
      initialDistance:type === 'crawler' ? 10 : 9,
      focusMs:0,
      banishMs:0,
      automatic:!!automatic,
      phase:this.rng.range(0, Math.PI * 2)
    };
    this.ghosts.push(ghost);
    this.emit('spawn', this.copyGhost(ghost));
    return ghost.id;
  };

  GhostLensGame.prototype.setCamera = function (yawDeg, pitchDeg) {
    this.camera.yaw = shortestDegrees(Number(yawDeg) || 0);
    this.camera.pitch = clamp(Number(pitchDeg) || 0, -60, 60);
    return { yaw:this.camera.yaw, pitch:this.camera.pitch };
  };

  GhostLensGame.prototype.setZoom = function (enabled) {
    this.camera.zoom = enabled == null ? !this.camera.zoom : !!enabled;
    this.emit('zoom', { enabled:this.camera.zoom });
    return this.camera.zoom;
  };

  GhostLensGame.prototype.nearestGhost = function () {
    let nearest = null;
    let best = Infinity;
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      if (ghost.state !== 'active') continue;
      const error = angleError(this.camera.yaw, this.camera.pitch, ghost.yaw, ghost.pitch);
      if (error < best) { best = error; nearest = ghost; }
    }
    return nearest;
  };

  GhostLensGame.prototype.aimAtGhost = function (id) {
    let target = null;
    for (let i = 0; i < this.ghosts.length; i++) {
      if (this.ghosts[i].state !== 'active') continue;
      if (id == null || this.ghosts[i].id === Number(id)) {
        target = this.ghosts[i];
        if (id != null) break;
      }
    }
    if (id == null) target = this.nearestGhost();
    if (!target) return false;
    this.setCamera(target.yaw, target.pitch);
    return target.id;
  };

  GhostLensGame.prototype.update = function (dtMs) {
    dtMs = clamp(Number(dtMs) || 0, 0, 120000);
    let remaining = dtMs;
    while (remaining > .0001 && this.mode === 'play') {
      const slice = Math.min(FIXED_STEP, remaining);
      this.fixedStep(slice);
      remaining -= slice;
    }
  };

  GhostLensGame.prototype.fixedStep = function (dtMs) {
    this.elapsedMs += dtMs;
    this.timeMs -= dtMs;
    if (this.interferenceMs > 0) this.interferenceMs = Math.max(0, this.interferenceMs - dtMs);

    if (this.reloadMs > 0) {
      this.reloadMs = Math.max(0, this.reloadMs - dtMs);
      if (this.reloadMs === 0) {
        this.film = MAX_FILM;
        this.emit('reloadComplete', { film:this.film });
      }
    } else if (this.film <= 0) {
      this.beginReload();
    }

    const secondsLeft = Math.max(0, Math.ceil(this.timeMs / 1000));
    if (secondsLeft <= 10 && secondsLeft !== this.countdownSecond) {
      this.countdownSecond = secondsLeft;
      this.emit('countdown', { second:secondsLeft });
    }
    if (this.timeMs <= 0) {
      this.timeMs = 0;
      this.finish();
      return;
    }

    let focusCandidate = null;
    let focusError = Infinity;
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      if (ghost.state === 'banishing') {
        ghost.banishMs -= dtMs;
        if (ghost.banishMs <= 0) ghost.state = 'gone';
        continue;
      }
      if (ghost.state !== 'active') continue;

      ghost.ageMs += dtMs;
      ghost.remainingMs = Math.max(0, ghost.lifetimeMs - ghost.ageMs);
      const drift = ghost.type === 'drifter' ? Math.sin(ghost.phase + ghost.ageMs * .00032) * .0025 * dtMs : 0;
      ghost.yaw = shortestDegrees(ghost.yaw + drift);
      const error = angleError(this.camera.yaw, this.camera.pitch, ghost.yaw, ghost.pitch);
      ghost.visible = error <= RETICLE_DEG * 1.4;
      if (ghost.visible) ghost.observed = true;

      if (ghost.type === 'crawler' && (ghost.observed || error < 34)) {
        ghost.observed = true;
        ghost.distance -= dtMs * .001;
        if (ghost.distance <= .55) {
          ghost.distance = .55;
          ghost.state = 'gone';
          this.interferenceMs = 5000;
          this.combo = 0;
          this.missedCount++;
          this.focusGhostId = null;
          this.focusMs = 0;
          this.emit('crawlerAttack', { id:ghost.id, durationMs:5000 });
          continue;
        }
      }

      if (ghost.ageMs >= ghost.lifetimeMs) {
        ghost.state = 'gone';
        this.missedCount++;
        this.combo = 0;
        if (this.focusGhostId === ghost.id) {
          this.focusGhostId = null;
          this.focusMs = 0;
        }
        this.emit('expired', { id:ghost.id, type:ghost.type });
        continue;
      }
      if (error <= RETICLE_DEG && error < focusError) {
        focusCandidate = ghost;
        focusError = error;
      }
    }

    if (focusCandidate) {
      if (this.focusGhostId !== focusCandidate.id) {
        this.focusGhostId = focusCandidate.id;
        this.focusMs = 0;
        this.emit('focusEnter', { id:focusCandidate.id, type:focusCandidate.type });
      }
      this.focusMs = Math.min(FOCUS_MS, this.focusMs + dtMs);
      focusCandidate.focusMs = this.focusMs;
      if (this.focusMs === FOCUS_MS && this.focusMs - dtMs < FOCUS_MS) {
        this.emit('focusLock', { id:focusCandidate.id, type:focusCandidate.type });
      }
    } else {
      if (this.focusGhostId != null) this.emit('focusLeave', { id:this.focusGhostId });
      this.focusGhostId = null;
      this.focusMs = 0;
    }

    this.ghosts = this.ghosts.filter(function (ghost) { return ghost.state !== 'gone'; });
    if (this.spawnCooldownMs > 0) this.spawnCooldownMs = Math.max(0, this.spawnCooldownMs - dtMs);
    if (this.spawnCooldownMs <= 0 && this.activeGhostCount() < this.targetGhostCount) {
      this.spawnRandomGhost();
      this.spawnCooldownMs = this.rng.range(350, 900);
    }
  };

  GhostLensGame.prototype.focusedGhost = function () {
    if (this.focusGhostId == null) return null;
    for (let i = 0; i < this.ghosts.length; i++) {
      if (this.ghosts[i].id === this.focusGhostId && this.ghosts[i].state === 'active') return this.ghosts[i];
    }
    return null;
  };

  GhostLensGame.prototype.shutter = function () {
    if (this.mode !== 'play' || this.reloadMs > 0 || this.film <= 0) {
      this.emit('dryFire', { reloading:this.reloadMs > 0, film:this.film });
      return { success:false, reason:this.reloadMs > 0 ? 'reloading' : 'unavailable' };
    }

    this.film--;
    const target = this.focusedGhost();
    if (!target || this.focusMs < FOCUS_MS) {
      this.blurCount++;
      this.combo = 0;
      this.lastQuality = 'BLUR';
      this.emit('blur', { film:this.film, focusMs:this.focusMs });
      if (this.film === 0) this.beginReload();
      return { success:false, reason:'blur', score:0, film:this.film };
    }

    const error = angleError(this.camera.yaw, this.camera.pitch, target.yaw, target.pitch);
    let quality = 'HIT';
    let precisionMultiplier = 1;
    if (error <= 2) { quality = 'PERFECT'; precisionMultiplier = 2; }
    else if (error <= 4) { quality = 'GOOD'; precisionMultiplier = 1.5; }

    let base = target.type === 'gold' ? 500 : 100;
    if (target.type === 'crawler') {
      const proximity = clamp(1 - (target.distance - .55) / (target.initialDistance - .55), 0, 1);
      base = Math.round(100 + proximity * 200);
    }
    const quickness = clamp(1 + target.remainingMs / target.lifetimeMs * .25, 1, 1.25);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const comboMult = comboMultiplier(this.combo);
    const gain = Math.round(base * precisionMultiplier * quickness * comboMult);
    this.score += gain;
    this.timeMs += 3000;
    this.successCount++;
    this.lastQuality = quality;
    target.state = 'banishing';
    target.banishMs = target.type === 'gold' ? 950 : 680;
    target.visible = true;
    target.focusMs = FOCUS_MS;

    const photo = {
      id:this.nextPhotoId++,
      ghostId:target.id,
      type:target.type,
      name:target.name,
      quality:quality,
      score:gain,
      errorDeg:Number(error.toFixed(3)),
      capturedAtMs:Math.round(this.elapsedMs),
      stamp:'',
      dataUrl:null
    };
    this.photos.push(photo);
    this.focusGhostId = null;
    this.focusMs = 0;
    this.spawnCooldownMs = target.banishMs + 250;

    const payload = {
      success:true,
      ghostId:target.id,
      type:target.type,
      quality:quality,
      base:base,
      precisionMultiplier:precisionMultiplier,
      quickness:Number(quickness.toFixed(3)),
      combo:this.combo,
      comboMultiplier:comboMult,
      score:gain,
      totalScore:this.score,
      timeBonusMs:3000,
      film:this.film,
      photoId:photo.id,
      errorDeg:Number(error.toFixed(3))
    };
    this.emit('capture', payload);
    if (this.film === 0) this.beginReload();
    return payload;
  };

  GhostLensGame.prototype.setPhotoData = function (photoId, dataUrl, stamp) {
    for (let i = 0; i < this.photos.length; i++) {
      if (this.photos[i].id === Number(photoId)) {
        this.photos[i].dataUrl = dataUrl || null;
        this.photos[i].stamp = stamp || '';
        return true;
      }
    }
    return false;
  };

  GhostLensGame.prototype.beginReload = function () {
    if (this.reloadMs > 0 || this.film > 0) return false;
    this.reloadMs = RELOAD_MS;
    this.emit('reloadStart', { durationMs:RELOAD_MS });
    return true;
  };
  GhostLensGame.prototype.reloadFilm = function () {
    this.reloadMs = 0;
    this.film = MAX_FILM;
    this.emit('reloadComplete', { film:this.film, forced:true });
    return this.film;
  };
  GhostLensGame.prototype.setFilm = function (n) {
    this.film = clamp(Math.floor(Number(n) || 0), 0, MAX_FILM);
    this.reloadMs = 0;
    if (this.mode === 'play' && this.film === 0) this.beginReload();
    return this.film;
  };
  GhostLensGame.prototype.setTime = function (seconds) {
    this.timeMs = Math.max(0, Number(seconds) * 1000 || 0);
    if (this.mode === 'ready') this.start();
    return this.timeMs;
  };

  GhostLensGame.prototype.finish = function () {
    if (this.mode === 'result') return false;
    this.mode = 'result';
    if (this.score > this.bestScore) this.bestScore = this.score;
    this.emit('finish', {
      score:this.score,
      captures:this.successCount,
      maxCombo:this.maxCombo,
      bestScore:this.bestScore,
      photos:this.photos.length
    });
    return true;
  };

  GhostLensGame.prototype.copyGhost = function (ghost) {
    const error = angleError(this.camera.yaw, this.camera.pitch, ghost.yaw, ghost.pitch);
    return {
      id:ghost.id,
      type:ghost.type,
      name:ghost.name,
      yaw:Number(ghost.yaw.toFixed(3)),
      pitch:Number(ghost.pitch.toFixed(3)),
      visible:!!ghost.visible,
      observed:!!ghost.observed,
      state:ghost.state,
      distance:Number(ghost.distance.toFixed(3)),
      remainingMs:Math.max(0, Math.round(ghost.remainingMs)),
      lifetimeMs:Math.round(ghost.lifetimeMs),
      focusMs:ghost.id === this.focusGhostId ? Math.round(this.focusMs) : 0,
      angleErrorDeg:Number(error.toFixed(3))
    };
  };

  GhostLensGame.prototype.getState = function () {
    const nearest = this.nearestGhost();
    const nearestError = nearest ? angleError(this.camera.yaw, this.camera.pitch, nearest.yaw, nearest.pitch) : 180;
    return {
      mode:this.mode,
      seed:this.seed,
      score:this.score,
      remainingMs:Math.max(0, Math.round(this.timeMs)),
      camera:{ yaw:Number(this.camera.yaw.toFixed(3)), pitch:Number(this.camera.pitch.toFixed(3)), zoom:this.camera.zoom },
      ghosts:this.ghosts.map(this.copyGhost.bind(this)),
      focus:{ ghostId:this.focusGhostId, ms:Math.round(this.focusMs), progress:Number((this.focusMs / FOCUS_MS).toFixed(3)), locked:this.focusMs >= FOCUS_MS },
      film:this.film,
      maxFilm:MAX_FILM,
      reloading:this.reloadMs > 0,
      reloadRemainingMs:Math.round(this.reloadMs),
      combo:this.combo,
      comboMultiplier:comboMultiplier(this.combo),
      maxCombo:this.maxCombo,
      captures:this.successCount,
      blurred:this.blurCount,
      missed:this.missedCount,
      interferenceMs:Math.round(this.interferenceMs),
      emf:Number(clamp(1 - nearestError / 180, 0, 1).toFixed(3)),
      photos:this.photos.map(function (p) {
        return {
          id:p.id, ghostId:p.ghostId, type:p.type, quality:p.quality, score:p.score,
          errorDeg:p.errorDeg, capturedAtMs:p.capturedAtMs, stamp:p.stamp,
          hasImage:!!p.dataUrl, dataUrl:p.dataUrl
        };
      }),
      bestScore:this.bestScore,
      lastQuality:this.lastQuality
    };
  };

  GhostLensGame.prototype.dump = function () {
    const state = this.getState();
    const lines = [
      'GHOST LENS seed=' + state.seed + ' mode=' + state.mode,
      'camera yaw=' + state.camera.yaw.toFixed(1) + ' pitch=' + state.camera.pitch.toFixed(1) + (state.camera.zoom ? ' ZOOM' : ''),
      'score=' + state.score + ' time=' + (state.remainingMs / 1000).toFixed(2) + ' film=' + state.film + (state.reloading ? ' DEVELOPING ' + state.reloadRemainingMs + 'ms' : ''),
      'combo=' + state.combo + ' x' + state.comboMultiplier + ' focus=' + state.focus.progress.toFixed(2) + ' interference=' + state.interferenceMs,
      'photos=' + state.photos.length + ' captures=' + state.captures + ' blurred=' + state.blurred
    ];
    if (!state.ghosts.length) lines.push('ghosts: none');
    for (let i = 0; i < state.ghosts.length; i++) {
      const g = state.ghosts[i];
      lines.push('#' + g.id + ' ' + g.type + ' yaw=' + g.yaw.toFixed(1) + ' pitch=' + g.pitch.toFixed(1) +
        ' err=' + g.angleErrorDeg.toFixed(1) + ' dist=' + g.distance.toFixed(1) + ' life=' + g.remainingMs + ' ' + g.state);
    }
    return lines.join('\n');
  };

  GhostLensGame.constants = {
    FIXED_STEP:FIXED_STEP,
    FOCUS_MS:FOCUS_MS,
    MAX_FILM:MAX_FILM,
    RELOAD_MS:RELOAD_MS,
    RETICLE_DEG:RETICLE_DEG
  };
  GhostLensGame.angleError = angleError;
  GhostLensGame.shortestDegrees = shortestDegrees;
  GhostLensGame.comboMultiplier = comboMultiplier;
  window.GhostLensGame = GhostLensGame;
})();
