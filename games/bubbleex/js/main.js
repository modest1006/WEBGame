(function () {
  'use strict';
  var C = window.BubbleExConstants;
  var params = new URLSearchParams(location.search);
  var seed = parseInt(params.get('seed') || '1', 10) || 1;

  var game = new window.BubbleExGame({ seed: seed });
  game.loadBest();
  var canvas = document.getElementById('view');
  var renderer = new window.BubbleExRenderer(canvas);
  // Constructor-time resize() can read a pre-layout 0x0 clientWidth/Height if the DOM hasn't
  // settled yet (e.g. throttled/background tabs where rAF never fires). Re-measure synchronously
  // now, and defensively again on every render pump so headless/manual step()+__renderOnce()
  // verification (no live rAF loop) still gets a correctly sized canvas.
  renderer.resize();
  var audio = new window.BubbleExAudio();
  var debug = window.installBubbleExDebug(game);
  window.__renderOnce = function () {
    try {
      if (canvas.width === 0 || canvas.height === 0) renderer.resize();
      renderer.render(game.getState(), 0, game.launcherPos(), true);
    } catch (e) { console.error('renderOnce error', e); }
  };

  var $ = function (id) { return document.getElementById(id); };
  var overlay = $('overlay');
  var scanlines = $('scanlines');
  var cutin = $('cutin');
  var cutinText = $('cutin-text');
  var muteBtn = $('mute-btn');
  var pauseBtn = $('pause-btn');

  var colorHexCss = {
    red: '#ff3b4e', blue: '#2f8fff', green: '#38d67a',
    yellow: '#ffd438', purple: '#b861ff', orange: '#ff9a2e'
  };

  function chainIndex() { return game.comboMult || 1; }

  game.on(function (type, data) {
    try {
      switch (type) {
        case 'fire': audio.fire(); break;
        case 'wallbounce': audio.wallbounce(); break;
        case 'pop':
          audio.pop(data.count);
          renderer.spawnPopBurst(data.cells, 'pop');
          break;
        case 'drop':
          audio.dropBonus(data.count);
          renderer.spawnPopBurst(data.cells, 'drop');
          break;
        case 'combo':
          showCutin(data.mult + ' COMBO!!');
          audio.combo(data.mult);
          break;
        case 'ceiling':
          audio.ceilingWarn();
          break;
        case 'stagestart':
          showCutin('READY... GO!!');
          break;
        case 'stageclear':
          audio.stageClear();
          showCutin('STAGE CLEAR!');
          setTimeout(function () { game.nextStage(); syncOverlay(); }, 1500);
          break;
        case 'gameover':
          audio.gameOver();
          break;
        default: break;
      }
    } catch (e) { console.error('event handling error', type, e); }
  });

  function showCutin(text) {
    cutinText.textContent = text;
    cutin.classList.remove('show');
    void cutin.offsetWidth;
    cutin.classList.add('show');
  }

  function fmtScore(n) { return String(n).padStart(6, '0'); }

  function syncHud() {
    var s = game.getState();
    $('hud-score').textContent = fmtScore(s.score);
    $('hud-best').textContent = fmtScore(s.best);
    $('hud-stage').textContent = s.stage + ' / ' + C.STAGES.length;
    var sw = $('hud-next-swatch');
    sw.style.background = colorHexCss[s.next] || '#fff';
    sw.style.color = colorHexCss[s.next] || '#fff';
  }

  function showOverlay(title, sub, result, showPush) {
    $('overlay-title').textContent = title;
    $('overlay-sub').textContent = sub;
    $('result-line').textContent = result || '';
    $('push-start').style.display = showPush ? 'block' : 'none';
    overlay.classList.remove('hidden');
  }
  function syncOverlay() {
    var s = game.getState();
    if (s.status === 'title') {
      showOverlay('BUBBLE BLASTER EX', '壁で反射させて同色3つを繋げて消せ！', '', true);
    } else if (s.status === 'paused') {
      showOverlay('PAUSE', 'P で再開', '', false);
    } else if (s.status === 'gameover') {
      showOverlay('GAME OVER', 'R でリスタート', 'SCORE ' + s.score + ' / BEST ' + s.best, false);
    } else {
      overlay.classList.add('hidden');
    }
  }

  function startGame() {
    audio.unlock();
    audio.startBgm();
    game.status = 'aiming';
    game.cutIn = { text: 'READY... GO!!', t: 0, dur: 1000 };
    showCutin('READY... GO!!');
    syncOverlay();
  }

  $('start-btn').addEventListener('click', startGame);

  var input = new window.BubbleExInput(canvas, game, {
    onFire: function () { audio.unlock(); },
    onRestart: function () { audio.unlock(); game.restart(); syncOverlay(); },
    onMute: function () { toggleMute(); },
    onPause: function () { togglePause(); },
    onDebugToggle: function () { debug.toggle(); }
  });

  restartBtnBind();
  function restartBtnBind() {
    $('restart-btn').addEventListener('click', function () {
      audio.unlock();
      game.restart();
      syncOverlay();
    });
  }

  function toggleMute() {
    game.mute = !game.mute;
    audio.setMute(game.mute);
    muteBtn.textContent = game.mute ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', toggleMute);

  function togglePause() {
    if (game.status === 'title' || game.status === 'gameover') return;
    game.togglePause();
    pauseBtn.textContent = game.paused ? '▶' : '⏸';
    syncOverlay();
  }
  pauseBtn.addEventListener('click', togglePause);

  var showScanlines = params.get('scanlines') !== '0';
  scanlines.classList.toggle('off', !showScanlines);

  // ---- Main loop --------------------------------------------------------
  var lastT = performance.now();
  function frame(t) {
    var dtMs = Math.min(48, t - lastT);
    lastT = t;
    try {
      if (canvas.width === 0 || canvas.height === 0) renderer.resize();
      if (game.status !== 'title') {
        input.tick(dtMs / 1000);
        game.step(dtMs);
      }
      renderer.render(game.getState(), dtMs / 1000, game.launcherPos(), game.status === 'aiming' || game.status === 'title');
      syncHud();
      debug.update();
      if (game.status === 'gameover' || game.status === 'paused') syncOverlay();
    } catch (e) {
      console.error('frame loop error', e);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  syncOverlay();
  syncHud();

  // Run stage validation once at startup (logs any bad stage to console).
  try {
    var v = game.validate();
    if (!v.allOk) console.error('BUBBLE BLASTER EX: stage validation failed', v.results.filter(function (r) { return !r.ok; }));
  } catch (e) { console.error('validate() threw', e); }
})();
