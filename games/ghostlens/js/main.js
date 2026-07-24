(function () {
  'use strict';

  const params=new URLSearchParams(window.location.search);
  const seed=Number(params.get('seed'))||73191;
  const jumpscareEnabled=params.get('jumpscare')!=='0';
  let bestScore=0;
  try{bestScore=Number(localStorage.getItem('ghostlens-best'))||0;}catch(error){}

  const canvas=document.getElementById('world');
  const titleScreen=document.getElementById('title-screen');
  const resultScreen=document.getElementById('result-screen');
  const hud=document.getElementById('hud');
  const gyroButton=document.getElementById('gyro-start-btn');
  const fallbackButton=document.getElementById('fallback-start-btn');
  const calibrateButton=document.getElementById('calibrate-btn');
  const shutterButton=document.getElementById('shutter-btn');
  const muteButton=document.getElementById('mute-btn');
  const zoomButton=document.getElementById('zoom-btn');
  const restartButton=document.getElementById('restart-btn');
  const dexButton=document.getElementById('dex-btn');
  const dexCloseButton=document.getElementById('dex-close-btn');
  const dateStamp=document.getElementById('date-stamp');
  const debugOverlay=document.getElementById('debug-overlay');
  let progressionStorage=null;
  try{progressionStorage=window.localStorage;}catch(error){}
  const progression=new GhostLensProgression(progressionStorage);

  let renderer=null;
  let audio=null;
  let input=null;
  let slowMotionMs=0;
  let gyroHintShown=false;
  let debugVisible=params.get('debug')==='1';
  let lastTime=performance.now();

  function eventBoundary(type,data){
    try{
      if(audio)audio.handleEvent(type,data);
      if(renderer)renderer.handleEvent(type,data);
      if(type==='capture'){
        slowMotionMs=300+(data.hitStopMs||0);
        const photo=game.getState().photos.find(function(item){return item.id===data.photoId;});
        progression.recordCapture(data,photo);
        if(renderer)renderer.updateProgression(progression.getState());
      }
      if(type==='finish'){
        try{localStorage.setItem('ghostlens-best',String(game.bestScore));}catch(error){}
        const resultMeta=progression.recordResult(game.score);
        if(renderer){
          renderer.updateProgression(progression.getState());
          renderer.showResult(game.getState(),resultMeta);
        }
        hud.classList.add('hidden');
      }
    }catch(error){console.error('[GHOST LENS event boundary]',type,error);}
  }

  const game=new GhostLensGame({seed:seed,bestScore:bestScore,jumpscareEnabled:jumpscareEnabled,onEvent:eventBoundary});
  audio=new GhostLensAudio();
  renderer=new GhostLensRenderer({canvas:canvas,game:game});
  renderer.updateProgression(progression.getState());
  input=new GhostLensInput({
    surface:canvas,
    onShutter:function(){game.shutter();},
    onToggleDebug:function(){setDebugVisible(!debugVisible);},
    isPlaying:function(){return game.mode==='play';}
  });

  function setDebugVisible(visible){
    debugVisible=!!visible;
    debugOverlay.classList.toggle('hidden',!debugVisible);
  }
  setDebugVisible(debugVisible);

  function updateDate(){
    const d=new Date();
    dateStamp.textContent=d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');
  }
  updateDate();

  function beginPlay(){
    titleScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    renderer.hideDex();
    hud.classList.remove('hidden');
    game.start();
    lastTime=performance.now();
  }

  function waitForOrientationAndStart(){
    let attempts=0;
    const timer=setInterval(function(){
      attempts++;
      if(input.gyro.quaternion){
        clearInterval(timer);
        input.calibrate();
        beginPlay();
        if(!gyroHintShown){
          gyroHintShown=true;
          renderer.showMessage('スワイプでも見回せます','hint');
        }else renderer.showMessage('NEUTRAL SET','');
      }else if(attempts>=16){
        clearInterval(timer);
        beginPlay();
        renderer.showMessage('GYRO SIGNAL WAITING','');
      }
    },80);
  }

  gyroButton.addEventListener('click',function(){
    gyroButton.disabled=true;
    gyroButton.textContent='許可を確認中…';
    audio.unlock();
    input.requestGyro().then(function(granted){
      gyroButton.disabled=false;
      gyroButton.textContent='ジャイロで構える';
      if(granted)waitForOrientationAndStart();
      else{
        beginPlay();
        renderer.showMessage(input.gyro.permission==='unsupported'?'DRAG MODE':'GYRO DENIED / DRAG MODE','');
      }
    }).catch(function(error){
      console.error('[GHOST LENS gyro permission]',error);
      gyroButton.disabled=false;
      beginPlay();
    });
  });

  fallbackButton.addEventListener('click',function(){
    audio.unlock();
    beginPlay();
    renderer.showMessage('DRAG MODE','');
  });
  calibrateButton.addEventListener('click',function(event){
    event.stopPropagation();
    if(input.calibrate())renderer.showMessage('NEUTRAL SET','');
    else{
      input.setPose(0,0);game.setCamera(0,0);renderer.showMessage('VIEW RESET','');
    }
  });
  shutterButton.addEventListener('pointerdown',function(event){event.stopPropagation();});
  shutterButton.addEventListener('click',function(event){event.stopPropagation();game.shutter();});
  muteButton.addEventListener('click',function(event){
    event.stopPropagation();
    audio.unlock();
    const muted=audio.setMuted(!audio.muted);
    muteButton.setAttribute('aria-pressed',muted?'true':'false');
    muteButton.textContent=muted?'× MUTED':'♪ SOUND';
  });
  zoomButton.addEventListener('click',function(event){event.stopPropagation();game.setZoom();});
  restartButton.addEventListener('click',function(){
    game.reset();
    game.bestScore=Math.max(game.bestScore,bestScore);
    resultScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    game.start();
    input.setPose(0,0);
    renderer.showMessage('CASE REOPENED','');
    lastTime=performance.now();
  });
  dexButton.addEventListener('click',function(){
    renderer.showDex(progression.getState());
  });
  dexCloseButton.addEventListener('click',function(){
    renderer.hideDex();
  });

  function frame(now){
    try{
      let dt=Math.min(50,Math.max(0,now-lastTime));
      lastTime=now;
      const pose=input.update(dt);
      if(game.mode==='play'){
        if(game.hitStopMs<=0)game.setCamera(pose.yaw,pose.pitch);
        const logicDt=game.hitStopMs>0?dt:(slowMotionMs>0?dt*.18:dt);
        game.update(logicDt);
        if(slowMotionMs>0)slowMotionMs=Math.max(0,slowMotionMs-dt);
      }
      const state=game.getState();
      audio.update(state,dt);
      renderer.render(state,dt);
      if(debugVisible){
        debugOverlay.textContent=game.dump()+'\n\nINPUT '+JSON.stringify(input.getState(),null,1)+'\nAUDIO '+JSON.stringify(audio.getState())+'\nRENDER '+JSON.stringify(renderer.getInfo());
      }
    }catch(error){console.error('[GHOST LENS animation frame]',error);}
    requestAnimationFrame(frame);
  }

  window.__renderOnce=function(dt){
    try{
      const ms=Number(dt)||0;
      const state=game.getState();
      audio.update(state,ms);
      renderer.render(state,ms);
      if(debugVisible)debugOverlay.textContent=game.dump();
      return renderer.getInfo();
    }catch(error){console.error('[GHOST LENS manual render]',error);return null;}
  };

  window.__ghostlens={
    game:game,
    input:input,
    audio:audio,
    renderer:renderer,
    progression:progression,
    beginPlay:beginPlay,
    setDebugVisible:setDebugVisible
  };
  renderer.render(game.getState(),0);
  requestAnimationFrame(frame);
})();
