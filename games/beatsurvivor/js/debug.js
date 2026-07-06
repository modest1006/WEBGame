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
    while (rest > 0 && game.state === 'playing') {
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
      const targetTime = (target * BEAT_MS + offsetMs) / 1000;
      const ms = (targetTime - game.time) * 1000;
      return stepWhilePlaying(Math.max(0, ms));
    },
    start: () => game.start(),
    pause: () => { if (game.state === 'playing') game.togglePause(); },
    resume: () => { if (game.state === 'paused') game.togglePause(); },
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
    setGroove: (n) => { game.groove = n; game.lastPerfectBeat = game.beat; },
    setHp: (n) => { game.p.hp = n; },
    teleport: (x, y) => { game.p.x = x; game.p.y = y; },
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
        `beat ${s.beat} (offset ${s.beatOffsetMs}ms)`,
        `hp ${s.hp}/${s.maxHp}  lv ${s.level}  xp ${s.xp}/${s.xpNext}`,
        `groove ${s.groove} x${s.grooveMult}  P${s.stats.perfect}/G${s.stats.good}/M${s.stats.miss}`,
        `enemies ${s.enemies}  bullets ${s.bullets}  gems ${s.gems}  kills ${s.kills}`,
        `weapons ${JSON.stringify(s.weapons)}`,
        s.boss ? `boss hp ${s.boss.hp}` : '',
      ].filter(Boolean).join('\n');
    },
  };
}
