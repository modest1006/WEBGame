(function () {
  'use strict';

  function PropellaDebug(game, input, renderer, audio, runtime) {
    this.game = game;
    this.input = input;
    this.renderer = renderer;
    this.audio = audio;
    this.runtime = runtime;
    this.overlay = document.getElementById('debug-overlay');
    this.visible = new URLSearchParams(window.location.search).get('debug') === '1';
    this.frames = [];
    this.install();
  }

  PropellaDebug.prototype.install = function () {
    const self = this;
    if (this.visible) this.overlay.classList.remove('hidden');
    window.addEventListener('keydown', function (event) {
      if (event.code === 'Backquote') {
        self.visible = !self.visible;
        self.overlay.classList.toggle('hidden', !self.visible);
      }
    });

    window.__renderOnce = function (dt) {
      return self.runtime.renderOnce(Number(dt) || 16.7);
    };

    window.__game = {
      getState:function () {
        const state = self.game.getState();
        state.controls = self.input.getState();
        state.audio = self.audio.getState();
        state.autoStep = self.runtime.getAutoStep();
        return state;
      },
      dump:function () { return self.game.dump(); },
      step:function (ms) {
        if (self.game.mode === 'ready') self.game.start();
        const injected = self.input.update(Number(ms) || 0);
        self.game.setInput(injected);
        self.game.update(Number(ms) || 0);
        self.runtime.renderOnce(Number(ms) || 16.7);
        return this.getState();
      },
      setInput:function (value) {
        self.input.setDebugInput(value || {});
        self.game.setInput(value || {});
        return this.getState();
      },
      clearInput:function () {
        self.input.clearDebugInput();
        return this.getState();
      },
      teleport:function (x, y, z) {
        self.game.teleport(x, y, z);
        self.runtime.renderOnce(16.7);
        return this.getState();
      },
      aimAtNextRing:function () {
        const result = self.game.aimAtNextRing();
        self.runtime.renderOnce(16.7);
        return result;
      },
      passRing:function () {
        if (self.game.mode === 'ready') self.game.start();
        const result = self.game.passRing();
        self.runtime.renderOnce(16.7);
        return result;
      },
      setTime:function (seconds) {
        self.game.setTime(seconds);
        self.runtime.renderOnce(16.7);
        return this.getState();
      },
      restart:function () {
        self.runtime.restart();
        return this.getState();
      },
      start:function () {
        self.runtime.start();
        return this.getState();
      },
      setAutoStep:function (enabled) {
        self.runtime.setAutoStep(!!enabled);
        return this.getState();
      },
      forceBalloon:function () {
        const result = self.game.forceBalloon();
        self.runtime.renderOnce(16.7);
        return result;
      },
      forceMountain:function () {
        const result = self.game.forceMountain();
        self.runtime.renderOnce(16.7);
        return result;
      },
      testSfx:function () { return self.audio.testAll(); },
      unlockAudio:function () { return self.audio.unlock(); },
      getRendererConfig:function () { return Object.assign({}, PropellaRenderer.constants); }
    };
  };

  PropellaDebug.prototype.recordFrame = function (dtMs) {
    this.frames.push(Number(dtMs) || 0);
    if (this.frames.length > 45) this.frames.shift();
    if (!this.visible) return;
    let total = 0;
    for (let i = 0; i < this.frames.length; i++) total += this.frames[i];
    const fps = total > 0 ? 1000 / (total / this.frames.length) : 0;
    const state = this.game.getState();
    this.overlay.textContent =
      'PROPELLA DEBUG  FPS ' + fps.toFixed(1) + '\n' +
      this.game.dump() + '\n' +
      'boost=' + (state.boostFuel * 100).toFixed(0) + '% penalty=' + state.speedPenaltyMs.toFixed(0) + 'ms\n' +
      'renderer near/far=' + PropellaRenderer.constants.CAMERA_NEAR.toFixed(2) + '/' + PropellaRenderer.constants.CAMERA_FAR;
  };

  window.PropellaDebug = PropellaDebug;
})();
