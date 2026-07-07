(function () {
  'use strict';
  function RollMazeRng(seed) {
    this.s = (seed >>> 0) || 0x6d2b79f5;
  }
  RollMazeRng.prototype.next = function () {
    let t = this.s += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RollMazeRng.prototype.range = function (a, b) {
    return a + (b - a) * this.next();
  };
  window.RollMazeRng = RollMazeRng;
})();
