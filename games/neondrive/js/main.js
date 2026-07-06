const ndParams = new URLSearchParams(location.search);
const ndSeed = parseInt(ndParams.get('seed') || '8108', 10) || 8108;

const ndGame = new NeonDriveGame({ seed: ndSeed });
const ndRenderer = new NeonDriveRenderer(document.getElementById('view'));
const ndMusic = new NeonDriveMusic();
const ndDebug = installNeonDriveDebug(ndGame);

const nd$ = (id) => document.getElementById(id);
const ndHud = {
  speed: nd$('hud-speed'),
  score: nd$('hud-score'),
  distance: nd$('hud-distance'),
  time: nd$('hud-time'),
  boost: nd$('boost-fill'),
  boostText: nd$('boost-text'),
  combo: nd$('hud-combo'),
  best: nd$('hud-best'),
  overlay: nd$('overlay'),
  overlayTitle: nd$('overlay-title'),
  overlaySub: nd$('overlay-sub'),
  mute: nd$('mute-btn'),
};

function ndFmt(n) { return Math.floor(n).toLocaleString('en-US'); }

function syncHud() {
  const s = ndGame.getSnapshot();
  ndHud.speed.textContent = String(s.speed).padStart(3, '0');
  ndHud.score.textContent = ndFmt(s.score);
  ndHud.distance.textContent = `${ndFmt(s.distance)}m`;
  ndHud.time.textContent = s.remaining.toFixed(1);
  ndHud.boost.style.width = `${Math.round(s.boost * 100)}%`;
  ndHud.boostText.textContent = ndGame.boostTime > 0 ? 'ACTIVE' : `${Math.round(s.boost * 100)}%`;
  ndHud.combo.textContent = s.combo > 1 ? `${s.combo} COMBO` : '';
  ndHud.best.textContent = `BEST ${ndFmt(s.bestScore)} / ${ndFmt(s.bestDistance)}m`;
  ndHud.mute.textContent = ndMusic.muted ? 'MUTED' : 'SOUND';
}

function syncOverlay() {
  const s = ndGame.getSnapshot();
  if (s.state === 'title') {
    ndHud.overlay.classList.remove('hidden');
    ndHud.overlayTitle.innerHTML = 'NEON<br>DRIVE';
    ndHud.overlaySub.innerHTML = 'Press Space or tap BOOST to run the night';
  } else if (s.state === 'dead') {
    ndHud.overlay.classList.remove('hidden');
    ndHud.overlayTitle.innerHTML = 'TIME<br>UP';
    ndHud.overlaySub.innerHTML = `Score ${ndFmt(s.score)} / Distance ${ndFmt(s.distance)}m<br>Best ${ndFmt(s.bestScore)} / ${ndFmt(s.bestDistance)}m<br><br>Press R or tap to restart`;
  } else if (s.state === 'paused') {
    ndHud.overlay.classList.remove('hidden');
    ndHud.overlayTitle.innerHTML = 'PAUSED';
    ndHud.overlaySub.innerHTML = 'Press P or Esc to resume';
  } else {
    ndHud.overlay.classList.add('hidden');
  }
}

ndGame.on((type, data) => {
  ndRenderer.handleEvent(type, data || {});
  if (['nearmiss', 'crash', 'checkpoint', 'boost', 'countdown', 'dead'].includes(type)) ndMusic.sfx(type, data);
  if (['start', 'dead', 'pause', 'resume'].includes(type)) syncOverlay();
});

const ndActions = {
  anyInput: () => ndMusic.unlock(),
  boost: () => {
    ndMusic.unlock();
    if (ndGame.state === 'title' || ndGame.state === 'dead') ndGame.start();
    else ndGame.requestBoost();
    syncOverlay();
  },
  restart: () => { ndMusic.unlock(); ndGame.start(); syncOverlay(); },
  pause: () => { ndGame.togglePause(); syncOverlay(); },
  mute: () => { ndMusic.unlock(); ndMusic.toggleMute(); syncHud(); },
  debug: () => ndDebug.toggle(),
};

const ndInput = new NeonDriveInput(ndGame, ndActions, document.getElementById('view'));
ndHud.overlay.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ndActions.boost();
});
window.addEventListener('resize', () => ndRenderer.resize());

let ndLast = performance.now();
function ndFrame(now) {
  const dt = Math.min(now - ndLast, 100);
  ndLast = now;
  try {
    ndGame.update(dt);
    ndMusic.update(ndGame, dt);
    ndRenderer.render(ndGame, dt);
    syncHud();
    syncOverlay();
    ndDebug.update(dt);
  } catch (err) {
    console.error('[neondrive frame]', err);
  }
  requestAnimationFrame(ndFrame);
}

syncHud();
syncOverlay();
requestAnimationFrame(ndFrame);
