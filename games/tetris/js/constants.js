// 盤面サイズ（上部2行は非表示のスポーン領域）
const COLS = 10;
const ROWS = 22;
const HIDDEN_ROWS = 2;
const VISIBLE_ROWS = ROWS - HIDDEN_ROWS;

// SRS準拠のテトロミノ定義。spawn向きのセル座標から4回転分を生成する。
const TETROMINO_BASE = {
  I: { size: 4, spawnX: 3, color: '#3be8f0', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, spawnX: 4, color: '#f7d038', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, spawnX: 3, color: '#c04df9', cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, spawnX: 3, color: '#4bf275', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, spawnX: 3, color: '#fb4b6a', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, spawnX: 3, color: '#4a7bfb', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, spawnX: 3, color: '#fb9b3c', cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

function rotateCW(cells, size) {
  return cells.map(([x, y]) => [size - 1 - y, x]);
}

const PIECES = {};
for (const [type, def] of Object.entries(TETROMINO_BASE)) {
  const rotations = [def.cells];
  for (let i = 1; i < 4; i++) rotations.push(rotateCW(rotations[i - 1], def.size));
  PIECES[type] = { size: def.size, spawnX: def.spawnX, color: def.color, rotations };
}

const PIECE_TYPES = Object.keys(TETROMINO_BASE);

// SRSキックテーブル。値は (x, yUp) — 適用時は dy = -yUp（画面座標はy下向き）。
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// タイミング（ms）
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const CLEAR_ANIM_MS = 320;
const SOFT_DROP_FACTOR = 20;

// ガイドライン準拠の落下速度
function gravityMs(level) {
  const l = Math.min(level, 20);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}

// ライン数ごとの基礎スコア
const LINE_SCORES = [0, 100, 300, 500, 800];
