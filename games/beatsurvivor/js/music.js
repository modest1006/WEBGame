// WebAudioによるプロシージャル音楽エンジン＋SFX。外部音源ファイル不要。
// ゲームのビートクロック（game.beat）を親として先読みスケジューリングする。
// GROOVEが上がるほどレイヤーが増えて曲が盛り上がる。
class Music {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.nextStep = 0;       // 次にスケジュールする16分音符ステップ
    this.anchorBeat = 0;     // game.beat と audio時刻の対応アンカー
    this.anchorTime = 0;
    this.timer = null;
    // Aマイナーのベースパターン（1小節=16ステップ、-1=休符、数値=半音）
    this.bassPat = [0, -1, 0, -1, 7, -1, 5, -1, 0, -1, 0, 3, -1, 3, 5, 7];
    this.arpNotes = [0, 3, 7, 10, 12, 10, 7, 3];
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 30);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  // game.beat → audio時刻の変換（毎スケジュールで再アンカー）
  schedule() {
    if (!this.ctx || this.game.state === 'title') return;
    const beatSec = 60 / BPM;
    const now = this.ctx.currentTime;
    // 再アンカー: 現在のgame.beatがnowに対応する
    this.anchorBeat = this.game.beat;
    this.anchorTime = now;
    const stepSec = beatSec / 4;
    const curStep = Math.floor(this.game.beat * 4);
    if (this.nextStep < curStep) this.nextStep = curStep;
    // 0.18秒先までスケジュール
    while (true) {
      const t = this.anchorTime + (this.nextStep / 4 - this.anchorBeat) * beatSec;
      if (t > now + 0.18) break;
      const st = this.game.state;
      // levelup中も曲を止めない（体験をぶつ切りにしない）
      if (t >= now - 0.02 && (st === 'playing' || st === 'levelup')) this.playStep(this.nextStep, Math.max(t, now + 0.001));
      this.nextStep++;
    }
  }

  playStep(step, t) {
    const g = this.game.groove;
    const s16 = step % 16;
    const beatInBar = Math.floor(s16 / 4);
    // キック: 4つ打ち
    if (s16 % 4 === 0) this.kick(t);
    // スネア: 2・4拍目
    if (s16 === 4 || s16 === 12) this.snare(t, 0.5);
    // ハイハット: 8分（GROOVE5+で16分に）
    if (g >= 5 ? true : s16 % 2 === 0) this.hihat(t, s16 % 4 === 2 ? 0.35 : 0.18);
    // ベース
    const bn = this.bassPat[s16];
    if (bn >= 0) this.bass(t, 55 * Math.pow(2, bn / 12), g >= 2 ? 0.3 : 0.2);
    // アルペジオ: GROOVE 6以上で追加
    if (g >= 6 && s16 % 2 === 0) {
      const n = this.arpNotes[(step / 2) % 8 | 0];
      this.pluck(t, 440 * Math.pow(2, (n - 12) / 12), 0.1);
    }
    // 上物パッド: GROOVE 12以上、小節頭
    if (g >= 12 && s16 === 0) {
      this.pad(t, 220, 1.6);
      this.pad(t, 220 * Math.pow(2, 3 / 12), 1.6);
      this.pad(t, 220 * Math.pow(2, 7 / 12), 1.6);
    }
  }

  // ---- 楽器 ----
  env(t, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.master);
    return g;
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, 0.16, 0.9));
    o.start(t); o.stop(t + 0.18);
  }

  noiseBuf() {
    if (!this._nb) {
      const len = this.ctx.sampleRate * 0.3;
      this._nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._nb;
  }

  // 即時ノイズ音（SFX用の汎用ヘルパー）
  noise({ dur = 0.1, gain = 0.05, freq = 1200, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    src.connect(f);
    f.connect(this.env(t, dur, gain));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  snare(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1400;
    src.connect(f); f.connect(this.env(t, 0.14, vol));
    src.start(t); src.stop(t + 0.15);
  }

  hihat(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6500;
    src.connect(f); f.connect(this.env(t, 0.05, vol));
    src.start(t); src.stop(t + 0.06);
  }

  bass(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    o.connect(f); f.connect(this.env(t, 0.18, vol));
    o.start(t); o.stop(t + 0.2);
  }

  pluck(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    o.connect(this.env(t, 0.12, vol));
    o.start(t); o.stop(t + 0.14);
  }

  pad(t, freq, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.master);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- SFX（即時再生） ----
  sfx(name, data = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'perfect': {
        const f = 660 + Math.min(data.groove ?? 0, 20) * 30; // GROOVEで音程が上がる
        this.pluck(t, f, 0.22);
        this.pluck(t + 0.05, f * 1.5, 0.16);
        break;
      }
      case 'good':
        this.pluck(t, 440, 0.12);
        break;
      case 'miss': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
        o.connect(this.env(t, 0.15, 0.15));
        o.start(t); o.stop(t + 0.17);
        break;
      }
      case 'kill':
        this.pluck(t, 520 + Math.random() * 200, 0.07);
        break;
      case 'hurt': {
        const o = this.ctx.createOscillator();
        o.type = 'square'; o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
        o.connect(this.env(t, 0.2, 0.2));
        o.start(t); o.stop(t + 0.22);
        break;
      }
      case 'gem':
        this.pluck(t, 1180, 0.05);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.pluck(t + i * 0.07, f, 0.15));
        break;
      case 'cardin': {
        // カード登場の「ドン」（タム風）
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
        o.connect(this.env(t, 0.16, 0.5));
        o.start(t); o.stop(t + 0.18);
        this.noise({ dur: 0.05, gain: 0.05, freq: 1800 });
        break;
      }
      case 'boss': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.7);
        o.connect(this.env(t, 0.7, 0.3));
        o.start(t); o.stop(t + 0.75);
        break;
      }
      case 'clear':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.pluck(t + i * 0.09, f, 0.18));
        break;
      case 'dead': {
        [330, 262, 196, 131].forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = 'triangle'; o.frequency.value = f;
          o.connect(this.env(t + i * 0.16, 0.3, 0.15));
          o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.32);
        });
        break;
      }
    }
  }
}
