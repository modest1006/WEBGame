const VERSION = 1;

const WORLD = { w: 960, h: 540 };
const ACT = { TITLE: 0, PREP: 1, JUST: 2, DASH: 3, DAY_RESULT: 4, WEEK_RESULT: 5, PAUSED: 6 };
const ACT_NAMES = ['TITLE', '仕込み', '定時ジャスト', '退社ダッシュ', '日次リザルト', '週間リザルト', 'PAUSE'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_JP = ['月', '火', '水', '木', '金'];
const PREP_STAGES = ['PCシャットダウン', '書類片付け', 'カバン詰め', '上着装着'];
const QTE_TYPES = ['coworker', 'papers', 'elevator', 'wax'];
const QTE_LABELS = { coworker: 'お疲れ様でした!', papers: '書類ジャンプ', elevator: '滑り込み', wax: 'スライディング', director: '部長3連' };
const BEST_KEY = 'teijidash.weekBest.v1';

const TUNING = {
  prepMs: 40000,
  justMs: 15000,
  dashMs: 40000,
  resultMs: 5200,
  prepRate: 100 / 27000,
  prepPenalty: 6,
  caughtPenaltyMs: 1800,
  qteLeadMs: 1150,
  qteWindowMs: 260,
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function fmtMs(ms) {
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(Math.round(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return sign + m + ':' + String(s % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}
