// Canvas描画とビジュアルエフェクト。ゲームロジックには一切干渉しない。
// 依存: constants.js
class Renderer {
  constructor(boardCanvas, nextCanvas, holdCanvas) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.holdCanvas = holdCanvas;
    this.holdCtx = holdCanvas.getContext('2d');
    this.particles = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.flashes = []; // ロック時のセル発光
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
  }

  resize() {
    for (const c of [this.canvas, this.nextCanvas, this.holdCanvas]) {
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width * this.dpr);
      c.height = Math.round(rect.height * this.dpr);
    }
    this.cell = this.canvas.width / COLS;
  }

  handleEvent(type, data, game) {
    if (type === 'clear') {
      const strength = data.count === 4 ? 10 : data.count * 2;
      this.shakeT = 220;
      this.shakeMag = strength;
      for (const row of data.rows) {
        for (let x = 0; x < COLS; x++) {
          const color = PIECES[game.board[row][x]]?.color ?? '#ffffff';
          for (let i = 0; i < 3; i++) this.spawnParticle(x, row, color);
        }
      }
    } else if (type === 'harddrop') {
      this.shakeT = 90;
      this.shakeMag = 3;
      for (const [x, y] of data.cells) {
        this.spawnParticle(x, y, 'rgba(255,255,255,0.9)', -1);
      }
    } else if (type === 'lock') {
      const now = performance.now();
      for (const [x, y] of data.cells) this.flashes.push({ x, y, t0: now });
    }
  }

  spawnParticle(cx, cy, color, dirY = 1) {
    this.particles.push({
      x: (cx + 0.5) * this.cell,
      y: (cy - HIDDEN_ROWS + 0.5) * this.cell,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() * -0.15 - 0.05) * dirY,
      life: 500 + Math.random() * 300,
      age: 0,
      size: this.cell * (0.08 + Math.random() * 0.12),
      color,
    });
  }

  drawBlock(ctx, px, py, size, color, alpha = 1, glow = true) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const pad = size * 0.06;
    const s = size - pad * 2;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.35;
    }
    ctx.fillStyle = color;
    ctx.fillRect(px + pad, py + pad, s, s);
    ctx.shadowBlur = 0;
    // 上辺ハイライトと下辺シェード
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px + pad, py + pad, s, s * 0.18);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px + pad, py + pad + s * 0.82, s, s * 0.18);
    ctx.restore();
  }

  drawGhostBlock(ctx, px, py, size, color) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    const pad = size * 0.1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.strokeRect(px + pad, py + pad, size - pad * 2, size - pad * 2);
    ctx.restore();
  }

  render(game, dt) {
    const { ctx, cell } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // 画面シェイク
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(this.shakeT, 0) / 220 * this.shakeMag * this.dpr;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }

    // 背景グリッド
    ctx.strokeStyle = 'rgba(120,140,255,0.07)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, H); ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(W, y * cell); ctx.stroke();
    }

    // 確定ブロック
    const clearingSet = new Set(game.clearingRows);
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const type = game.board[y][x];
        if (!type) continue;
        const py = (y - HIDDEN_ROWS) * cell;
        if (clearingSet.has(y)) {
          // 消去アニメーション: 白フラッシュ→フェードアウト
          const p = 1 - game.clearTimer / CLEAR_ANIM_MS;
          const flash = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6;
          ctx.save();
          ctx.globalAlpha = Math.max(flash, 0);
          ctx.fillStyle = p < 0.4 ? '#ffffff' : PIECES[type].color;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = cell * 0.6;
          const shrink = p < 0.4 ? 0 : (p - 0.4) / 0.6 * cell * 0.5;
          ctx.fillRect(x * cell + shrink / 2, py + shrink / 2, cell - shrink, cell - shrink);
          ctx.restore();
        } else {
          this.drawBlock(ctx, x * cell, py, cell, PIECES[type].color, 1, false);
        }
      }
    }

    // ゴーストと操作中ピース
    if (game.current && (game.state === 'playing' || game.state === 'paused')) {
      const color = PIECES[game.current.type].color;
      const gy = game.ghostY();
      for (const [cx, cy] of PIECES[game.current.type].rotations[game.current.rot]) {
        const gx = game.current.x + cx;
        const gyy = gy + cy;
        if (gyy >= HIDDEN_ROWS && gyy !== game.current.y + cy) {
          this.drawGhostBlock(ctx, gx * cell, (gyy - HIDDEN_ROWS) * cell, cell, color);
        }
      }
      for (const [x, y] of game.cellsOf(game.current)) {
        if (y >= HIDDEN_ROWS) this.drawBlock(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, color);
      }
    }

    // ロックフラッシュ
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.t0 < 160);
    for (const f of this.flashes) {
      const a = 1 - (now - f.t0) / 160;
      if (f.y < HIDDEN_ROWS) continue;
      ctx.fillStyle = `rgba(255,255,255,${a * 0.45})`;
      ctx.fillRect(f.x * cell, (f.y - HIDDEN_ROWS) * cell, cell, cell);
    }

    // パーティクル
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt * this.dpr;
      p.y += p.vy * dt * this.dpr;
      p.vy += 0.0006 * dt;
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  renderSidePanels(game) {
    this.drawPieceList(this.nextCtx, this.nextCanvas, game.queue.slice(0, 3));
    this.drawPieceList(this.holdCtx, this.holdCanvas, game.holdType ? [game.holdType] : [], !game.canHold);
  }

  drawPieceList(ctx, canvas, types, dim = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const slot = canvas.width; // 正方形スロットを縦に並べる
    types.forEach((type, i) => {
      const def = PIECES[type];
      const cells = def.rotations[0];
      const cellSize = slot / 5;
      const minX = Math.min(...cells.map((c) => c[0]));
      const maxX = Math.max(...cells.map((c) => c[0]));
      const minY = Math.min(...cells.map((c) => c[1]));
      const maxY = Math.max(...cells.map((c) => c[1]));
      const offX = (slot - (maxX - minX + 1) * cellSize) / 2 - minX * cellSize;
      const offY = i * slot + (slot - (maxY - minY + 1) * cellSize) / 2 - minY * cellSize;
      for (const [cx, cy] of cells) {
        this.drawBlock(ctx, offX + cx * cellSize, offY + cy * cellSize, cellSize,
          def.color, dim ? 0.35 : 1, false);
      }
    });
  }
}
