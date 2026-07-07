(function () {
  'use strict';
  function OneManAudio() {
    this.ctx = null;
    this.muted = false;
  }
  OneManAudio.prototype.unlock = function () {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };
  OneManAudio.prototype.toggleMute = function () { this.muted = !this.muted; };
  OneManAudio.prototype.beep = function (freq, dur, type, gain) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gain || 0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + dur);
  };
  OneManAudio.prototype.noise = function (dur, gain) {
    if (this.muted || !this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
    g.gain.value = gain || 0.08;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start(); src.stop(this.ctx.currentTime + dur);
  };
  OneManAudio.prototype.event = function (type) {
    if (type === 'brake') this.noise(0.12, 0.035);
    if (type === 'brakeRelease') this.noise(0.18, 0.04);
    if (type === 'jerkStop') this.beep(82, 0.18, 'square', 0.08);
    if (type === 'stop') this.beep(180, 0.08, 'triangle', 0.04);
    if (type === 'approach') { this.beep(880, 0.08, 'square', 0.04); this.beep(660, 0.12, 'square', 0.04); }
  };
  window.OneManAudio = OneManAudio;
})();
