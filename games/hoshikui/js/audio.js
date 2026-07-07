(function () {
  'use strict';
  function HoshikuiAudio(){ this.ctx=null; this.master=null; this.muted=localStorage.getItem('hoshikui.muted')==='1'; this.next=0; }
  HoshikuiAudio.prototype.unlock=function(){
    if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; }
    const A=window.AudioContext||window.webkitAudioContext; if(!A) return;
    this.ctx=new A(); this.master=this.ctx.createGain(); this.master.gain.value=this.muted?0:.68; this.master.connect(this.ctx.destination);
  };
  HoshikuiAudio.prototype.toggleMute=function(){ this.muted=!this.muted; localStorage.setItem('hoshikui.muted',this.muted?'1':'0'); if(this.master) this.master.gain.setTargetAtTime(this.muted?0:.68,this.ctx.currentTime,.03); return this.muted; };
  HoshikuiAudio.prototype.tone=function(freq,dur,gain,type,delay){
    if(!this.ctx||this.muted) return; const t=this.ctx.currentTime+(delay||0), o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type||'sine'; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(Math.max(28,freq*.82),t+dur);
    g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g).connect(this.master); o.start(t); o.stop(t+dur+.04);
  };
  HoshikuiAudio.prototype.event=function(type,data){
    if(type==='absorb'){ const m=data.object.mass||1; this.tone(760/(1+m*.12)+data.combo*5,.14,.075,'triangle'); this.tone(1140/(1+m*.1),.08,.035,'sine',.035); }
    if(type==='evolve'){ [196,247,294,370,440,587].forEach((f,i)=>this.tone(f*(1+data.index*.025),.38,.08,'sine',i*.055)); }
    if(type==='bump'){ this.tone(data.burn?92:150,.25,.16,'sawtooth'); this.tone(310,.08,.06,'square',.08); }
    if(type==='finish'){ this.tone(data.win?55:130,.8,.16,'sine'); this.tone(data.win?110:98,.8,.08,'triangle',.08); }
  };
  HoshikuiAudio.prototype.update=function(game){
    if(!this.ctx||this.muted) return; const now=this.ctx.currentTime; if(now<this.next) return;
    const st=game.player.stage, root=55*Math.pow(2,st/7), chord=[1,1.5,2,2.5+(st*.03)];
    for(let i=0;i<Math.min(chord.length,2+Math.floor(st/2));i++) this.tone(root*chord[i],.16,.018+(st*.004),'sine',i*.04);
    if(st>=6) this.tone(34,.45,.035,'sawtooth',.02);
    this.next=now+.62;
  };
  window.HoshikuiAudio = HoshikuiAudio;
})();
