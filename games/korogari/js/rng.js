(function () {
  'use strict';
  function KorogariRng(seed) { this.s = (seed >>> 0) || 123456789; }
  KorogariRng.prototype.next = function () {
    let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0;
    return this.s / 4294967296;
  };
  KorogariRng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  KorogariRng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };
  window.KorogariRng = KorogariRng;
})();
