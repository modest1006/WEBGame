(function () {
  'use strict';

  function BubbleExAudio() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  BubbleExAudio.prototype.unlock = function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
    } catch (e) { console.error('audio unlock failed', e); }
  };

  BubbleExAudio.prototype.setMute = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  };

  BubbleExAudio.prototype._osc = function (type, freq, t0, dur, gainPeak, opts) {
    if (!this.ctx) return;
    opts = opts || {};
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  BubbleExAudio.prototype.fire = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    this._osc('square', 520, t, 0.09, 0.16, { slideTo: 780 });
  };

  BubbleExAudio.prototype.wallbounce = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    this._osc('triangle', 340, t, 0.06, 0.12, { slideTo: 220 });
  };

  BubbleExAudio.prototype.pop = function (chainIndex) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var freq = 440 + Math.min(chainIndex, 10) * 55;
    this._osc('square', freq, t, 0.08, 0.14, { slideTo: freq * 1.5 });
  };

  BubbleExAudio.prototype.dropBonus = function (count) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var n = Math.min(count, 8);
    for (var i = 0; i < n; i++) {
      this._osc('sine', 300 + i * 40, t + i * 0.045, 0.12, 0.12, { slideTo: 500 + i * 40 });
    }
  };

  BubbleExAudio.prototype.ceilingWarn = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    this._osc('sawtooth', 90, t, 0.5, 0.18, { slideTo: 60 });
    this._osc('sawtooth', 92, t + 0.08, 0.5, 0.16, { slideTo: 58 });
  };

  BubbleExAudio.prototype.combo = function (mult) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < Math.min(mult, 4); i++) {
      this._osc('square', notes[i], t + i * 0.07, 0.14, 0.15);
    }
  };

  BubbleExAudio.prototype.stageClear = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this._osc('square', f, t + i * 0.11, 0.24, 0.16));
  };

  BubbleExAudio.prototype.gameOver = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var notes = [392, 349.2, 293.7, 220];
    notes.forEach((f, i) => this._osc('sawtooth', f, t + i * 0.17, 0.3, 0.16));
  };

  BubbleExAudio.prototype.startBgm = function () {
    if (!this.ctx || this.bgmTimer) return;
    var self = this;
    var pattern = [261.6, 329.6, 392.0, 329.6, 261.6, 329.6, 392.0, 523.2];
    var stepDur = 0.18;
    function tick() {
      if (!self.ctx || self.muted) { self.bgmStep++; return; }
      var t = self.ctx.currentTime;
      var freq = pattern[self.bgmStep % pattern.length];
      self._osc('square', freq, t, stepDur * 0.85, 0.045);
      if (self.bgmStep % 4 === 0) self._osc('triangle', 65, t, stepDur * 0.9, 0.1);
      self.bgmStep++;
    }
    this.bgmTimer = setInterval(tick, stepDur * 1000);
  };

  BubbleExAudio.prototype.stopBgm = function () {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
  };

  window.BubbleExAudio = BubbleExAudio;
})();
