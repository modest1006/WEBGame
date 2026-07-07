(function () {
  'use strict';
  function installOneManDebug(game, renderer) {
    const el = document.getElementById('debug-overlay');
    const params = new URLSearchParams(location.search);
    let visible = params.get('debug') === '1';
    let fps = 0, frames = 0, last = performance.now();
    function sync() { if (el) el.classList.toggle('hidden', !visible); }
    function update() {
      frames++;
      const now = performance.now();
      if (now - last > 500) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
      if (!el || !visible) return;
      const s = game.getState();
      el.textContent = [
        'ONE-MAN debug fps=' + fps.toFixed(1) + ' calls=' + renderer.drawCalls,
        'phase=' + s.phase + ' shot=' + s.shot + ' dist=' + s.dist.toFixed(2) + ' v=' + s.kmh.toFixed(1) + ' notch=' + s.notchName,
        'target=' + s.targetBrake.toFixed(3) + ' eff=' + s.effectiveBrake.toFixed(3) + ' grade=' + s.gradePermille.toFixed(1) + ' moves=' + s.moves,
        game.dump()
      ].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function (ms) { return game.step(ms); },
      brake: function (n) { game.brake(n); return game.getState(); },
      setSpeed: game.setSpeed.bind(game),
      setDist: game.setDist.bind(game),
      skipTo: game.skipTo.bind(game),
      finishStation: game.finishStation.bind(game),
      result: game.resultSummary.bind(game),
      validate: game.validate.bind(game),
      simulatePattern: game.simulatePattern.bind(game),
      constantDistribution: game.constantDistribution.bind(game)
    };
    sync();
    return { toggle: function () { visible = !visible; sync(); update(); }, update: update };
  }
  window.installOneManDebug = installOneManDebug;
})();
