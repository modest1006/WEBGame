// キーボード＋タッチ入力（左半分=バーチャルスティック、右半分タップ=ダッシュ）
class Input {
  constructor(game, actions, canvas) {
    this.game = game;
    this.actions = actions;
    this.keys = new Set();
    this.stick = null; // {id, cx, cy}
    this.bindKeyboard();
    this.bindTouch(canvas);
    this.bindButtons();
  }

  updateMoveFromKeys() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) mx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) mx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) my -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) my += 1;
    // スティック操作中はスティック優先
    if (!this.stick) { this.game.ctrl.mx = mx; this.game.ctrl.my = my; }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) {
        this.actions.anyInput();
        switch (e.code) {
          case 'Space': case 'KeyJ': case 'KeyK':
            e.preventDefault(); this.actions.dash(); return;
          case 'Digit1': this.actions.pick(0); return;
          case 'Digit2': this.actions.pick(1); return;
          case 'Digit3': this.actions.pick(2); return;
          case 'KeyP': case 'Escape': this.actions.pause(); return;
          case 'KeyR': this.actions.restart(); return;
          case 'KeyM': this.actions.mute(); return;
          case 'Backquote': this.actions.debug(); return;
        }
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.updateMoveFromKeys();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.updateMoveFromKeys();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.game.ctrl.mx = 0; this.game.ctrl.my = 0;
      this.stick = null;
      this.updateStickUI(null);
    });
  }

  bindTouch(canvas) {
    const stickMax = 60;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.actions.anyInput();
      if (e.clientX < window.innerWidth / 2) {
        // 左半分: バーチャルスティック
        this.stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
        this.updateStickUI({ x: e.clientX, y: e.clientY, kx: e.clientX, ky: e.clientY });
        canvas.setPointerCapture(e.pointerId);
      } else {
        // 右半分: ダッシュ（リズムアクション）
        this.actions.dash();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      e.preventDefault();
      let dx = e.clientX - this.stick.cx;
      let dy = e.clientY - this.stick.cy;
      const len = Math.hypot(dx, dy);
      if (len > stickMax) { dx *= stickMax / len; dy *= stickMax / len; }
      this.game.ctrl.mx = dx / stickMax;
      this.game.ctrl.my = dy / stickMax;
      this.updateStickUI({
        x: this.stick.cx, y: this.stick.cy,
        kx: this.stick.cx + dx, ky: this.stick.cy + dy,
      });
    });
    const end = (e) => {
      if (this.stick && e.pointerId === this.stick.id) {
        this.stick = null;
        this.game.ctrl.mx = 0; this.game.ctrl.my = 0;
        this.updateStickUI(null);
        this.updateMoveFromKeys();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  updateStickUI(pos) {
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    if (!base) return;
    if (!pos) { base.classList.add('hidden'); return; }
    base.classList.remove('hidden');
    base.style.left = `${pos.x}px`;
    base.style.top = `${pos.y}px`;
    knob.style.left = `${pos.kx - pos.x + 55}px`;
    knob.style.top = `${pos.ky - pos.y + 55}px`;
  }

  bindButtons() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.actions.anyInput();
        const act = btn.dataset.action;
        if (act === 'pause') this.actions.pause();
        else if (act === 'mute') this.actions.mute();
        else if (act === 'restart') this.actions.restart();
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}
