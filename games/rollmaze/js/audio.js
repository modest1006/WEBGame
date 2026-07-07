(function () {
  'use strict';
  function RollMazeAudio() {
    this.ctx = null;
    this.muted = localStorage.getItem('rollmaze.muted') === '1';
    this.rollGain = null;
    this.rollOsc = null;
    this.bgmGain = null;
  }
  RollMazeAudio.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    this.ctx = new A();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.62;
    this.master.connect(this.ctx.destination);
    this.rollOsc = this.ctx.createOscillator();
    this.rollOsc.type = 'sawtooth';
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 440;
    this.rollOsc.connect(filter).connect(this.rollGain).connect(this.master);
    this.rollOsc.start();
    this.startBgm();
  };
  RollMazeAudio.prototype.startBgm = function () {
    if (!this.ctx) return;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.035;
    this.bgmGain.connect(this.master);
    [110, 165, 220].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.2 / (i + 1);
      o.connect(g).connect(this.bgmGain);
      o.start();
    });
  };
  RollMazeAudio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    localStorage.setItem('rollmaze.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, this.ctx.currentTime, 0.02);
    return this.muted;
  };
  RollMazeAudio.prototype.blip = function (freq, dur, gain, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  RollMazeAudio.prototype.event = function (type, data) {
    if (type === 'hit') this.blip(180 + 180 * (data.strength || 0.2), 0.09, 0.05 + 0.09 * (data.strength || 0.2), 'square');
    if (type === 'fall') this.blip(430, 0.65, 0.16, 'sawtooth');
    if (type === 'checkpoint') this.blip(760, 0.18, 0.14, 'sine');
    if (type === 'goal') { this.blip(523, 0.2, 0.14, 'triangle'); setTimeout(this.blip.bind(this, 784, 0.28, 0.14, 'triangle'), 120); }
    if (type === 'pad') this.blip(620, 0.12, 0.08, 'sawtooth');
  };
  RollMazeAudio.prototype.update = function (game) {
    if (!this.ctx || !this.rollGain) return;
    const s = game.getState();
    const speed = Math.sqrt(s.ball.vx * s.ball.vx + s.ball.vz * s.ball.vz);
    const vol = game.mode === 'play' ? Math.min(0.12, speed * 0.025) : 0;
    this.rollGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.04);
    this.rollOsc.frequency.setTargetAtTime(55 + speed * 38, this.ctx.currentTime, 0.04);
  };
  window.RollMazeAudio = RollMazeAudio;
})();
