function installDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0, acc = 0, frames = 0;

  function step(ms) {
    const wasPaused = game.paused;
    game.paused = false;
    let rest = Math.max(0, Number(ms) || 0);
    while (rest > 0) {
      const d = Math.min(rest, 1000 / 60);
      game.tick(d);
      rest -= d;
    }
    game.paused = wasPaused;
    return game.getState();
  }

  window.__game = {
    getState: () => game.getState(),
    dump: () => game.dump(),
    step,
    press: (down) => { game.press(down !== false); return game.getState(); },
    release: () => { game.release(); return game.getState(); },
    pressAt: (offsetMs) => { const r = game.pressAt(Number(offsetMs) || 0); return { judge: r, state: game.getState() }; },
    setAct: (n) => game.setAct(n),
    setDay: (n) => game.setDay(n),
    setPrep: (pct) => game.setPrep(pct),
    bossLook: (on) => game.bossLook(on),
    spawnQTE: (type) => game.spawnQTE(type),
    finishDay: () => { game.finishDay(); return game.result(); },
    result: () => game.result(),
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
      const s = game.getState();
      overlay.textContent = [
        `FPS ${fps} ${s.dayName} act=${s.act} paused=${s.paused}`,
        `prep=${s.prep}% stage=${s.prepStage} boss=${s.bossLooking} warn=${s.bossWarnMs}`,
        `clock=${s.clockMs} judge=${s.judge} offset=${s.offset}`,
        `score=${s.score} combo=${s.combo}/${s.maxCombo} run=${s.runX} speed=${s.speed}`,
        `qte=${s.qte.map((q) => q.type + ':' + q.dist + '/' + q.taps).join(',')}`,
      ].join('\n');
    },
  };
}
