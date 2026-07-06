class Input {
  constructor(game, renderer, actions, canvas) {
    this.game = game;
    this.renderer = renderer;
    this.actions = actions;
    this.canvas = canvas;
    this.left = false;
    this.right = false;
    this.pointerDown = false;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      this.actions.anyInput();
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.left = true; e.preventDefault(); }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.right = true; e.preventDefault(); }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.actions.drop(); }
      if (e.code === 'KeyR') this.actions.restart();
      if (e.code === 'KeyM') this.actions.mute();
      if (e.code === 'Backquote') this.actions.debug();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = false;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.anyInput();
      this.pointerDown = true;
      this.game.setAim(this.renderer.screenToWorld(e.clientX));
      this.canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse') this.actions.drop();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || this.pointerDown) {
        e.preventDefault();
        this.game.setAim(this.renderer.screenToWorld(e.clientX));
      }
    });
    const up = (e) => {
      if (!this.pointerDown) return;
      e.preventDefault();
      this.pointerDown = false;
      if (e.pointerType !== 'mouse') this.actions.drop();
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', () => { this.pointerDown = false; });
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

  update(dt) {
    const speed = 420;
    if (this.left) this.game.setAim(this.game.aimX - speed * dt / 1000);
    if (this.right) this.game.setAim(this.game.aimX + speed * dt / 1000);
  }
}
