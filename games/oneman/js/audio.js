(function () {
  'use strict';

  function OneManAudio() {
    this.ctx = null;
    this.master = null;
    this.wind = null;
    this.windGain = null;
    this.vvvf = null;
    this.vvvfGain = null;
    this.muted = false;
    this.lastJointIndex = -1;
    this.lastCrossingBeat = -1;
    this.lastSqueal = 0;
    this.phase = 'TITLE';
  }

  OneManAudio.prototype.unlock = function () {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.startBeds();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };
  OneManAudio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.03);
  };
  OneManAudio.prototype.startBeds = function () {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 760; filter.Q.value = 0.8;
    const gain = ctx.createGain(); gain.gain.value = 0;
    wind.connect(filter); filter.connect(gain); gain.connect(this.master); wind.start();
    this.wind = wind; this.windGain = gain; this.windFilter = filter;

    const vvvf = ctx.createOscillator();
    vvvf.type = 'square'; vvvf.frequency.value = 110;
    const vf = ctx.createBiquadFilter();
    vf.type = 'lowpass'; vf.frequency.value = 950; vf.Q.value = 8;
    const vg = ctx.createGain(); vg.gain.value = 0;
    vvvf.connect(vf); vf.connect(vg); vg.connect(this.master); vvvf.start();
    this.vvvf = vvvf; this.vvvfFilter = vf; this.vvvfGain = vg;
  };
  OneManAudio.prototype.envGain = function (dur, peak) {
    const g = this.ctx.createGain(), now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak || 0.05), now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    return g;
  };
  OneManAudio.prototype.beep = function (freq, dur, type, gain, when) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + dur + 0.02);
  };
  OneManAudio.prototype.noise = function (dur, gain, freq, q, when) {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx, start = ctx.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = q || 0.8;
    g.gain.setValueAtTime(gain || 0.08, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(this.master); src.start(start); src.stop(start + dur);
  };
  OneManAudio.prototype.bell = function () {
    for (let i = 0; i < 18; i++) {
      this.beep(1550, 0.045, 'square', 0.035, i * 0.105);
      this.beep(1180, 0.04, 'square', 0.025, i * 0.105 + 0.045);
    }
  };
  OneManAudio.prototype.chime = function () {
    this.beep(740, 0.20, 'sine', 0.06, 0);
    this.beep(988, 0.28, 'sine', 0.055, 0.18);
    this.beep(740, 0.20, 'sine', 0.05, 0.72);
    this.beep(988, 0.28, 'sine', 0.05, 0.90);
  };
  OneManAudio.prototype.door = function () {
    this.noise(0.42, 0.055, 900, 0.7, 0);
    this.noise(0.55, 0.035, 320, 1.6, 0.16);
  };
  OneManAudio.prototype.horn = function () {
    this.beep(392, 0.72, 'sawtooth', 0.13, 0);
    this.beep(466, 0.68, 'sawtooth', 0.09, 0.02);
  };
  OneManAudio.prototype.joint = function (external, tunnel) {
    const g = external ? 0.075 : 0.045;
    const f = tunnel ? 240 : 310;
    this.noise(0.045, g, f, tunnel ? 5 : 3, 0);
    this.noise(0.045, g * 0.9, f * 0.82, tunnel ? 5 : 3, 0.115);
    if (tunnel) this.noise(0.32, 0.025, 180, 7, 0.03);
  };
  OneManAudio.prototype.event = function (type, data) {
    if (type === 'phase') {
      this.phase = data.to;
      if (data.to === 'RUN_INTRO' || data.to === 'FINAL_RESULT') {
        this.beep(523, 0.12, 'triangle', 0.04, 0);
        this.beep(659, 0.12, 'triangle', 0.04, 0.14);
        this.beep(784, 0.24, 'triangle', 0.045, 0.28);
      }
      if (data.to === 'DEPART') { this.door(); this.bell(); }
      if (data.to === 'DOORS') { this.chime(); this.door(); }
    }
    if (type === 'brake') this.noise(0.22, 0.042, 1500, 1.1);
    if (type === 'brakeRelease') this.noise(0.42, 0.055, 1800, 0.65);
    if (type === 'jerkStop') this.beep(82, 0.18, 'square', 0.08);
    if (type === 'stop') this.beep(180, 0.08, 'triangle', 0.04);
    if (type === 'approach') { this.beep(880, 0.08, 'square', 0.04); this.beep(660, 0.12, 'square', 0.04, 0.12); }
    if (type === 'horn') this.horn();
  };
  OneManAudio.prototype.update = function (state, dtMs) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const speed = Math.max(0, state.kmh || 0);
    const external = state.shot && state.shot.indexOf('CINE_') === 0;
    const tunnel = state.stationIndex === 2 && state.routePos > state.sectionLength * 0.43 && state.routePos < state.sectionLength * 0.53;
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(Math.min(0.11, speed / 900) * (external ? 0.55 : 1), now, 0.18);
      this.windFilter.frequency.setTargetAtTime(500 + speed * 13, now, 0.2);
    }
    if (this.vvvfGain) {
      const active = state.phase === 'DEPART';
      const step = Math.floor((state.phaseTimeMs || 0) / 420);
      const freq = 110 + step * 38 + Math.sin(now * 9) * 3;
      this.vvvf.frequency.setTargetAtTime(freq, now, 0.03);
      this.vvvfFilter.frequency.setTargetAtTime(700 + step * 85, now, 0.08);
      this.vvvfGain.gain.setTargetAtTime(active ? 0.038 : 0.0001, now, 0.08);
    }
    if (speed > 8 && state.phase !== 'TITLE' && state.phase !== 'RUN_INTRO' && state.phase !== 'FINAL_RESULT') {
      const idx = Math.floor((state.routePos || 0) / 25);
      if (idx !== this.lastJointIndex) {
        this.lastJointIndex = idx;
        this.joint(external, tunnel);
      }
    }
    if (state.phase === 'FINAL' && speed < 18 && speed > 1 && now - this.lastSqueal > 0.55) {
      this.lastSqueal = now;
      this.beep(2100 + speed * 18, 0.25, 'sine', 0.012);
    }
    const crossingZ = state.sectionLength * 0.46;
    const nearCrossing = state.stationIndex === 1 && Math.abs((state.routePos || 0) - crossingZ) < 150 && (state.phase === 'CRUISE' || state.phase === 'DEPART');
    if (nearCrossing) {
      const beat = Math.floor(now * 3.2);
      if (beat !== this.lastCrossingBeat) {
        this.lastCrossingBeat = beat;
        const doppler = 1 + ((state.routePos || 0) - crossingZ) / 900;
        this.beep(980 * doppler, 0.07, 'square', external ? 0.055 : 0.028);
      }
    }
  };
  window.OneManAudio = OneManAudio;
})();
