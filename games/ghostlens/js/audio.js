(function () {
  'use strict';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function GhostLensAudio() {
    this.context = null;
    this.master = null;
    this.ambientGain = null;
    this.presenceGain = null;
    this.voices = {};
    this.muted = false;
    this.unlocked = false;
    this.clickTimer = 0;
    this.heartbeatTimer = 0;
    this.creakTimer = 3;
  }

  GhostLensAudio.prototype.unlock = function () {
    if (this.unlocked && this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(function () {});
      return Promise.resolve(true);
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve(false);
    try {
      const ctx = this.context = new AudioContextClass();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : .52;
      this.master.connect(ctx.destination);
      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = .17;
      this.ambientGain.connect(this.master);
      this.presenceGain = ctx.createGain();
      this.presenceGain.gain.value = .34;
      this.presenceGain.connect(this.master);
      this.startAmbience();
      this.unlocked = true;
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return Promise.resolve(true);
    } catch (error) {
      console.error('[GHOST LENS audio unlock]', error);
      return Promise.resolve(false);
    }
  };

  GhostLensAudio.prototype.startAmbience = function () {
    const ctx = this.context;
    const now = ctx.currentTime;
    const drone = ctx.createOscillator();
    const drone2 = ctx.createOscillator();
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    drone.type = 'sine'; drone.frequency.value = 43;
    drone2.type = 'triangle'; drone2.frequency.value = 47.5;
    g1.gain.value = .28; g2.gain.value = .12;
    filter.type = 'lowpass'; filter.frequency.value = 180; filter.Q.value = 1.2;
    drone.connect(g1).connect(filter);
    drone2.connect(g2).connect(filter);
    filter.connect(this.ambientGain);
    drone.start(now); drone2.start(now);

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(2.2);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    const windGain = ctx.createGain();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = .7;
    windGain.gain.value = .045;
    wind.connect(windFilter).connect(windGain).connect(this.ambientGain);
    wind.start(now);
  };

  GhostLensAudio.prototype.noiseBuffer = function (seconds) {
    const ctx = this.context;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * .94 + white * .06;
      data[i] = last;
    }
    return buffer;
  };

  GhostLensAudio.prototype.createPanner = function () {
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 18;
    panner.rolloffFactor = .7;
    panner.coneInnerAngle = 180;
    panner.coneOuterAngle = 300;
    panner.coneOuterGain = .35;
    return panner;
  };

  GhostLensAudio.prototype.ensureGhostVoice = function (ghost) {
    if (!this.context || this.voices[ghost.id]) return;
    const ctx = this.context;
    const panner = this.createPanner();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    gain.gain.value = 0;
    filter.type = 'bandpass';
    filter.frequency.value = ghost.type === 'crawler' ? 115 : ghost.type === 'gold' ? 1300 : 560;
    filter.Q.value = ghost.type === 'gold' ? 4 : 1.2;
    filter.connect(gain).connect(panner).connect(this.presenceGain);
    const sources = [];
    if (ghost.type === 'drifter') {
      const whisper = ctx.createBufferSource();
      whisper.buffer = this.noiseBuffer(1.4);
      whisper.loop = true;
      whisper.connect(filter);
      whisper.start();
      sources.push(whisper);
      const tone = ctx.createOscillator();
      tone.type = 'sine'; tone.frequency.value = 218;
      const tg = ctx.createGain(); tg.gain.value = .12;
      tone.connect(tg).connect(filter); tone.start(); sources.push(tone);
    } else if (ghost.type === 'crawler') {
      const growl = ctx.createOscillator();
      growl.type = 'sawtooth'; growl.frequency.value = 48;
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      mod.frequency.value = 5.2; modGain.gain.value = 12;
      mod.connect(modGain).connect(growl.frequency);
      growl.connect(filter); growl.start(); mod.start();
      sources.push(growl, mod);
    } else {
      [523.25,659.25,783.99].forEach(function (frequency, index) {
        const tone = ctx.createOscillator();
        const tg = ctx.createGain();
        tone.type = 'sine'; tone.frequency.value = frequency;
        tg.gain.value = .12 - index * .02;
        tone.connect(tg).connect(filter); tone.start();
        sources.push(tone);
      });
    }
    this.voices[ghost.id] = { panner:panner, gain:gain, filter:filter, sources:sources, type:ghost.type };
  };

  GhostLensAudio.prototype.removeGhostVoice = function (id) {
    const voice = this.voices[id];
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .06);
    setTimeout(function () {
      for (let i = 0; i < voice.sources.length; i++) {
        try { voice.sources[i].stop(); } catch (error) {}
      }
      try { voice.panner.disconnect(); } catch (error) {}
    }, 250);
    delete this.voices[id];
  };

  GhostLensAudio.prototype.setPosition = function (node, x, y, z) {
    const now = this.context.currentTime;
    if (node.positionX) {
      node.positionX.setTargetAtTime(x, now, .035);
      node.positionY.setTargetAtTime(y, now, .035);
      node.positionZ.setTargetAtTime(z, now, .035);
    } else if (node.setPosition) node.setPosition(x, y, z);
  };

  GhostLensAudio.prototype.setListener = function (yawDeg, pitchDeg) {
    if (!this.context) return;
    const yaw = yawDeg * Math.PI / 180;
    const pitch = pitchDeg * Math.PI / 180;
    const fx = Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    const listener = this.context.listener;
    const now = this.context.currentTime;
    if (listener.forwardX) {
      listener.forwardX.setValueAtTime(fx, now);
      listener.forwardY.setValueAtTime(fy, now);
      listener.forwardZ.setValueAtTime(fz, now);
      listener.upX.setValueAtTime(0, now);
      listener.upY.setValueAtTime(1, now);
      listener.upZ.setValueAtTime(0, now);
    } else if (listener.setOrientation) listener.setOrientation(fx, fy, fz, 0, 1, 0);
  };

  GhostLensAudio.prototype.update = function (state, dtMs) {
    if (!this.unlocked || !this.context || !state) return;
    try {
      this.setListener(state.camera.yaw, state.camera.pitch);
      const alive = {};
      for (let i = 0; i < state.ghosts.length; i++) {
        const ghost = state.ghosts[i];
        alive[ghost.id] = true;
        this.ensureGhostVoice(ghost);
        const voice = this.voices[ghost.id];
        if (!voice) continue;
        const yaw = ghost.yaw * Math.PI / 180;
        const pitch = ghost.pitch * Math.PI / 180;
        const radius = ghost.type === 'crawler' ? clamp(ghost.distance, 1, 10) : 6;
        this.setPosition(voice.panner,
          Math.sin(yaw) * Math.cos(pitch) * radius,
          Math.sin(pitch) * radius,
          -Math.cos(yaw) * Math.cos(pitch) * radius
        );
        const clarity = clamp(1 - ghost.angleErrorDeg / 100, .04, 1);
        const proximity = ghost.type === 'crawler' ? clamp(1.25 - ghost.distance / 10, .2, 1.15) : 1;
        const targetGain = (ghost.visible ? .22 : .08) * clarity * proximity;
        voice.gain.gain.setTargetAtTime(targetGain, this.context.currentTime, .08);
        voice.filter.frequency.setTargetAtTime(
          (ghost.type === 'crawler' ? 100 : ghost.type === 'gold' ? 1550 : 460) + clarity * (ghost.type === 'crawler' ? 90 : 620),
          this.context.currentTime, .08
        );
      }
      const ids = Object.keys(this.voices);
      for (let j = 0; j < ids.length; j++) if (!alive[ids[j]]) this.removeGhostVoice(ids[j]);

      const dt = Math.max(0, Number(dtMs) || 0) / 1000;
      this.clickTimer -= dt;
      if (this.clickTimer <= 0 && state.mode === 'play') {
        this.geiger(.1 + state.emf * .9);
        this.clickTimer = .95 - state.emf * .86;
      }
      this.heartbeatTimer -= dt;
      if (state.focus.ghostId != null && this.heartbeatTimer <= 0) {
        this.heartbeat(state.focus.progress);
        this.heartbeatTimer = .7 - state.focus.progress * .32;
      }
      this.creakTimer -= dt;
      if (this.creakTimer <= 0 && state.mode === 'play') {
        this.creak();
        this.creakTimer = 5 + Math.random() * 9;
      }
    } catch (error) {
      console.error('[GHOST LENS audio update]', error);
    }
  };

  GhostLensAudio.prototype.tone = function (frequency, duration, gainValue, type, destination, when) {
    if (!this.context) return null;
    const ctx = this.context;
    const now = when == null ? ctx.currentTime : when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, frequency), now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, gainValue), now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + Math.max(.015, duration));
    osc.connect(gain).connect(destination || this.master);
    osc.start(now); osc.stop(now + duration + .03);
    return osc;
  };

  GhostLensAudio.prototype.noiseBurst = function (duration, gainValue, frequency) {
    if (!this.context) return;
    const ctx = this.context;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = this.noiseBuffer(Math.max(.05, duration));
    filter.type = 'bandpass'; filter.frequency.value = frequency || 900; filter.Q.value = 1.1;
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(); src.stop(ctx.currentTime + duration);
  };

  GhostLensAudio.prototype.geiger = function (strength) {
    if (!this.context) return;
    this.noiseBurst(.018, .018 + strength * .045, 1900 + Math.random() * 900);
  };
  GhostLensAudio.prototype.heartbeat = function (strength) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.tone(54, .13, .08 + strength * .06, 'sine', this.master, now);
    this.tone(47, .11, .045 + strength * .04, 'sine', this.master, now + .17);
  };
  GhostLensAudio.prototype.focusLock = function () {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.tone(760, .12, .055, 'sine', this.master, now);
    this.tone(1140, .16, .04, 'sine', this.master, now + .06);
  };
  GhostLensAudio.prototype.shutter = function () {
    if (!this.context) return;
    this.noiseBurst(.045, .15, 1400);
    this.tone(115, .055, .12, 'square', this.master, this.context.currentTime);
    this.tone(82, .08, .09, 'square', this.master, this.context.currentTime + .075);
  };
  GhostLensAudio.prototype.blur = function () {
    if (!this.context) return;
    this.shutter();
    this.tone(98, .22, .045, 'sawtooth', this.master, this.context.currentTime + .1);
  };
  GhostLensAudio.prototype.reload = function () {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 5; i++) this.tone(155 + i * 18, .045, .032, 'square', this.master, now + i * .16);
    this.noiseBurst(.55, .035, 520);
  };
  GhostLensAudio.prototype.creak = function () {
    if (!this.context) return;
    const ctx = this.context;
    const osc = this.tone(105 + Math.random() * 45, .75, .025, 'sawtooth');
    if (osc) osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + .7);
  };
  GhostLensAudio.prototype.banish = function (type) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (type === 'gold') {
      [523,659,784,1046].forEach(function (f, i) { this.tone(f, .75, .075, 'sine', this.master, now + i * .045); }, this);
      this.noiseBurst(.8, .08, 2400);
    } else if (type === 'crawler') {
      this.noiseBurst(.65, .1, 160);
      const sink = this.tone(130, .65, .08, 'sawtooth');
      if (sink) sink.frequency.exponentialRampToValueAtTime(28, now + .62);
    } else {
      this.noiseBurst(.5, .07, 1000);
      this.tone(440, .55, .055, 'sine');
      this.tone(660, .7, .035, 'sine', this.master, now + .08);
    }
  };
  GhostLensAudio.prototype.attack = function () {
    if (!this.context) return;
    this.noiseBurst(1.1, .22, 95);
    const tone = this.tone(78, 1.2, .13, 'sawtooth');
    if (tone) tone.frequency.exponentialRampToValueAtTime(31, this.context.currentTime + 1.1);
  };

  GhostLensAudio.prototype.handleEvent = function (type, data) {
    if (!this.unlocked) return;
    try {
      if (type === 'focusLock') this.focusLock();
      else if (type === 'capture') { this.shutter(); this.banish(data.type); }
      else if (type === 'blur') this.blur();
      else if (type === 'reloadStart') this.reload();
      else if (type === 'crawlerAttack') this.attack();
    } catch (error) {
      console.error('[GHOST LENS audio event]', type, error);
    }
  };

  GhostLensAudio.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : .52, this.context.currentTime, .025);
    }
    return this.muted;
  };

  GhostLensAudio.prototype.testAll = function () {
    if (!this.context) return false;
    this.geiger(1);
    this.focusLock();
    this.shutter();
    this.reload();
    this.banish('drifter');
    this.banish('crawler');
    this.banish('gold');
    return true;
  };

  GhostLensAudio.prototype.getState = function () {
    return {
      supported:!!(window.AudioContext || window.webkitAudioContext),
      unlocked:this.unlocked,
      contextState:this.context ? this.context.state : 'none',
      muted:this.muted,
      activePanners:Object.keys(this.voices).length
    };
  };

  window.GhostLensAudio = GhostLensAudio;
})();
