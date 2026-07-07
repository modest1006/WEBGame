(function () {
  'use strict';

  const EMPTY = 0;
  const WALL = 255;
  const W = 144;
  const H = 144;
  const RADIUS = 69;
  const CENTER = 71.5;
  const SAVE_KEY = 'petri.save.v1';

  const SPECIES = [
    null,
    { id: 1, key: 'conway', name: 'コンウェイ菌', rule: 'B3/S23', color: '#19e85a', cost: 0, b: bits([3]), s: bits([2, 3]) },
    { id: 2, key: 'highlife', name: 'ハイライフ菌', rule: 'B36/S23', color: '#00f0d8', cost: 0, b: bits([3, 6]), s: bits([2, 3]) },
    { id: 3, key: 'seeds', name: 'シード菌', rule: 'B2/S-', color: '#ffe21a', cost: 140, b: bits([2]), s: bits([]) },
    { id: 4, key: 'maze', name: 'メイズ菌', rule: 'B3/S12345', color: '#ff8a12', cost: 420, b: bits([3]), s: bits([1, 2, 3, 4, 5]) },
    { id: 5, key: 'daynight', name: 'デイナイト菌', rule: 'B3678/S34678', color: '#a94cff', cost: 900, b: bits([3, 6, 7, 8]), s: bits([3, 4, 6, 7, 8]) },
    { id: 6, key: 'replicator', name: 'レプリ菌', rule: 'B1357/S1357', color: '#ff2f9d', cost: 1800, b: bits([1, 3, 5, 7]), s: bits([1, 3, 5, 7]) }
  ];

  const PATTERNS = makePatterns();

  function bits(nums) {
    let n = 0;
    for (let i = 0; i < nums.length; i++) n |= (1 << nums[i]);
    return n;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeMask() {
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - CENTER;
        const dy = y - CENTER;
        if (dx * dx + dy * dy <= RADIUS * RADIUS) mask[y * W + x] = 1;
      }
    }
    return mask;
  }

  function norm(cells) {
    let minX = 999, minY = 999, maxX = -999, maxY = -999;
    for (let i = 0; i < cells.length; i++) {
      minX = Math.min(minX, cells[i][0]);
      minY = Math.min(minY, cells[i][1]);
      maxX = Math.max(maxX, cells[i][0]);
      maxY = Math.max(maxY, cells[i][1]);
    }
    const out = [];
    for (let i = 0; i < cells.length; i++) out.push([cells[i][0] - minX, cells[i][1] - minY]);
    out.sort(function (a, b) { return a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]; });
    return { cells: out, w: maxX - minX + 1, h: maxY - minY + 1, sig: out.map(function (p) { return p[0] + ':' + p[1]; }).join(',') };
  }

  function variants(cells) {
    const seen = {};
    const out = [];
    const transforms = [
      function (x, y) { return [x, y]; },
      function (x, y) { return [-x, y]; },
      function (x, y) { return [x, -y]; },
      function (x, y) { return [-x, -y]; },
      function (x, y) { return [y, x]; },
      function (x, y) { return [-y, x]; },
      function (x, y) { return [y, -x]; },
      function (x, y) { return [-y, -x]; }
    ];
    for (let t = 0; t < transforms.length; t++) {
      const v = norm(cells.map(function (p) { return transforms[t](p[0], p[1]); }));
      if (!seen[v.sig]) {
        seen[v.sig] = true;
        out.push(v);
      }
    }
    return out;
  }

  function makePatterns() {
    function p(key, name, bonus, cells) {
      return { key: key, name: name, bonus: bonus, variants: variants(cells), count: cells.length };
    }
    return [
      p('block', '角砂糖群体', 24, [[0,0],[1,0],[0,1],[1,1]]),
      p('beehive', 'はちみつ膜', 32, [[1,0],[2,0],[0,1],[3,1],[1,2],[2,2]]),
      p('loaf', '食パン胞子', 36, [[1,0],[2,0],[0,1],[3,1],[1,2],[3,2],[2,3]]),
      p('boat', '小舟菌', 28, [[0,0],[1,0],[0,1],[2,1],[1,2]]),
      p('tub', '湯のみ胞子', 28, [[1,0],[0,1],[2,1],[1,2]]),
      p('blinker', 'はばたき虫', 42, [[0,0],[1,0],[2,0]]),
      p('toad', 'ずれる跳ね虫', 58, [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1]]),
      p('beacon', '信号灯コロニー', 64, [[0,0],[1,0],[0,1],[3,2],[2,3],[3,3]]),
      p('glider', 'すべり胞子', 120, [[1,0],[2,1],[0,2],[1,2],[2,2]]),
      p('lwss', '軽便宇宙菌', 180, [[1,0],[4,0],[0,1],[0,2],[4,2],[0,3],[1,3],[2,3],[3,3]]),
      p('pulsar', '脈打つ花環', 260, [[2,0],[3,0],[4,0],[8,0],[9,0],[10,0],[0,2],[5,2],[7,2],[12,2],[0,3],[5,3],[7,3],[12,3],[0,4],[5,4],[7,4],[12,4],[2,5],[3,5],[4,5],[8,5],[9,5],[10,5],[2,7],[3,7],[4,7],[8,7],[9,7],[10,7],[0,8],[5,8],[7,8],[12,8],[0,9],[5,9],[7,9],[12,9],[0,10],[5,10],[7,10],[12,10],[2,12],[3,12],[4,12],[8,12],[9,12],[10,12]]),
      p('pentadecathlon', '十五拍子虫', 220, [[1,0],[2,0],[0,1],[3,1],[1,2],[2,2],[1,3],[2,3],[1,4],[2,4],[1,5],[2,5],[0,6],[3,6],[1,7],[2,7]])
    ];
  }

  function PetriGame(opts) {
    opts = opts || {};
    this.width = W;
    this.height = H;
    this.mask = makeMask();
    this.cells = new Uint8Array(W * H);
    this.next = new Uint8Array(W * H);
    this.decay = new Uint8Array(W * H);
    this.rng = mulberry32((opts.seed || 1234567) >>> 0);
    this.seed = opts.seed || 0;
    this.generation = 0;
    this.accum = 0;
    this.speed = 1;
    this.paused = false;
    this.spores = 0;
    this.maxPopulation = 0;
    this.population = 0;
    this.populationBySpecies = [0,0,0,0,0,0,0];
    this.unlocked = { 1: true, 2: true };
    this.codex = {};
    this.events = [];
    this.lastDetectGeneration = 0;
    this.gauge = 100;
    this.tool = 'nutrient';
    this.selectedSpecies = 1;
    this.nextNaturalGeneration = 0;
    this.lowPopulationSince = 0;
    this.lastSavedAt = Date.now();
    this.perf = { generations: 0, ms: 0 };
    this._listeners = [];
    if (!opts.skipLoad && !this.load()) this.seedDish();
    if (!this.nextNaturalGeneration) this.scheduleNaturalSpore();
  }

  PetriGame.SPECIES = SPECIES;
  PetriGame.PATTERNS = PATTERNS;
  PetriGame.WALL = WALL;
  PetriGame.EMPTY = EMPTY;

  PetriGame.prototype.on = function (fn) { this._listeners.push(fn); };
  PetriGame.prototype.emit = function (type, data) {
    this.events.push({ type: type, data: data || {}, at: this.generation });
    if (this.events.length > 40) this.events.shift();
    for (let i = 0; i < this._listeners.length; i++) this._listeners[i](type, data || {});
  };

  PetriGame.prototype.seedDish = function () {
    this.cells.fill(EMPTY);
    this.next.fill(EMPTY);
    this.decay.fill(0);
    for (let i = 0; i < 38; i++) {
      const sp = i % 2 ? 2 : 1;
      const a = this.rng() * Math.PI * 2;
      const r = 8 + this.rng() * 52;
      this.scatter(CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r, sp, 4 + (this.rng() * 5 | 0), 0.38);
    }
    this.measurePopulation();
    this.scheduleNaturalSpore();
  };

  PetriGame.prototype.scheduleNaturalSpore = function () {
    this.nextNaturalGeneration = this.generation + 240 + ((this.rng() * 480) | 0);
  };

  PetriGame.prototype.randomDishPoint = function () {
    for (let i = 0; i < 80; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * 61;
      const x = CENTER + Math.cos(a) * r;
      const y = CENTER + Math.sin(a) * r;
      if (this.inDish(x | 0, y | 0)) return { x: x, y: y };
    }
    return { x: CENTER, y: CENTER };
  };

  PetriGame.prototype.randomUnlockedSpecies = function () {
    const ids = [];
    for (let s = 1; s <= 6; s++) if (this.unlocked[s]) ids.push(s);
    return ids.length ? ids[(this.rng() * ids.length) | 0] : 1;
  };

  PetriGame.prototype.densityForSpecies = function (species) {
    if (species === 3) return 0.28;
    if (species === 4 || species === 5) return 0.37;
    if (species === 6) return 0.32;
    return 0.35;
  };

  PetriGame.prototype.spawnFloatingSpores = function (reason) {
    const p = this.randomDishPoint();
    const species = this.randomUnlockedSpecies();
    const radius = reason === 'low' ? 11 : 8 + ((this.rng() * 4) | 0);
    this.scatter(p.x, p.y, species, radius, this.densityForSpecies(species));
    if (species === 1 || species === 2) {
      this.placePattern(species, (p.x - 2) | 0, (p.y - 2) | 0, this.rng() < 0.5 ? 'glider' : 'blinker');
    }
    this.lowPopulationSince = 0;
    this.scheduleNaturalSpore();
    this.emit('spore', { x: p.x, y: p.y, species: species, reason: reason || 'natural' });
  };

  PetriGame.prototype.index = function (x, y) { return y * W + x; };
  PetriGame.prototype.inDish = function (x, y) {
    x = x | 0; y = y | 0;
    return x >= 0 && y >= 0 && x < W && y < H && this.mask[y * W + x] === 1;
  };

  PetriGame.prototype.scatter = function (cx, cy, species, radius, chance) {
    species = this.unlocked[species] ? species : this.selectedSpecies;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (!this.inDish(x, y)) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius && this.rng() < chance) this.cells[y * W + x] = species;
      }
    }
    this.measurePopulation();
  };

  PetriGame.prototype.placePattern = function (species, x, y, name) {
    species = this.unlocked[species] ? species : this.selectedSpecies;
    const map = {
      block: [[0,0],[1,0],[0,1],[1,1]],
      blinker: [[0,0],[1,0],[2,0]],
      glider: [[1,0],[2,1],[0,2],[1,2],[2,2]],
      toad: [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1]],
      beacon: [[0,0],[1,0],[0,1],[3,2],[2,3],[3,3]],
      lwss: [[1,0],[4,0],[0,1],[0,2],[4,2],[0,3],[1,3],[2,3],[3,3]],
      pulsar: PATTERNS[10].variants[0].cells
    };
    const cells = map[name || 'glider'] || map.glider;
    for (let i = 0; i < cells.length; i++) {
      const px = (x | 0) + cells[i][0], py = (y | 0) + cells[i][1];
      if (this.inDish(px, py)) this.cells[py * W + px] = species;
    }
    this.measurePopulation();
  };

  PetriGame.prototype.stir = function (cx, cy, radius) {
    const vals = [];
    const idxs = [];
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (!this.inDish(x, y)) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          const idx = y * W + x;
          idxs.push(idx);
          vals.push(this.cells[idx]);
        }
      }
    }
    for (let i = vals.length - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
      const t = vals[i]; vals[i] = vals[j]; vals[j] = t;
    }
    for (let k = 0; k < idxs.length; k++) this.cells[idxs[k]] = vals[k];
    this.emit('stir', { x: cx, y: cy });
  };

  PetriGame.prototype.wallLine = function (x0, y0, x1, y1, radius) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) | 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++) {
        for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
          if (this.inDish(xx, yy)) this.cells[yy * W + xx] = WALL;
        }
      }
    }
  };

  PetriGame.prototype.generationStep = function () {
    const c = this.cells, n = this.next, d = this.decay, m = this.mask;
    n.fill(EMPTY);
    const counts = [0,0,0,0,0,0,0];
    let pop = 0;
    counts.fill(0);
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    for (let y = 1; y < H - 1; y++) {
      let row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const idx = row + x;
        if (!m[idx]) continue;
        const cur = c[idx];
        if (cur === WALL) {
          n[idx] = WALL;
          continue;
        }
        let total = 0;
        const by = [0,0,0,0,0,0,0];
        const i0 = idx - W - 1;
        const a0 = c[i0], a1 = c[i0 + 1], a2 = c[i0 + 2], a3 = c[idx - 1], a4 = c[idx + 1], a5 = c[idx + W - 1], a6 = c[idx + W], a7 = c[idx + W + 1];
        if (a0 > 0 && a0 !== WALL) { total++; by[a0]++; }
        if (a1 > 0 && a1 !== WALL) { total++; by[a1]++; }
        if (a2 > 0 && a2 !== WALL) { total++; by[a2]++; }
        if (a3 > 0 && a3 !== WALL) { total++; by[a3]++; }
        if (a4 > 0 && a4 !== WALL) { total++; by[a4]++; }
        if (a5 > 0 && a5 !== WALL) { total++; by[a5]++; }
        if (a6 > 0 && a6 !== WALL) { total++; by[a6]++; }
        if (a7 > 0 && a7 !== WALL) { total++; by[a7]++; }
        let out = EMPTY;
        if (cur > 0 && cur !== WALL) {
          const hostile = total - by[cur];
          if ((SPECIES[cur].s & (1 << total)) && hostile <= by[cur] + 3) out = cur;
        } else if (total > 0) {
          let winner = 0, best = -1;
          for (let s = 1; s <= 6; s++) {
            if (by[s] > best && this.unlocked[s]) { best = by[s]; winner = s; }
          }
          if (winner && (SPECIES[winner].b & (1 << total))) out = winner;
        }
        n[idx] = out;
        if (out > 0 && out !== WALL) {
          pop++;
          counts[out]++;
          d[idx] = 0;
        } else if (cur > 0 && cur !== WALL) {
          d[idx] = 5;
        } else if (d[idx] > 0) {
          d[idx]--;
        }
      }
    }
    const swap = this.cells; this.cells = this.next; this.next = swap;
    this.population = pop;
    this.populationBySpecies = counts;
    this.maxPopulation = Math.max(this.maxPopulation, pop);
    this.spores += pop / 2400;
    this.gauge = Math.min(100, this.gauge + 0.075);
    this.generation++;
    this.perf.generations++;
    this.perf.ms += ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
    if (this.generation - this.lastDetectGeneration >= 12) this.detectPatterns(420);
    if (this.population < 150) {
      if (!this.lowPopulationSince) this.lowPopulationSince = this.generation;
      if (this.generation - this.lowPopulationSince >= 24) this.spawnFloatingSpores('low');
    } else {
      this.lowPopulationSince = 0;
    }
    if (this.generation >= this.nextNaturalGeneration) this.spawnFloatingSpores('natural');
  };

  PetriGame.prototype.step = function (ms) {
    if (this.paused) return;
    this.accum += Math.max(0, Math.min(ms || 0, 10000));
    const interval = 1000 / (8 * this.speed);
    let guard = 0;
    while (this.accum >= interval && guard++ < 80) {
      this.accum -= interval;
      this.generationStep();
    }
  };

  PetriGame.prototype.measurePopulation = function () {
    const counts = [0,0,0,0,0,0,0];
    let pop = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v > 0 && v !== WALL) { pop++; counts[v]++; }
    }
    this.population = pop;
    this.populationBySpecies = counts;
    this.maxPopulation = Math.max(this.maxPopulation, pop);
  };

  PetriGame.prototype.detectPatterns = function (budget) {
    this.lastDetectGeneration = this.generation;
    const found = [];
    let checks = 0;
    const cells = this.cells;
    if (budget) {
      for (let sample = 0; sample < budget; sample++) {
        const pat = PATTERNS[sample % PATTERNS.length];
        const x = 2 + ((this.rng() * (W - 18)) | 0);
        const y = 2 + ((this.rng() * (H - 18)) | 0);
        if (!this.mask[y * W + x]) continue;
        for (let vi = 0; vi < pat.variants.length; vi++) {
          const v = pat.variants[vi];
          if (x + v.w >= W || y + v.h >= H) continue;
          checks++;
          const sp = this.matchVariant(x, y, v);
          if (sp) {
            const key = sp + ':' + pat.key;
            if (!this.codex[key]) {
              this.codex[key] = { species: sp, pattern: pat.key, patternName: pat.name, name: SPECIES[sp].name + 'の' + pat.name, generation: this.generation };
              this.spores += pat.bonus;
              const evt = { species: sp, pattern: pat.key, name: this.codex[key].name, bonus: pat.bonus, x: x + v.w / 2, y: y + v.h / 2 };
              found.push(evt);
              this.emit('discover', evt);
            }
            break;
          }
        }
      }
      return found;
    }
    for (let pi = 0; pi < PATTERNS.length; pi++) {
      const pat = PATTERNS[pi];
      for (let y = 2; y < H - 14; y += pat.count > 20 ? 2 : 1) {
        for (let x = 2; x < W - 14; x += pat.count > 20 ? 2 : 1) {
          if (!this.mask[y * W + x]) continue;
          for (let vi = 0; vi < pat.variants.length; vi++) {
            const v = pat.variants[vi];
            if (x + v.w >= W || y + v.h >= H) continue;
            checks++;
            const sp = this.matchVariant(x, y, v);
            if (sp) {
              const key = sp + ':' + pat.key;
              if (!this.codex[key]) {
                this.codex[key] = { species: sp, pattern: pat.key, patternName: pat.name, name: SPECIES[sp].name + 'の' + pat.name, generation: this.generation };
                this.spores += pat.bonus;
                const evt = { species: sp, pattern: pat.key, name: this.codex[key].name, bonus: pat.bonus, x: x + v.w / 2, y: y + v.h / 2 };
                found.push(evt);
                this.emit('discover', evt);
              }
              x += Math.max(1, v.w - 1);
              break;
            }
          }
          if (budget && checks > budget) return found;
        }
      }
    }
    return found;
  };

  PetriGame.prototype.matchVariant = function (x, y, v) {
    const set = {};
    const speciesCounts = [0,0,0,0,0,0,0];
    for (let i = 0; i < v.cells.length; i++) {
      const px = x + v.cells[i][0], py = y + v.cells[i][1];
      const idx = py * W + px;
      const sp = this.cells[idx];
      if (!(sp > 0 && sp !== WALL)) return 0;
      set[v.cells[i][0] + ':' + v.cells[i][1]] = true;
      speciesCounts[sp]++;
    }
    for (let yy = -1; yy <= v.h; yy++) {
      for (let xx = -1; xx <= v.w; xx++) {
        const px = x + xx, py = y + yy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        if (xx >= 0 && yy >= 0 && xx < v.w && yy < v.h && set[xx + ':' + yy]) continue;
        const val = this.cells[py * W + px];
        if (val > 0 && val !== WALL) return 0;
      }
    }
    let best = 0, bestN = 0;
    for (let s = 1; s <= 6; s++) if (speciesCounts[s] > bestN) { bestN = speciesCounts[s]; best = s; }
    return best;
  };

  PetriGame.prototype.applyTool = function (tool, species, x, y, x2, y2) {
    if (tool !== 'wall' && this.gauge < 12) return false;
    if (tool === 'nutrient') {
      species = species || this.selectedSpecies;
      this.scatter(x, y, species, 10, this.densityForSpecies(species));
      this.gauge -= 16;
      this.emit('drop', { x: x, y: y });
    } else if (tool === 'stir') {
      this.stir(x, y, 10);
      this.gauge -= 22;
    } else if (tool === 'wall') {
      this.wallLine(x, y, x2 == null ? x : x2, y2 == null ? y : y2, 1);
      this.gauge = Math.max(0, this.gauge - 0.8);
    }
    return true;
  };

  PetriGame.prototype.unlock = function (id) {
    if (!SPECIES[id]) return false;
    if (this.unlocked[id]) return true;
    if (this.spores < SPECIES[id].cost) return false;
    this.spores -= SPECIES[id].cost;
    this.unlocked[id] = true;
    this.emit('unlock', { species: id });
    return true;
  };

  PetriGame.prototype.addPoints = function (n) { this.spores += Number(n) || 0; };
  PetriGame.prototype.resetDish = function () {
    this.cells.fill(EMPTY); this.next.fill(EMPTY); this.decay.fill(0);
    this.population = 0; this.populationBySpecies = [0,0,0,0,0,0,0];
    this.generation = 0; this.maxPopulation = 0;
    this.emit('reset', {});
    this.save();
  };

  PetriGame.prototype.offlineSim = function (minutes) {
    const gens = Math.min(30000, Math.max(0, Math.floor((minutes || 0) * 60 * 8)));
    const before = Object.keys(this.codex).length;
    const pop0 = this.maxPopulation;
    for (let i = 0; i < gens; i++) this.generationStep();
    const after = Object.keys(this.codex).length;
    const report = { generations: gens, maxPopulation: this.maxPopulation, newDiscoveries: after - before, previousMaxPopulation: pop0 };
    this.emit('offline', report);
    return report;
  };

  PetriGame.prototype.encodeBoard = function () {
    let out = '', last = this.cells[0], count = 1;
    function push(v, n) { out += v.toString(36) + ':' + n.toString(36) + ';'; }
    for (let i = 1; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v === last && count < 65535) count++;
      else { push(last, count); last = v; count = 1; }
    }
    push(last, count);
    return out;
  };

  PetriGame.prototype.decodeBoard = function (str) {
    const arr = new Uint8Array(W * H);
    const parts = String(str || '').split(';');
    let pos = 0;
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      const kv = parts[i].split(':');
      const val = parseInt(kv[0], 36), count = parseInt(kv[1], 36);
      for (let j = 0; j < count && pos < arr.length; j++) arr[pos++] = val;
    }
    if (pos === arr.length) this.cells = arr;
  };

  PetriGame.prototype.save = function () {
    if (typeof localStorage === 'undefined') return false;
    const data = {
      generation: this.generation, spores: this.spores, maxPopulation: this.maxPopulation,
      unlocked: this.unlocked, codex: this.codex, board: this.encodeBoard(), lastSavedAt: Date.now(),
      seed: this.seed, nextNaturalGeneration: this.nextNaturalGeneration, lowPopulationSince: this.lowPopulationSince
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    this.lastSavedAt = data.lastSavedAt;
    return true;
  };

  PetriGame.prototype.load = function () {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.generation = data.generation || 0;
      this.spores = data.spores || 0;
      this.maxPopulation = data.maxPopulation || 0;
      this.unlocked = data.unlocked || { 1: true, 2: true };
      this.codex = data.codex || {};
      this.lastSavedAt = data.lastSavedAt || Date.now();
      this.nextNaturalGeneration = data.nextNaturalGeneration || 0;
      this.lowPopulationSince = data.lowPopulationSince || 0;
      this.decodeBoard(data.board);
      this.measurePopulation();
      return true;
    } catch (err) {
      return false;
    }
  };

  PetriGame.prototype.getState = function () {
    return {
      generation: this.generation,
      population: this.population,
      populationBySpecies: this.populationBySpecies.slice(),
      spores: Math.floor(this.spores),
      sporesExact: this.spores,
      codexCount: Object.keys(this.codex).length,
      codexTotal: (SPECIES.length - 1) * PATTERNS.length,
      gauge: Math.max(0, Math.round(this.gauge)),
      speed: this.speed,
      paused: this.paused,
      maxPopulation: this.maxPopulation,
      nextNaturalGeneration: this.nextNaturalGeneration,
      unlocked: Object.assign({}, this.unlocked),
      species: SPECIES.slice(1),
      perf: {
        generations: this.perf.generations,
        ms: this.perf.ms,
        gps: this.perf.ms > 0 ? this.perf.generations / (this.perf.ms / 1000) : 0
      }
    };
  };

  PetriGame.prototype.dump = function () {
    const scale = 4, lines = [];
    for (let y = 0; y < H; y += scale) {
      let line = '';
      for (let x = 0; x < W; x += scale) {
        const v = this.cells[y * W + x];
        line += v === WALL ? '#' : (v > 0 ? String(v) : (this.mask[y * W + x] ? '.' : ' '));
      }
      lines.push(line);
    }
    return lines.join('\n');
  };

  PetriGame.prototype.validate = function () {
    const a = new PetriGame({ seed: 1, skipLoad: true });
    a.unlocked = { 1: true };
    a.placePattern(1, 70, 70, 'blinker');
    a.generationStep();
    const vertical = a.cells[69 * W + 71] === 1 && a.cells[70 * W + 71] === 1 && a.cells[71 * W + 71] === 1;
    a.generationStep();
    const horizontal = a.cells[70 * W + 70] === 1 && a.cells[70 * W + 71] === 1 && a.cells[70 * W + 72] === 1;
    const b = new PetriGame({ seed: 2, skipLoad: true });
    b.unlocked = { 1: true };
    b.placePattern(1, 60, 60, 'glider');
    for (let i = 0; i < 4; i++) b.generationStep();
    const moved = [[62,61],[63,62],[61,63],[62,63],[63,63]].every(function (p) { return b.cells[p[1] * W + p[0]] === 1; });
    return { ok: !!(vertical && horizontal && moved), blinker: vertical && horizontal, glider: moved };
  };

  window.PetriGame = PetriGame;
})();
