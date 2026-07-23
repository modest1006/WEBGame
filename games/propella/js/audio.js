(function () {
  'use strict';

  function PropellaAudio() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.unlocked = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.comboLayer = 0;
  }

  PropellaAudio.prototype.unlock = function () {
    if (this.unlocked && this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(function () {});
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      const ctx = this.context;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : .62;
      this.master.connect(ctx.destination);

      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = .001;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineFilter.Q.value = 1.4;
      this.engineGain.connect(this.engineFilter);
      this.engineFilter.connect(this.master);

      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 58;
      this.engineOsc.connect(this.engineGain);
      this.engineOsc.start();

      this.engineSub = ctx.createOscillator();
      this.engineSub.type = 'triangle';
      this.engineSub.detune.value = -1200;
      this.engineSub.connect(this.engineGain);
      this.engineSub.start();

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = .075;
      this.musicGain.connect(this.master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = .45;
      this.sfxGain.connect(this.master);

      this.unlocked = true;
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      this.startMusic();
      return true;
    } catch (error) {
      console.error('[PROPELLA audio unlock]', error);
      return false;
    }
  };

  PropellaAudio.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : .62, this.context.currentTime, .025);
    }
  };

  PropellaAudio.prototype.toggleMute = function () {
    this.setMuted(!this.muted);
    return this.muted;
  };

  PropellaAudio.prototype.update = function (game) {
    if (!this.context || !this.engineOsc) return;
    try {
      const now = this.context.currentTime;
      const speedFactor = Math.max(0, Math.min(1.4, (game.speed - 45) / 75));
      const engineHz = 55 + speedFactor * 48 + (game.boosting ? 18 : 0);
      this.engineOsc.frequency.setTargetAtTime(engineHz, now, .08);
      this.engineSub.frequency.setTargetAtTime(engineHz, now, .08);
      this.engineFilter.frequency.setTargetAtTime(330 + speedFactor * 720 + (game.boosting ? 260 : 0), now, .09);
      this.engineGain.gain.setTargetAtTime(game.mode === 'play' ? .105 + speedFactor * .055 : .018, now, .12);
      this.comboLayer = Math.max(0, PropellaGame.comboMultiplier(game.combo) - 1);
      this.musicGain.gain.setTargetAtTime(.058 + this.comboLayer * .018, now, .2);
    } catch (error) {
      console.error('[PROPELLA audio update]', error);
    }
  };

  PropellaAudio.prototype.tone = function (frequency, duration, options) {
    if (!this.context || !this.sfxGain) return;
    options = options || {};
    const ctx = this.context;
    const now = ctx.currentTime + (options.delay || 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
    oscillator.detune.value = options.detune || 0;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume || .16, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  };

  PropellaAudio.prototype.noiseBurst = function (duration, volume, highpass) {
    if (!this.context || !this.sfxGain) return;
    const ctx = this.context;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      const envelope = Math.pow(1 - i / frames, 2.4);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass || 700;
    const gain = ctx.createGain();
    gain.gain.value = volume || .22;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  };

  PropellaAudio.prototype.playRing = function (gold, combo) {
    if (gold) {
      const notes = [659, 831, 988, 1319];
      for (let i = 0; i < notes.length; i++) this.tone(notes[i], .3, { delay:i * .065, volume:.16, type:'sine' });
      this.tone(330, .55, { to:990, volume:.1, type:'triangle' });
    } else {
      this.tone(310, .24, { to:125, volume:.2, type:'sine' });
      this.tone(740, .16, { to:980, volume:.09, type:'triangle', delay:.04 });
    }
    if (combo >= 2) this.playCombo(combo);
  };

  PropellaAudio.prototype.playCombo = function (combo) {
    const base = 440 * Math.pow(2, Math.min(8, combo) / 12);
    this.tone(base, .17, { volume:.1, type:'square' });
    this.tone(base * 1.25, .2, { delay:.075, volume:.09, type:'square' });
    this.tone(base * 1.5, .24, { delay:.15, volume:.09, type:'triangle' });
  };

  PropellaAudio.prototype.playBalloon = function () {
    this.noiseBurst(.14, .42, 950);
    this.tone(150, .13, { to:62, volume:.24, type:'square' });
  };

  PropellaAudio.prototype.playMountain = function () {
    this.noiseBurst(.32, .35, 160);
    this.tone(95, .42, { to:42, volume:.28, type:'sawtooth' });
  };

  PropellaAudio.prototype.playCountdown = function (second) {
    this.tone(second <= 3 ? 880 : 520, .11, { volume:.13, type:'square' });
    this.tone(74, .2, { volume:.14, type:'sine' });
  };

  PropellaAudio.prototype.playCloud = function () {
    this.noiseBurst(.38, .08, 1300);
    this.tone(520, .35, { to:760, volume:.045, type:'sine' });
  };

  PropellaAudio.prototype.startMusic = function () {
    if (this.musicTimer) return;
    const self = this;
    const melody = [0, 4, 7, 11, 7, 4, 2, 7, 0, 4, 9, 12, 9, 7, 4, 2];
    const bass = [0, 0, 5, 5, 7, 7, 5, 5];
    this.musicTimer = window.setInterval(function () {
      if (!self.context || self.muted) return;
      try {
        const step = self.musicStep++;
        const root = 220;
        const note = root * Math.pow(2, melody[step % melody.length] / 12);
        self.musicTone(note, .34, .035, 'triangle');
        if (step % 2 === 0) {
          const bassNote = 110 * Math.pow(2, bass[Math.floor(step / 2) % bass.length] / 12);
          self.musicTone(bassNote, .5, .035, 'sine');
        }
        if (self.comboLayer >= 1 && step % 2 === 1) self.musicTone(note * 2, .14, .022 + self.comboLayer * .007, 'square');
        if (self.comboLayer >= 3) self.musicTone(note * 1.5, .2, .02, 'triangle');
      } catch (error) {
        console.error('[PROPELLA music]', error);
      }
    }, 230);
  };

  PropellaAudio.prototype.musicTone = function (frequency, duration, volume, type) {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type || 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.musicGain);
    oscillator.start(now);
    oscillator.stop(now + duration + .04);
  };

  PropellaAudio.prototype.handleEvent = function (type, data) {
    if (!this.context) return;
    try {
      if (type === 'ring') this.playRing(data.gold, data.combo);
      else if (type === 'balloon') this.playBalloon();
      else if (type === 'mountain') this.playMountain();
      else if (type === 'countdown') this.playCountdown(data.second);
      else if (type === 'cloud') this.playCloud();
      else if (type === 'finish') {
        this.tone(392, .45, { to:196, volume:.18, type:'triangle' });
        this.tone(294, .52, { delay:.16, to:147, volume:.16, type:'triangle' });
      }
    } catch (error) {
      console.error('[PROPELLA sfx]', type, error);
    }
  };

  PropellaAudio.prototype.testAll = function () {
    if (!this.context) return false;
    this.playRing(false, 1);
    this.playRing(true, 3);
    this.playBalloon();
    this.playMountain();
    this.playCountdown(3);
    this.playCloud();
    this.playCombo(5);
    return true;
  };

  PropellaAudio.prototype.getState = function () {
    return {
      unlocked:this.unlocked,
      contextState:this.context ? this.context.state : 'none',
      muted:this.muted,
      comboLayer:this.comboLayer
    };
  };

  window.PropellaAudio = PropellaAudio;
})();
