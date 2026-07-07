(function () {
  'use strict';
  function HellbreakRng(seed) { this.s = (seed || 0x51f15e) >>> 0; }
  HellbreakRng.prototype.next = function () {
    let x = this.s || 1;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  };
  HellbreakRng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  HellbreakRng.prototype.pick = function (arr) { return arr[(this.next() * arr.length) | 0]; };
  window.HellbreakRng = HellbreakRng;
})();
