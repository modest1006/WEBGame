class NeonDriveInput {
  constructor(game, actions, canvas) {
    this.game = game;
    this.actions = actions;
    this.canvas = canvas;
    this.keys = new Set();
    this.touch = new Map();
    this.buttonSteer = 0;
    this.buttonBrake = false;
    this.bindKeyboard();
    this.bindPointer();
    this.bindButtons();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      try {
        this.actions.anyInput();
        if (!e.repeat) {
          if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.actions.boost(); return; }
          if (e.code === 'KeyR') { this.actions.restart(); return; }
          if (e.code === 'KeyM') { this.actions.mute(); return; }
          if (e.code === 'KeyP' || e.code === 'Escape') { this.actions.pause(); return; }
          if (e.code === 'Backquote') { this.actions.debug(); return; }
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
        this.keys.add(e.code);
        this.syncKeys();
      } catch (err) { console.error('[input keydown]', err); }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.syncKeys();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
      this.game.setSteer(0);
      this.game.setBrake(false);
    });
  }

  syncKeys() {
    let steer = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) steer -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) steer += 1;
    steer += this.buttonSteer;
    this.game.setSteer(steer);
    this.game.setBrake(this.buttonBrake || this.keys.has('ArrowDown') || this.keys.has('KeyS'));
  }

  bindPointer() {
    const end = (e) => {
      this.touch.delete(e.pointerId);
      this.syncTouch();
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.actions.anyInput();
      this.canvas.setPointerCapture(e.pointerId);
      this.touch.set(e.pointerId, { x: e.clientX, y: e.clientY, startY: e.clientY });
      this.syncTouch();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.touch.has(e.pointerId)) return;
      e.preventDefault();
      const t = this.touch.get(e.pointerId);
      t.x = e.clientX; t.y = e.clientY;
      if (t.startY - e.clientY > 55) this.actions.boost();
      this.syncTouch();
    });
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  syncTouch() {
    let steer = 0, brake = false;
    for (const t of this.touch.values()) {
      if (t.y > window.innerHeight * 0.78) brake = true;
      else steer += t.x < window.innerWidth / 2 ? -1 : 1;
    }
    if (this.touch.size > 1) brake = true;
    if (this.touch.size) {
      this.game.setSteer(ndClamp(steer, -1, 1));
      this.game.setBrake(brake);
    } else {
      this.syncKeys();
    }
  }

  bindButtons() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.actions.anyInput();
        const act = btn.dataset.action;
        if (this.actions[act]) this.actions[act]();
      });
    });
    const hold = (selector, down, up) => {
      const btn = document.querySelector(selector);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.actions.anyInput();
        down();
        this.syncKeys();
      });
      const release = (e) => {
        e.preventDefault();
        up();
        this.syncKeys();
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    };
    hold('.touch-btn.left', () => { this.buttonSteer = -1; }, () => { if (this.buttonSteer < 0) this.buttonSteer = 0; });
    hold('.touch-btn.right', () => { this.buttonSteer = 1; }, () => { if (this.buttonSteer > 0) this.buttonSteer = 0; });
    hold('.touch-btn.brake', () => { this.buttonBrake = true; }, () => { this.buttonBrake = false; });
  }
}
