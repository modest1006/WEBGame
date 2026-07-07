(function () {
  'use strict';
  function installRollMazeDebug(game) {
    const el = document.getElementById('debug-overlay');
    const params = new URLSearchParams(location.search);
    let visible = params.get('debug') === '1';
    function sync() { if (el) el.classList.toggle('hidden', !visible); }
    function update() {
      if (!el || !visible) return;
      const s = game.getState();
      el.textContent = [
        'ROLL MAZE debug',
        'mode=' + s.mode + ' stage=' + s.stage + ' time=' + s.time.toFixed(2),
        'ball=(' + s.ball.x.toFixed(2) + ',' + s.ball.z.toFixed(2) + ') v=(' + s.ball.vx.toFixed(2) + ',' + s.ball.vz.toFixed(2) + ')',
        'tilt=(' + s.tilt.x.toFixed(3) + ',' + s.tilt.z.toFixed(3) + ') falls=' + s.falls,
        game.dump()
      ].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function (ms) { game.step(ms || RollMazeConstants.STEP_MS); return game.getState(); },
      tilt: function (x, z) { game.setTilt(x, z); return game.getState().tilt; },
      setBall: function (x, z) { game.setBall(x, z); return game.getState().ball; },
      setStage: function (n) { game.restartStage(n); return game.getState(); },
      win: function () { game.forceWin(); return game.getState(); },
      fall: function () { game.forceFall(); return game.getState(); },
      stars: game.stars.bind(game)
    };
    sync();
    return {
      toggle: function () { visible = !visible; sync(); update(); },
      update: update
    };
  }
  window.installRollMazeDebug = installRollMazeDebug;
})();
