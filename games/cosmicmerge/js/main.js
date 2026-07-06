const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '0', 10) || 0;

const game = new Game({ seed });
const renderer = new Renderer(document.getElementById('view'), document.getElementById('next-canvas'));
const music = new Music();
const debugOverlay = installDebug(game);

const $ = (id) => document.getElementById(id);
const scoreEl = $('score');
const bestEl = $('best');
const overlay = $('overlay');
const comboEl = $('combo');
const muteBtn = $('mute-btn');
let endedAt = 0;

function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

function buildChain() {
  const box = $('chain');
  box.innerHTML = '';
  TIERS.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'chain-item';
    item.id = `tier-${i}`;
    item.innerHTML = `<span>${i}</span><b>${t.jp}</b>`;
    box.appendChild(item);
  });
}

function syncHud() {
  const s = game.getSnapshot();
  scoreEl.textContent = fmt(s.score);
  bestEl.textContent = fmt(s.best);
  comboEl.textContent = s.combo > 1 && game.comboFlash > 0 ? `${s.combo} COMBO` : '';
  TIERS.forEach((_, i) => {
    const el = $(`tier-${i}`);
    if (el) el.classList.toggle('on', s.reached[i]);
  });
}

function showOverlay(title, sub) {
  $('overlay-title').innerHTML = title;
  $('overlay-sub').innerHTML = sub;
  overlay.classList.remove('hidden');
}

function syncOverlay() {
  if (game.state === 'title') {
    showOverlay('COSMIC<br>MERGE', 'Click, press Space, or tap to begin');
  } else if (game.state === 'dead') {
    const tier = TIERS[game.highestTier];
    showOverlay('GAME<br>OVER', `Score ${fmt(game.score)}<br>Highest ${tier.jp}<br><br>Click or press R to restart`);
  } else {
    overlay.classList.add('hidden');
  }
}

game.on((type, data) => {
  renderer.handleEvent(type, data, game);
  if (type === 'drop' || type === 'hit' || type === 'merge' || type === 'warning' || type === 'dead' || type === 'bigbang') {
    music.sfx(type, data);
  }
  if (type === 'score' || type === 'next' || type === 'merge' || type === 'bigbang') syncHud();
  if (type === 'start' || type === 'dead') syncOverlay();
  if (type === 'dead') endedAt = performance.now();
});

const actions = {
  anyInput: () => music.unlock(),
  drop: () => {
    music.unlock();
    if (game.state === 'dead') {
      if (performance.now() - endedAt > 500) game.start();
      return;
    }
    game.drop();
    syncOverlay();
  },
  restart: () => { music.unlock(); game.start(); syncOverlay(); syncHud(); },
  mute: () => {
    const muted = music.toggleMute();
    muteBtn.textContent = muted ? '×' : '♪';
  },
  debug: () => debugOverlay.toggle(),
};

const input = new Input(game, renderer, actions, document.getElementById('view'));
overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.drop(); });
window.addEventListener('resize', () => renderer.resize());

buildChain();
syncHud();
syncOverlay();
renderer.handleEvent('next', { tier: game.nextTier });

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  try {
    input.update(dt);
    game.update(dt);
    renderer.render(game, dt);
    syncHud();
    debugOverlay.update(dt);
  } catch (err) {
    console.error('[frame]', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
