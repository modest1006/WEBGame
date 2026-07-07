(function () {
  'use strict';
  function install(game, renderer){
    const el=document.getElementById('debug-overlay'), params=new URLSearchParams(location.search); let visible=params.get('debug')==='1', frames=0,last=performance.now(),fps=0;
    function sync(){ if(el) el.classList.toggle('hidden',!visible); }
    function update(){ frames++; const now=performance.now(); if(now-last>500){ fps=frames*1000/(now-last); frames=0; last=now; } if(!visible||!el) return; const s=game.getState(); el.textContent=['KOROGARI debug fps='+fps.toFixed(1)+' mode='+s.mode,'d='+s.diameter.toFixed(3)+' target='+s.target+' time='+s.remainingMs+' combo='+s.combo,'pos=('+s.position.x.toFixed(1)+','+s.position.z.toFixed(1)+') area='+s.area+' objects='+s.objects,'validate='+(s.validation.ok?'ok':'fail')+' potential='+s.validation.finalPotential.toFixed(2)+' absorbed='+s.validation.absorbed+'/'+s.validation.total,game.dump()].join('\n'); }
    window.__game = {
      getState: game.getState.bind(game),
      dump: game.dump.bind(game),
      step: function(ms){ game.start(); game.update(Number(ms)||KorogariConstants.STEP_MS); return game.getState(); },
      move: function(x,z){ game.setMove(x,z); return game.getState(); },
      setDiameter: game.setDiameter.bind(game),
      teleport: game.teleport.bind(game),
      absorbNearest: game.absorbNearest.bind(game),
      clearTime: game.clearTime.bind(game),
      win: game.win.bind(game),
      finish: function(){ game.finish(false); return game.getState(); },
      validate: game.validate.bind(game)
    };
    sync(); return { toggle:function(){ visible=!visible; sync(); update(); }, update:update };
  }
  window.installKorogariDebug = install;
})();
