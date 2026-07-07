(function () {
  'use strict';

  function installPetriDebug(game, renderer) {
    const el = document.getElementById('debug-overlay');
    const params = new URLSearchParams(location.search);
    let visible = params.get('debug') === '1';
    function sync() { if (el) el.classList.toggle('hidden', !visible); }
    function update() {
      if (!el || !visible) return;
      const s = game.getState();
      el.textContent = [
        'PETRI debug',
        'gen=' + s.generation + ' pop=' + s.population + ' spores=' + s.spores + ' gauge=' + s.gauge + ' nextSpore=' + s.nextNaturalGeneration,
        'species=' + s.populationBySpecies.join(',') + ' codex=' + s.codexCount + '/' + s.codexTotal,
        'perf=' + s.perf.gps.toFixed(0) + ' gen/s',
        game.dump()
      ].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      step: function (ms) { game.step(ms || 125); game.save(); return game.getState(); },
      advance: function (gens) { for (let i = 0; i < (gens || 1); i++) game.generationStep(); game.save(); return game.getState(); },
      place: function (speciesId, x, y, pattern) { game.placePattern(speciesId || game.selectedSpecies, x || 70, y || 70, pattern || 'glider'); game.save(); return game.getState(); },
      soup: function (speciesId, x, y) { game.scatter(x || 70, y || 70, speciesId || game.selectedSpecies, 13, game.densityForSpecies(speciesId || game.selectedSpecies)); game.save(); return game.getState(); },
      addPoints: function (n) { game.addPoints(n); game.save(); return game.getState(); },
      unlock: function (id) { game.addPoints(PetriGame.SPECIES[id] ? PetriGame.SPECIES[id].cost : 0); game.unlock(id); game.save(); return game.getState(); },
      detectNow: function () { return game.detectPatterns(0); },
      offlineSim: function (minutes) { const r = game.offlineSim(minutes || 60); game.save(); return r; },
      resetDish: function () { game.resetDish(); return game.getState(); },
      dump: game.dump.bind(game),
      validate: game.validate.bind(game)
    };
    window.__renderOnce = function (dt) {
      renderer.render(game, dt || 16.7);
      update();
      return document.getElementById('view').toDataURL('image/png').length;
    };
    sync();
    return { toggle: function () { visible = !visible; sync(); update(); }, update: update };
  }

  window.installPetriDebug = installPetriDebug;
})();
