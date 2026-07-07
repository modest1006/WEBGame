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
  }
  new OneManInput(game, { anyInput: function () { audio.unlock(); }, start: startOrContinue, debug: debug.toggle }, $('brake-lever'));
  $('start-btn').addEventListener('click', function () { audio.unlock(); startOrContinue(); });
  $('mute-btn').addEventListener('click', function () { audio.unlock(); audio.toggleMute(); $('mute-btn').textContent = audio.muted ? 'MUTED' : 'SOUND'; });
  window.addEventListener('resize', function () { try { renderer.resize(); } catch (err) { console.error('[resize]', err); } });
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(100, now - last);
      last = now;
      game.update(dt);
      renderer.render(game, dt);
      debug.update();
      syncShellState();
    } catch (err) { console.error('[frame]', err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__renderOnce = function (dt) {
    try {
      game.update(dt || 16.7);
      renderer.render(game, dt || 16.7);
      debug.update();
      syncShellState();
      return $('view').toDataURL('image/png').length;
    } catch (err) { console.error('[renderOnce]', err); return -1; }
  };
})();
