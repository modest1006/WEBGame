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
let selectedMode = MODE_NORMAL;

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = String(Math.floor(t % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function showOverlay(title, sub) {
  $('overlay-title').innerHTML = title;
  $('overlay-sub').innerHTML = sub;
  overlay.classList.remove('hidden');
  syncModeButtons();
}

function statLine(d) {
  if (d.mode === MODE_ENDLESS) {
    const best = d.bestTime ? `<br>BEST ${fmtTime(d.bestTime)}` : '';
    return `SURVIVAL ${fmtTime(d.time)} / KILLS ${d.kills} / SCORE ${d.score}<br>`
      + `MAX GROOVE x${(1 + Math.min(d.maxGroove ?? 0, GROOVE_MAX) * GROOVE_STEP).toFixed(2)} / BPM ${d.bpm ?? BPM}`
      + best;
  }
  return `TIME ${fmtTime(d.time)} / Lv${d.level} / KILLS ${d.kills}<br>`
    + `PERFECT ${d.perfect} / GOOD ${d.good} / MISS ${d.miss}<br>`
    + `MAX GROOVE x${(1 + Math.min(d.maxGroove ?? 0, GROOVE_MAX) * GROOVE_STEP).toFixed(2)}`;
}

function modeSelectHtml() {
  return '<div class="mode-select">'
    + `<button class="mode-btn" data-mode="${MODE_NORMAL}">NORMAL<span>3:00 BOSS / 5:00 CLEAR</span></button>`
    + `<button class="mode-btn" data-mode="${MODE_ENDLESS}">ENDLESS<span>SURVIVE UNTIL DEATH</span></button>`
    + '</div>';
}

function settingsHtml() {
  const volumes = game.settings.volumes ?? { bgm: 1, sfx: 1, judge: 1 };
  const slider = (key, label) => {
    const value = Math.round(Math.max(0, Math.min(1, Number(volumes[key] ?? 1))) * 100);
    return `<label class="volume-row"><span>${label}</span>`
      + `<input class="volume-slider" type="range" min="0" max="100" value="${value}" data-volume="${key}">`
      + `<b>${value}</b></label>`;
  };
  return '<div class="settings-panel">'
    + `<button class="setting-toggle" data-setting="screenShake">SHAKE <b>${game.settings.screenShake ? 'ON' : 'OFF'}</b></button>`
    + `<button class="setting-toggle" data-setting="reducedFlash">FLASH <b>${game.settings.reducedFlash ? 'LOW' : 'FULL'}</b></button>`
    + '<div class="volume-panel">'
    + slider('bgm', 'BGM')
    + slider('sfx', 'SFX')
    + slider('judge', 'JUDGE')
    + '</div>'
    + '</div>';
}

function saveSettings() {
  const saved = updateBeatSurvivorSave((data) => { data.settings = { ...game.settings }; });
  game.save = saved;
}

function syncModeButtons() {
  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  }
}

function syncOverlay() {
  levelupPanel.classList.toggle('hidden', game.state !== 'levelup');
  switch (game.state) {
    case 'title':
      showOverlay('BEAT<br>SURVIVOR',
        modeSelectHtml() + 'WASD/←→↑↓:移動　<b>SPACE:ダッシュ</b><br>'
        + 'ビートに合わせてダッシュすると <b>GROOVE</b> が上がり火力アップ！<br>'
        + '自機に収束するリングがビートの目印。3分後のボスを倒せ！<br><br>'
        + 'キー入力 / タップ でスタート');
      break;
    case 'paused':
      showOverlay('PAUSE', settingsHtml() + 'P / Esc to resume');
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
    case 'start': music.setBossMode(false); break;
    case 'beat': onBeatUI(); break;
    case 'dash': music.sfx(data.judge, data); break;
    case 'maxgroove': music.sfx('maxgroove', data); break;
    case 'bossdead': music.setBossMode(false); break;
    case 'bossdefeat-explode': music.sfx('bossboom', data); break;
    case 'deathstart': music.sfx('hurt'); break;
    case 'kill': music.sfx('kill'); break;
    case 'hurt': music.sfx('hurt'); break;
    case 'gem': music.sfx('gem'); break;
    case 'boss':
      music.setBossMode(true);
      music.sfx('boss');
      break;
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
    if (game.state === 'playing' || game.state === 'levelup' || game.state === 'paused') {
      game.togglePause();
      if (game.state !== 'paused') music.unlock();
      syncOverlay();
    }
  },
  restart: () => { if (game.state !== 'title') { game.start(selectedMode); syncOverlay(); } },
  mute: () => {
    const muted = music.toggleMute();
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  },
  debug: () => debugOverlay.toggle(),
  anyInput: () => {
    music.unlock();
    if (game.state === 'title') { game.start(selectedMode); syncOverlay(); }
    else if ((game.state === 'dead' || game.state === 'clear') && performance.now() - endedAt > 800) {
      game.start(selectedMode);
      syncOverlay();
    }
  },
};

new Input(game, actions, document.getElementById('view'));
overlay.addEventListener('pointerdown', (e) => {
  const modeBtn = e.target.closest('[data-mode]');
  if (!modeBtn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  selectedMode = modeBtn.dataset.mode === MODE_ENDLESS ? MODE_ENDLESS : MODE_NORMAL;
  game.setMode(selectedMode);
  syncModeButtons();
});
overlay.addEventListener('pointerdown', (e) => {
  const settingBtn = e.target.closest('[data-setting]');
  if (!settingBtn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const key = settingBtn.dataset.setting;
  if (key === 'screenShake') game.settings.screenShake = !game.settings.screenShake;
  if (key === 'reducedFlash') game.settings.reducedFlash = !game.settings.reducedFlash;
  saveSettings();
  syncOverlay();
});
overlay.addEventListener('input', (e) => {
  const slider = e.target.closest('[data-volume]');
  if (!slider) return;
  const value = Math.max(0, Math.min(100, Number(slider.value) || 0));
  music.setVolume(slider.dataset.volume, value / 100);
  const readout = slider.parentElement?.querySelector('b');
  if (readout) readout.textContent = String(Math.round(value));
  saveSettings();
});
overlay.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-volume]')) return;
  e.stopImmediatePropagation();
});
overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.anyInput(); });
window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (game.state === 'playing' || game.state === 'levelup')) {
    game.pause();
    music.stop();
    syncOverlay();
  }
});

window.__music = {
  getPhraseLog: () => music.phraseLog.slice(),
  getVolumes: () => music.getVolumes(),
  setVolume: (kind, value) => {
    const applied = music.setVolume(kind, value);
    saveSettings();
    return applied;
  },
  setBossMode: (on) => music.setBossMode(on),
};

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
  hud.time.textContent = game.isEndless() ? `${fmtTime(game.time)} / ${Math.round(game.currentBpm())} BPM` : fmtTime(game.time);
  hud.kills.textContent = game.kills;
  hud.grooveFill.style.width = `${Math.min(game.groove, GROOVE_MAX) / GROOVE_MAX * 100}%`;
  hud.grooveMult.textContent = `x${game.grooveMult().toFixed(2)}`;
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
