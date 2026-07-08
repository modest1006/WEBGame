(function () {
  'use strict';

  // Deterministic mulberry32 PRNG so ?seed=N reproduces identical boards/shots.
  function BubbleExRng(seed) {
    this.state = (seed >>> 0) || 1;
  }
  BubbleExRng.prototype.next = function () {
    var t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  BubbleExRng.prototype.int = function (maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  };
  BubbleExRng.prototype.pick = function (arr) {
    return arr[this.int(arr.length)];
  };

  window.BubbleExRng = BubbleExRng;
})();
