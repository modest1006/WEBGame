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

  play(name, data = {}) {
    switch (name) {
      case 'move':
        this.tone({ freq: 220, dur: 0.03, type: 'square', gain: 0.03 });
        break;
      case 'rotate':
        this.tone({ freq: 330, end: 440, dur: 0.05, type: 'square', gain: 0.04 });
        break;
      case 'softstep':
        this.tone({ freq: 160, dur: 0.02, type: 'triangle', gain: 0.02 });
        break;
      case 'harddrop':
        this.tone({ freq: 180, end: 60, dur: 0.1, type: 'sawtooth', gain: 0.08 });
        break;
      case 'lock':
        this.tone({ freq: 120, end: 80, dur: 0.06, type: 'square', gain: 0.05 });
        break;
      case 'hold':
        this.tone({ freq: 520, end: 390, dur: 0.07, type: 'triangle', gain: 0.05 });
        break;
      case 'clear': {
        const n = data.count ?? 1;
        const base = n === 4 ? [523, 659, 784, 1047] : [440, 554, 659].slice(0, n + 1);
        base.forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: 'square', gain: 0.06, delay: i * 0.06 }));
        break;
      }
      case 'levelup':
        [392, 523, 659, 784].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.1, type: 'triangle', gain: 0.06, delay: i * 0.08 }));
        break;
      case 'gameover':
        [330, 262, 196, 131].forEach((f, i) =>
          this.tone({ freq: f, end: f * 0.9, dur: 0.22, type: 'sawtooth', gain: 0.06, delay: i * 0.18 }));
        break;
      case 'start':
        [262, 330, 392, 523].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.09, type: 'square', gain: 0.05, delay: i * 0.07 }));
        break;
    }
  }
}
