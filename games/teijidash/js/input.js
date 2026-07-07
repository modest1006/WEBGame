class Input {
  constructor(game, actions, target) {
    this.game = game;
    this.actions = actions;
    this.target = target;
    this.pointerDown = false;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      this.actions.anyInput();
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!this.game.inputDown) this.actions.press(true); }
      if (e.code === 'KeyR') this.actions.restart();
      if (e.code === 'KeyM') this.actions.mute();
      if (e.code === 'KeyP') this.actions.pause();
      if (e.code === 'Backquote') this.actions.debug();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.actions.release(); }
    });
    this.target.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.anyInput();
      this.pointerDown = true;
      this.target.setPointerCapture(e.pointerId);
      this.actions.press(true);
    });
    const up = (e) => {
      if (!this.pointerDown) return;
      e.preventDefault();
      this.pointerDown = false;
      this.actions.release();
    };
    this.target.addEventListener('pointerup', up);
    this.target.addEventListener('pointercancel', up);
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.actions.anyInput();
        const act = btn.dataset.action;
        if (act === 'restart') this.actions.restart();
        if (act === 'mute') this.actions.mute();
      });
    });
  }
}
