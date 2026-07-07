(function () {
  'use strict';
  function RollMazeInput(game, actions, target) {
    this.game = game;
    this.actions = actions;
    this.target = target;
    this.keys = {};
    this.drag = null;
    this.install();
  }
  RollMazeInput.prototype.install = function () {
    const self = this;
    window.addEventListener('keydown', function (e) {
      try {
        self.keys[e.key.toLowerCase()] = true;
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
        if (e.key === 'r' || e.key === 'R') self.actions.restart();
        if (e.key === 'm' || e.key === 'M') self.actions.mute();
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') self.actions.pause();
        if (e.key === '`') self.actions.debug();
        self.actions.anyInput();
      } catch (err) { console.error('[keydown]', err); }
    });
    window.addEventListener('keyup', function (e) {
      try { self.keys[e.key.toLowerCase()] = false; } catch (err) { console.error('[keyup]', err); }
    });
    this.target.addEventListener('pointerdown', function (e) {
      try {
        e.preventDefault();
        self.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        self.target.setPointerCapture(e.pointerId);
        self.actions.anyInput();
      } catch (err) { console.error('[pointerdown]', err); }
    });
    this.target.addEventListener('pointermove', function (e) {
      try {
        if (!self.drag || self.drag.id !== e.pointerId) return;
        e.preventDefault();
        const dx = (e.clientX - self.drag.x) / Math.max(160, innerWidth * 0.18);
        const dy = (e.clientY - self.drag.y) / Math.max(160, innerHeight * 0.18);
        self.game.setTilt(dy * RollMazeConstants.MAX_TILT, dx * RollMazeConstants.MAX_TILT);
      } catch (err) { console.error('[pointermove]', err); }
    });
    function end(e) {
      try {
        if (self.drag && self.drag.id === e.pointerId) {
          e.preventDefault();
          self.drag = null;
        }
      } catch (err) { console.error('[pointerend]', err); }
    }
    this.target.addEventListener('pointerup', end);
    this.target.addEventListener('pointercancel', end);
  };
  RollMazeInput.prototype.update = function () {
    if (this.drag) return;
    const C = RollMazeConstants;
    let x = 0, z = 0;
    if (this.keys.arrowup || this.keys.w) x -= C.MAX_TILT;
    if (this.keys.arrowdown || this.keys.s) x += C.MAX_TILT;
    if (this.keys.arrowleft || this.keys.a) z -= C.MAX_TILT;
    if (this.keys.arrowright || this.keys.d) z += C.MAX_TILT;
    this.game.setTilt(x, z);
  };
  window.RollMazeInput = RollMazeInput;
})();
