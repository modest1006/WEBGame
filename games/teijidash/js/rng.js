class RNG {
  constructor(seed) { this.s = (seed || 123456789) >>> 0; }
  next() {
    this.s ^= this.s << 13; this.s >>>= 0;
    this.s ^= this.s >>> 17; this.s >>>= 0;
    this.s ^= this.s << 5; this.s >>>= 0;
    return (this.s >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}
