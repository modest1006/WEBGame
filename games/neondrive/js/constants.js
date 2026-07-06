const ND_VERSION = 1;
const ND_STORAGE = {
  bestScore: 'neondrive.bestScore.v1',
  bestDistance: 'neondrive.bestDistance.v1',
  muted: 'neondrive.muted.v1',
};

const ND = {
  road: {
    segmentLength: 5,
    drawDistance: 220,
    roadWidth: 2.15,
    rumbleLength: 3,
    laneCount: 3,
    cameraHeight: 0.92,
    cameraDepth: 0.86,
  },
  physics: {
    step: 1 / 90,
    accel: 18,
    brake: 42,
    drag: 0.015,
    maxSpeed: 132,
    boostMaxSpeed: 178,
    offroadSlow: 55,
    offroadMinSpeed: 14,  // オフロードでもこの速度までしか減速しない（スタック防止）
    steerSpeed: 2.35,
    centrifugal: 6.6,     // 遠心力は速度に線形（v²だと高速で物理的に曲がれない）
    crashSlow: 0.34,
  },
  rules: {
    startTime: 55,
    checkpointDistance: 1800,
    checkpointBonus: 26,
    checkpointBonusMin: 14,
    nearMissDistance: 7.2,
    nearMissLateral: 0.38,
    crashRadiusZ: 2.2,
    crashLateral: 0.46,
  },
  lanes: [-0.66, 0, 0.66],
};

function ndClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function ndLerp(a, b, t) { return a + (b - a) * t; }
function ndSmooth(t) { return t * t * (3 - 2 * t); }
function ndWrap(v, max) {
  v %= max;
  return v < 0 ? v + max : v;
}
