(function () {
  'use strict';
  const params=new URLSearchParams(location.search), seed=parseInt(params.get('seed')||'1',10)||1;
  const game=new KorogariGame({ seed:seed });
  const renderer=new KorogariRenderer(document.getElementById('view'));
  const audio=new KorogariAudio();
  const debug=installKorogariDebug(game, renderer);
  const $=id=>document.getElementById(id);
  const overlay=$('overlay'), ticker=$('ticker'), flash=$('flash'), combo=$('combo');
  function showTicker(text){ ticker.textContent=text; ticker.classList.remove('show'); void ticker.offsetWidth; ticker.classList.add('show'); }
  function doFlash(){ flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
  function resultText(s){ const units=[['自転車',1.7],['軽トラ',3.4],['町家の玄関',5.0],['大太鼓',2.1]]; const u=units[Math.min(units.length-1,Math.floor(s.diameter/1.6))]; return '今日のコロガリ: 直径'+s.diameter.toFixed(2)+'m（'+u[0]+' '+Math.max(1,Math.round(s.diameter/u[1]))+'台ぶん）'; }
  function syncHud(){ const s=game.getState(); $('hud-area').textContent=s.area; $('hud-diameter').textContent=s.diameter.toFixed(2)+'m'; $('hud-target').textContent=s.target.toFixed(2)+'m'; $('hud-time').textContent=Math.ceil(s.remainingMs/1000); $('hud-count').textContent=s.count; $('mute-btn').textContent=audio.muted?'MUTED':'SOUND'; combo.textContent=s.combo>1 ? s.combo+' COMBO' : ''; }
  function syncOverlay(){ const s=game.getState(); if(s.mode==='ready'){ overlay.classList.remove('hidden'); $('overlay-title').textContent='コロガリ魂'; $('overlay-sub').textContent='小さなものから巻きこんで、5mを目指せ。'; $('overlay-result').textContent=s.validation.ok?'validate OK: 最終到達見込み '+s.validation.finalPotential.toFixed(2)+'m':'validate NG'; $('play-btn').textContent='START'; } else if(s.paused){ overlay.classList.remove('hidden'); $('overlay-title').textContent='PAUSE'; $('overlay-sub').textContent='Pで再開'; $('overlay-result').textContent=''; $('play-btn').textContent='RESUME'; } else if(s.mode==='result'){ overlay.classList.remove('hidden'); $('overlay-title').textContent=s.win?'CLEAR':'TIME UP'; $('overlay-sub').textContent=resultText(s); $('overlay-result').textContent='巻き込み '+s.count+' 個 / BEST '+(s.best?s.best.diameter.toFixed(2)+'m':'-'); $('play-btn').textContent='PLAY AGAIN'; } else overlay.classList.add('hidden'); }
  game.on(function(type,data){ renderer.handleEvent(type,data); audio.event(type,data); if(type==='absorb'){ showTicker(data.object.name+'を まきこんだ！'); } if(type==='grow'){ doFlash(); showTicker('おおきくなった！！'); } if(type==='goal'){ doFlash(); showTicker(data.goal.toFixed(1)+'m 達成！'); } if(type==='finish') syncOverlay(); });
  const actions={ any:function(){ audio.unlock(); game.start(); syncOverlay(); }, restart:function(){ audio.unlock(); game.restart(); syncOverlay(); }, mute:function(){ audio.unlock(); audio.toggleMute(); syncHud(); }, pause:function(){ if(game.mode==='play'){ game.paused=!game.paused; syncOverlay(); } }, debug:function(){ debug.toggle(); } };
  const input=new KorogariInput(game, actions, $('view'));
  $('play-btn').addEventListener('click', function(){ if(game.mode==='result') game.restart(); if(game.paused) game.paused=false; audio.unlock(); game.start(); syncOverlay(); });
  $('again-btn').addEventListener('click', actions.restart);
  $('restart-btn').addEventListener('click', actions.restart); $('mute-btn').addEventListener('click', actions.mute); $('pause-btn').addEventListener('click', actions.pause);
  console.log('[korogari] validate', game.validation);
  let last=performance.now();
  function frame(now){ try { const dt=Math.min(now-last,100); last=now; input.update(); game.update(dt); audio.update(game); renderer.render(game,dt); syncHud(); debug.update(); } catch(err){ console.error('[frame]',err); } requestAnimationFrame(frame); }
  syncOverlay(); syncHud(); requestAnimationFrame(frame);
  window.__renderOnce = function(dt){ try { dt=dt||16.7; input.update(); game.update(dt); renderer.render(game,dt); syncHud(); debug.update(); return $('view').toDataURL('image/png').length; } catch(err){ console.error('[renderOnce]',err); return -1; } };
})();
