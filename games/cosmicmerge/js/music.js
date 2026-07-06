class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.muted = false;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
    this.startPad();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime, 0.03);
    return this.muted;
  }

  startPad() {
    if (!this.ctx) return;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.035;
    this.padGain.connect(this.master);
    [55, 82.41, 110, 146.83].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.value = 0.18 / (i + 1);
      o.connect(g); g.connect(this.padGain); o.start();
    });
  }

  tone(freq, dur, type = 'sine', gain = 0.12, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.04);
  }

  noise(dur, gain = 0.08, delay = 0, filter = 900) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const biq = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    biq.type = 'bandpass'; biq.frequency.value = filter; biq.Q.value = 0.9;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.buffer = buf; src.connect(biq); biq.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  sfx(type, d = {}) {
    if (!this.unlocked) return;
    if (type === 'drop') { this.tone(110 + d.tier * 22, 0.12, 'triangle', 0.08); this.noise(0.08, 0.025, 0, 500 + d.tier * 90); }
    if (type === 'hit') this.tone(80 + d.tier * 18, 0.06, 'sine', 0.035);
    if (type === 'merge') {
      const base = 180 + d.nextTier * 42 + d.combo * 10;
      this.tone(base, 0.18, 'sine', 0.1);
      this.tone(base * 1.5, 0.16, 'triangle', 0.065, 0.035);
      this.tone(base * 2, 0.13, 'sine', 0.045, 0.075);
      if (d.nextTier >= 8) this.noise(0.35, 0.09, 0.02, 1400);
    }
    if (type === 'warning') { this.tone(620, 0.09, 'square', 0.055); this.tone(430, 0.08, 'square', 0.035, 0.12); }
    if (type === 'dead') { this.tone(180, 0.5, 'sawtooth', 0.11); this.tone(90, 0.8, 'sine', 0.14, 0.12); }
    if (type === 'bigbang') { this.noise(0.9, 0.16, 0, 180); this.tone(55, 1.1, 'sine', 0.22); this.tone(880, 0.45, 'triangle', 0.09, 0.22); }
  }
}
