// デバッグAPI（window.__game）とデバッグオーバーレイ。
// セルフレビュー時は pause() してから step(ms) で決定論的に進めること。
function installDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0, fpsAcc = 0, fpsCount = 0;

  window.__game = {
    getState: () => game.getSnapshot(),
    // プレイヤー周辺のASCIIマップ（R=プレイヤー, X=地形, ^=トゲ, o=ニンジン, C=CP, G=ゴール）
    dump: (radius) => game.dump(radius),
    // 時間をmsぶん進める。ポーズ中でも進む（検証用）
    step(ms) {
      const wasPaused = game.state === 'paused';
      if (wasPaused) game.state = 'playing';
      let rest = ms;
      while (rest > 0) {
        const d = Math.min(rest, 1000 / 60);
        game.update(d);
        rest -= d;
      }
      if (wasPaused && game.state === 'playing') game.state = 'paused';
      return game.getSnapshot();
    },
    start: () => game.start(),
    pause: () => { if (game.state === 'playing') game.togglePause(); },
    resume: () => { if (game.state === 'paused') game.togglePause(); },
    // 入力注入: hold({right:true, slide:true}) で押しっぱなし状態を設定
    hold: (keys) => Object.assign(game.ctrl, keys),
    pressJump: () => game.pressJump(),
    releaseJump: () => game.releaseJump(),
    // 状態注入
    teleport: (tx, ty) => game.teleport(tx, ty),
    setVel: (vx, vy) => game.setVel(vx, vy),
    respawnAt: (tx, ty) => { game.respawn = { x: tx * TILE, y: (ty + 1) * TILE - PHYS.standH }; },
    die: () => game.die('debug'),
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
        `FPS ${fps}  state ${s.state}`,
        `pos (${s.x}, ${s.y})  tile (${s.tile.x}, ${s.tile.y})`,
        `vel (${s.vx}, ${s.vy})  top ${s.topSpeed}`,
        `ground ${s.onGround} ${s.groundTime}ms  slide ${s.sliding}${s.slideLock ? '(lock)' : ''}`,
        `combo ${s.combo} (max ${s.maxCombo})`,
        `time ${s.time}s  deaths ${s.deaths}  carrots ${s.carrots}/${s.totalCarrots}`,
      ].join('\n');
    },
  };
}
