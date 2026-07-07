(function () {
  'use strict';
  function installHellbreakDebug(game, renderer) {
    const el = document.getElementById('debug-overlay');
    const params = new URLSearchParams(location.search);
    let visible = params.get('debug') === '1', fps = 0, last = performance.now(), frames = 0;
    function sync() { if (el) el.classList.toggle('hidden', !visible); }
    function update() {
      frames++; const now = performance.now(); if (now - last > 500) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
      if (!el || !visible) return; const s = game.getState();
      el.textContent = ['HELLBREAK debug', 'fps=' + fps.toFixed(1) + ' calls=' + renderer.drawCalls + ' mode=' + s.mode + ' level=' + s.level, 'hp=' + s.hp + ' armor=' + s.armor + ' weapon=' + s.weapon + ' bullet=' + s.ammo.bullet + ' shell=' + s.ammo.shell, 'pos=(' + s.position.x.toFixed(2) + ',' + s.position.z.toFixed(2) + ') yaw=' + s.position.yaw.toFixed(2) + ' enemies=' + s.enemies.length, 'validation=' + s.validation.map(function(v){return v.level + ':' + (v.ok?'ok':'fail') + '(' + v.states + ')';}).join(' '), game.dump()].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function (ms) {
        // 固定刻みに分割して決定論的に進める（巨大tick1回だと物理・連射が破綻する）
        let rest = Math.max(0, Number(ms) || HellbreakConstants.STEP_MS);
        while (rest > 0) {
          const d = Math.min(rest, HellbreakConstants.STEP_MS);
          game.step(d);
          rest -= d;
        }
        return game.getState();
      },
      teleport: function (x,z) { game.teleport(x,z); return game.getState(); },
      turn: function (deg) { game.turn(deg); return game.getState().position; },
      fire: function (on) { game.setFire(on); return game.getState(); },
      move: function (x,z) { game.setMove(x,z); return game.getState(); },
      spawn: function (type, dist) { return game.spawn(type, dist); },
      killAll: function () { game.killAll(); return game.getState(); },
      god: function () { return game.god(); },
      give: function (what) { game.give(what); return game.getState(); },
      setLevel: function (n) { game.setLevel(n); return game.getState(); },
      openAllDoors: function () { game.openAllDoors(); return game.getState(); },
      validate: function () { return game.validation; }
    };
    sync();
    return { toggle: function () { visible = !visible; sync(); update(); }, update: update };
  }
  window.installHellbreakDebug = installHellbreakDebug;
})();
