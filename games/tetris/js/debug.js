// デバッグAPI（window.__game）とデバッグオーバーレイ。
// セルフレビュー時は __game.pause() してから step(ms) で決定論的に進めること。
function installDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0;
  let fpsAcc = 0;
  let fpsCount = 0;

  // ポーズ中でも操作系APIが効くように一時的にplayingへ切り替える
  const whilePlaying = (fn) => {
    const wasPaused = game.state === 'paused';
    if (wasPaused) game.state = 'playing';
    const result = fn();
    if (wasPaused && game.state === 'playing') game.state = 'paused';
    return result;
  };

  window.__game = {
    // 状態スナップショット（シリアライズ可能）
    getState: () => game.getSnapshot(),
    // 盤面ASCIIダンプ（'----'より上がスポーン領域、小文字=操作中ピース）
    dump: () => game.dump(),
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
    move: (dx) => whilePlaying(() => game.move(dx)),
    rotate: (dir = 1) => whilePlaying(() => game.rotate(dir)),
    softDrop: (on) => { game.softDropping = on; },
    hardDrop: () => whilePlaying(() => game.hardDrop()),
    hold: () => whilePlaying(() => game.hold()),
    // 状態注入
    setRow: (y, str) => game.setRow(y, str),
    fillBottomRows: (n, holeCol = 0) => game.fillBottomRows(n, holeCol),
    clearBoard: () => game.clearBoard(),
    setCurrent: (type) => game.setCurrent(type),
    setLevel: (n) => { game.level = n; },
    setQueue: (types) => { game.queue = [...types]; },
  };

  return {
    toggle() {
      visible = !visible;
      overlay.classList.toggle('hidden', !visible);
    },
    update(dt) {
      fpsAcc += dt;
      fpsCount++;
      if (fpsAcc >= 500) {
        fps = Math.round(fpsCount / (fpsAcc / 1000));
        fpsAcc = 0;
        fpsCount = 0;
      }
      overlay.classList.toggle('hidden', !visible);
      if (!visible) return;
      const s = game.getSnapshot();
      overlay.textContent = [
        `FPS ${fps}`,
        `state ${s.state}`,
        `score ${s.score}  lines ${s.lines}  lv ${s.level}`,
        `combo ${s.combo}  b2b ${s.b2b}`,
        `piece ${s.current ? `${s.current.type} r${s.current.rot} (${s.current.x},${s.current.y})` : '-'}`,
        `hold ${s.hold ?? '-'}  next ${s.next.join('')}`,
        `seed ${s.seed}`,
      ].join('\n');
    },
  };
}
