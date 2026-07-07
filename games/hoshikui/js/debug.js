(function () {
  'use strict';
  function install(game, renderer){
    const el=document.getElementById('debug-overlay'), params=new URLSearchParams(location.search); let visible=params.get('debug')==='1', frames=0,last=performance.now(),fps=0;
    function sync(){ if(el) el.classList.toggle('hidden',!visible); }
    function update(){
      frames++; const now=performance.now(); if(now-last>500){ fps=frames*1000/(now-last); frames=0; last=now; }
      if(!visible||!el) return; const s=game.getState();
      el.textContent=['HOSHIKUI debug fps='+fps.toFixed(1)+' mode='+s.mode,'mass='+s.mass.toFixed(2)+' stage='+s.stageName+' time='+s.remainingMs+' count='+s.count+' moons='+s.satellites,'pos=('+s.position.x.toFixed(1)+','+s.position.z.toFixed(1)+') vel=('+s.velocity.x.toFixed(2)+','+s.velocity.z.toFixed(2)+') gravity='+s.gravityRadius.toFixed(1),'validate='+(s.validation.ok?'ok':'fail')+' finalMass='+s.validation.finalMass.toFixed(1)+' absorbed='+s.validation.absorbed+'/'+s.validation.total,game.dump()].join('\n');
    }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function(ms){ game.start(); game.update(Number(ms)||HoshikuiConstants.STEP_MS); return game.getState(); },
      move: function(x,z){ game.setMove(x,z); return game.getState(); },
      teleport: game.teleport.bind(game),
      setMass: game.setMass.bind(game),
      absorbNearest: game.absorbNearest.bind(game),
      evolve: game.evolve.bind(game),
      win: game.win.bind(game),
      finish: game.finishDebug.bind(game),
      validate: game.validate.bind(game)
    };
    sync(); return { toggle:function(){ visible=!visible; sync(); update(); }, update:update };
  }
  window.installHoshikuiDebug = install;
})();
