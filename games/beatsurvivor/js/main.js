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
let exitArmedAt = 0; // EXIT 2段確認用
let selectedMode = MODE_NORMAL;
let overlayView = 'title';
let pendingLoadout = { weapon: 'beatshot', passive: 'amp' };

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
  animateChipCount();
}

function statLine(d) {
  const chips = d.chipBreakdown;
  const achievementLine = d.achievementsUnlocked?.length
    ? '<br><span class="unlock-line">UNLOCK '
      + d.achievementsUnlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id).join(' / ')
      + '</span>'
    : '';
  const chipLine = chips ? '<br><br><span class="chip-breakdown">'
    + `KILL ${chips.kills} / TIER ${chips.tier} / BOSS ${chips.boss} / SURVIVE ${chips.survival}`
    + (chips.wave ? ` / WAVE ${chips.wave}` : '')
    + (chips.bonus ? ` / BONUS ${chips.bonus}` : '')
    + `</span><br><b class="chip-total" data-chip-count="${chips.total}">+0 CHIPS</b>`
    + achievementLine
    + '<br><button class="studio-link" data-open-studio="1">STUDIOで強化</button>' : '';
  if (d.mode === MODE_ENDLESS) {
    const best = d.bestTime ? `<br>BEST ${fmtTime(d.bestTime)}` : '';
    return `SURVIVAL ${fmtTime(d.time)} / KILLS ${d.kills} / SCORE ${d.score}<br>`
      + `MAX GROOVE x${(1 + Math.min(d.maxGroove ?? 0, GROOVE_MAX) * GROOVE_STEP).toFixed(2)} / BPM ${d.bpm ?? BPM}`
      + best + chipLine;
  }
  return `TIME ${fmtTime(d.time)} / Lv${d.level} / KILLS ${d.kills}<br>`
    + `PERFECT ${d.perfect} / GOOD ${d.good} / MISS ${d.miss}<br>`
    + `MAX GROOVE x${(1 + Math.min(d.maxGroove ?? 0, GROOVE_MAX) * GROOVE_STEP).toFixed(2)}`
    + chipLine;
}

function modeSelectHtml() {
  // モード選択はカセットテープ意匠（「押したら開始」に見えないように。開始はPLAYのみ）
  const cassette = (mode, title, sub, tone) => `
    <button class="cassette ${tone}" data-mode="${mode}" aria-label="${title}">
      <span class="c-screw a"></span><span class="c-screw b"></span>
      <span class="c-label">${title}</span>
      <span class="c-window"><i class="reel"></i><span class="tape"></span><i class="reel"></i></span>
      <span class="c-sub">${sub}</span>
    </button>`;
  return '<p class="deck-hint">─ SELECT TAPE ─</p><div class="mode-select cassette-deck">'
    + cassette(MODE_NORMAL, 'STANDARD MIX', '3:00 BOSS / 5:00 CLEAR', 'cyan')
    + cassette(MODE_ENDLESS, 'ENDLESS MIX', 'SURVIVE UNTIL DEATH', 'magenta')
    + '</div>';
}

function titleHtml() {
  const meta = normalizeMeta(game.meta);
  return `<div class="chip-wallet">NEON CHIPS <b>${meta.chips}</b></div>`
    + modeSelectHtml()
    + '<div class="title-actions">'
    + '<button class="studio-link" data-start-run="1">PLAY</button>'
    + '<button class="studio-link" data-open-studio="1">STUDIO</button>'
    + '<button class="studio-link" data-open-achievements="1">ACHIEVEMENTS</button>'
    + '</div>'
    + 'WASD/矢印: MOVE　<b>SPACE: DASH</b><br>'
    + 'Beat-perfect dashes raise <b>GROOVE</b>. Build your sound system between runs.';
}

function studioHtml() {
  const meta = normalizeMeta(game.meta);
  const rack = META_GEAR.map((g, i) => {
    const lv = gearLevel(meta, g.id);
    return `<span class="rack-unit ${lv > 0 ? 'on' : ''} lv${lv}" style="--i:${i}" aria-label="${g.name} Lv${lv}"></span>`;
  }).join('');
  const list = META_GEAR.map((g) => {
    const lv = gearLevel(meta, g.id);
    const next = lv + 1;
    const cost = gearCost(g.id, next);
    const canBuy = lv < 3 && meta.chips >= cost;
    return '<div class="gear-row">'
      + `<div><span class="gear-cat">${g.category}</span><b>${g.name}</b><em>Lv ${lv}/3</em>`
      + `<small>${g.effect}<br>${g.flavor}</small></div>`
      + (lv >= 3 ? '<span class="gear-max">MAX</span>' : `<button class="buy-btn" data-buy-gear="${g.id}" ${canBuy ? '' : 'disabled'}>${cost}</button>`)
      + '</div>';
  }).join('');
  return `<div class="chip-wallet">NEON CHIPS <b>${meta.chips}</b></div>`
    + `<div class="studio-grid"><div class="dj-booth ${isRackComplete(meta) ? 'complete' : ''}">${rack}<div class="booth-deck"></div></div><div class="gear-list">${list}</div></div>`
    + '<div class="title-actions"><button class="studio-link" data-back-title="1">TITLE</button><button class="studio-link" data-open-achievements="1">ACHIEVEMENTS</button></div>';
}

function achievementsHtml() {
  const unlocked = new Set(normalizeMeta(game.meta).achievements);
  const list = ACHIEVEMENTS.map((a) => `<div class="achievement ${unlocked.has(a.id) ? 'on' : ''}">`
    + `<b>${unlocked.has(a.id) ? a.name : '????'}</b><span>${unlocked.has(a.id) ? a.reward : 'SILHOUETTE'}</span></div>`).join('');
  return `<div class="achievements-list">${list}</div>`
    + '<div class="title-actions"><button class="studio-link" data-back-title="1">TITLE</button><button class="studio-link" data-open-studio="1">STUDIO</button></div>';
}

function loadoutHtml() {
  const recordLv = gearLevel(game.meta, 'record_bag');
  const weaponSymbols = { beatshot: '♪', nova: '◎', bass: '◣', laser: '✦' };
  const passiveSymbols = { amp: '▲', speaker: '◎', footwork: '»', battery: '+', metronome: '♪' };
  const weaponBtns = Object.entries(WEAPONS).map(([key, def]) =>
    `<button class="loadout-btn ${pendingLoadout.weapon === key ? 'active' : ''}" data-loadout-weapon="${key}"><b>${weaponSymbols[key] ?? '♪'}</b><span>${def.name}</span></button>`).join('');
  const passiveBtns = recordLv >= 3 ? '<div class="loadout-group">'
    + Object.entries(PASSIVES).map(([key, def]) =>
      `<button class="loadout-btn small ${pendingLoadout.passive === key ? 'active' : ''}" data-loadout-passive="${key}"><b>${passiveSymbols[key] ?? '♪'}</b><span>${def.name}</span></button>`).join('')
    + '</div>' : '';
  return `<p class="loadout-note">RECORD BAG Lv${recordLv} / First track setup</p>`
    + `<div class="loadout-group">${weaponBtns}</div>`
    + passiveBtns
    + '<button class="studio-link" data-confirm-loadout="1">START</button>';
}

function animateChipCount() {
  const el = overlay.querySelector('[data-chip-count]');
  if (!el) return;
  const total = Number(el.dataset.chipCount) || 0;
  const start = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - start) / 650);
    el.textContent = `+${Math.floor(total * k)} CHIPS`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
    + '<button class="resume-btn" data-resume="1">RESUME</button>'
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
function syncOverlay() {
  levelupPanel.classList.toggle('hidden', game.state !== 'levelup');
  switch (game.state) {
    case 'title':
      if (overlayView === 'studio') showOverlay('STUDIO', studioHtml());
      else if (overlayView === 'achievements') showOverlay('ACHIEVEMENTS', achievementsHtml());
      else if (overlayView === 'loadout') showOverlay('SELECT<br>TRACK', loadoutHtml());
      else showOverlay('BEAT<br>SURVIVOR', titleHtml());
      break;
    case 'paused':
      showOverlay('PAUSE', settingsHtml() + 'P / Esc to resume');
      break;
    case 'dead':
      showOverlay('GAME OVER', statLine(game.lastEnd ?? {}) + '<br><br>タップでタイトルへ');
      break;
    case 'clear':
      showOverlay('STAGE CLEAR!', statLine(game.lastEnd ?? {}) + '<br><br>タップでタイトルへ');
      break;
    default:
      overlay.classList.add('hidden');
  }
}

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
    case 'start':
      music.resetSchedule();
      music.setBossMode(false);
      break;
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
  restart: () => {
    // EXIT(タイトルへ戻る)の2段確認。押し間違いでランが消えるのを防ぐ
    music.unlock();
    const btn = $('exit-btn');
    const inRun = game.state === 'playing' || game.state === 'levelup' || game.state === 'paused';
    if (!inRun) return;
    if (performance.now() - exitArmedAt < 3000 && exitArmedAt > 0) {
      exitArmedAt = 0;
      if (btn) { btn.textContent = '⏏'; btn.classList.remove('armed'); }
      selectedMode = game.mode === MODE_ENDLESS ? MODE_ENDLESS : MODE_NORMAL;
      game.state = 'title';
      overlayView = 'title';
      syncOverlay();
    } else {
      exitArmedAt = performance.now();
      if (btn) {
        btn.textContent = 'EXIT?';
        btn.classList.add('armed');
        setTimeout(() => {
          if (exitArmedAt > 0 && performance.now() - exitArmedAt >= 2950) {
            exitArmedAt = 0;
            btn.textContent = '⏏';
            btn.classList.remove('armed');
          }
        }, 3050);
      }
    }
  },
  mute: () => {
    const muted = music.toggleMute();
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  },
  debug: () => debugOverlay.toggle(),
  anyInput: () => {
    music.unlock();
    // タイトルはPLAYボタンからのみ開始（カセット選択タップの誤爆防止）
    if ((game.state === 'dead' || game.state === 'clear') && performance.now() - endedAt > 800) {
      // リザルト後はタイトルへ戻す（連戦はタイトルのPLAYから）
      game.state = 'title';
      overlayView = 'title';
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
  const handled = e.target.closest('[data-open-studio],[data-open-achievements],[data-back-title],[data-start-run],[data-confirm-loadout],[data-loadout-weapon],[data-loadout-passive],[data-buy-gear],[data-resume]');
  if (!handled) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  music.unlock();
  if (handled.dataset.resume) {
    game.resume();
  } else if (handled.dataset.openStudio) {
    if (game.state === 'dead' || game.state === 'clear') game.state = 'title';
    overlayView = 'studio';
  } else if (handled.dataset.openAchievements) {
    if (game.state === 'dead' || game.state === 'clear') game.state = 'title';
    overlayView = 'achievements';
  } else if (handled.dataset.backTitle) {
    if (game.state === 'dead' || game.state === 'clear') game.state = 'title';
    overlayView = 'title';
  }
  else if (handled.dataset.startRun) {
    music.unlock();
    if (gearLevel(game.meta, 'record_bag') > 0) overlayView = 'loadout';
    else game.start(selectedMode);
  } else if (handled.dataset.loadoutWeapon) {
    pendingLoadout.weapon = handled.dataset.loadoutWeapon;
  } else if (handled.dataset.loadoutPassive) {
    pendingLoadout.passive = handled.dataset.loadoutPassive;
  } else if (handled.dataset.confirmLoadout) {
    music.unlock();
    game.start(selectedMode, pendingLoadout);
  } else if (handled.dataset.buyGear) {
    const id = handled.dataset.buyGear;
    const save = updateBeatSurvivorSave((s) => {
      s.meta = normalizeMeta(s.meta);
      const lv = gearLevel(s.meta, id);
      const cost = gearCost(id, lv + 1);
      if (lv >= 3 || s.meta.chips < cost) return;
      s.meta.chips -= cost;
      s.meta.gear[id] = lv + 1;
      if (isRackComplete(s.meta) && !s.meta.achievements.includes('rack_complete')) s.meta.achievements.push('rack_complete');
    });
    game.save = save;
    game.meta = normalizeMeta(save.meta);
    handled.classList.add('installed');
    music.sfx('cardin');
  }
  syncOverlay();
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
  getAudioState: () => ({
    unlocked: !!music.ctx,
    ctxState: music.ctx?.state ?? 'none',
    nextStep: music.nextStep,
    lastScheduleState: music.lastScheduleState,
    master: music.master?.gain.value ?? null,
    bgm: music.bgmGain?.gain.value ?? null,
    sfx: music.sfxGain?.gain.value ?? null,
    judge: music.judgeGain?.gain.value ?? null,
    hasCompressor: !!music.compressor,
  }),
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
