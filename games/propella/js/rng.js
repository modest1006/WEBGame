(function () {
  'use strict';

  function PropellaRng(seed) {
    this.state = (Number(seed) || 1) >>> 0;
    if (!this.state) this.state = 1;
  }

  PropellaRng.prototype.next = function () {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  };

  PropellaRng.prototype.range = function (min, max) {
    return min + (max - min) * this.next();
  };

  PropellaRng.prototype.int = function (min, max) {
    return Math.floor(this.range(min, max + 1));
  };

  window.PropellaRng = PropellaRng;
})();
