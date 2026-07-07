(function () {
  'use strict';
  function HoshikuiRng(seed) { this.s = (seed >>> 0) || 246813579; }
  HoshikuiRng.prototype.next = function () {
    let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0;
    return this.s / 4294967296;
  };
  HoshikuiRng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  HoshikuiRng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  HoshikuiRng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };
  window.HoshikuiRng = HoshikuiRng;
})();
