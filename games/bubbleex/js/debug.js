(function () {
  'use strict';

  function installBubbleExDebug(game) {
    var el = document.getElementById('debug-overlay');
    var params = new URLSearchParams(location.search);
    var visible = params.get('debug') === '1';
    function sync() { if (el) el.classList.toggle('hidden', !visible); }
    function update() {
      if (!el || !visible) return;
      var s = game.getState();
      el.textContent = [
        'BUBBLE BLASTER EX debug',
        'status=' + s.status + ' stage=' + s.stage + ' score=' + s.score + ' best=' + s.best,
        'current=' + s.current + ' next=' + s.next + ' aim=' + s.aimDeg.toFixed(1),
        'shotsUntilCeiling=' + s.shotsUntilCeiling + '/' + s.shotsToNextDrop + ' cells=' + s.cellCount + ' combo=' + s.comboMult,
        game.dump()
      ].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function (ms) { game.step(ms || window.BubbleExConstants.STEP_MS); return game.getState(); },
      aim: function (deg) { return game.aim(deg); },
      fire: function () { return game.fire(); },
      setBubble: function (color) { return game.setBubble(color); },
      setStage: function (n) { return game.setStage(n); },
      clearBoard: function () { return game.clearBoard(); },
      win: function () { return game.win(); },
      lose: function () { return game.lose(); },
      shootAt: function (row, col) { return game.shootAt(row, col); },
      validate: function () { return game.validate(); },
      restart: function () { game.restart(); return game.getState(); },
      togglePause: function () { game.togglePause(); return game.getState(); }
    };
    sync();
    return {
      toggle: function () { visible = !visible; sync(); update(); },
      update: update
    };
  }

  window.installBubbleExDebug = installBubbleExDebug;
})();
