// デバッグAPI（window.__game）とデバッグオーバーレイ。
// セルフレビュー時は pause() してから step(ms) で決定論的に進めること。
function installDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0, fpsAcc = 0, fpsCount = 0;

  const stepWhilePlaying = (ms) => {
    const wasPaused = game.state === 'paused';
    if (wasPaused) game.state = 'playing';
    let rest = ms;
    // levelup中もビートクロックが進むので step 可能にする
    while (rest > 0 && (game.state === 'playing' || game.state === 'levelup' || game.state === 'dying')) {
      const d = Math.min(rest, 1000 / 60);
      game.update(d);
      rest -= d;
    }
    if (wasPaused && game.state === 'playing') game.state = 'paused';
    return game.getSnapshot();
  };

  window.__game = {
    getState: () => game.getSnapshot(),
    dump: () => game.dump(),
    // 時間をmsぶん進める（ポーズ中でも可。levelup中は進まない→pick(i)で選択）
    step: stepWhilePlaying,
    // 次のビート境界の指定オフセット(ms)まで進める（ダッシュ判定テスト用）
    stepToBeatOffset(offsetMs = 0) {
      const target = Math.ceil(game.beat + 0.3); // 次のビート

      const targetTime = game.timeForBeat ? game.timeForBeat(target, offsetMs) : (target * BEAT_MS + offsetMs) / 1000;
      const ms = (targetTime - game.time) * 1000;
      return stepWhilePlaying(Math.max(0, ms));
    },
    start: (mode) => game.start(mode),
    setMode: (mode) => game.setMode(mode),
    pause: () => game.pause(),
    resume: () => game.resume(),
    hold: (mx, my) => { game.ctrl.mx = mx; game.ctrl.my = my; },
    dash: () => {
      const wasPaused = game.state === 'paused';
      if (wasPaused) game.state = 'playing';
      const judge = game.dash();
      if (wasPaused && game.state === 'playing') game.state = 'paused';
      return judge;
    },
    // 状態注入
    spawn: (type, n = 1, dist = 300) => {
      for (let i = 0; i < n; i++) game.spawnAround(type, dist);
      return game.enemies.length;
    },
    killAll: () => { for (const e of [...game.enemies]) game.killEnemy(e); },
    addXp: (n) => {
      const wasPaused = game.state === 'paused';
      if (wasPaused) game.state = 'playing';
      game.addXp(n);
      if (wasPaused && game.state === 'playing') game.state = 'paused';
      return game.state;
    },
    choices: () => game.choices.map((c, i) => `${i}: ${c.name} Lv${c.lv}`),
    pick: (i) => game.pick(i),
    setGroove: (n) => { game.setGrooveValue(Number(n) || 0, 'debug'); game.lastPerfectBeat = game.beat; },
    setHp: (n) => { game.p.hp = n; },
    teleport: (x, y) => { game.p.x = x; game.p.y = y; },
    giveChips: (n) => {
      const save = updateBeatSurvivorSave((s) => {
        s.meta = normalizeMeta(s.meta);
        s.meta.chips = Math.max(0, s.meta.chips + Math.floor(Number(n) || 0));
      });
      game.save = save; game.meta = normalizeMeta(save.meta);
      return game.meta.chips;
    },
    buyGear: (id) => {
      const save = updateBeatSurvivorSave((s) => {
        s.meta = normalizeMeta(s.meta);
        const lv = gearLevel(s.meta, id);
        const cost = gearCost(id, lv + 1);
        if (lv >= 3 || s.meta.chips < cost) return;
        s.meta.chips -= cost;
        s.meta.gear[id] = lv + 1;
        if (isRackComplete(s.meta) && !s.meta.achievements.includes('rack_complete')) s.meta.achievements.push('rack_complete');
      });
      game.save = save; game.meta = normalizeMeta(save.meta);
      return { chips: game.meta.chips, level: gearLevel(game.meta, id) };
    },
    unlockAll: () => {
      const save = updateBeatSurvivorSave((s) => {
        s.meta = normalizeMeta(s.meta);
        for (const g of META_GEAR) s.meta.gear[g.id] = 3;
        s.meta.achievements = ACHIEVEMENTS.map((a) => a.id);
      });
      game.save = save; game.meta = normalizeMeta(save.meta);
      return game.meta;
    },
    benchSeparation(iter = 200) {
      const saved = game.enemies.map((e) => ({ ...e }));
      const fill = () => {
        game.enemies = [];
        for (let i = 0; i < ENEMY_CAP; i++) {
          const a = i * 2.399963;
          const r = 120 + (i % 97) / 97 * 1120;
          const e = game.spawnEnemy(i % 8 === 0 ? 'tank' : 'chaser', Math.cos(a) * r, Math.sin(a) * r);
          if (e) { e.kbx = 0; e.kby = 0; }
        }
      };
      fill();
      const t0 = performance.now();
      for (let i = 0; i < iter; i++) game.separateEnemiesBruteForce();
      const bruteMs = (performance.now() - t0) / iter;
      fill();
      const t1 = performance.now();
      for (let i = 0; i < iter; i++) game.separateEnemiesGrid();
      const gridMs = (performance.now() - t1) / iter;
      game.enemies = saved;
      return { enemies: ENEMY_CAP, iter, bruteMs, gridMs };
    },
  };

  return {
    toggle() {
      visible = !visible;
      overlay.classList.toggle('hidden', !visible);
    },
    update(dt) {
      fpsAcc += dt; fpsCount++;
      if (fpsAcc >= 500) {
        fps = Math.round(fpsCount / (fpsAcc / 1000));
        fpsAcc = 0; fpsCount = 0;
      }
      overlay.classList.toggle('hidden', !visible);
      if (!visible) return;
      const s = game.getSnapshot();
      overlay.textContent = [
        `FPS ${fps}  state ${s.state}  t ${s.time}s`,
        `beat ${s.beat} audio ${s.audioBeat} (offset ${s.beatOffsetMs}ms) scale ${s.timeScale}`,
        `timers ${JSON.stringify(s.timers)}`,
        `hp ${s.hp}/${s.maxHp}  lv ${s.level}  xp ${s.xp}/${s.xpNext}`,
        `groove ${s.groove} x${s.grooveMult}  P${s.stats.perfect}/G${s.stats.good}/M${s.stats.miss}`,
        `enemies ${s.enemies}  bullets ${s.bullets}  gems ${s.gems}  kills ${s.kills}`,
        `weapons ${JSON.stringify(s.weapons)}`,
        s.boss ? `boss hp ${s.boss.hp}` : '',
      ].filter(Boolean).join('\n');
    },
  };
}
