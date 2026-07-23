(function () {
  'use strict';

  function runtime(){return window.__ghostlens;}
  function ensurePlay(){
    const rt=runtime();
    if(rt.game.mode==='ready'){
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      rt.game.start();
    }
    return rt;
  }
  function state(){
    const rt=runtime();
    const snapshot=rt.game.getState();
    snapshot.input=rt.input.getState();
    snapshot.audio=rt.audio.getState();
    snapshot.renderer=rt.renderer.getInfo();
    snapshot.progression=rt.progression.getState();
    return snapshot;
  }

  window.__game={
    getState:state,
    dump:function(){return runtime().game.dump();},
    step:function(ms){
      const rt=ensurePlay();
      rt.game.update(Number(ms)||0);
      rt.audio.update(rt.game.getState(),Number(ms)||0);
      rt.renderer.render(rt.game.getState(),Number(ms)||0);
      return state();
    },
    setCamera:function(yawDeg,pitchDeg){
      const rt=ensurePlay();
      rt.input.setPose(yawDeg,pitchDeg);
      rt.game.setCamera(yawDeg,pitchDeg);
      rt.renderer.render(rt.game.getState(),0);
      return rt.game.getState().camera;
    },
    aimAtGhost:function(id){
      const rt=ensurePlay();
      const target=rt.game.aimAtGhost(id);
      if(target!==false){
        const camera=rt.game.getState().camera;
        rt.input.setPose(camera.yaw,camera.pitch);
        rt.renderer.render(rt.game.getState(),0);
      }
      return target;
    },
    spawnGhost:function(type,yawDeg,pitchDeg){
      const rt=ensurePlay();
      const id=rt.game.spawnGhost(type,yawDeg,pitchDeg,false);
      rt.renderer.render(rt.game.getState(),0);
      return id;
    },
    shutter:function(){return ensurePlay().game.shutter();},
    setTime:function(sec){const rt=ensurePlay();rt.game.setTime(sec);return rt.game.getState().remainingMs;},
    reloadFilm:function(){return ensurePlay().game.reloadFilm();},
    setFilm:function(n){return ensurePlay().game.setFilm(n);},
    triggerJumpscare:function(){return ensurePlay().game.triggerJumpscare();},
    getDex:function(){return runtime().progression.getState();},
    titleForScore:function(score){return GhostLensProgression.titleForScore(score);},
    sampleGhosts:function(count,elapsedSec,seed){
      const total=Math.max(1,Math.min(10000,Math.floor(Number(count)||100)));
      const probe=new GhostLensGame({seed:Number(seed)||runtime().game.seed,jumpscareEnabled:false});
      probe.elapsedMs=Math.max(0,Math.min(90000,(Number(elapsedSec)||0)*1000));
      const counts={drifter:0,crawler:0,doll:0,mirror:0,gold:0};
      for(let i=0;i<total;i++)counts[probe.rollGhostType()]++;
      return{seed:probe.seed,elapsedSec:probe.elapsedMs/1000,total:total,weights:probe.getSpawnWeights(),counts:counts};
    },
    auditLayout:function(){
      const selectors=['#dex-screen','.dex-header','#dex-grid','.dex-entry','#result-rank','#photo-lightbox img'];
      const items=selectors.map(function(selector){
        const element=document.querySelector(selector);
        if(!element)return{selector:selector,present:false,overflow:false};
        const rect=element.getBoundingClientRect();
        return{
          selector:selector,
          present:true,
          rect:{left:Number(rect.left.toFixed(2)),top:Number(rect.top.toFixed(2)),right:Number(rect.right.toFixed(2)),bottom:Number(rect.bottom.toFixed(2)),width:Number(rect.width.toFixed(2)),height:Number(rect.height.toFixed(2))},
          overflow:rect.left < -.5 || rect.right > window.innerWidth+.5
        };
      });
      return{viewport:{width:window.innerWidth,height:window.innerHeight},overflowCount:items.filter(function(item){return item.overflow;}).length,items:items};
    },
    restart:function(){
      const rt=runtime();
      rt.game.reset();
      document.getElementById('result-screen').classList.add('hidden');
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      rt.game.start();
      rt.input.setPose(0,0);
      rt.renderer.render(rt.game.getState(),0);
      return state();
    },
    unlockAudio:function(){return runtime().audio.unlock();},
    testAudio:function(){return runtime().audio.testAll();},
    testOrientation:function(alpha,beta,gamma,calibrate){
      const rt=runtime();
      rt.input.debugEnableGyro();
      const event=new Event('deviceorientation');
      Object.defineProperties(event,{
        alpha:{value:Number(alpha)||0},
        beta:{value:Number(beta)||0},
        gamma:{value:Number(gamma)||0}
      });
      window.dispatchEvent(event);
      if(calibrate)rt.input.calibrate();
      rt.input.update(16.7);
      return rt.input.getState();
    },
    setDebug:function(visible){runtime().setDebugVisible(visible);return !!visible;}
  };
})();
