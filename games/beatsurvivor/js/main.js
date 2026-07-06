// エントリポイント。依存スクリプトは index.html で先に読み込まれている前提。
const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') ?? '0', 10) || 0;

const game = new Game({ seed });
const renderer = new Renderer(document.getElementById('view'));
const music = new Music(game);
const debugOverlay = installDebug(game);

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const levelupPanel = $('levelup');
let endedAt = 0;

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = String(Math.floor(t % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function showOverlay(title, sub) {
  $('overlay-title').innerHTML = title;
  $('overlay-sub').innerHTML = sub;
  overlay.classList.remove('hidden');
}

function statLine(d) {
  return `生存 ${fmtTime(d.time)}　Lv${d.level}　撃破 ${d.kills}<br>`
    + `PERFECT ${d.perfect} / GOOD ${d.good} / MISS ${d.miss}<br>`
    + `最大GROOVE ×${(1 + Math.min(d.maxGroove, GROOVE_MAX) * GROOVE_STEP).toFixed(2)}`;
}

function syncOverlay() {
  levelupPanel.classList.toggle('hidden', game.state !== 'levelup');
  switch (game.state) {
    case 'title':
      showOverlay('BEAT<br>SURVIVOR',
        'WASD/←→↑↓:移動　<b>SPACE:ダッシュ</b><br>'
        + 'ビートに合わせてダッシュすると <b>GROOVE</b> が上がり火力アップ！<br>'
        + '自機に収束するリングがビートの目印。3分後のボスを倒せ！<br><br>'
        + 'キー入力 / タップ でスタート');
      break;
    case 'paused':
      showOverlay('PAUSE', 'P / ⏸ で再開');
      break;
    case 'dead':
      showOverlay('GAME OVER', statLine(game.lastEnd ?? {}) + '<br><br>キー入力 / タップ でリトライ');
      break;
    case 'clear':
      showOverlay('STAGE CLEAR!', statLine(game.lastEnd ?? {}) + '<br><br>キー入力 / タップ でもう一度');
      break;
    default:
      overlay.classList.add('hidden');
  }
}

// レベルアップカードはビートに合わせて1枚ずつ「ドン」と登場する
let cardQueue = [];
function renderLevelup(choices) {
  const box = $('levelup-cards');
  box.innerHTML = '';
  cardQueue = [];
  choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.innerHTML = `<span class="card-icon">${c.icon}</span>`
      + `<span class="card-name">${c.name} <em>${c.isNew ? 'NEW!' : `Lv${c.lv}`}</em></span>`
      + `<span class="card-desc">${c.desc}</span>`
      + `<span class="card-key">${i + 1}</span>`;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.pick(i); });
    box.appendChild(btn);
    cardQueue.push(btn);
  });
}

function onBeatUI() {
  // GROOVEメーターは常にビートで脈動
  const gb = document.querySelector('.groove-box');
  gb.classList.remove('beatpulse');
  void gb.offsetWidth;
  gb.classList.add('beatpulse');
  if (game.state !== 'levelup') return;
  const next = cardQueue.find((c) => !c.classList.contains('in'));
  if (next) {
    // 次のカードをドンと出す
    next.classList.add('in');
    music.sfx('cardin');
  } else {
    // 全部出たらビートで振動し続ける
    for (const c of document.querySelectorAll('#levelup-cards .card')) {
      c.classList.remove('thump');
      void c.offsetWidth;
      c.classList.add('thump');
    }
  }
}

game.on((type, data) => {
  renderer.handleEvent(type, data, game);
  switch (type) {
    case 'beat': onBeatUI(); break;
    case 'dash': music.sfx(data.judge, data); break;
    case 'kill': music.sfx('kill'); break;
    case 'hurt': music.sfx('hurt'); break;
    case 'gem': music.sfx('gem'); break;
    case 'boss': music.sfx('boss'); break;
    case 'levelup-open':
      music.sfx('levelup');
      renderLevelup(data.choices);
      break;
    case 'dead': case 'clear':
      game.lastEnd = data;
      endedAt = performance.now();
      music.sfx(type === 'clear' ? 'clear' : 'dead');
      break;
  }
  if (['start', 'pause', 'resume', 'levelup-open', 'levelup-pick', 'dead', 'clear', 'boss'].includes(type)) syncOverlay();
});

const actions = {
  dash: () => game.dash(),
  pick: (i) => {
    // まだビート演出で登場していないカードは選べない
    if (cardQueue[i] && !cardQueue[i].classList.contains('in')) return;
    game.pick(i);
    syncOverlay();
  },
  pause: () => {
    if (game.state === 'playing' || game.state === 'paused') {
      game.togglePause();
      syncOverlay();
    }
  },
  restart: () => { if (game.state !== 'title') { game.start(); syncOverlay(); } },
  mute: () => {
    const muted = music.toggleMute();
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  },
  debug: () => debugOverlay.toggle(),
  anyInput: () => {
    music.unlock();
    if (game.state === 'title') { game.start(); syncOverlay(); }
    else if ((game.state === 'dead' || game.state === 'clear') && performance.now() - endedAt > 800) {
      game.start();
      syncOverlay();
    }
  },
};

new Input(game, actions, document.getElementById('view'));
overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.anyInput(); });
window.addEventListener('resize', () => renderer.resize());

// HUD
const hud = {
  hpFill: $('hp-fill'), hpText: $('hp-text'),
  xpFill: $('xp-fill'), level: $('hud-level'),
  time: $('hud-time'), kills: $('hud-kills'),
  groove: $('groove-num'), grooveFill: $('groove-fill'), grooveMult: $('groove-mult'),
  bossWrap: $('boss-bar'), bossFill: $('boss-fill'),
};
let grooveShown = -1;
function updateHud() {
  hud.hpFill.style.width = `${Math.max(0, game.p.hp / game.p.maxHp) * 100}%`;
  hud.hpText.textContent = `${Math.max(0, Math.round(game.p.hp))}`;
  hud.xpFill.style.width = `${(game.xp / xpForLevel(game.level)) * 100}%`;
  hud.level.textContent = game.level;
  hud.time.textContent = fmtTime(game.time);
  hud.kills.textContent = game.kills;
  hud.grooveFill.style.width = `${Math.min(game.groove, GROOVE_MAX) / GROOVE_MAX * 100}%`;
  hud.grooveMult.textContent = `×${game.grooveMult().toFixed(2)}`;
  if (game.groove !== grooveShown) {
    grooveShown = game.groove;
    hud.groove.textContent = game.groove;
    hud.grooveMult.classList.remove('bump');
    void hud.grooveMult.offsetWidth;
    hud.grooveMult.classList.add('bump');
  }
  const boss = game.bossRef;
  hud.bossWrap.classList.toggle('hidden', !boss);
  if (boss) hud.bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  // 例外が出てもループは維持する（1フレーム破棄が最悪ケースになるように）
  try {
    game.update(dt);
    renderer.render(game, dt);
    updateHud();
    debugOverlay.update(dt);
  } catch (err) {
    console.error('[frame]', err);
  }
  requestAnimationFrame(frame);
}

syncOverlay();
requestAnimationFrame(frame);
