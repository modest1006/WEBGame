class Music {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
    this.loop = 0;
    this.lastAct = -1;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.unlocked = true;
    this.ctx.resume();
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(freq, dur, type, gain, when) {
    if (!this.ctx || this.muted) return;
    const t = when == null ? this.now() : when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }

  noise(dur, gain) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain || 0.08;
    src.connect(g); g.connect(this.ctx.destination);
    src.buffer = buf; src.start(); src.stop(this.now() + dur);
  }

  event(type, data) {
    if (!this.ctx || this.muted) return;
    if (type === 'prepAction') {
      const stage = data.stage || 0;
      const gain = [0.025, 0.055, 0.09, 0.12][stage] || 0.06;
      this.tone(stage >= 3 ? 740 : stage >= 2 ? 130 : 440, stage >= 3 ? 0.07 : 0.1, stage >= 3 ? 'square' : 'triangle', gain);
      if (stage >= 1) this.noise(stage >= 3 ? 0.05 : 0.07, gain * 0.75);
      if (stage >= 3) this.tone(980, 0.06, 'square', 0.05, this.now() + 0.08);
    }
    if (type === 'bossWarn') {
      const f = data.kind === 'quick' ? 1040 : data.kind === 'coffee' ? 520 : data.kind === 'stretch' ? 430 : 700;
      this.tone(f, 0.07, 'triangle', 0.055);
    }
    if (type === 'bossLook') this.tone(data.on ? 140 : 360, 0.08, 'sawtooth', 0.05);
    if (type === 'caught') { this.tone(90, 0.35, 'sawtooth', 0.12); this.noise(0.18, 0.12); }
    if (type === 'flying') this.tone(220, 0.2, 'triangle', 0.08);
    if (type === 'just') {
      const base = data.judge === 'PERFECT' ? 70 : 95;
      this.tone(base, 0.45, 'sine', 0.11);
      setTimeout(() => { this.tone(60, 0.18, 'sawtooth', 0.18); this.noise(0.16, 0.16); }, data.slow || 800);
    }
    if (type === 'qteSuccess') {
      const f = 520 + (data.combo || 0) * 45;
      this.tone(f, 0.09, 'square', 0.08);
      this.tone(f * 1.5, 0.12, 'triangle', 0.05, this.now() + 0.05);
    }
    if (type === 'qteFail') { this.tone(160, 0.22, 'sawtooth', 0.1); this.tone(90, 0.28, 'square', 0.08, this.now() + 0.12); }
    if (type === 'finale') {
      this.noise(0.18, 0.18);
      this.tone(110, 0.22, 'sawtooth', 0.18);
      const t = this.now() + 1.95;
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, t + i * 0.12));
    }
  }

  update(game) {
    if (!this.ctx || this.muted) return;
    if (game.act !== this.lastAct) { this.lastAct = game.act; this.loop = 0; }
    const now = this.now();
    if (now < this.loop) return;
    if (game.act === ACT.PREP) {
      [330, 392, 494, 392].forEach((f, i) => this.tone(f, 0.08, 'square', 0.025, now + i * 0.14));
      this.loop = now + 0.62;
    } else if (game.act === ACT.JUST) {
      this.tone(880, 0.035, 'square', 0.035);
      this.loop = now + 1;
    } else if (game.act === ACT.DASH || game.act === ACT.FINALE) {
      [220, 330, 440, 660].forEach((f, i) => this.tone(f, 0.06, 'sawtooth', 0.025, now + i * 0.085));
      if (game.act === ACT.FINALE) this.tone(880, 0.08, 'triangle', 0.035, now + 0.22);
      this.loop = game.act === ACT.FINALE ? now + 0.24 : now + 0.34;
    } else {
      this.loop = now + 0.5;
    }
  }
}
