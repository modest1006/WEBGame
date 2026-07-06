// レベルはコードで構築する（タイポ耐性とデバッグしやすさ優先）。
// 座標はタイル単位。y=0が上、地面の上面は基本 y=11。
const LEVEL_W = 210;
const LEVEL_H = 14;

function buildLevel() {
  const tiles = Array.from({ length: LEVEL_H }, () => new Array(LEVEL_W).fill(T_EMPTY));

  const box = (x0, x1, y0, y1, code = T_SOLID) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && x < LEVEL_W && y >= 0 && y < LEVEL_H) tiles[y][x] = code;
      }
    }
  };
  const ground = (x0, x1) => box(x0, x1, 11, 13);
  const put = (x, y, code) => { tiles[y][x] = code; };

  // --- セクション1: スタート＆走行練習 (x 0-13) ---
  ground(0, 30);

  // --- セクション2: 低いトンネル＝スライディング必須 (x 14-26) ---
  // 天井が y=9 まで下りていて、立ち姿勢(44px)は通れずスライディング(26px)のみ通れる
  box(14, 26, 4, 9);
  put(17, 10, T_CARROT);
  put(21, 10, T_CARROT);

  // --- セクション3: 崖ジャンプ (x 31-52) ---
  // 31-33 が3タイル穴、39-42 が4タイル穴（トンネル出口26から4タイルの助走あり）
  ground(34, 38);
  ground(43, 74);
  put(32, 9, T_CARROT);
  put(40, 9, T_CARROT);
  put(41, 9, T_CARROT);

  // --- セクション4: トゲ地帯 (x 55-74) ---
  put(57, 10, T_SPIKE); put(58, 10, T_SPIKE);
  put(64, 10, T_SPIKE); put(65, 10, T_SPIKE); put(66, 10, T_SPIKE);
  put(72, 10, T_SPIKE); put(73, 10, T_SPIKE);
  put(58, 8, T_CARROT);
  put(65, 7, T_CARROT);

  // --- セクション5: チェックポイント (x 75-88) ---
  ground(75, 88);
  put(78, 10, T_CHECK);

  // --- セクション6: バニーホップ滑走路→大ジャンプ (x 89-140) ---
  // 32タイルの直線でホップを重ねて加速しないと 8タイル穴(121-128)は越えられない
  ground(89, 120);
  ground(129, 168);
  put(122, 8, T_CARROT);
  put(124, 7, T_CARROT);
  put(126, 6, T_CARROT);
  put(128, 7, T_CARROT);

  // --- セクション7: 空中足場＆スピード維持トンネル (x 141-168) ---
  box(143, 146, 7, 7);
  box(150, 153, 5, 5);
  put(144, 6, T_CARROT);
  put(151, 4, T_CARROT);
  box(157, 163, 4, 9); // 2つ目の低トンネル（スライディングで速度維持）
  put(160, 10, T_CARROT);

  // --- セクション8: 最後の穴→ゴール (x 169-209) ---
  // 169-172 が4タイル穴（トンネル出口163から5タイルの助走あり）
  ground(173, LEVEL_W - 1);
  put(182, 10, T_GOAL);

  let totalCarrots = 0;
  for (const row of tiles) for (const c of row) if (c === T_CARROT) totalCarrots++;

  return {
    w: LEVEL_W,
    h: LEVEL_H,
    tiles,
    spawn: { x: 3 * TILE, y: 11 * TILE - PHYS.standH },
    totalCarrots,
    // 画面内に描く操作ヒント（ワールド座標・タイル単位）
    hints: [
      { x: 3, y: 6, text: '← → : はしる　SPACE : ジャンプ' },
      { x: 15, y: 2, text: '↓ / SHIFT : スライディング！' },
      { x: 92, y: 5, text: 'スライディング着地 → すぐジャンプ' },
      { x: 104, y: 6, text: '= バニーホップで加速！つないで飛べ！' },
    ],
  };
}
