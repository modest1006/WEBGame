const VERSION = 2;

const WORLD = { w: 960, h: 540 };
const ACT = {
  TITLE: 0,
  PREP: 1,
  JUST: 2,
  DASH: 3,
  JUST_SLOW: 4,
  DAY_RESULT: 5,
  WEEK_RESULT: 6,
  INTERLUDE: 7,
};
const ACT_NAMES = {
  0: 'TITLE',
  1: '仕込み',
  2: '定時ジャスト',
  3: '退社ダッシュ',
  4: 'スローモーション',
  5: '日次リザルト',
  6: '週間リザルト',
  7: '幕間',
};
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_JP = ['月', '火', '水', '木', '金'];
const PREP_STAGES = ['PCシャットダウン', '書類片付け', 'カバン詰め', '上着装着'];
const ACT_TITLES = {
  1: '第一幕 帰り支度',
  2: '第二幕 定時ジャスト',
  3: '第三幕 退社ダッシュ',
};
const QTE_TYPES = ['coworker', 'papers', 'elevator', 'wax'];
const QTE_LABELS = {
  coworker: 'ちょっといい？',
  papers: '書類配布',
  elevator: '閉まりかけEV',
  wax: 'ワックス床',
  director: '部長3連',
};
const BEST_KEY = 'teijidash.weekBest.v1';

const TUNING = {
  interludeMs: 1200,
  prepMs: 40000,
  justMs: 15000,
  justFreezeMs: 400,
  justFlashMs: 100,
  dashMs: 40000,
  resultInputLockMs: 1000,
  prepRate: 100 / 27000,
  prepPenalty: 6,
  caughtPenaltyMs: 1800,
  qteLeadMs: 1200,
  qteWindowMs: 260,
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function fmtMs(ms) {
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(Math.round(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return sign + m + ':' + String(s % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}
function fmtStamp(offset) {
  const ms = Math.max(0, Math.round(Number(offset) || 0));
  return '18:00:00.' + String(ms).padStart(3, '0') + ` (${offset >= 0 ? '+' : ''}${Math.round(offset)}ms)`;
}
