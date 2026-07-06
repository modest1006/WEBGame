function installNeonDriveDebug(game) {
  const overlay = document.getElementById('debug-overlay');
  let visible = new URLSearchParams(location.search).get('debug') === '1';
  let fps = 0, acc = 0, frames = 0;

  function force(fn) {
    const old = game.state;
    if (old === 'title' || old === 'dead') game.state = 'playing';
    const out = fn();
    // fn中にdead等へ遷移した場合はそれを尊重する（無条件restoreだとゲームオーバーを握り潰す）
    if (game.state === 'playing') game.state = old;
    return out;
  }

  window.__game = {
    getState: () => game.getSnapshot(),
    start: () => { game.start(); return game.getSnapshot(); },
    dump: () => game.dump(),
    step: (ms = 16) => {
      let rest = Math.max(0, Number(ms) || 0);
      return force(() => {
        while (rest > 0) {
          const d = Math.min(rest, 1000 / 60);
          game.update(d, true);
          rest -= d;
        }
        return game.getSnapshot();
      });
    },
    setSpeed: (v) => { game.setSpeed(v); return game.getSnapshot(); },
    setX: (x) => { game.setX(x); return game.getSnapshot(); },
    setTime: (s) => { game.setTime(s); return game.getSnapshot(); },
    addScore: (n) => { game.addScore(n); return game.getSnapshot(); },
    teleport: (dist) => { game.teleport(dist); return game.getSnapshot(); },
    steer: (x) => { game.setSteer(x); return game.getSnapshot(); },
    brake: (on) => { game.setBrake(on); return game.getSnapshot(); },
    boost: () => { game.requestBoost(); return game.getSnapshot(); },
    spawnCar: (lane = 1, distAhead = 35) => force(() => game.spawnCar(lane, distAhead)),
    crash: () => { game.crash(); return game.getSnapshot(); },
  };

  return {
    toggle() {
      visible = !visible;
      overlay.classList.toggle('hidden', !visible);
    },
    update(dt) {
      acc += dt; frames++;
      if (acc >= 500) { fps = Math.round(frames / (acc / 1000)); frames = 0; acc = 0; }
      overlay.classList.toggle('hidden', !visible);
      if (!visible) return;
      const s = game.getSnapshot();
      overlay.textContent = [
        `FPS ${fps} state=${s.state} speed=${s.speed}km/h dist=${s.distance}m`,
        `time=${s.remaining}s score=${s.score} boost=${s.boost} combo=${s.combo}`,
        `x=${s.playerX} curve=${s.curve} cars=${s.cars.length} crashes=${s.crashes}`,
        `segments=${game.segments.length} draw=${ND.road.drawDistance}`,
      ].join('\n');
    },
  };
}
