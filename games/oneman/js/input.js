(function () {
  'use strict';
  function OneManInput(game, hooks, leverEl) {
    this.game = game;
    this.hooks = hooks || {};
    this.leverEl = leverEl;
    this.dragging = false;
    this.bind();
  }
  OneManInput.prototype.bind = function () {
    const self = this;
    window.addEventListener('keydown', function (e) {
      if (e.repeat && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 's' || e.key === 'w')) return;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { self.touch(); self.game.adjustBrake(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { self.touch(); self.game.adjustBrake(-1); e.preventDefault(); }
      else if (/^[1-9]$/.test(e.key)) { self.touch(); self.game.brake(Number(e.key)); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'e') { self.touch(); self.game.brake(9); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'h') { self.touch(); if (self.hooks.horn) self.hooks.horn(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { self.touch(); if (self.hooks.start) self.hooks.start(); e.preventDefault(); }
      else if (e.key === '`' && self.hooks.debug) self.hooks.debug();
    });
    if (!this.leverEl) return;
    document.getElementById('view').addEventListener('pointerdown', function () { if (self.hooks.start) self.hooks.start(); });
    function setFromPointer(ev) {
      const rect = self.leverEl.getBoundingClientRect();
      const y = (ev.clientY - rect.top) / Math.max(1, rect.height);
      const notch = Math.max(0, Math.min(9, Math.round(y * 9)));
      self.touch();
      self.game.brake(notch);
    }
    this.leverEl.addEventListener('pointerdown', function (ev) { self.dragging = true; self.leverEl.setPointerCapture(ev.pointerId); setFromPointer(ev); ev.preventDefault(); });
    this.leverEl.addEventListener('pointermove', function (ev) { if (self.dragging) { setFromPointer(ev); ev.preventDefault(); } });
    this.leverEl.addEventListener('pointerup', function () { self.dragging = false; });
    this.leverEl.addEventListener('pointercancel', function () { self.dragging = false; });
  };
  OneManInput.prototype.touch = function () { if (this.hooks.anyInput) this.hooks.anyInput(); };
  window.OneManInput = OneManInput;
})();
