(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed') || '0', 10) || 0;
  const game = new RollMazeGame({ seed: seed });
  const renderer = new RollMazeRenderer(document.getElementById('view'));
  const audio = new RollMazeAudio();
  const debug = installRollMazeDebug(game);
  const $ = function (id) { return document.getElementById(id); };
  const overlay = $('overlay');
  const stageList = $('stage-list');
  const muteBtn = $('mute-btn');

  function fmt(ms) {
    const s = ms / 1000;
    return s.toFixed(2) + 's';
  }
  function syncStageList() {
    stageList.innerHTML = '';
    RollMazeConstants.STAGES.forEach(function (st) {
      const rec = game.records[String(st.id)];
      const btn = document.createElement('button');
      btn.className = 'stage-card';
      btn.disabled = st.id > game.unlocked;
      btn.innerHTML = '<b>' + st.id + '</b><span>' + st.name + '</span><small>' + (rec ? ('BEST ' + fmt(rec.bestMs) + ' / ' + '***'.slice(0, rec.stars)) : (st.id <= game.unlocked ? 'OPEN' : 'LOCKED')) + '</small>';
      btn.addEventListener('click', function () { audio.unlock(); game.selectStage(st.id); syncOverlay(); });
      stageList.appendChild(btn);
    });
  }
  function showOverlay(title, sub, result) {
    $('overlay-title').textContent = title;
    $('overlay-sub').textContent = sub;
    $('result-line').textContent = result || '';
    overlay.classList.remove('hidden');
  }
  function syncOverlay() {
    syncStageList();
    if (game.mode === 'select') showOverlay('ROLL MAZE', 'ステージを選択してください', '');
    else if (game.paused) showOverlay('PAUSE', 'P / Esc で再開', '');
    else if (game.mode === 'result') {
      const s = game.getState();
      const rec = game.records[String(s.stage)] || {};
      showOverlay('STAGE CLEAR', 'Next で次のステージへ', 'TIME ' + fmt(s.timeMs) + ' / STARS ' + '***'.slice(0, rec.stars || 1) + ' / FALLS ' + s.falls);
    } else overlay.classList.add('hidden');
  }
  function syncHud() {
    const s = game.getState();
    $('hud-stage').textContent = s.stage + ' / 8';
    $('hud-name').textContent = s.stageName;
    $('hud-time').textContent = fmt(s.timeMs);
    $('hud-par').textContent = s.par + 's';
    $('hud-falls').textContent = String(s.falls);
    $('tilt-dot').style.transform = 'translate(' + (s.tilt.z / RollMazeConstants.MAX_TILT * 28) + 'px,' + (s.tilt.x / RollMazeConstants.MAX_TILT * 28) + 'px)';
    muteBtn.textContent = audio.muted ? 'MUTED' : 'SOUND';
  }

  game.on(function (type, data) {
    renderer.handleEvent(type, data, game);
    audio.event(type, data);
    if (type === 'goal' || type === 'stage' || type === 'mode') syncOverlay();
  });

  const actions = {
    anyInput: function () { audio.unlock(); },
    restart: function () { audio.unlock(); game.restart(); syncOverlay(); },
    mute: function () { audio.unlock(); audio.toggleMute(); syncHud(); },
    pause: function () { if (game.mode !== 'select' && game.mode !== 'result') game.paused = !game.paused; syncOverlay(); },
    debug: function () { debug.toggle(); }
  };
  const input = new RollMazeInput(game, actions, $('view'));
  $('play-btn').addEventListener('click', function () { audio.unlock(); if (game.mode === 'select') game.selectStage(game.unlocked); else if (game.mode === 'result') game.selectStage(Math.min(8, game.stageIndex + 2)); syncOverlay(); });
  $('select-btn').addEventListener('click', function () { game.setMode('select'); syncOverlay(); });
  $('restart-btn').addEventListener('click', actions.restart);
  muteBtn.addEventListener('click', actions.mute);
  window.addEventListener('resize', function () { try { renderer.resize(); } catch (err) { console.error('[resize]', err); } });

  syncStageList();
  syncOverlay();
  syncHud();
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(now - last, 100);
      last = now;
      input.update();
      game.update(dt);
      audio.update(game);
      renderer.render(game, dt);
      syncHud();
      debug.update();
      if (game.mode === 'result') syncOverlay();
    } catch (err) {
      console.error('[frame]', err);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__renderOnce = function (dt) {
    try {
      dt = dt || 16.7;
      input.update();
      game.update(dt);
      renderer.render(game, dt);
      syncHud();
      debug.update();
      return $('view').toDataURL('image/png').length;
    } catch (err) {
      console.error('[renderOnce]', err);
      return -1;
    }
  };
})();
