(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const params = new URLSearchParams(location.search);
  const debugMode = params.get('debug') === '1';
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
  const hornTouch = $('horn-touch');
  const portraitCoarse = matchMedia('(orientation: portrait) and (pointer: coarse)');
  let rotatePaused = false;
  let bestScore = Number(localStorage.getItem('oneman.best') || 0);
  let lastUiInput = performance.now();
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
    const phase = game.phase;
    document.body.classList.toggle('title', phase === OneManGame.Phase.TITLE);
    document.body.classList.toggle('final-result', phase === OneManGame.Phase.FINAL_RESULT);
    document.body.classList.toggle('departing', phase === OneManGame.Phase.DEPART);
    document.body.classList.toggle('cruise', phase === OneManGame.Phase.CRUISE);
    document.body.classList.toggle('approach', phase === OneManGame.Phase.APPROACH);
    document.body.classList.toggle('final', phase === OneManGame.Phase.FINAL || phase === OneManGame.Phase.STOPPED || phase === OneManGame.Phase.OVERRUN || phase === OneManGame.Phase.CREEP);
    document.body.classList.toggle('debug-mode', debugMode);
    document.body.classList.toggle('settings-idle', performance.now() - lastUiInput > 3000 && phase !== OneManGame.Phase.TITLE);
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
  function wakeUi() {
    lastUiInput = performance.now();
    document.body.classList.remove('settings-idle');
  }
  function syncOrientationPrompt() {
    const active = !!portraitCoarse.matches;
    rotatePaused = active;
    if (rotatePrompt) rotatePrompt.classList.toggle('hidden', !active);
  }
  // 全画面: タッチ端末はSTART時に自動要求（ユーザー操作内でのみ許可される）＋手動トグル。
  // 全画面中はscreen.orientation.lockで横向き固定を試みる（Android Chrome対応、失敗は無視）
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el)).then(function () {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
    }).catch(function () {});
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else enterFullscreen();
  }
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  new OneManInput(game, { anyInput: function () { wakeUi(); audio.unlock(); }, start: startOrContinue, debug: debug.toggle, horn: horn }, $('brake-lever'));
  document.addEventListener('pointermove', wakeUi, { passive: true });
  document.addEventListener('pointerdown', wakeUi, { passive: true });
  document.addEventListener('keydown', wakeUi);
  $('start-btn').addEventListener('click', function () { wakeUi(); audio.unlock(); if (isCoarse) enterFullscreen(); startOrContinue(); });
  $('fs-btn').addEventListener('click', function () { wakeUi(); toggleFullscreen(); });
  $('mute-btn').addEventListener('click', function () { wakeUi(); audio.unlock(); audio.toggleMute(); $('mute-btn').textContent = audio.muted ? 'x' : String.fromCharCode(9834); });
  if (hornBtn) hornBtn.addEventListener('click', horn);
  if (hornTouch) hornTouch.addEventListener('click', horn);
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
