(function () {
  'use strict';

  function PetriInput(canvas, renderer, game, actions) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = game;
    this.actions = actions;
    this.dragging = false;
    this.last = null;
    this.install();
  }

  PetriInput.prototype.install = function () {
    const self = this;
    this.canvas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      self.canvas.setPointerCapture(ev.pointerId);
      self.dragging = true;
      self.actions.anyInput();
      const p = self.renderer.screenToGrid(ev.clientX, ev.clientY);
      self.last = p;
      self.apply(p, p);
    });
    this.canvas.addEventListener('pointermove', function (ev) {
      if (!self.dragging) return;
      ev.preventDefault();
      const p = self.renderer.screenToGrid(ev.clientX, ev.clientY);
      if (self.game.tool === 'wall') self.apply(self.last || p, p);
      self.last = p;
    });
    window.addEventListener('pointerup', function () {
      self.dragging = false;
      self.last = null;
    });
    this.canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      self.renderer.zoom = Math.max(0.82, Math.min(1.45, self.renderer.zoom + (ev.deltaY < 0 ? 0.05 : -0.05)));
      self.renderer.resize();
    }, { passive: false });
    window.addEventListener('keydown', function (ev) {
      if (ev.key === 'm' || ev.key === 'M') self.actions.mute();
      if (ev.key === ' ') self.actions.pause();
      if (ev.key === '1') self.actions.tool('nutrient');
      if (ev.key === '2') self.actions.tool('wall');
      if (ev.key === '3') self.actions.tool('stir');
    });
  };

  PetriInput.prototype.apply = function (from, to) {
    const g = this.game;
    if (g.tool === 'wall') g.applyTool('wall', g.selectedSpecies, from.x, from.y, to.x, to.y);
    else g.applyTool(g.tool, g.selectedSpecies, to.x, to.y);
    this.actions.sync();
  };

  window.PetriInput = PetriInput;
})();
