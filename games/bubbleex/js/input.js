(function () {
  'use strict';
  var C = window.BubbleExConstants;

  // Deadzone radius (px, screen space) around launcher to prevent accidental taps from firing.
  var TOUCH_DEADZONE = 46;

  function BubbleExInput(canvas, game, callbacks) {
    this.canvas = canvas;
    this.game = game;
    this.callbacks = callbacks || {};
    this.dragging = false;
    this.keyLeft = false;
    this.keyRight = false;
    this.bind();
  }

  BubbleExInput.prototype.launcherScreenPos = function () {
    var rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.92 };
  };

  BubbleExInput.prototype.aimFromPoint = function (clientX, clientY) {
    var lp = this.launcherScreenPos();
    var dx = clientX - lp.x;
    var dy = clientY - lp.y;
    if (dy > -8) dy = -8; // avoid pointing downward/degenerate
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    return Math.max(-C.MAX_AIM_DEG, Math.min(C.MAX_AIM_DEG, deg));
  };

  BubbleExInput.prototype.bind = function () {
    var self = this;

    this.canvas.addEventListener('mousemove', function (e) {
      self.game.setAim(self.aimFromPoint(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('mousedown', function (e) {
      self.game.setAim(self.aimFromPoint(e.clientX, e.clientY));
      self.game.fire();
      if (self.callbacks.onFire) self.callbacks.onFire();
    });

    this.canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      self.touchId = t.identifier;
      self.dragging = true;
      self.game.setAim(self.aimFromPoint(t.clientX, t.clientY));
    }, { passive: false });
    this.canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!self.dragging) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === self.touchId) {
          self.game.setAim(self.aimFromPoint(t.clientX, t.clientY));
        }
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      if (!self.dragging) return;
      var lp = self.launcherScreenPos();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === self.touchId) {
          var dx = t.clientX - lp.x, dy = t.clientY - lp.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          self.dragging = false;
          if (dist >= TOUCH_DEADZONE) {
            self.game.fire();
            if (self.callbacks.onFire) self.callbacks.onFire();
          }
        }
      }
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft') self.keyLeft = true;
      if (e.code === 'ArrowRight') self.keyRight = true;
      if (e.code === 'Space') {
        e.preventDefault();
        self.game.fire();
        if (self.callbacks.onFire) self.callbacks.onFire();
      }
      if (e.key === 'r' || e.key === 'R') { if (self.callbacks.onRestart) self.callbacks.onRestart(); }
      if (e.key === 'm' || e.key === 'M') { if (self.callbacks.onMute) self.callbacks.onMute(); }
      if (e.key === 'p' || e.key === 'P') { if (self.callbacks.onPause) self.callbacks.onPause(); }
      if (e.key === '`') { if (self.callbacks.onDebugToggle) self.callbacks.onDebugToggle(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'ArrowLeft') self.keyLeft = false;
      if (e.code === 'ArrowRight') self.keyRight = false;
    });
  };

  BubbleExInput.prototype.tick = function (dtSec) {
    if (this.keyLeft && !this.keyRight) this.game.setAim(this.game.aimDeg - dtSec * 90);
    if (this.keyRight && !this.keyLeft) this.game.setAim(this.game.aimDeg + dtSec * 90);
  };

  window.BubbleExInput = BubbleExInput;
})();
