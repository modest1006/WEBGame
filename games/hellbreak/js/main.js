(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed') || '0', 10) || 0;
  const $ = function (id) { return document.getElementById(id); };
  const game = new HellbreakGame({ seed: seed });
  const renderer = new HellbreakRenderer($('view'), $('weapon-view'), $('face'));
  const audio = new HellbreakAudio();
  const debug = installHellbreakDebug(game, renderer);
  const input = new HellbreakInput(game, {
    anyInput: function () { audio.unlock(); },
    restart: function () { audio.unlock(); game.restart(); syncOverlay(); },
    mute: function () { audio.unlock(); audio.toggleMute(); syncHud(); },
    pause: function () { if (game.mode !== 'title') game.paused = !game.paused; syncOverlay(); },
    debug: function () { debug.toggle(); }
  }, $('view'));

  game.on(function (type, data) {
    try {
      renderer.handleEvent(type, data, game);
      audio.event(type, data || {});
      if (type === 'clear' || type === 'dead' || type === 'level') syncOverlay();
    } catch (err) { console.error('[event]', err); }
  });

  function fmt(ms) {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function syncHud() {
    const s = game.getState(), w = HellbreakConstants.WEAPONS[s.weapon];
    $('hp').textContent = String(Math.ceil(s.hp));
    $('armor').textContent = String(Math.ceil(s.armor));
    $('ammo-label').textContent = s.weapon === 'pistol' ? 'INF' : (w.ammo === 'shell' ? 'SHELL' : 'BUL');
    $('ammo').textContent = s.weapon === 'pistol' ? 'INF' : String(s.ammo[w.ammo] || 0);
    $('level-name').textContent = s.levelName + '  KILLS ' + s.kills + '/' + s.totalEnemies;
    $('mute-btn').textContent = audio.muted ? 'MUTED' : 'SOUND';
    $('key-r').classList.toggle('on', s.keys.red);
    $('key-b').classList.toggle('on', s.keys.blue);
    $('key-y').classList.toggle('on', s.keys.yellow);
    const flash = $('flash');
    const op = Math.max(s.flash.red || 0, (s.flash.pickup || 0) * .55);
    flash.style.opacity = op.toFixed(3);
    flash.style.background = (s.flash.red || 0) > (s.flash.pickup || 0) ? 'radial-gradient(ellipse at center, transparent 35%, rgba(170,0,0,.75) 100%)' : 'radial-gradient(ellipse at center, transparent 45%, ' + (s.flash.color || '#fff') + ' 120%)';
  }
  function syncOverlay() {
    const s = game.getState(), o = $('overlay'), title = $('overlay-title'), copy = $('overlay-copy'), result = $('result-line'), btn = $('play-btn');
    if (s.mode === 'title') {
      o.classList.remove('hidden'); title.textContent = 'HELLBREAK'; copy.textContent = 'Escape three infernal fortress levels. Click for pointer lock.'; result.textContent = validationLine(s.validation); btn.textContent = 'PLAY';
    } else if (s.mode === 'dead') {
      o.classList.remove('hidden'); title.textContent = 'YOU DIED'; copy.textContent = 'R or PLAY restarts the level.'; result.textContent = ''; btn.textContent = 'RESTART';
    } else if (s.mode === 'result') {
      o.classList.remove('hidden'); title.textContent = 'LEVEL CLEAR'; copy.textContent = 'Kills ' + Math.round((s.result.kills / Math.max(1, s.result.total)) * 100) + '%  Time ' + fmt(s.result.timeMs); result.textContent = 'Level ' + s.result.level + ' breached.'; btn.textContent = 'NEXT';
    } else if (s.mode === 'ending') {
      o.classList.remove('hidden'); title.textContent = 'HELL BROKEN'; copy.textContent = 'You escaped the fortress. Total kills ' + game.totalKills + '  Final time ' + fmt(s.timeMs); result.textContent = ''; btn.textContent = 'AGAIN';
    } else if (game.paused) {
      o.classList.remove('hidden'); title.textContent = 'PAUSED'; copy.textContent = 'Esc resumes.'; result.textContent = ''; btn.textContent = 'RESUME';
    } else o.classList.add('hidden');
  }
  function validationLine(v) { return 'Path validation: ' + v.map(function (x) { return 'L' + x.level + ' ' + (x.ok ? 'OK' : 'FAIL'); }).join(' / '); }
  $('play-btn').addEventListener('click', function () {
    try {
      audio.unlock();
      if (game.mode === 'title') game.start();
      else if (game.mode === 'dead') game.restart();
      else if (game.mode === 'result') game.nextLevel();
      else if (game.mode === 'ending') game.setLevel(1);
      else game.paused = false;
      syncOverlay();
    } catch (err) { console.error('[play]', err); }
  });
  $('mute-btn').addEventListener('click', function () { audio.unlock(); audio.toggleMute(); syncHud(); });
  window.addEventListener('resize', function () { try { renderer.resize(); } catch (err) { console.error('[resize]', err); } });

  syncHud(); syncOverlay();
  let last = performance.now();
  function frame(now) {
    try {
      const dt = Math.min(now - last, 100); last = now;
      input.update(); game.update(dt); audio.update(game); renderer.render(game, dt); syncHud(); syncOverlay(); debug.update();
    } catch (err) { console.error('[frame]', err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__renderOnce = function (dt) {
    try {
      input.update(); game.update(dt || 16.7); renderer.render(game, dt || 16.7); syncHud(); syncOverlay(); debug.update();
      return $('view').toDataURL('image/png').length;
    } catch (err) { console.error('[renderOnce]', err); return -1; }
  };
})();
