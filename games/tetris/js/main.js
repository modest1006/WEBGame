// エントリポイント。依存スクリプトは index.html で先に読み込まれている前提。
const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') ?? '0', 10) || 0;

const game = new Game({ seed });
const renderer = new Renderer(
  document.getElementById('board'),
  document.getElementById('next'),
  document.getElementById('hold'),
);
const sfx = new Sfx();
const debugOverlay = installDebug(game);

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const popup = $('popup');
let gameoverAt = 0;

function showOverlay(title, sub) {
  overlayTitle.innerHTML = title;
  overlaySub.innerHTML = sub;
  overlay.classList.remove('hidden');
}

function syncOverlay() {
  switch (game.state) {
    case 'title':
      showOverlay('NEON<br>TETRIS', 'キー入力 / タップ でスタート');
      break;
    case 'paused':
      showOverlay('PAUSE', 'P / ⏸ で再開');
      break;
    case 'gameover':
      showOverlay('GAME OVER', `SCORE ${game.score.toLocaleString()}<br>キー入力 / タップ でリスタート`);
      break;
    default:
      overlay.classList.add('hidden');
  }
}

function showPopup(text, cls = '') {
  popup.textContent = text;
  popup.className = `popup show ${cls}`;
  clearTimeout(showPopup.timer);
  showPopup.timer = setTimeout(() => popup.classList.remove('show'), 900);
}

const CLEAR_NAMES = { 1: 'SINGLE', 2: 'DOUBLE', 3: 'TRIPLE', 4: 'TETRIS!' };

game.on((type, data) => {
  renderer.handleEvent(type, data, game);
  switch (type) {
    case 'clear':
      sfx.play('clear', data);
      showPopup(
        (data.b2b && data.count === 4 ? 'B2B ' : '') + CLEAR_NAMES[data.count]
          + (game.combo > 0 ? `  ×${game.combo + 1} COMBO` : ''),
        data.count === 4 ? 'tetris' : '',
      );
      break;
    case 'levelup':
      sfx.play('levelup');
      showPopup(`LEVEL ${data.level}`, 'level');
      break;
    case 'gameover':
      sfx.play('gameover');
      gameoverAt = performance.now();
      break;
    case 'move': case 'rotate': case 'harddrop': case 'lock': case 'hold': case 'start':
      sfx.play(type, data);
      break;
  }
  syncOverlay();
});

const actions = {
  move: (dx) => game.move(dx),
  rotate: (dir) => game.rotate(dir),
  softDrop: (on) => { game.softDropping = on; },
  hardDrop: () => game.hardDrop(),
  hold: () => game.hold(),
  pause: () => { game.togglePause(); syncOverlay(); },
  restart: () => { if (game.state !== 'title') game.start(); },
  mute: () => {
    const muted = sfx.toggleMute();
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  },
  debug: () => debugOverlay.toggle(),
  anyInput: () => {
    sfx.unlock();
    if (game.state === 'title') game.start();
    else if (game.state === 'gameover' && performance.now() - gameoverAt > 600) game.start();
  },
};

const input = new Input(actions, document.getElementById('board'));

overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.anyInput(); });
window.addEventListener('resize', () => renderer.resize());

// HUD
let hudCache = '';
function updateHud() {
  const key = `${game.score}|${game.lines}|${game.level}`;
  if (key === hudCache) return;
  hudCache = key;
  $('score').textContent = game.score.toLocaleString();
  $('lines').textContent = game.lines;
  $('level').textContent = game.level;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  input.update(dt);
  game.update(dt);
  renderer.render(game, dt);
  renderer.renderSidePanels(game);
  updateHud();
  debugOverlay.update(dt);
  requestAnimationFrame(frame);
}

syncOverlay();
requestAnimationFrame(frame);
