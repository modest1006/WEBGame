// キーボード＋タッチ入力。ゲームの ctrl 状態と actions コールバックを操作する。
class Input {
  constructor(game, actions) {
    this.game = game;
    this.actions = actions;
    this.bindKeyboard();
    this.bindTouchButtons();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.actions.anyInput();
      const c = this.game.ctrl;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': e.preventDefault(); c.left = true; break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); c.right = true; break;
        case 'Space': case 'ArrowUp': case 'KeyW':
          e.preventDefault(); this.game.pressJump(); break;
        case 'ArrowDown': case 'KeyS': case 'ShiftLeft': case 'ShiftRight':
          e.preventDefault(); c.slide = true; break;
        case 'KeyP': case 'Escape': this.actions.pause(); break;
        case 'KeyR': this.actions.restart(); break;
        case 'KeyM': this.actions.mute(); break;
        case 'Backquote': this.actions.debug(); break;
      }
    });
    window.addEventListener('keyup', (e) => {
      const c = this.game.ctrl;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': c.left = false; break;
        case 'ArrowRight': case 'KeyD': c.right = false; break;
        case 'Space': case 'ArrowUp': case 'KeyW': this.game.releaseJump(); break;
        case 'ArrowDown': case 'KeyS': case 'ShiftLeft': case 'ShiftRight': c.slide = false; break;
      }
    });
    // フォーカス喪失時は入力をリセット（キー押しっぱなし事故防止）
    window.addEventListener('blur', () => {
      const c = this.game.ctrl;
      c.left = c.right = c.slide = false;
      this.game.releaseJump();
    });
  }

  bindTouchButtons() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      const act = btn.dataset.action;
      const c = this.game.ctrl;
      const press = (e) => {
        e.preventDefault();
        this.actions.anyInput();
        btn.classList.add('pressed');
        switch (act) {
          case 'left': c.left = true; break;
          case 'right': c.right = true; break;
          case 'slide': c.slide = true; break;
          case 'jump': this.game.pressJump(); break;
          case 'pause': this.actions.pause(); break;
          case 'mute': this.actions.mute(); break;
          case 'restart': this.actions.restart(); break;
        }
      };
      const release = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        switch (act) {
          case 'left': c.left = false; break;
          case 'right': c.right = false; break;
          case 'slide': c.slide = false; break;
          case 'jump': this.game.releaseJump(); break;
        }
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}
