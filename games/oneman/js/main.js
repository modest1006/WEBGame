(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const params = new URLSearchParams(location.search);
  const game = new OneManGame({ seed: parseInt(params.get('seed') || '0', 10) || 0 });
  const hud = {
    speedNeedle: $('speed-needle'),
    speedText: $('speed-text'),
    distText: $('dist-text'),
    finalCounter: $('final-counter'),
    lever: $('brake-lever'),
    leverKnob: $('lever-knob'),
    phase: $('phase'),
    notch: $('notch'),
    eff: $('eff'),
    grade: $('grade'),
    dimension: $('dimension'),
    dimensionValue: $('dimension-value'),
    result: $('result'),
    resultTitle: $('result-title'),
    resultBody: $('result-body'),
    overlay: $('transition'),
    routeIntro: $('route-intro'),
    routeMap: $('route-map'),
    topLedText: document.querySelector('#top-led span')
  };
  const renderer = new OneManRenderer($('view'), hud);
  const audio = new OneManAudio();
  const debug = installOneManDebug(game, renderer);
  const rotatePrompt = $('rotate-prompt');
  const hornBtn = $('horn-btn');
  const portraitCoarse = matchMedia('(orientation: portrait) and (pointer: coarse)');
  let rotatePaused = false;
  let bestScore = Number(localStorage.getItem('oneman.best') || 0);
  window.__onemanRenderer = renderer;
  game.on(function (type, data) {
    try { renderer.handleEvent(type, data, game); audio.event(type, data || {}); }
    catch (err) { console.error('[event]', err); }
  });
  function startOrContinue() {
    if (game.phase === OneManGame.Phase.TITLE || game.phase === OneManGame.Phase.FINAL_RESULT) game.start();
    else if (game.phase === OneManGame.Phase.RUN_INTRO || game.phase === OneManGame.Phase.DEPART || game.phase === OneManGame.Phase.CRUISE) game.skipCruise();
  }
  function syncShellState() {
    document.body.classList.toggle('title', game.phase === OneManGame.Phase.TITLE);
    document.body.classList.toggle('final-result', game.phase === OneManGame.Phase.FINAL_RESULT);
    document.body.classList.toggle('departing', game.phase === OneManGame.Phase.DEPART);
    if (game.phase === OneManGame.Phase.FINAL_RESULT) {
      const total = game.resultSummary().total;
      if (total > bestScore) {
        bestScore = total;
        localStorage.setItem('oneman.best', String(bestScore));
      }
    }
    document.body.setAttribute('data-best', String(bestScore));
  }
  function horn() { audio.unlock(); audio.event('horn', {}); }
  function syncOrientationPrompt() {
    const active = !!portraitCoarse.matches;
    rotatePaused = active;
    if (rotatePrompt) rotatePrompt.classList.toggle('hidden', !active);
  }
  new OneManInput(game, { anyInput: function () { audio.unlock(); }, start: startOrContinue, debug: debug.toggle, horn: horn }, $('brake-lever'));
  $('start-btn').addEventListener('click', function () { audio.unlock(); startOrContinue(); });
  $('mute-btn').addEventListener('click', function () { audio.unlock(); audio.toggleMute(); $('mute-btn').textContent = audio.muted ? 'MUTED' : 'SOUND'; });
  if (hornBtn) hornBtn.addEventListener('click', horn);
  window.addEventListener('resize', function () { try { renderer.resize(); syncOrientationPrompt(); } catch (err) { console.error('[resize]', err); } });
  if (portraitCoarse.addEventListener) portraitCoarse.addEventListener('change', syncOrientationPrompt);
  else if (portraitCoarse.addListener) portraitCoarse.addListener(syncOrientationPrompt);
  syncOrientationPrompt();
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(100, now - last);
      last = now;
      if (!rotatePaused) game.update(dt);
      syncShellState();
      renderer.render(game, dt);
      audio.update(game.getState(), dt);
      debug.update();
    } catch (err) { console.error('[frame]', err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__renderOnce = function (dt) {
    try {
      if (!rotatePaused) game.update(dt || 16.7);
      syncShellState();
      renderer.render(game, dt || 16.7);
      audio.update(game.getState(), dt || 16.7);
      debug.update();
      return $('view').toDataURL('image/png').length;
    } catch (err) { console.error('[renderOnce]', err); return -1; }
  };
})();
