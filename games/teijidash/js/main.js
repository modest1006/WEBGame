const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '0', 10) || 0;

const game = new TeijiDashGame({ seed });
const renderer = new Renderer(document.getElementById('view'));
const music = new Music();
const debugOverlay = installDebug(game);

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const judgeEl = $('judge');
const muteBtn = $('mute-btn');

function showOverlay(title, sub) {
  $('overlay-title').innerHTML = title;
  $('overlay-sub').innerHTML = sub;
  overlay.classList.remove('hidden');
}

function syncHud() {
  const s = game.getState();
  $('day').textContent = s.dayName;
  $('act').textContent = s.act;
  $('score').textContent = Math.floor(s.score).toLocaleString('en-US');
  $('best').textContent = Math.floor(game.best).toLocaleString('en-US');
  $('prep-bar').style.width = s.prep + '%';
  $('meter-label').textContent = game.act === ACT.DASH ? `疾走 ${s.runX}m / Combo ${s.combo}` : game.act === ACT.JUST ? `定時まで ${fmtMs(Math.max(0, -s.clockMs))}` : `帰り支度 ${s.prep}%`;
  judgeEl.textContent = game.flashMs > 0 ? game.flashText : '';
}

function syncOverlay() {
  if (game.act === ACT.TITLE) {
    showOverlay('定時ダッシュ', 'Space、クリック、タップで開始');
  } else if (game.act === ACT.DAY_RESULT && game.dayResult) {
    const r = game.dayResult;
    showOverlay(`${DAY_JP[r.day]}曜 ${r.rank}`, `Score ${r.score.toLocaleString('en-US')}<br>支度 ${r.prep}% / ${r.judge} ${r.offset}ms<br>押すと次の日へ`);
  } else if (game.act === ACT.WEEK_RESULT) {
    const r = game.result();
    showOverlay(`今週の称号<br>${r.title}`, `週間 ${r.weekScore.toLocaleString('en-US')} / BEST ${r.best.toLocaleString('en-US')}<br>今週の残業時間 ${r.overtime}<br>押すと再挑戦`);
  } else if (game.paused) {
    showOverlay('PAUSE', 'Pで再開');
  } else {
    overlay.classList.add('hidden');
  }
}

game.on((type, data) => {
  renderer.handleEvent(type, data, game);
  music.event(type, data);
  if (type === 'dayResult' || type === 'weekResult' || type === 'start' || type === 'act') syncOverlay();
});

const actions = {
  anyInput: () => music.unlock(),
  press: (down) => { music.unlock(); game.press(down); syncOverlay(); },
  release: () => game.release(),
  restart: () => { music.unlock(); game.start(); syncOverlay(); },
  mute: () => { muteBtn.textContent = music.toggleMute() ? '×' : '♪'; },
  pause: () => { if (game.act !== ACT.TITLE) game.paused = !game.paused; syncOverlay(); },
  debug: () => debugOverlay.toggle(),
};

new Input(game, actions, document.getElementById('view'));
overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.press(true); actions.release(); });
window.addEventListener('resize', () => renderer.resize());

syncHud();
syncOverlay();

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  try {
    game.update(dt);
    music.update(game);
    renderer.render(game, dt);
    syncHud();
    debugOverlay.update(dt);
  } catch (err) {
    console.error('[frame]', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ヘッドレス検証用: rAFが止まる非表示環境でも1フレーム描画できる手動ポンプ
window.__renderOnce = (dt = 16.7) => {
  try {
    renderer.render(game, dt);
    syncHud();
    return document.getElementById('view').toDataURL('image/png').length;
  } catch (err) { console.error('[renderOnce]', err); return -1; }
};
