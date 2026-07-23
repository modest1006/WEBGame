(function () {
  'use strict';

  const DEX_KEY = 'ghostlens-dex';
  const TITLE_KEY = 'ghostlens-title';
  const TYPES = ['drifter','crawler','doll','mirror','gold'];
  const QUALITY_RANK = { HIT:1, GOOD:2, PERFECT:3 };
  const TITLES = [
    { min:0, max:999, name:'見習い霊能写真家' },
    { min:1000, max:2499, name:'夜歩きの記者' },
    { min:2500, max:4999, name:'心霊写真師' },
    { min:5000, max:7999, name:'怪異蒐集家' },
    { min:8000, max:Infinity, name:'冥府の目撃者' }
  ];
  const META = {
    drifter:{
      name:'浮遊霊',
      flavor:'月明かりの差す夜だけ、白い影が寝台を巡る。\nその顔を見た者は、翌朝から自分の影を失うという。'
    },
    crawler:{
      name:'這い寄り',
      flavor:'床下より四肢を折る音がする晩は、決して灯を消してはならぬ。\n朝には必ず、畳に黒い手形が増えている。'
    },
    doll:{
      name:'囁き人形',
      flavor:'夜ごと位置が変わると当主の日記にある。\n誰も動かしていない、と使用人は泣いた。'
    },
    mirror:{
      name:'鏡の淑女',
      flavor:'鏡にだけ喪服の女が立つ。振り返っても、そこには誰もいない。\n三度目に目が合えば、鏡の側へ連れてゆかれる。'
    },
    gold:{
      name:'金色の残光',
      flavor:'亡者が成仏する刹那、まれに金の光を残すという。\n拾おうと手を伸ばせば、遠い鐘の音だけが指をすり抜ける。'
    }
  };

  function blankEntry() {
    return { count:0, bestQuality:null, bestScore:0, bestPhoto:null };
  }
  function blankDex() {
    const entries = {};
    for (let i=0;i<TYPES.length;i++) entries[TYPES[i]] = blankEntry();
    return { version:1, entries:entries };
  }
  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }
  function normalizeDex(raw) {
    const next = blankDex();
    if (!raw || typeof raw !== 'object' || !raw.entries || typeof raw.entries !== 'object') return next;
    for (let i=0;i<TYPES.length;i++) {
      const type = TYPES[i];
      const source = raw.entries[type];
      if (!source || typeof source !== 'object') continue;
      next.entries[type] = {
        count:safeNumber(source.count),
        bestQuality:QUALITY_RANK[source.bestQuality] ? source.bestQuality : null,
        bestScore:safeNumber(source.bestScore),
        bestPhoto:typeof source.bestPhoto === 'string' && source.bestPhoto.indexOf('data:image/') === 0 ? source.bestPhoto : null
      };
    }
    return next;
  }
  function titleForScore(score) {
    const value = safeNumber(score);
    for (let i=TITLES.length-1;i>=0;i--) if (value >= TITLES[i].min) return { level:i, name:TITLES[i].name, score:value };
    return { level:0, name:TITLES[0].name, score:value };
  }

  function GhostLensProgression(storage) {
    this.storage = storage || null;
    this.dex = blankDex();
    this.bestTitle = { level:-1, name:'未鑑定' };
    this.load();
  }

  GhostLensProgression.prototype.read = function (key) {
    if (!this.storage || typeof this.storage.getItem !== 'function') return null;
    try { return this.storage.getItem(key); }
    catch (error) { return null; }
  };
  GhostLensProgression.prototype.write = function (key, value) {
    if (!this.storage || typeof this.storage.setItem !== 'function') return false;
    try { this.storage.setItem(key, value); return true; }
    catch (error) { return false; }
  };
  GhostLensProgression.prototype.load = function () {
    const dexText = this.read(DEX_KEY);
    if (dexText) {
      try { this.dex = normalizeDex(JSON.parse(dexText)); }
      catch (error) { this.dex = blankDex(); this.write(DEX_KEY, JSON.stringify(this.dex)); }
    }
    const titleText = this.read(TITLE_KEY);
    if (titleText) {
      try {
        const parsed = JSON.parse(titleText);
        const level = Math.max(-1, Math.min(TITLES.length-1, Math.floor(Number(parsed.level))));
        if (Number.isFinite(level) && level >= 0) this.bestTitle = { level:level, name:TITLES[level].name };
      } catch (error) {
        this.bestTitle = { level:-1, name:'未鑑定' };
        this.write(TITLE_KEY, JSON.stringify(this.bestTitle));
      }
    }
    return this.getState();
  };
  GhostLensProgression.prototype.saveDex = function () {
    return this.write(DEX_KEY, JSON.stringify(this.dex));
  };
  GhostLensProgression.prototype.recordCapture = function (capture, photo) {
    if (!capture || TYPES.indexOf(capture.type) < 0) return false;
    const entry = this.dex.entries[capture.type];
    entry.count++;
    const quality = QUALITY_RANK[capture.quality] ? capture.quality : 'HIT';
    if (!entry.bestQuality || QUALITY_RANK[quality] > QUALITY_RANK[entry.bestQuality]) entry.bestQuality = quality;
    const score = safeNumber(capture.score);
    const dataUrl = photo && typeof photo.dataUrl === 'string' ? photo.dataUrl : null;
    if (dataUrl && (!entry.bestPhoto || score > entry.bestScore)) {
      entry.bestScore = score;
      entry.bestPhoto = dataUrl;
    }
    this.saveDex();
    return copy(entry);
  };
  GhostLensProgression.prototype.recordResult = function (score) {
    const title = titleForScore(score);
    const promoted = title.level > this.bestTitle.level;
    if (promoted) {
      this.bestTitle = { level:title.level, name:title.name };
      this.write(TITLE_KEY, JSON.stringify(this.bestTitle));
    }
    return { title:title.name, level:title.level, promoted:promoted, bestTitle:this.bestTitle.name };
  };
  GhostLensProgression.prototype.isComplete = function () {
    for (let i=0;i<TYPES.length;i++) if (this.dex.entries[TYPES[i]].count <= 0) return false;
    return true;
  };
  GhostLensProgression.prototype.getState = function () {
    const entries = [];
    for (let i=0;i<TYPES.length;i++) {
      const type = TYPES[i];
      const entry = this.dex.entries[type];
      entries.push({
        type:type,
        name:META[type].name,
        flavor:META[type].flavor,
        count:entry.count,
        discovered:entry.count > 0,
        bestQuality:entry.bestQuality,
        bestScore:entry.bestScore,
        bestPhoto:entry.bestPhoto
      });
    }
    return {
      entries:entries,
      discovered:entries.filter(function (entry) { return entry.discovered; }).length,
      total:TYPES.length,
      complete:this.isComplete(),
      bestTitle:{ level:this.bestTitle.level, name:this.bestTitle.name }
    };
  };
  GhostLensProgression.prototype.reset = function () {
    this.dex = blankDex();
    this.bestTitle = { level:-1, name:'未鑑定' };
    this.saveDex();
    this.write(TITLE_KEY, JSON.stringify(this.bestTitle));
    return this.getState();
  };

  GhostLensProgression.titleForScore = titleForScore;
  GhostLensProgression.types = TYPES.slice();
  GhostLensProgression.titles = copy(TITLES.map(function (title) { return { min:title.min, max:title.max, name:title.name }; }));
  window.GhostLensProgression = GhostLensProgression;
})();
