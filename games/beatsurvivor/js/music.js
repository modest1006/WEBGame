class Music {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.compressor = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.judgeGain = null;
    this.upperFilter = null;
    this.nextStep = 0;
    this.anchorBeat = 0;
    this.anchorTime = 0;
    this.timer = null;
    this.lastScheduleState = null;
    this.bossMode = false;
    this.currentPhrase = { index: -1, variant: 0, hats16: false, lead: false, pad: 0, arp: 0 };
    this.phraseLog = [];

    // The kick and bass pattern are the groove foundation. Do not alter these.
    this.bassPat = [0, -1, 0, -1, 7, -1, 5, -1, 0, -1, 0, 3, -1, 3, 5, 7];
    this.arpPatterns = [
      [0, 3, 7, 10, 12, 10, 7, 3],
      [0, 7, 10, 15, 14, 10, 7, 3],
      [0, 5, 7, 12, 15, 12, 7, 5],
    ];
    this.padChords = [
      [0, 3, 7],
      [0, 5, 10],
      [3, 7, 12],
    ];
    this.minorPadChords = [
      [0, 3, 7],
      [-2, 3, 7],
      [0, 3, 10],
    ];
    this.leadNotes = [12, -1, 15, -1, 17, 15, 12, -1, 10, -1, 12, 15, -1, 17, 19, -1];
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;

      this.compressor = this.ctx.createDynamicsCompressor ? this.ctx.createDynamicsCompressor() : null;
      if (this.compressor) {
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.16;
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
      } else {
        this.master.connect(this.ctx.destination);
      }

      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.judgeGain = this.ctx.createGain();
      this.upperFilter = this.ctx.createBiquadFilter();
      this.upperFilter.type = 'lowpass';
      this.upperFilter.frequency.value = 8200;
      this.upperFilter.Q.value = 0.4;

      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.judgeGain.connect(this.master);
      this.upperFilter.connect(this.bgmGain);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 30);
  }

  applyVolumes() {
    const v = this.game.settings?.volumes ?? { bgm: 1, sfx: 1, judge: 1 };
    if (this.bgmGain) this.bgmGain.gain.value = Math.max(0, Math.min(1, Number(v.bgm ?? 1)));
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, Number(v.sfx ?? 1)));
    if (this.judgeGain) this.judgeGain.gain.value = Math.max(0, Math.min(1, Number(v.judge ?? 1)));
  }

  setVolume(kind, value) {
    if (!this.game.settings.volumes) this.game.settings.volumes = { bgm: 1, sfx: 1, judge: 1 };
    this.game.settings.volumes[kind] = Math.max(0, Math.min(1, Number(value) || 0));
    this.applyVolumes();
    return this.game.settings.volumes[kind];
  }

  getVolumes() {
    return {
      bgm: this.bgmGain ? this.bgmGain.gain.value : this.game.settings?.volumes?.bgm ?? 1,
      sfx: this.sfxGain ? this.sfxGain.gain.value : this.game.settings?.volumes?.sfx ?? 1,
      judge: this.judgeGain ? this.judgeGain.gain.value : this.game.settings?.volumes?.judge ?? 1,
    };
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  setBossMode(on) {
    this.bossMode = !!on;
    if (this.upperFilter && this.ctx) {
      const freq = this.bossMode ? 1450 : 8200;
      const now = this.ctx.currentTime;
      if (this.upperFilter.frequency.setTargetAtTime) this.upperFilter.frequency.setTargetAtTime(freq, now, 0.18);
      else this.upperFilter.frequency.value = freq;
    }
  }

  schedule() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const st = this.game.state;
    if (st !== this.lastScheduleState) {
      this.nextStep = Math.floor((st === 'title' ? now * BPM / 60 : (this.game.audioBeat ?? this.game.beat)) * 4);
      this.lastScheduleState = st;
    }
    const titleMode = st === 'title' || st === 'paused' || st === 'dead' || st === 'clear';
    const beatSec = titleMode ? 60 / BPM : (this.game.audioBeatMs ? this.game.audioBeatMs() / 1000 : 60 / BPM);
    const clockBeat = titleMode ? now / beatSec : (this.game.audioBeat ?? this.game.beat);
    this.anchorBeat = clockBeat;
    this.anchorTime = now;
    const curStep = Math.floor(clockBeat * 4);
    if (this.nextStep < curStep) this.nextStep = curStep;
    while (true) {
      const t = this.anchorTime + (this.nextStep / 4 - this.anchorBeat) * beatSec;
      if (t > now + 0.18) break;
      if (t >= now - 0.02) {
        if (titleMode) this.playTitleStep(this.nextStep, Math.max(t, now + 0.001));
        else if (st === 'playing' || st === 'levelup' || st === 'dying') this.playStep(this.nextStep, Math.max(t, now + 0.001));
      }
      this.nextStep++;
    }
  }

  playTitleStep(step, t) {
    const s16 = step % 16;
    if (s16 % 4 === 0) this.kick(t);
    if (s16 % 2 === 0) this.hihat(t, s16 % 4 === 2 ? 0.12 : 0.08);
    const bn = this.bassPat[s16];
    if (bn >= 0) this.bass(t, 55 * Math.pow(2, bn / 12), 0.11);
    const titleLayer = this.game.meta?.achievements?.includes('groove_max');
    if (titleLayer && s16 % 4 === 2) {
      const n = [0, 7, 10, 15][Math.floor(step / 4) % 4];
      this.pluck(t, 440 * Math.pow(2, (n - 12) / 12), 0.035, this.upperFilter);
    }
  }

  updatePhrase(step, t) {
    if (step % 128 !== 0) return;
    const index = Math.floor(step / 128);
    if (index === this.currentPhrase.index) return;
    const variant = index % 3;
    this.currentPhrase = {
      index,
      variant,
      hats16: variant !== 1,
      lead: variant === 1 || variant === 2,
      pad: variant,
      arp: variant,
    };
    this.phraseLog.push({
      step,
      beat: step / 4,
      phrase: index,
      variant,
      boss: this.bossMode,
      overdrive: this.game.isEndless?.() && this.game.time >= OVERDRIVE_TIME,
    });
    if (this.phraseLog.length > 64) this.phraseLog.shift();
  }

  playStep(step, t) {
    this.updatePhrase(step, t);
    const g = this.game.groove;
    const s16 = step % 16;

    if (s16 % 4 === 0) this.kick(t);
    if (s16 === 4 || s16 === 12) this.snare(t, 0.5);

    const hat16 = g >= 5 || this.currentPhrase.hats16;
    if (hat16 || s16 % 2 === 0) this.hihat(t, hat16 && s16 % 2 ? 0.13 : (s16 % 4 === 2 ? 0.35 : 0.18));

    const bn = this.bassPat[s16];
    if (bn >= 0) this.bass(t, 55 * Math.pow(2, bn / 12), g >= 2 ? 0.3 : 0.2);

    if (g >= 6 && s16 % 2 === 0) {
      const pat = this.bossMode ? this.arpPatterns[1] : this.arpPatterns[this.currentPhrase.arp];
      const n = pat[(step / 2) % pat.length | 0] + (this.bossMode ? -2 : 0);
      this.pluck(t, 440 * Math.pow(2, (n - 12) / 12), this.bossMode ? 0.075 : 0.1, this.upperFilter);
    }

    if (this.currentPhrase.lead && g >= 9 && s16 % 2 === 0) {
      const n = this.leadNotes[s16];
      if (n >= 0) this.lead(t, 440 * Math.pow(2, (n + (this.bossMode ? -2 : 0) - 12) / 12), this.bossMode ? 0.045 : 0.07);
    }

    if (g >= 12 && s16 === 0) {
      const chordSet = this.bossMode ? this.minorPadChords : this.padChords;
      const chord = chordSet[this.currentPhrase.pad];
      for (const n of chord) this.pad(t, 220 * Math.pow(2, n / 12), 1.6, this.upperFilter);
    }

    if (this.game.isEndless?.() && this.game.time >= OVERDRIVE_TIME && g >= 4 && s16 % 4 === 2) {
      const n = [19, 17, 15, 22][(step / 4) % 4 | 0];
      this.pluck(t, 880 * Math.pow(2, (n - 19) / 12), 0.055, this.upperFilter);
    }
  }

  env(t, dur, peak, dest = this.sfxGain) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, peak), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(dest || this.master);
    return g;
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, 0.16, 0.9, this.bgmGain));
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

  noise({ dur = 0.1, gain = 0.05, freq = 1200, delay = 0, dest = this.sfxGain }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    src.connect(f);
    f.connect(this.env(t, dur, gain, dest));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  snare(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1400;
    src.connect(f); f.connect(this.env(t, 0.14, vol, this.bgmGain));
    src.start(t); src.stop(t + 0.15);
  }

  hihat(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6500;
    src.connect(f); f.connect(this.env(t, 0.05, vol, this.upperFilter));
    src.start(t); src.stop(t + 0.06);
  }

  bass(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    o.connect(f); f.connect(this.env(t, 0.18, vol, this.bgmGain));
    o.start(t); o.stop(t + 0.2);
  }

  pluck(t, freq, vol, dest = this.sfxGain) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    o.connect(this.env(t, 0.12, vol, dest));
    o.start(t); o.stop(t + 0.14);
  }

  lead(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(this.env(t, 0.18, vol, this.upperFilter));
    o.start(t); o.stop(t + 0.2);
  }

  pad(t, freq, dur, dest = this.upperFilter) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(dest || this.master);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  }

  sfx(name, data = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'perfect': {
        const f = 660 + Math.min(data.groove ?? 0, 20) * 30;
        this.pluck(t, f, 0.22, this.judgeGain);
        this.pluck(t + 0.05, f * 1.5, 0.16, this.judgeGain);
        break;
      }
      case 'good':
        this.pluck(t, 440, 0.12, this.judgeGain);
        break;
      case 'miss': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
        o.connect(this.env(t, 0.15, 0.15, this.judgeGain));
        o.start(t); o.stop(t + 0.17);
        break;
      }
      case 'kill':
        this.pluck(t, 520 + Math.random() * 200, 0.07, this.sfxGain);
        break;
      case 'hurt': {
        const o = this.ctx.createOscillator();
        o.type = 'square'; o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
        o.connect(this.env(t, 0.2, 0.2, this.sfxGain));
        o.start(t); o.stop(t + 0.22);
        break;
      }
      case 'gem':
        this.pluck(t, 1180, 0.05, this.sfxGain);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.pluck(t + i * 0.07, f, 0.15, this.sfxGain));
        break;
      case 'cardin': {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
        o.connect(this.env(t, 0.16, 0.5, this.sfxGain));
        o.start(t); o.stop(t + 0.18);
        this.noise({ dur: 0.05, gain: 0.05, freq: 1800, dest: this.sfxGain });
        break;
      }
      case 'boss': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.7);
        o.connect(this.env(t, 0.7, 0.3, this.sfxGain));
        o.start(t); o.stop(t + 0.75);
        break;
      }
      case 'clear':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.pluck(t + i * 0.09, f, 0.18, this.sfxGain));
        break;
      case 'dead': {
        [330, 262, 196, 131].forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = 'triangle'; o.frequency.value = f;
          o.connect(this.env(t + i * 0.16, 0.3, 0.15, this.sfxGain));
          o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.32);
        });
        break;
      }
      case 'maxgroove':
        this.pluck(t, data.strong ? 1320 : 990, data.strong ? 0.26 : 0.12, this.sfxGain);
        this.pluck(t + 0.05, data.strong ? 1980 : 1485, data.strong ? 0.18 : 0.08, this.sfxGain);
        break;
      case 'bossboom':
        this.noise({ dur: 0.35, gain: 0.22, freq: 180, dest: this.sfxGain });
        this.kick(t);
        this.kick(t + 0.09);
        break;
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
