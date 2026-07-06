const VERSION = 1;

const WORLD = {
  w: 720,
  h: 960,
  left: 96,
  right: 624,
  floor: 878,
  top: 154,
  deadLine: 172,
  spawnY: 92,
  gravity: 1650,
  airDrag: 0.018,
  wallRestitution: 0.12,
  bodyRestitution: 0.15,
  friction: 0.55,
  sleepSpeed: 7,
  sleepAngular: 0.08,
  maxBodies: 90,
};

const PHYSICS = {
  step: 1 / 120,
  iterations: 5,
  correctionPercent: 0.78,
  correctionSlop: 0.8,
  dropCooldown: 0.5,
  warningTime: 2.0,
};

const TIERS = [
  { name: 'Stardust', jp: '星屑', r: 14, mass: 1.0, color: '#a9f5ff', glow: '#e8ffff' },
  { name: 'Meteorite', jp: '隕石', r: 20, mass: 2.1, color: '#9a8173', glow: '#ffb37d' },
  { name: 'Asteroid', jp: '小惑星', r: 27, mass: 3.8, color: '#8b8a96', glow: '#d8d1bd' },
  { name: 'Comet', jp: '彗星', r: 36, mass: 6.5, color: '#bdf8ff', glow: '#7ee9ff' },
  { name: 'Moon', jp: '月', r: 46, mass: 10.5, color: '#d7d3c7', glow: '#ffffff' },
  { name: 'Mars', jp: '火星型惑星', r: 58, mass: 16.0, color: '#d76c46', glow: '#ff9b60' },
  { name: 'Earth', jp: '地球型惑星', r: 72, mass: 24.0, color: '#3e8fdc', glow: '#68f0b6' },
  { name: 'Ring Giant', jp: 'ガス惑星・環つき', r: 90, mass: 36.0, color: '#e7bd73', glow: '#ffe7a9' },
  { name: 'Sun', jp: '太陽', r: 110, mass: 55.0, color: '#ffcf35', glow: '#ff6535' },
  { name: 'Red Giant', jp: '赤色巨星', r: 134, mass: 82.0, color: '#ff5a46', glow: '#ffb14b' },
  { name: 'Black Hole', jp: 'ブラックホール', r: 120, mass: 120.0, color: '#090614', glow: '#b47cff' },
];

const DROP_TIERS = [0, 1, 2, 3, 4];
const SCORE_BASE = 10;
const BIG_BANG_BONUS = 25000;
const BEST_KEY = 'cosmicmerge.best.v1';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function tierScore(tier, combo) {
  return Math.round(((tier + 1) * (tier + 1) * SCORE_BASE) * (1 + Math.max(0, combo - 1) * 0.35));
}
