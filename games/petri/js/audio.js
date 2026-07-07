(function () {
  'use strict';

  function PetriAudio() {
    this.ctx = null;
    this.muted = localStorage.getItem('petri.muted') === '1';
    this.started = false;
    this.nextBubble = 0;
  }

  PetriAudio.prototype.unlock = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.16;
    this.master.connect(this.ctx.destination);
    this.pad = this.ctx.createOscillator();
    this.padGain = this.ctx.createGain();
    this.pad.type = 'sine';
    this.pad.frequency.value = 92;
    this.padGain.gain.value = 0.025;
    this.pad.connect(this.padGain);
    this.padGain.connect(this.master);
    this.pad.start();
  };

  PetriAudio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    localStorage.setItem('petri.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
  };

  PetriAudio.prototype.tone = function (freq, dur, type, gain) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  };

  PetriAudio.prototype.event = function (type) {
    if (type === 'drop') this.tone(170, 0.18, 'sine', 0.09);
    if (type === 'spore') this.tone(330, 0.16, 'triangle', 0.045);
    if (type === 'stir') this.tone(95, 0.28, 'sawtooth', 0.04);
    if (type === 'discover') {
      this.tone(520, 0.18, 'triangle', 0.09);
      setTimeout(this.tone.bind(this, 780, 0.22, 'triangle', 0.08), 90);
      setTimeout(this.tone.bind(this, 1040, 0.26, 'triangle', 0.07), 180);
    }
  };

  PetriAudio.prototype.update = function () {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now > this.nextBubble) {
      this.nextBubble = now + 1.8 + Math.random() * 4;
      this.tone(260 + Math.random() * 140, 0.08, 'sine', 0.018);
    }
  };

  window.PetriAudio = PetriAudio;
})();
