(function () {
  'use strict';
  function HoshikuiInput(game, actions, canvas) {
    this.game=game; this.actions=actions; this.canvas=canvas; this.keys={}; this.left=null; this.right=null; this.stick=document.querySelector('#stick i'); this.install();
  }
  HoshikuiInput.prototype.install=function(){
    const self=this;
    window.addEventListener('keydown', function(e){ try {
      const k=e.key.toLowerCase(); self.keys[k]=true;
      if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
      if(k==='r') self.actions.restart(); if(k==='m') self.actions.mute(); if(k==='p'||k==='escape') self.actions.pause(); if(k==='`') self.actions.debug(); self.actions.any();
    } catch(err){ console.error('[keydown]',err); } });
    window.addEventListener('keyup', function(e){ try { self.keys[e.key.toLowerCase()]=false; } catch(err){ console.error('[keyup]',err); } });
    window.addEventListener('pointerdown', function(e){ try {
      self.actions.any(); if(e.clientX<innerWidth*.48){ self.left={id:e.pointerId,x:e.clientX,y:e.clientY,cx:e.clientX,cy:e.clientY}; } else { self.right={id:e.pointerId,x:e.clientX}; }
    } catch(err){ console.error('[pointerdown]',err); } }, { passive:false });
    window.addEventListener('pointermove', function(e){ try {
      if(self.left&&self.left.id===e.pointerId){ e.preventDefault(); self.left.cx=e.clientX; self.left.cy=e.clientY; }
      if(self.right&&self.right.id===e.pointerId){ e.preventDefault(); self.game.rotateCamera((e.clientX-self.right.x)*.006); self.right.x=e.clientX; }
    } catch(err){ console.error('[pointermove]',err); } }, { passive:false });
    function end(e){ if(self.left&&self.left.id===e.pointerId) self.left=null; if(self.right&&self.right.id===e.pointerId) self.right=null; }
    window.addEventListener('pointerup',end); window.addEventListener('pointercancel',end);
    this.canvas.addEventListener('wheel', function(e){ e.preventDefault(); }, { passive:false });
  };
  HoshikuiInput.prototype.update=function(){
    let x=0,z=0; if(this.keys.w||this.keys.arrowup) z-=1; if(this.keys.s||this.keys.arrowdown) z+=1; if(this.keys.a||this.keys.arrowleft) x-=1; if(this.keys.d||this.keys.arrowright) x+=1;
    if(this.left){ const dx=this.left.cx-this.left.x, dy=this.left.cy-this.left.y; x=dx/54; z=dy/54; if(this.stick) this.stick.style.transform='translate('+clamp(dx,-34,34)+'px,'+clamp(dy,-34,34)+'px)'; }
    else if(this.stick) this.stick.style.transform='translate(0,0)';
    const l=Math.sqrt(x*x+z*z); if(l>1){ x/=l; z/=l; } this.game.setMove(x,z);
  };
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  window.HoshikuiInput = HoshikuiInput;
})();
