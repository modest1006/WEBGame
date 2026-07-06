// エントリポイント。依存スクリプトは index.html で先に読み込まれている前提。
const game = new Game();
const renderer = new Renderer(document.getElementById('view'));
const sfx = new Sfx();
const debugOverlay = installDebug(game);

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
let finishedAt = 0;

const BEST_KEY = 'bunnydash-best';
game.bestTime = parseFloat(localStorage.getItem(BEST_KEY)) || null;

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

function showOverlay(title, sub) {
  overlayTitle.innerHTML = title;
  overlaySub.innerHTML = sub;
  overlay.classList.remove('hidden');
}

function syncOverlay() {
  switch (game.state) {
    case 'title':
      showOverlay('BUNNY DASH',
        '←→:はしる　SPACE:ジャンプ　↓/SHIFT:スライディング<br>'
        + 'スライディング着地→すぐジャンプで <b>バニーホップ加速！</b><br><br>'
        + (game.bestTime ? `BEST ${fmtTime(game.bestTime)}<br>` : '')
        + 'キー入力 / タップ でスタート');
      break;
    case 'paused':
      showOverlay('PAUSE', 'P / ⏸ で再開');
      break;
    case 'finished': {
      const d = game.lastFinish ?? {};
      const isBest = game.bestTime !== null && Math.abs(game.bestTime - d.time) < 0.001;
      showOverlay('GOAL!',
        `TIME ${fmtTime(d.time ?? 0)} ${isBest ? '★NEW RECORD!' : ''}<br>`
        + `BEST ${game.bestTime ? fmtTime(game.bestTime) : '-'}<br>`
        + `🥕 ${d.carrots}/${d.total}　最大コンボ ×${d.maxCombo}　最高速 ${d.topSpeed}<br>`
        + `デス ${d.deaths}<br><br>キー入力 / タップ でリトライ`);
      break;
    }
    default:
      overlay.classList.add('hidden');
  }
}

game.on((type, data) => {
  renderer.handleEvent(type, data, game);
  switch (type) {
    case 'finish':
      game.lastFinish = data;
      if (game.bestTime === null || data.time < game.bestTime) {
        game.bestTime = data.time;
        localStorage.setItem(BEST_KEY, String(data.time));
      }
      finishedAt = performance.now();
      sfx.play('finish');
      break;
    case 'land':
      if (data.impact > 500) sfx.play('land');
      break;
    case 'jump': case 'bhop': case 'slide': case 'carrot':
    case 'checkpoint': case 'death': case 'start':
      sfx.play(type, data);
      break;
  }
  syncOverlay();
});

const actions = {
  pause: () => {
    if (game.state === 'playing' || game.state === 'paused') {
      game.togglePause();
      syncOverlay();
    }
  },
  restart: () => { if (game.state !== 'title') { game.start(); syncOverlay(); } },
  mute: () => {
    const muted = sfx.toggleMute();
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  },
  debug: () => debugOverlay.toggle(),
  anyInput: () => {
    sfx.unlock();
    if (game.state === 'title') { game.start(); syncOverlay(); }
    else if (game.state === 'finished' && performance.now() - finishedAt > 800) {
      game.start();
      syncOverlay();
    }
  },
};

new Input(game, actions);
overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.anyInput(); });
window.addEventListener('resize', () => renderer.resize());

// HUD
const hud = {
  time: $('hud-time'), speedBar: $('speed-bar'), speedVal: $('hud-speed'),
  combo: $('hud-combo'), carrots: $('hud-carrots'),
};
let comboShown = 0;
function updateHud() {
  hud.time.textContent = fmtTime(game.time);
  const sp = Math.abs(game.p.vx);
  hud.speedVal.textContent = Math.round(sp);
  const ratio = Math.min(1, sp / PHYS.maxSpeed);
  hud.speedBar.style.width = `${ratio * 100}%`;
  hud.speedBar.classList.toggle('hot', sp > PHYS.maxRun + 40);
  hud.carrots.textContent = `${game.carrots}/${game.level.totalCarrots}`;
  if (game.combo !== comboShown) {
    comboShown = game.combo;
    hud.combo.textContent = game.combo > 0 ? `HOP ×${game.combo}` : '';
    if (game.combo > 0) {
      hud.combo.classList.remove('bump');
      void hud.combo.offsetWidth; // アニメーション再トリガー
      hud.combo.classList.add('bump');
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  game.update(dt);
  renderer.render(game, dt);
  updateHud();
  debugOverlay.update(dt);
  requestAnimationFrame(frame);
}

syncOverlay();
requestAnimationFrame(frame);
