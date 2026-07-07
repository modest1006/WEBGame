class NeonDriveMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineGain = null;
    this.filter = null;
    this.started = false;
    this.muted = false;
    this.step = 0;
    this.nextNote = 0;
    this.engineOsc = null;
    this.engineNoise = null;
    try { this.muted = localStorage.getItem(ND_STORAGE.muted) === '1'; } catch (_) {}
  }

  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.started) this.startEngine();
    this.started = true;
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.58;
    this.master.connect(this.ctx.destination);
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 950;
    this.filter.Q.value = 0.75;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.12;
    this.filter.connect(this.musicGain);
    this.musicGain.connect(this.master);
    this.engineGain.connect(this.master);
  }

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 120;
    f.Q.value = 2.8;
    this.engineOsc.connect(f);
    f.connect(this.engineGain);
    this.engineOsc.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.58, this.ctx.currentTime, 0.02);
    try { localStorage.setItem(ND_STORAGE.muted, this.muted ? '1' : '0'); } catch (_) {}
    return this.muted;
  }

  update(game, dtMs) {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    const speedT = ndClamp(game.speed / ND.physics.boostMaxSpeed, 0, 1);
    const boost = game.boostTime > 0 ? 1 : 0;
    if (this.engineOsc) {
      this.engineOsc.frequency.setTargetAtTime(55 + speedT * 170 + boost * 60, now, 0.035);
      this.engineGain.gain.setTargetAtTime(0.08 + speedT * 0.13 + boost * 0.11, now, 0.05);
    }
    if (this.filter) this.filter.frequency.setTargetAtTime(620 + speedT * 2600 + boost * 2200, now, 0.08);
    this.scheduleMusic(now, speedT, boost);
  }

  scheduleMusic(now, speedT, boost) {
    const bpm = 118 + speedT * 28 + boost * 18;
    const stepDur = 60 / bpm / 2;
    while (this.nextNote < now + 0.12) {
      const t = this.nextNote || now;
      const root = 55;
      const seq = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 15, 22];
      this.tone(root * Math.pow(2, seq[this.step % seq.length] / 12), t, stepDur * 0.72, 'sawtooth', 0.07, this.filter);
      if (this.step % 4 === 0) this.kick(t, 0.22 + boost * 0.08);
      if (this.step % 4 === 2) this.snare(t, 0.08);
      this.hat(t, 0.035 + speedT * 0.02);
      if (this.step % 8 === 0) this.tone(220 * Math.pow(2, (this.step % 16 === 0 ? 0 : 5) / 12), t, stepDur * 6, 'triangle', 0.035, this.filter);
      this.step++;
      this.nextNote = t + stepDur;
    }
  }

  tone(freq, time, dur, type, gain, dest) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(time); o.stop(time + dur + 0.02);
  }

  kick(time, gain) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    o.connect(g); g.connect(this.master); o.start(time); o.stop(time + 0.18);
  }

  snare(time, gain) { this.noise(time, 0.12, gain, 1800); }
  hat(time, gain) { this.noise(time, 0.035, gain, 7000); }

  noise(time, dur, gain, freq) {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    f.type = 'highpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.buffer = buffer; src.connect(f); f.connect(g); g.connect(this.master);
    src.start(time); src.stop(time + dur);
  }

  sfx(type) {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    if (type === 'nearmiss') {
      this.noise(t, 0.16, 0.16, 3600);
      this.tone(880, t, 0.08, 'sine', 0.06, this.master);
    } else if (type === 'crash') {
      this.noise(t, 0.38, 0.28, 260);
      this.tone(90, t, 0.32, 'sawtooth', 0.16, this.master);
    } else if (type === 'checkpoint') {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.07, 0.16, 'square', 0.06, this.master));
    } else if (type === 'boost') {
      this.noise(t, 0.58, 0.34, 900);
      this.sweep(t, 0.42, 120, 1800, 0.16);
      this.tone(130, t, 0.55, 'sawtooth', 0.16, this.master);
    } else if (type === 'countdown') {
      this.tone(980, t, 0.08, 'square', 0.08, this.master);
    } else if (type === 'dead') {
      [330, 247, 196, 147].forEach((f, i) => this.tone(f, t + i * 0.12, 0.24, 'triangle', 0.08, this.master));
    }
  }

  sweep(time, dur, from, to, gain) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, time);
    o.frequency.exponentialRampToValueAtTime(to, time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(this.master);
    o.start(time); o.stop(time + dur + 0.02);
  }
}
