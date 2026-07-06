// ゲームロジック本体。DOM/Canvas非依存 — update(dt) で決定論的に進む。
// 依存: constants.js, rng.js（読み込み順は index.html 参照）
class Game {
  constructor({ seed = 0 } = {}) {
    this.seedValue = seed;
    this.listeners = [];
    this.state = 'title';
    this.resetCore();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  resetCore() {
    this.rng = new RNG(this.seedValue);
    this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.b2b = false;
    this.queue = [];
    this.holdType = null;
    this.canHold = true;
    this.current = null;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.clearingRows = [];
    this.clearTimer = 0;
    this.softDropping = false;
  }

  start() {
    this.resetCore();
    this.state = 'playing';
    this.spawnNext();
    this.emit('start');
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.emit('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); }
  }

  refillQueue() {
    while (this.queue.length < 7) this.queue.push(...this.rng.shuffle([...PIECE_TYPES]));
  }

  makePiece(type) {
    return { type, rot: 0, x: PIECES[type].spawnX, y: 0 };
  }

  cellsOf(piece) {
    return PIECES[piece.type].rotations[piece.rot]
      .map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
  }

  collides(piece) {
    for (const [x, y] of this.cellsOf(piece)) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
      if (this.board[y][x]) return true;
    }
    return false;
  }

  spawnNext(type = null) {
    if (type === null) {
      this.refillQueue();
      type = this.queue.shift();
      this.canHold = true;
    }
    const piece = this.makePiece(type);
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(piece)) {
      this.current = piece;
      this.state = 'gameover';
      this.emit('gameover', { score: this.score });
      return;
    }
    this.current = piece;
    this.emit('spawn', { type });
  }

  isGrounded() {
    if (!this.current) return false;
    return this.collides({ ...this.current, y: this.current.y + 1 });
  }

  resetLock() {
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (this.state !== 'playing' || !this.current) return false;
    const moved = { ...this.current, x: this.current.x + dx };
    if (this.collides(moved)) return false;
    this.current = moved;
    if (this.isGrounded()) this.resetLock();
    this.emit('move', { dx });
    return true;
  }

  rotate(dir) {
    if (this.state !== 'playing' || !this.current) return false;
    const p = this.current;
    if (p.type === 'O') { this.emit('rotate', { dir }); return true; }
    const to = (p.rot + dir + 4) % 4;
    const kicks = (p.type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${p.rot}>${to}`];
    for (const [kx, kyUp] of kicks) {
      const cand = { ...p, rot: to, x: p.x + kx, y: p.y - kyUp };
      if (!this.collides(cand)) {
        this.current = cand;
        if (this.isGrounded()) this.resetLock();
        this.emit('rotate', { dir, kicked: kx !== 0 || kyUp !== 0 });
        return true;
      }
    }
    return false;
  }

  hold() {
    if (this.state !== 'playing' || !this.current || !this.canHold) return false;
    const prev = this.holdType;
    this.holdType = this.current.type;
    this.canHold = false;
    if (prev) this.spawnNext(prev);
    else {
      this.refillQueue();
      this.spawnNext(this.queue.shift());
    }
    this.emit('hold', { type: this.holdType });
    return true;
  }

  ghostY() {
    if (!this.current) return 0;
    let y = this.current.y;
    while (!this.collides({ ...this.current, y: y + 1 })) y++;
    return y;
  }

  hardDrop() {
    if (this.state !== 'playing' || !this.current) return;
    const dist = this.ghostY() - this.current.y;
    this.current = { ...this.current, y: this.current.y + dist };
    this.score += dist * 2;
    this.emit('harddrop', { dist, cells: this.cellsOf(this.current) });
    this.lockPiece();
  }

  lockPiece() {
    const cells = this.cellsOf(this.current);
    for (const [x, y] of cells) this.board[y][x] = this.current.type;
    const toppedOut = cells.every(([, y]) => y < HIDDEN_ROWS);
    this.emit('lock', { cells, type: this.current.type });
    this.current = null;

    if (toppedOut) {
      this.state = 'gameover';
      this.emit('gameover', { score: this.score });
      return;
    }

    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((c) => c)) full.push(y);
    }

    if (full.length > 0) {
      this.applyClearScore(full.length);
      this.clearingRows = full;
      this.clearTimer = CLEAR_ANIM_MS;
      this.state = 'clearing';
      this.emit('clear', { rows: full, count: full.length, b2b: this.b2b });
    } else {
      this.combo = -1;
      this.spawnNext();
    }
  }

  applyClearScore(n) {
    let base = LINE_SCORES[n] * this.level;
    if (n === 4) {
      if (this.b2b) base = Math.floor(base * 1.5);
      this.b2b = true;
    } else {
      this.b2b = false;
    }
    this.combo++;
    if (this.combo > 0) base += 50 * this.combo * this.level;
    this.score += base;
    this.lines += n;
    const newLevel = 1 + Math.floor(this.lines / 10);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.emit('levelup', { level: newLevel });
    }
  }

  collapseRows() {
    for (const y of this.clearingRows) {
      this.board.splice(y, 1);
      this.board.unshift(new Array(COLS).fill(null));
    }
    this.clearingRows = [];
  }

  update(dt) {
    if (this.state === 'clearing') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.collapseRows();
        this.state = 'playing';
        this.spawnNext();
      }
      return;
    }
    if (this.state !== 'playing' || !this.current) return;

    const interval = gravityMs(this.level) / (this.softDropping ? SOFT_DROP_FACTOR : 1);
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.isGrounded()) {
        this.current = { ...this.current, y: this.current.y + 1 };
        if (this.softDropping) this.score += 1;
      } else {
        this.gravityAcc = 0;
        break;
      }
    }

    if (this.isGrounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
    } else {
      this.lockTimer = 0;
    }
  }

  // --- デバッグ/検証用 ---

  getSnapshot() {
    return {
      state: this.state,
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      b2b: this.b2b,
      seed: this.rng.seed,
      current: this.current ? { ...this.current } : null,
      hold: this.holdType,
      next: this.queue.slice(0, 5),
      board: this.board.map((row) => row.map((c) => c ?? '.').join('')),
    };
  }

  dump() {
    const grid = this.board.map((row) => row.map((c) => c ?? '.'));
    if (this.current) {
      for (const [x, y] of this.cellsOf(this.current)) grid[y][x] = this.current.type.toLowerCase();
    }
    const lines = grid.map((row, y) => (y === HIDDEN_ROWS ? '----------\n' : '') + row.join(''));
    return lines.join('\n');
  }

  // 行を文字列でセットする（例: 'ZZZZ.ZZZZZ'、'.'は空）
  setRow(y, str) {
    for (let x = 0; x < COLS; x++) {
      const ch = str[x];
      this.board[y][x] = ch && ch !== '.' ? ch.toUpperCase() : null;
    }
  }

  fillBottomRows(n, holeCol = 0) {
    for (let i = 0; i < n; i++) {
      const y = ROWS - 1 - i;
      for (let x = 0; x < COLS; x++) this.board[y][x] = x === holeCol ? null : 'J';
    }
  }

  clearBoard() {
    for (const row of this.board) row.fill(null);
  }

  setCurrent(type) {
    this.current = this.makePiece(type);
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
  }
}
