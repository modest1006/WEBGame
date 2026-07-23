(function () {
  'use strict';

  const dom = {
    shell:document.getElementById('game-shell'),
    canvas:document.getElementById('world'),
    wind:document.getElementById('wind-layer'),
    hud:document.getElementById('hud'),
    score:document.getElementById('score-value'),
    combo:document.getElementById('combo-value'),
    time:document.getElementById('time-value'),
    timeBox:document.getElementById('time-box'),
    speedNeedle:document.getElementById('speed-needle'),
    speedReadout:document.getElementById('speed-readout'),
    altNeedle:document.getElementById('alt-needle'),
    altReadout:document.getElementById('alt-readout'),
    attitude:document.getElementById('attitude-world'),
    boostButton:document.getElementById('boost-btn'),
    boostFill:document.getElementById('boost-fill'),
    boostPercent:document.getElementById('boost-percent'),
    target:document.getElementById('target-marker'),
    targetArrow:document.querySelector('#target-marker i'),
    targetDistance:document.getElementById('target-distance'),
    callout:document.getElementById('callout'),
    flash:document.getElementById('flash'),
    title:document.getElementById('title-screen'),
    calibration:document.getElementById('calibration-screen'),
    calibrationCount:document.getElementById('calibration-count'),
    result:document.getElementById('result-screen'),
    resultScore:document.getElementById('result-score'),
    resultRings:document.getElementById('result-rings'),
    resultCombo:document.getElementById('result-combo'),
    resultBest:document.getElementById('result-best'),
    gyroStart:document.getElementById('gyro-start-btn'),
    fallbackStart:document.getElementById('fallback-start-btn'),
    permissionNote:document.getElementById('permission-note'),
    calibrate:document.getElementById('calibrate-btn'),
    mute:document.getElementById('mute-btn'),
    restart:document.getElementById('restart-btn'),
    orientationNote:document.getElementById('orientation-note'),
    dragStick:document.getElementById('drag-stick')
  };

  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed')) || 1;
  let bestScore = 0;
  try { bestScore = Number(localStorage.getItem('propella.bestScore')) || 0; } catch (error) {}

  const game = new PropellaGame({ seed:seed, bestScore:bestScore });
  const renderer = new PropellaRenderer(dom.canvas);
  const audio = new PropellaAudio();
  const input = new PropellaInput({
    surface:dom.shell,
    boostButton:dom.boostButton,
    stick:dom.dragStick,
    onOrientationChange:function () {
      dom.orientationNote.classList.add('show');
      showCallout('NEUTRALを再設定');
    }
  });

  let autoStep = true;
  let lastFrame = performance.now();
  let calloutToken = 0;
  let calibrationTimer = null;
  const windStreaks = [];
  for (let i = 0; i < 72; i++) {
    windStreaks.push({
      x:Math.random(),
      y:Math.random(),
      speed:.2 + Math.random() * .9,
      length:8 + Math.random() * 22,
      alpha:.12 + Math.random() * .38
    });
  }

  function showCallout(text) {
    calloutToken++;
    const token = calloutToken;
    dom.callout.textContent = text;
    dom.callout.classList.remove('show');
    void dom.callout.offsetWidth;
    dom.callout.classList.add('show');
    window.setTimeout(function () {
      if (token === calloutToken) dom.callout.classList.remove('show');
    }, 900);
  }

  function flash(strong) {
    dom.flash.style.background = strong ? '#fff2a4' : '#ffffff';
    dom.flash.classList.remove('active');
    void dom.flash.offsetWidth;
    dom.flash.classList.add('active');
  }

  function shakeCockpit() {
    dom.shell.classList.remove('impact');
    void dom.shell.offsetWidth;
    dom.shell.classList.add('impact');
    window.setTimeout(function () { dom.shell.classList.remove('impact'); }, 520);
  }

  function saveBest(score) {
    try { localStorage.setItem('propella.bestScore', String(score)); } catch (error) {}
  }

  game.on(function (type, data) {
    try {
      renderer.handleEvent(type, data);
      audio.handleEvent(type, data);
      if (type === 'ring') {
        showCallout(data.gold ? 'GOLD! +' + data.score + '  +5秒' : '+' + data.score + '  +2秒');
        if (data.gold) flash(true);
      } else if (type === 'miss') {
        showCallout(data.lostCombo ? 'COMBO LOST' : 'RING MISSED');
      } else if (type === 'balloon') {
        showCallout('パァン! +50');
      } else if (type === 'mountain') {
        showCallout('BOUNCE!');
        shakeCockpit();
      } else if (type === 'cloud') {
        flash(false);
      } else if (type === 'countdown' && data.second <= 5) {
        showCallout(String(data.second));
      } else if (type === 'finish') {
        saveBest(data.bestScore);
        showResult(data);
      }
    } catch (error) {
      console.error('[PROPELLA event presentation]', type, error);
    }
  });

  function showResult(data) {
    dom.resultScore.textContent = String(data.score);
    dom.resultRings.textContent = String(data.rings);
    dom.resultCombo.textContent = '×' + PropellaGame.comboMultiplier(data.maxCombo);
    dom.resultBest.textContent = String(data.bestScore);
    dom.result.classList.remove('hidden');
  }

  function startFlight() {
    if (calibrationTimer) {
      window.clearInterval(calibrationTimer);
      calibrationTimer = null;
    }
    dom.title.classList.add('hidden');
    dom.calibration.classList.add('hidden');
    dom.result.classList.add('hidden');
    dom.orientationNote.classList.remove('show');
    input.clearDebugInput();
    input.resetPointer();
    game.restart();
    game.start();
    showCallout('TAKE OFF!');
  }

  function startCalibration() {
    dom.title.classList.add('hidden');
    dom.calibration.classList.remove('hidden');
    let count = 3;
    dom.calibrationCount.textContent = String(count);
    calibrationTimer = window.setInterval(function () {
      count--;
      dom.calibrationCount.textContent = String(Math.max(0, count));
      if (count <= 0) {
        window.clearInterval(calibrationTimer);
        calibrationTimer = null;
        if (!input.calibrate()) {
          dom.permissionNote.textContent = '姿勢を取得できなかったため、タッチ操作で開始します。';
        }
        startFlight();
      }
    }, 650);
  }

  dom.gyroStart.addEventListener('click', function () {
    audio.unlock();
    dom.permissionNote.textContent = 'ジャイロの許可を確認しています…';
    input.requestGyro().then(function (granted) {
      if (granted) {
        startCalibration();
      } else {
        dom.permissionNote.textContent = input.gyro.supported === false ?
          'この端末はジャイロ非対応です。タッチ操作で開始します。' :
          'ジャイロが許可されませんでした。タッチ操作で開始します。';
        startFlight();
      }
    }).catch(function (error) {
      console.error('[PROPELLA gyro permission]', error);
      startFlight();
    });
  });

  dom.fallbackStart.addEventListener('click', function () {
    audio.unlock();
    startFlight();
  });

  dom.restart.addEventListener('click', function () {
    audio.unlock();
    startFlight();
  });

  dom.calibrate.addEventListener('click', function () {
    if (input.calibrate()) {
      dom.orientationNote.classList.remove('show');
      showCallout('NEUTRAL SET');
    } else {
      showCallout('ジャイロ未接続');
    }
  });

  dom.mute.addEventListener('click', function () {
    audio.unlock();
    const muted = audio.toggleMute();
    dom.mute.setAttribute('aria-pressed', String(muted));
    dom.mute.textContent = muted ? '× MUTED' : '♪ SOUND';
  });

  function updateHud() {
    const state = game;
    const multiplier = PropellaGame.comboMultiplier(state.combo);
    dom.score.textContent = String(Math.round(state.score)).padStart(6, '0');
    dom.combo.textContent = 'COMBO ×' + multiplier + (state.combo > 1 ? '  (' + state.combo + ')' : '');
    dom.time.textContent = (Math.max(0, state.timeMs) / 1000).toFixed(1);
    dom.timeBox.classList.toggle('danger', state.timeMs <= 10000 && state.mode === 'play');
    dom.speedReadout.textContent = String(Math.round(state.speed)).padStart(3, '0');
    dom.speedNeedle.style.transform = 'rotate(' + (-126 + Math.min(1, state.speed / 135) * 252) + 'deg)';
    dom.altReadout.textContent = String(Math.round(state.position.y)).padStart(3, '0');
    dom.altNeedle.style.transform = 'rotate(' + (-126 + state.position.y / 300 * 252) + 'deg)';
    const pitchShift = state.pitch / (35 * PropellaGame.constants.DEG) * 28;
    dom.attitude.style.transform = 'translateY(' + pitchShift + 'px) rotate(' + (-state.roll / PropellaGame.constants.DEG) + 'deg)';
    dom.boostFill.style.height = (state.boostFuel * 100).toFixed(1) + '%';
    dom.boostPercent.textContent = Math.round(state.boostFuel * 100) + '%';
    dom.shell.classList.toggle('boosting', state.boosting);

    const ring = state.nextRing();
    if (!ring || state.mode === 'result') {
      dom.target.style.opacity = '0';
    } else {
      const target = renderer.projectTarget(ring.position);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const x = Math.max(30, Math.min(width - 30, (target.x * .5 + .5) * width));
      const y = Math.max(80, Math.min(height * .73, (-target.y * .5 + .5) * height));
      dom.target.style.left = x + 'px';
      dom.target.style.top = y + 'px';
      dom.target.style.opacity = '1';
      dom.target.classList.toggle('offscreen', target.offscreen);
      dom.targetDistance.textContent = (ring.gold ? 'GOLD ' : 'NEXT ') + Math.round(target.distance) + 'm';
      if (target.offscreen) {
        const degrees = Math.atan2(-target.y, target.x) / PropellaGame.constants.DEG;
        dom.targetArrow.style.transform = 'rotate(' + (degrees - 45) + 'deg)';
      } else {
        dom.targetArrow.style.transform = '';
      }
    }
  }

  function resizeWindCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    if (dom.wind.width !== Math.round(width * ratio) || dom.wind.height !== Math.round(height * ratio)) {
      dom.wind.width = Math.round(width * ratio);
      dom.wind.height = Math.round(height * ratio);
      dom.wind.style.width = width + 'px';
      dom.wind.style.height = height + 'px';
    }
    return { ratio:ratio, width:width, height:height };
  }

  function drawWind(dtMs) {
    const size = resizeWindCanvas();
    const context = dom.wind.getContext('2d');
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    if (game.mode !== 'play') return;
    const multiplier = PropellaGame.comboMultiplier(game.combo);
    const count = Math.min(windStreaks.length, 16 + Math.floor((game.speed - 50) * .35) + (multiplier - 1) * 8);
    const strength = .65 + Math.max(0, game.speed - 60) / 60 + (multiplier - 1) * .12;
    context.lineCap = 'round';
    context.strokeStyle = '#effcff';
    context.lineWidth = game.boosting ? 1.7 : 1.1;
    for (let i = 0; i < count; i++) {
      const streak = windStreaks[i];
      streak.y += (dtMs / 1000) * streak.speed * strength;
      streak.x += (dtMs / 1000) * game.roll * .02;
      if (streak.y > 1.08) { streak.y = -.08; streak.x = Math.random(); }
      if (streak.x < -.05) streak.x = 1.05;
      if (streak.x > 1.05) streak.x = -.05;
      const perspective = .35 + streak.y * .9;
      const x = size.width * (.5 + (streak.x - .5) * perspective);
      const y = size.height * streak.y;
      const len = streak.length * strength * perspective;
      context.globalAlpha = streak.alpha * Math.min(1, strength);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + game.roll * 9, y + len);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function renderOnce(dtMs) {
    try {
      renderer.render(game, dtMs);
      audio.update(game);
      updateHud();
      drawWind(dtMs);
      if (debug) debug.recordFrame(dtMs);
      return game.getState();
    } catch (error) {
      console.error('[PROPELLA renderOnce]', error);
      return null;
    }
  }

  function restartFromDebug() {
    dom.title.classList.add('hidden');
    dom.calibration.classList.add('hidden');
    dom.result.classList.add('hidden');
    input.clearDebugInput();
    input.resetPointer();
    game.restart();
    game.start();
    renderOnce(16.7);
  }

  const runtime = {
    renderOnce:renderOnce,
    restart:restartFromDebug,
    start:function () {
      dom.title.classList.add('hidden');
      dom.result.classList.add('hidden');
      game.start();
      renderOnce(16.7);
    },
    setAutoStep:function (enabled) { autoStep = !!enabled; },
    getAutoStep:function () { return autoStep; }
  };
  const debug = new PropellaDebug(game, input, renderer, audio, runtime);

  function runSelfTest() {
    autoStep = false;
    dom.title.classList.add('hidden');
    const report = { seed:seed };
    let skimEvents = 0;
    game.on(function (type) { if (type === 'seaSkim') skimEvents++; });

    game.restart();
    game.start();
    input.setDebugInput({ pitch:0, roll:0, boost:false });
    game.setInput({ pitch:0, roll:0, boost:false });
    report.aimed = game.aimAtNextRing();
    game.update(4000);
    report.ring = {
      score:game.score,
      combo:game.combo,
      remainingMs:Math.round(game.timeMs),
      ringsPassed:game.ringsPassed
    };

    game.setTime(1);
    game.update(1200);
    report.timeup = {
      mode:game.mode,
      resultVisible:!dom.result.classList.contains('hidden'),
      scoreText:dom.resultScore.textContent
    };
    restartFromDebug();
    autoStep = false;
    report.restart = {
      mode:game.mode,
      resultHidden:dom.result.classList.contains('hidden'),
      score:game.score
    };

    const balloon = game.balloons.filter(function (item) { return item.alive; })[0];
    const balloonScore = game.score;
    if (balloon) {
      game.teleport(balloon.position.x, balloon.position.y, balloon.position.z);
      game.update(20);
    }
    report.balloon = {
      available:!!balloon,
      gain:game.score - balloonScore,
      popped:game.balloonsPopped
    };

    game.restart();
    game.start();
    const mountain = game.mountains[0];
    if (mountain) {
      game.teleport(mountain.x, PropellaGame.constants.SEA_Y + 4, mountain.z);
      game.update(20);
    }
    report.mountain = {
      available:!!mountain,
      penaltyMs:Math.round(game.speedPenaltyMs),
      bounceVelocity:Number(game.bounceVelocity.toFixed(2))
    };

    game.restart();
    game.start();
    game.teleport(0, 3, 0);
    game.setInput({ pitch:0, roll:0, boost:false });
    game.update(600);
    report.seaSkim = { events:skimEvents, altitude:Number(game.position.y.toFixed(2)) };

    report.audio = {
      unlockReturned:audio.unlock(),
      testReturned:false
    };
    report.audio.testReturned = audio.testAll();
    report.audio.state = audio.getState();
    report.renderer = Object.assign({}, PropellaRenderer.constants);
    renderOnce(16.7);

    const output = document.createElement('pre');
    output.id = 'selftest-output';
    output.className = 'selftest-output';
    output.textContent = JSON.stringify(report, null, 2);
    document.body.appendChild(output);
    console.log('[PROPELLA SELFTEST]', JSON.stringify(report));
  }

  if (params.get('selftest') === '1') window.setTimeout(runSelfTest, 0);

  function frame(now) {
    const dtMs = Math.min(50, Math.max(0, now - lastFrame || 16.7));
    lastFrame = now;
    try {
      if (autoStep && game.mode === 'play') {
        game.setInput(input.update(dtMs));
        game.update(dtMs);
      }
      renderOnce(dtMs);
    } catch (error) {
      console.error('[PROPELLA game loop]', error);
    }
    window.requestAnimationFrame(frame);
  }

  if (!input.gyro.supported) dom.gyroStart.textContent = 'タッチで飛ぶ';
  if (window.location.protocol !== 'https:' && window.location.protocol !== 'file:') {
    dom.permissionNote.textContent = 'ジャイロはHTTPS公開時に利用できます。ここではタッチ / PC操作が使えます。';
  }
  renderOnce(16.7);
  window.requestAnimationFrame(frame);
})();
