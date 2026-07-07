(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed') || '0', 10) || 0;
  const game = new PetriGame({ seed: seed, skipLoad: params.has('seed') });
  const renderer = new PetriRenderer($('view'));
  const audio = new PetriAudio();
  const debug = installPetriDebug(game, renderer);
  let lastSave = 0;
  let lastHud = 0;

  const els = {
    gen: $('gen'), pop: $('pop'), spores: $('spores'), gauge: $('gauge'), codex: $('codex'),
    species: $('species-list'), codexList: $('codex-list'), speed: $('speed-btn'), pause: $('pause-btn'),
    mute: $('mute-btn'), share: $('share'), modal: $('modal'), modalTitle: $('modal-title'), modalText: $('modal-text'),
    ticker: $('ticker')
  };
  let tickerTimer = 0;

  function setTool(tool) {
    game.tool = tool;
    document.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === tool); });
  }

  function selectSpecies(id) {
    game.selectedSpecies = id;
    syncSpecies();
  }

  function syncSpecies() {
    els.species.innerHTML = '';
    PetriGame.SPECIES.slice(1).forEach(function (sp) {
      const open = !!game.unlocked[sp.id];
      const btn = document.createElement('button');
      btn.className = 'species' + (game.selectedSpecies === sp.id ? ' active' : '') + (!open ? ' locked' : '');
      btn.type = 'button';
      btn.innerHTML = '<i style="background:' + sp.color + '"></i><span><b>' + sp.name + '</b><small>' + sp.rule + (open ? '' : ' / ' + sp.cost + '胞子') + '</small></span>';
      btn.addEventListener('click', function () {
        audio.unlock();
        if (open) selectSpecies(sp.id);
        else if (game.unlock(sp.id)) selectSpecies(sp.id);
        game.save();
        syncAll();
      });
      els.species.appendChild(btn);
    });
  }

  function syncCodex() {
    const entries = Object.keys(game.codex).map(function (k) { return game.codex[k]; }).sort(function (a, b) { return b.generation - a.generation; });
    els.codexList.innerHTML = entries.slice(0, 18).map(function (e) {
      return '<li><b>' + e.name + '</b><small>' + e.generation + '世代</small></li>';
    }).join('') || '<li><b>未発見</b><small>シャーレを育ててください</small></li>';
  }

  function syncShare(s) {
    const total = Math.max(1, s.population);
    let acc = 0;
    const stops = [];
    PetriGame.SPECIES.slice(1).forEach(function (sp) {
      const n = s.populationBySpecies[sp.id] || 0;
      if (n > 0) stops.push(sp.color + ' ' + (acc / total * 100).toFixed(2) + '% ' + ((acc + n) / total * 100).toFixed(2) + '%');
      acc += n;
    });
    els.share.style.background = stops.length ? ('conic-gradient(' + stops.join(',') + ')') : '#d5c892';
  }

  function syncAll() {
    const s = game.getState();
    els.gen.textContent = String(s.generation);
    els.pop.textContent = String(s.population);
    els.spores.textContent = String(s.spores);
    els.gauge.style.width = s.gauge + '%';
    els.codex.textContent = s.codexCount + ' / ' + s.codexTotal;
    els.speed.textContent = game.speed === 2 ? '倍速' : '通常';
    els.pause.textContent = game.paused ? '再開' : '一時停止';
    els.mute.textContent = audio.muted ? '消音中' : '音あり';
    syncShare(s);
    syncSpecies();
    syncCodex();
  }

  function showModal(title, text) {
    els.modalTitle.textContent = title;
    els.modalText.innerHTML = text;
    els.modal.classList.remove('hidden');
  }

  function showTicker(text) {
    els.ticker.textContent = text;
    els.ticker.classList.add('show');
    clearTimeout(tickerTimer);
    tickerTimer = setTimeout(function () { els.ticker.classList.remove('show'); }, 2400);
  }

  game.on(function (type, data) {
    renderer.handleEvent(type, data);
    audio.event(type, data);
    if (type === 'discover') syncCodex();
    if (type === 'spore') showTicker(data.reason === 'low' ? '浮遊胞子が救援に舞い込みました' : '浮遊胞子が舞い込みました');
  });

  const actions = {
    anyInput: function () { audio.unlock(); },
    sync: syncAll,
    mute: function () { audio.unlock(); audio.toggleMute(); syncAll(); },
    pause: function () { game.paused = !game.paused; syncAll(); },
    tool: setTool
  };
  new PetriInput($('view'), renderer, game, actions);

  document.querySelectorAll('[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () { audio.unlock(); setTool(b.dataset.tool); });
  });
  $('speed-btn').addEventListener('click', function () { game.speed = game.speed === 2 ? 1 : 2; syncAll(); });
  $('pause-btn').addEventListener('click', actions.pause);
  $('mute-btn').addEventListener('click', actions.mute);
  $('reset-btn').addEventListener('click', function () {
    if (confirm('培地を全消ししますか?')) { game.resetDish(); syncAll(); }
  });
  $('modal-close').addEventListener('click', function () { els.modal.classList.add('hidden'); });
  $('debug-btn').addEventListener('click', function () { debug.toggle(); });
  window.addEventListener('resize', function () { try { renderer.resize(); } catch (err) { console.error('[resize]', err); } });
  window.addEventListener('beforeunload', function () { game.save(); });

  const validation = game.validate();
  if (!validation.ok) console.error('[validate]', validation);

  const elapsedMinutes = Math.max(0, (Date.now() - game.lastSavedAt) / 60000);
  if (elapsedMinutes > 1) {
    const report = game.offlineSim(elapsedMinutes);
    showModal('るす中レポート', report.generations + '世代経過<br>最大人口 ' + report.maxPopulation + '<br>新種 ' + report.newDiscoveries + '種発見');
  }

  if (params.get('autotest') === 'six' || params.get('autotest') === 'nutrient') {
    game.addPoints(10000);
    for (let s = 1; s <= 6; s++) game.unlock(s);
    game.resetDish();
    [[46,46],[72,36],[98,48],[48,94],[74,104],[102,91]].forEach(function (p, i) {
      game.scatter(p[0], p[1], i + 1, 13, game.densityForSpecies(i + 1));
    });
    const gens = params.get('autotest') === 'nutrient' ? 360 : 40;
    for (let g = 0; g < gens; g++) game.generationStep();
  }

  function setupBenchState() {
    game.addPoints(10000);
    for (let s = 1; s <= 6; s++) game.unlock(s);
    game.resetDish();
    [[46,46],[72,36],[98,48],[48,94],[74,104],[102,91]].forEach(function (p, i) {
      game.scatter(p[0], p[1], i + 1, 13, game.densityForSpecies(i + 1));
    });
    for (let g = 0; g < 480; g++) game.generationStep();
  }

  syncAll();
  if (params.get('bench') === '1') {
    setupBenchState();
    syncAll();
    renderer.render(game, 16);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) renderer.render(game, 16);
    const avg = (performance.now() - t0) / 100;
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) {
      if (i % 8 === 0) game.generationStep();
      renderer.render(game, 16);
    }
    const activeAvg = (performance.now() - t1) / 100;
    const pre = document.createElement('pre');
    pre.id = 'bench-result';
    pre.textContent = JSON.stringify({ renderAvgMs: avg, activeAvgMs: activeAvg, frames: 100, population: game.population, generation: game.generation });
    document.body.appendChild(pre);
    const img = new Image();
    img.src = 'bench-result?data=' + encodeURIComponent(pre.textContent);
  }
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(120, now - last);
      last = now;
      game.step(dt);
      audio.update();
      renderer.render(game, dt);
      debug.update();
      if (now - lastHud > 350) { syncAll(); lastHud = now; }
      if (now - lastSave > 8000) { game.save(); lastSave = now; }
    } catch (err) {
      console.error('[frame]', err);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
