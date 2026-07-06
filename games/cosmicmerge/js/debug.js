function installDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0, acc = 0, frames = 0;

  function forcePlaying(fn) {
    const old = game.state;
    if (old === 'title') game.start();
    if (old === 'dead') game.state = 'playing';
    const out = fn();
    if (old === 'dead') game.state = 'dead';
    return out;
  }

  window.__game = {
    getState: () => game.getSnapshot(),
    dump: () => game.dump(),
    step: (ms = 16) => forcePlaying(() => {
      let rest = Math.max(0, Number(ms) || 0);
      while (rest > 0) {
        const d = Math.min(rest, 1000 / 60);
        game.update(d);
        rest -= d;
      }
      return game.getSnapshot();
    }),
    aim: (x) => { game.setAim(Number(x)); return game.aimX; },
    drop: () => forcePlaying(() => game.drop()),
    spawnBody: (tier, x = WORLD.w / 2, y = WORLD.top + 80) => forcePlaying(() => game.spawnBody(Number(tier), Number(x), Number(y)).id),
    setNext: (tier) => { game.forcedNext = clamp(Math.floor(Number(tier) || 0), 0, 4); return game.forcedNext; },
    clearBoard: () => game.clearBoard(),
    gameOver: () => game.gameOver(),
    start: () => game.start(),
  };

  return {
    toggle() {
      visible = !visible;
      overlay.classList.toggle('hidden', !visible);
    },
    update(dt) {
      acc += dt; frames++;
      if (acc >= 500) { fps = Math.round(frames / (acc / 1000)); acc = 0; frames = 0; }
      overlay.classList.toggle('hidden', !visible);
      if (!visible) return;
      const s = game.getSnapshot();
      overlay.textContent = [
        `FPS ${fps} state=${s.state} time=${s.time}`,
        `score=${s.score} best=${s.best} combo=${s.combo} next=${s.nextTier}`,
        `bodies=${s.bodies.length} contacts=${s.contacts} warning=${s.warning}`,
        `aim=${s.aimX} cooldown=${s.cooldown}`,
      ].join('\n');
    },
  };
}
