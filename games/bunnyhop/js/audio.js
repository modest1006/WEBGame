// WebAudioによる自前合成SFX。外部音源ファイル不要。
class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  tone({ freq = 440, end = freq, dur = 0.08, type = 'square', gain = 0.06, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.1, gain = 0.05, freq = 900, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t0);
  }

  play(name, data = {}) {
    switch (name) {
      case 'jump':
        this.tone({ freq: 300, end: 520, dur: 0.1, type: 'square', gain: 0.05 });
        break;
      case 'bhop': {
        // コンボが伸びるほど高い音に
        const f = 380 + Math.min(data.combo ?? 1, 10) * 45;
        this.tone({ freq: f, end: f * 1.6, dur: 0.09, type: 'square', gain: 0.06 });
        this.noise({ dur: 0.06, gain: 0.03, freq: 2200 });
        break;
      }
      case 'slide':
        this.noise({ dur: 0.18, gain: 0.05, freq: 700 });
        break;
      case 'land':
        this.noise({ dur: 0.05, gain: 0.04, freq: 500 });
        break;
      case 'carrot':
        this.tone({ freq: 880, end: 1320, dur: 0.09, type: 'triangle', gain: 0.06 });
        this.tone({ freq: 1320, end: 1760, dur: 0.08, type: 'triangle', gain: 0.05, delay: 0.07 });
        break;
      case 'checkpoint':
        this.tone({ freq: 523, dur: 0.1, type: 'triangle', gain: 0.06 });
        this.tone({ freq: 784, dur: 0.14, type: 'triangle', gain: 0.06, delay: 0.09 });
        break;
      case 'death':
        this.tone({ freq: 300, end: 60, dur: 0.4, type: 'sawtooth', gain: 0.07 });
        this.noise({ dur: 0.25, gain: 0.06, freq: 400 });
        break;
      case 'finish':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.14, type: 'square', gain: 0.06, delay: i * 0.1 }));
        break;
      case 'start':
        [392, 523, 659].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.08, type: 'square', gain: 0.05, delay: i * 0.06 }));
        break;
    }
  }
}
