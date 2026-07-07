(function () {
  'use strict';
  const params=new URLSearchParams(location.search), seed=parseInt(params.get('seed')||'1',10)||1;
  const game=new HoshikuiGame({ seed:seed });
  const renderer=new HoshikuiRenderer(document.getElementById('view'));
  const audio=new HoshikuiAudio();
  const debug=installHoshikuiDebug(game, renderer);
  const $=id=>document.getElementById(id), overlay=$('overlay'), ticker=$('ticker'), flash=$('flash');
  function showTicker(text){ ticker.textContent=text; ticker.classList.remove('show'); void ticker.offsetWidth; ticker.classList.add('show'); }
  function doFlash(){ flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
  function resultText(s){ return '今日の星喰い: 質量 地球'+Math.max(1,Math.round(s.mass)).toLocaleString()+'個ぶん / 喰った星 '+s.count+'個'; }
  function syncHud(){
    const s=game.getState(); $('hud-stage').textContent=s.stageName; $('hud-mass').textContent=s.mass.toFixed(1);
    $('hud-next').textContent=s.nextMass?s.nextMass.toFixed(0):'CORE'; $('hud-time').textContent=Math.ceil(s.remainingMs/1000);
    $('hud-count').textContent=s.count; $('hud-moons').textContent=s.satellites; $('mute-btn').textContent=audio.muted?'MUTED':'SOUND';
  }
  function syncOverlay(){
    const s=game.getState();
    if(s.mode==='ready'){ overlay.classList.remove('hidden'); $('overlay-title').textContent='星喰い HOSHIKUI'; $('overlay-sub').textContent='岩石から始まり、銀河コアを喰らうブラックホールへ。'; $('overlay-result').textContent=s.validation.ok?'validate OK: 最終質量 '+s.validation.finalMass.toFixed(1)+' / 銀河コア到達可能':'validate NG: 配置総質量不足'; $('play-btn').textContent='START'; }
    else if(s.paused){ overlay.classList.remove('hidden'); $('overlay-title').textContent='PAUSE'; $('overlay-sub').textContent='Pで再開'; $('overlay-result').textContent=''; $('play-btn').textContent='RESUME'; }
    else if(s.mode==='result'){ overlay.classList.remove('hidden'); $('overlay-title').textContent=s.win?'GALAXY EATEN':'TIME UP'; $('overlay-sub').textContent=resultText(s); $('overlay-result').textContent='衛星 '+s.satellites+' / BEST '+(s.best?Math.round(s.best.mass).toLocaleString():'-'); $('play-btn').textContent='PLAY AGAIN'; }
    else overlay.classList.add('hidden');
  }
  game.on(function(type,data){
    renderer.handleEvent(type,data); audio.event(type,data);
    if(type==='absorb') showTicker(data.object.name+'を喰った！');
    if(type==='evolve'){ doFlash(); showTicker(data.stage.name+'になった！！'); }
    if(type==='bump') showTicker(data.burn?'衛星がちょっと焦げた！':'大きすぎる星に弾かれた！');
    if(type==='finish'){ if(data.win) doFlash(); syncOverlay(); }
  });
  const actions={ any:function(){ audio.unlock(); game.start(); syncOverlay(); }, restart:function(){ audio.unlock(); game.restart(); renderer.lastStage=-1; syncOverlay(); }, mute:function(){ audio.unlock(); audio.toggleMute(); syncHud(); }, pause:function(){ if(game.mode==='play'){ game.paused=!game.paused; syncOverlay(); } }, debug:function(){ debug.toggle(); } };
  const input=new HoshikuiInput(game, actions, $('view'));
  $('play-btn').addEventListener('click', function(){ if(game.mode==='result') actions.restart(); if(game.paused) game.paused=false; audio.unlock(); game.start(); syncOverlay(); });
  $('again-btn').addEventListener('click', actions.restart); $('restart-btn').addEventListener('click', actions.restart); $('mute-btn').addEventListener('click', actions.mute); $('pause-btn').addEventListener('click', actions.pause);
  console.log('[hoshikui] validate', game.validation);
  let last=performance.now();
  function frame(now){ try { const dt=Math.min(now-last,100); last=now; input.update(); game.update(dt); audio.update(game); renderer.render(game,dt); syncHud(); debug.update(); } catch(err){ console.error('[frame]',err); } requestAnimationFrame(frame); }
  syncOverlay(); syncHud(); requestAnimationFrame(frame);
  window.__renderOnce=function(dt){ try { dt=dt||16.7; input.update(); game.update(dt); renderer.render(game,dt); syncHud(); debug.update(); return $('view').toDataURL('image/png').length; } catch(err){ console.error('[renderOnce]',err); return -1; } };
})();
