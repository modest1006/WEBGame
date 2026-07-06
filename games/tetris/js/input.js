const DAS = 170; // 横移動リピート開始まで(ms)
const ARR = 40;  // リピート間隔(ms)

// キーボード＋タッチ入力。actionsコールバック経由でゲームを操作する。
class Input {
  constructor(actions, boardCanvas) {
    this.actions = actions;
    this.dir = 0;          // 現在の横移動方向
    this.dirStack = [];    // 左右同時押し対応（後押し優先）
    this.dasTimer = 0;
    this.repeating = false;
    this.bindKeyboard();
    this.bindTouchButtons();
    this.bindGestures(boardCanvas);
  }

  // メインループから毎フレーム呼ぶ（DAS/ARR処理）
  update(dt) {
    if (this.dir === 0) return;
    this.dasTimer += dt;
    if (!this.repeating) {
      if (this.dasTimer >= DAS) {
        this.repeating = true;
        this.dasTimer -= DAS;
        this.actions.move(this.dir);
      }
    } else {
      while (this.dasTimer >= ARR) {
        this.dasTimer -= ARR;
        this.actions.move(this.dir);
      }
    }
  }

  pressDir(d) {
    this.dirStack = this.dirStack.filter((x) => x !== d);
    this.dirStack.push(d);
    this.dir = d;
    this.dasTimer = 0;
    this.repeating = false;
    this.actions.move(d);
  }

  releaseDir(d) {
    this.dirStack = this.dirStack.filter((x) => x !== d);
    const next = this.dirStack[this.dirStack.length - 1] ?? 0;
    if (next !== this.dir) {
      this.dir = next;
      this.dasTimer = 0;
      this.repeating = false;
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.actions.anyInput();
      switch (e.code) {
        case 'ArrowLeft': e.preventDefault(); this.pressDir(-1); break;
        case 'ArrowRight': e.preventDefault(); this.pressDir(1); break;
        case 'ArrowDown': e.preventDefault(); this.actions.softDrop(true); break;
        case 'Space': e.preventDefault(); this.actions.hardDrop(); break;
        case 'ArrowUp': case 'KeyX': e.preventDefault(); this.actions.rotate(1); break;
        case 'KeyZ': case 'ControlLeft': case 'ControlRight': this.actions.rotate(-1); break;
        case 'KeyC': case 'ShiftLeft': case 'ShiftRight': this.actions.hold(); break;
        case 'KeyP': case 'Escape': this.actions.pause(); break;
        case 'KeyR': this.actions.restart(); break;
        case 'KeyM': this.actions.mute(); break;
        case 'Backquote': this.actions.debug(); break;
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft': this.releaseDir(-1); break;
        case 'ArrowRight': this.releaseDir(1); break;
        case 'ArrowDown': this.actions.softDrop(false); break;
      }
    });
  }

  bindTouchButtons() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      const act = btn.dataset.action;
      const press = (e) => {
        e.preventDefault();
        this.actions.anyInput();
        btn.classList.add('pressed');
        switch (act) {
          case 'left': this.pressDir(-1); break;
          case 'right': this.pressDir(1); break;
          case 'down': this.actions.softDrop(true); break;
          case 'rotate': this.actions.rotate(1); break;
          case 'rotccw': this.actions.rotate(-1); break;
          case 'drop': this.actions.hardDrop(); break;
          case 'hold': this.actions.hold(); break;
          case 'pause': this.actions.pause(); break;
          case 'mute': this.actions.mute(); break;
        }
      };
      const release = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        if (act === 'left') this.releaseDir(-1);
        if (act === 'right') this.releaseDir(1);
        if (act === 'down') this.actions.softDrop(false);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // 盤面上のジェスチャー: 横ドラッグ=移動 / タップ=回転 / 下フリック=ハードドロップ / 下ドラッグ=ソフトドロップ
  bindGestures(canvas) {
    let active = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // マウスはキーボード操作前提
      e.preventDefault();
      this.actions.anyInput();
      const cell = canvas.getBoundingClientRect().width / 10;
      active = { x0: e.clientX, y0: e.clientY, t0: performance.now(), cell, movedCells: 0, soft: false, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!active) return;
      e.preventDefault();
      const dx = e.clientX - active.x0;
      const dy = e.clientY - active.y0;
      const cellsX = Math.trunc(dx / active.cell);
      while (active.movedCells < cellsX) { active.movedCells++; active.moved = true; this.actions.move(1); }
      while (active.movedCells > cellsX) { active.movedCells--; active.moved = true; this.actions.move(-1); }
      // ゆっくり下ドラッグでソフトドロップ
      if (!active.soft && dy > active.cell * 1.2 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        active.soft = true;
        active.moved = true;
        this.actions.softDrop(true);
      }
    });
    const end = (e) => {
      if (!active) return;
      e.preventDefault();
      const dt = performance.now() - active.t0;
      const dy = e.clientY - active.y0;
      const dx = e.clientX - active.x0;
      if (active.soft) this.actions.softDrop(false);
      const isFlickDown = dy > active.cell * 1.6 && dt < 250 && Math.abs(dy) > Math.abs(dx) * 1.5;
      const isTap = !active.moved && dt < 260 && Math.abs(dx) < 12 && Math.abs(dy) < 12;
      if (isFlickDown) {
        if (active.soft) this.actions.softDrop(false);
        this.actions.hardDrop();
      } else if (isTap) {
        this.actions.rotate(1);
      }
      active = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => {
      if (active?.soft) this.actions.softDrop(false);
      active = null;
    });
  }
}
