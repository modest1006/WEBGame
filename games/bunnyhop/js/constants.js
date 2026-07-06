// タイルサイズ（px）
const TILE = 32;

// タイルコード
const T_EMPTY = 0;
const T_SOLID = 1;
const T_SPIKE = 2;
const T_CARROT = 3;
const T_CHECK = 4;
const T_GOAL = 5;

// 物理パラメータ（px, 秒）
const PHYS = {
  gravity: 2200,
  jumpVel: 680,          // ジャンプ初速
  jumpCut: 300,          // ボタン早離しでの上昇打ち切り速度
  runAccel: 2600,
  airAccel: 1400,
  maxRun: 280,           // 通常走行の最高速（入力加速の上限）
  maxSpeed: 680,         // 絶対最高速（バニーホップの上限）
  frictionGround: 2400,  // 立ち状態の地上摩擦
  overspeedDecay: 1100,  // maxRun超過分の減速（立ち状態のみ）
  frictionSlide: 140,    // スライディング中の摩擦（ほぼ滑る）
  frictionGrace: 0.08,   // 着地後この秒数は摩擦なし（バニーホップ猶予）
  slideBoost: 130,       // スライディング開始時の加速
  slideBoostMaxSpeed: 500, // これ以上の速度ではブーストしない
  slideBoostCooldown: 0.8,
  slideStartSpeed: 150,  // スライディング開始に必要な速度
  slideMinSpeed: 80,     // これを下回るとスライディング終了
  crawlAccel: 900,       // スライディング中の低速前進（トンネル内で詰まないため）
  crawlMax: 140,
  bhopWindow: 0.1,       // 着地→ジャンプがこの秒数以内ならバニーホップ成立
  bhopBonus: 55,         // バニーホップ1回あたりの加速
  comboResetTime: 0.15,  // 地上にこの秒数いるとコンボ消滅
  coyote: 0.1,           // 崖から落ちた直後もジャンプ可能な猶予
  jumpBuffer: 0.13,      // 着地前の先行ジャンプ入力受付
  playerW: 24,
  standH: 44,
  slideH: 26,
};

// 死亡演出時間・リスポーン
const DEATH_TIME = 0.7;
