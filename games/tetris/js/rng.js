// mulberry32 — シード固定可能な軽量PRNG（?seed= での再現テスト用）
class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed || (Math.random() * 0xffffffff) >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
