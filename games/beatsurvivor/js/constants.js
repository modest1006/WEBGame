// ===== ビート =====
const BPM = 132;
const BEAT_MS = 60000 / BPM;           // 454.5ms
const MODE_NORMAL = 'normal';
const MODE_ENDLESS = 'endless';
const OVERDRIVE_TIME = 300;            // ENDLESS: 5:00縺九ｉBPM荳頑丐
const OVERDRIVE_BPM_PER_MIN = 4;
const BPM_MAX = 160;
const ENDLESS_BOSS_INTERVAL = 180;     // ENDLESS: 3:00豈弱↓繝懊せ
const ENDLESS_BEST_KEY = 'beatsurvivor.endless.bestTime.v1';
const SAVE_KEY = 'beatsurvivor.save.v1';
const LEGACY_NORMAL_BEST_KEY = 'beatsurvivor.bestTime.v1';
const PERFECT_MS = 80;                 // ビート±この範囲のダッシュでPERFECT
const GOOD_MS = 150;                   // GOOD（GROOVE維持）
const GROOVE_STEP = 0.15;              // GROOVE 1につき火力+15%
const GROOVE_MAX = 20;                 // 倍率上限 = 1 + 20*0.15 = 4.0x
const GROOVE_DECAY_BEATS = 8;          // PERFECTなしでこのビート数経過すると減衰開始
const MISS_PENALTY = 5;                // MISSで1ティアぶん没収
const GROOVE_DECAY_PER_BEAT = 2;       // 減衰開始後、1ビートごとのGROOVE減少量
// GROOVEティア（5毎に武器が進化）: 1=ビートショット+1弾 / 2=レーザー+1本＆ノヴァ2連 /
// 3=ビートショット貫通＆サブウーファー射程拡大 / 4=レーザー延長
const grooveTierOf = (groove) => Math.floor(Math.min(groove, GROOVE_MAX) / 5);
const ACCENT_MULT = 1.5;               // PERFECT直後1ビートの全攻撃倍率
const ACCENT_BEATS = 2;                // PERFECTから何ビート先までアクセント扱いか

// ===== プレイヤー =====
const PLAYER = {
  r: 14,
  speed: 230,
  maxHp: 100,
  pickupRadius: 70,
  collectRadius: 26,
  hurtCooldown: 0.6,
  dashDist: 90,          // 短い「ビートステップ」（画面が飛びすぎない距離）
  dashPerfectDist: 125,
  dashTime: 0.18,
  dashIframe: 0.3,
  dashCooldown: 0.3,
};

// ===== セッション =====
const SESSION_CLEAR_TIME = 300;        // 5分生存でクリア
const BOSS_TIME = 180;                 // 3分でボス出現
const ARENA_R = 1400;                  // アリーナ半径（円形）

// ===== 敵 =====
const ENEMIES = {
  chaser: { r: 13, speed: 72, hp: 22, hpGrow: 9, dmg: 8, xp: 1, color: '#f0508c' },
  swarm:  { r: 8,  speed: 135, hp: 8, hpGrow: 3, dmg: 5, xp: 1, color: '#c04df9' },
  tank:   { r: 24, speed: 40, hp: 130, hpGrow: 40, dmg: 18, xp: 6, color: '#ff8c42' },
  boss:   { r: 46, speed: 58, hp: 3200, hpGrow: 0, dmg: 30, xp: 60, color: '#ffd23e' },
};
const ENEMY_CAP = 220;
const ENEMY_GRID_CELL = 96;
const TIER_HITSTOP_SEC = 0.09;
const BOSS_DEFEAT_STOP_SEC = 1.2;
const DEATH_SLOW_SEC = 1.2;
const DEATH_FADE_SEC = 0.8;
const DEATH_SLOW_SCALE = 0.35;
const TIER_COLORS = ['#3be8f0', '#7cff9e', '#ffd23e', '#ff8c42', '#f04dd8'];

// ===== 武器（すべてビートに同期して発動） =====
// everyBeats: 発動間隔（ビート数）。0.5 = 8分音符
const WEAPONS = {
  beatshot: {
    name: 'ビートショット', icon: '♪', everyBeats: 1, maxLv: 5,
    desc: 'ビート毎に最寄りの敵へ弾を放つ',
    lv: [
      { count: 1, dmg: 12 }, { count: 2, dmg: 12 }, { count: 2, dmg: 16 },
      { count: 3, dmg: 16 }, { count: 4, dmg: 20 },
    ],
  },
  nova: {
    name: 'ソニックノヴァ', icon: '◎', everyBeats: 4, maxLv: 5,
    desc: '4ビート毎に全方位の衝撃波',
    lv: [
      { radius: 130, dmg: 18 }, { radius: 160, dmg: 22 }, { radius: 190, dmg: 26 },
      { radius: 220, dmg: 32 }, { radius: 260, dmg: 40 },
    ],
  },
  bass: {
    name: 'サブウーファー', icon: '◣', everyBeats: 2, maxLv: 5,
    desc: '2ビート毎に進行方向へ低音波（ノックバック）',
    lv: [
      { range: 200, arc: 0.9, dmg: 14, kb: 220 }, { range: 230, arc: 1.0, dmg: 18, kb: 250 },
      { range: 260, arc: 1.1, dmg: 24, kb: 280 }, { range: 300, arc: 1.25, dmg: 30, kb: 320 },
      { range: 340, arc: 1.4, dmg: 40, kb: 360 },
    ],
  },
  laser: {
    name: 'レーザーグリッド', icon: '✦', everyBeats: 0.5, maxLv: 5,
    desc: '回転ビーム。8分音符でダメージ',
    lv: [
      { beams: 1, len: 220, dmg: 6 }, { beams: 2, len: 240, dmg: 7 }, { beams: 2, len: 270, dmg: 9 },
      { beams: 3, len: 300, dmg: 11 }, { beams: 4, len: 330, dmg: 14 },
    ],
  },
};

// ===== パッシブ =====
const PASSIVES = {
  amp:      { name: 'アンプ', icon: '▲', maxLv: 5, desc: '全ダメージ +15%', },
  speaker:  { name: 'スピーカー', icon: '◍', maxLv: 3, desc: '回収範囲 +45%' },
  footwork: { name: 'フットワーク', icon: '➜', maxLv: 3, desc: '移動速度 +12%' },
  battery:  { name: 'バッテリー', icon: '❤', maxLv: 3, desc: '最大HP +25 ＆ 全回復' },
  metronome:{ name: 'メトロノーム', icon: '◷', maxLv: 2, desc: 'PERFECT判定幅 +25ms' },
};

// レベルアップに必要なXP
function xpForLevel(level) {
  return 5 + Math.floor(level * 3.2);
}

// 経過時間(秒)ごとの毎秒スポーン数
function spawnRate(t) {
  return 0.7 + (t / 60) * 1.05;
}

function bpmForTime(mode, t) {
  if (mode !== MODE_ENDLESS || t <= OVERDRIVE_TIME) return BPM;
  return Math.min(BPM_MAX, BPM + ((t - OVERDRIVE_TIME) / 60) * OVERDRIVE_BPM_PER_MIN);
}

function beatAtTime(mode, t) {
  if (mode !== MODE_ENDLESS || t <= OVERDRIVE_TIME) return t * (BPM / 60);
  const over = t - OVERDRIVE_TIME;
  const rampEnd = OVERDRIVE_TIME + ((BPM_MAX - BPM) / OVERDRIVE_BPM_PER_MIN) * 60;
  if (t <= rampEnd) {
    return OVERDRIVE_TIME * (BPM / 60)
      + (BPM * over + (OVERDRIVE_BPM_PER_MIN / 120) * over * over) / 60;
  }
  const rampDur = rampEnd - OVERDRIVE_TIME;
  const rampBeats = (BPM * rampDur + (OVERDRIVE_BPM_PER_MIN / 120) * rampDur * rampDur) / 60;
  return OVERDRIVE_TIME * (BPM / 60) + rampBeats + (t - rampEnd) * (BPM_MAX / 60);
}

const META_GEAR = [
  { id: 'power_core', category: 'POWER', name: '安定化電源', effect: '最大HP +10/20/30', flavor: '電源が細いと音が痩せる', costs: [160, 420, 900] },
  { id: 'ups', category: 'POWER', name: '無停電電源', effect: '死亡時1回だけ復活 / 無敵 / ノヴァ', flavor: 'ライブは止められない', costs: [160, 420, 900] },
  { id: 'isolator', category: 'POWER', name: 'アイソレーター', effect: '被ダメージ -5/10/15%', flavor: 'ノイズをぶった斬る', costs: [160, 420, 900] },
  { id: 'tube_amp', category: 'OUTPUT', name: '真空管アンプ', effect: '全ダメージ +6/12/18%', flavor: '歪みこそ味', costs: [160, 420, 900] },
  { id: 'tweeter', category: 'OUTPUT', name: 'ツイーター', effect: 'ビートショット弾速/貫通/弾数', flavor: '高音は正義', costs: [160, 420, 900] },
  { id: 'bass_reflex', category: 'OUTPUT', name: 'バスレフ箱', effect: 'ノヴァ半径 +10/20/30%', flavor: '箱鳴りで押し出す低域', costs: [160, 420, 900] },
  { id: 'record_bag', category: 'SELECT', name: 'レコードバッグ', effect: '開始武器選択 / Lv2開始 / パッシブ', flavor: '今夜の1枚目', costs: [160, 420, 900] },
  { id: 'metro_clock', category: 'SELECT', name: 'メトロノーム時計', effect: 'PERFECT判定 +8/16/24ms', flavor: '体内時計を鍛える', costs: [160, 420, 900] },
  { id: 'booth_monitor', category: 'SELECT', name: 'ブースモニター', effect: 'GROOVE減衰 +2/4/6ビート猶予', flavor: '自分の音が聴こえりゃ外さない', costs: [160, 420, 900] },
];

const ACHIEVEMENTS = [
  { id: 'stage_clear', name: '初ステージクリア', reward: 'ENDLESSモード解放' },
  { id: 'groove_max', name: 'GROOVE MAX到達', reward: 'タイトルBGMレイヤー追加' },
  { id: 'endless_5', name: 'エンドレス5:00', reward: '機体色バリエーション' },
  { id: 'night_rider', name: 'エンドレス10:00', reward: 'NIGHT RIDER称号' },
  { id: 'boss_triple', name: 'ボス3周回撃破', reward: '隠し色' },
  { id: 'rack_complete', name: 'サウンドシステム完成', reward: 'ラック完成ランプ' },
];

function defaultMeta() {
  const gear = {};
  for (const g of META_GEAR) gear[g.id] = 0;
  return { chips: 0, gear, achievements: [] };
}

function normalizeMeta(meta) {
  const base = defaultMeta();
  const srcGear = meta?.gear ?? {};
  for (const g of META_GEAR) {
    base.gear[g.id] = Math.max(0, Math.min(3, Math.floor(Number(srcGear[g.id]) || 0)));
  }
  base.chips = Math.max(0, Math.floor(Number(meta?.chips) || 0));
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  base.achievements = Array.isArray(meta?.achievements)
    ? [...new Set(meta.achievements.filter((id) => known.has(id)))]
    : [];
  return base;
}

function gearLevel(meta, id) {
  return Math.max(0, Math.min(3, Number(meta?.gear?.[id]) || 0));
}

function gearCost(id, nextLevel) {
  const gear = META_GEAR.find((g) => g.id === id);
  if (!gear || nextLevel < 1 || nextLevel > 3) return Infinity;
  return gear.costs[nextLevel - 1];
}

function calculateChipReward(run) {
  const kills = Math.max(0, Math.floor(Number(run.kills) || 0));
  const maxGroove = Math.max(0, Math.floor(Number(run.maxGroove) || 0));
  const tier = grooveTierOf(maxGroove);
  const bossRankSum = Math.max(0, Math.floor(Number(run.bossRankSum) || 0));
  const survivalSteps = Math.max(0, Math.floor((Number(run.time) || 0) / 30));
  const breakdown = {
    kills,
    tier: tier * 50,
    boss: bossRankSum * 300,
    survival: survivalSteps * 10,
  };
  breakdown.total = breakdown.kills + breakdown.tier + breakdown.boss + breakdown.survival;
  return breakdown;
}

function isRackComplete(meta) {
  return META_GEAR.every((g) => gearLevel(meta, g.id) >= 3);
}


function defaultBeatSurvivorSave() {
  return {
    version: 1,
    best: { normalTime: 0, endlessTime: 0 },
    settings: {
      screenShake: true,
      reducedFlash: false,
      volumes: { bgm: 1, sfx: 1, judge: 1 },
    },
    meta: defaultMeta(),
  };
}

function normalizeBeatSurvivorSave(data) {
  const base = defaultBeatSurvivorSave();
  if (!data || data.version !== 1) return base;
  return {
    version: 1,
    best: {
      normalTime: Number(data.best?.normalTime) || 0,
      endlessTime: Number(data.best?.endlessTime) || 0,
    },
    settings: {
      screenShake: data.settings?.screenShake !== false,
      reducedFlash: data.settings?.reducedFlash === true,
      volumes: {
        bgm: Math.max(0, Math.min(1, Number(data.settings?.volumes?.bgm ?? 1))),
        sfx: Math.max(0, Math.min(1, Number(data.settings?.volumes?.sfx ?? 1))),
        judge: Math.max(0, Math.min(1, Number(data.settings?.volumes?.judge ?? 1))),
      },
    },
    meta: normalizeMeta(data.meta),
  };
}

function loadBeatSurvivorSave() {
  const save = defaultBeatSurvivorSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return normalizeBeatSurvivorSave(JSON.parse(raw));
    const legacyEndless = Number(localStorage.getItem(ENDLESS_BEST_KEY) || 0);
    const legacyNormal = Number(localStorage.getItem(LEGACY_NORMAL_BEST_KEY) || 0);
    if (legacyEndless > 0 || legacyNormal > 0) {
      save.best.endlessTime = legacyEndless || 0;
      save.best.normalTime = legacyNormal || 0;
      saveBeatSurvivorSave(save);
    }
  } catch (err) {
    console.warn('[beatsurvivor] save data reset:', err);
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }
  return save;
}

function saveBeatSurvivorSave(next) {
  const data = normalizeBeatSurvivorSave(next);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
  catch (err) { console.warn('[beatsurvivor] save failed:', err); }
  return data;
}

function updateBeatSurvivorSave(mutator) {
  const save = loadBeatSurvivorSave();
  mutator(save);
  return saveBeatSurvivorSave(save);
}
