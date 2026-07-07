(function () {
  'use strict';
  function HellbreakAudio() { this.ctx = null; this.muted = localStorage.getItem('hellbreak.muted') === '1'; this.master = null; this.musicGain = null; this.combatGain = null; }
  HellbreakAudio.prototype.unlock = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    this.ctx = new A(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .58; this.master.connect(this.ctx.destination); this.startMusic();
  };
  HellbreakAudio.prototype.toggleMute = function () { this.muted = !this.muted; localStorage.setItem('hellbreak.muted', this.muted ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .58, this.ctx.currentTime, .02); return this.muted; };
  HellbreakAudio.prototype.startMusic = function () {
    const c = this.ctx; this.musicGain = c.createGain(); this.musicGain.gain.value = .055; this.musicGain.connect(this.master); this.combatGain = c.createGain(); this.combatGain.gain.value = 0; this.combatGain.connect(this.master);
    const riffs = [55, 55, 82.4, 73.4, 55, 98, 82.4, 73.4]; let step = 0; const self = this;
    this.timer = setInterval(function () { if (!self.ctx || self.muted) return; const f = riffs[step++ % riffs.length]; self.tone(f, .13, .09, 'sawtooth', self.musicGain); if (step % 2 === 0) self.noise(.05, .035, 900, self.musicGain); if (step % 4 === 0) self.noise(.08, .07, 120, self.musicGain); }, 145);
  };
  HellbreakAudio.prototype.tone = function (freq, dur, gain, type, dest) { if (!this.ctx || this.muted) return; const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain(); o.type=type||'square'; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.75),t+dur); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g).connect(dest||this.master); o.start(t); o.stop(t+dur+.03); };
  HellbreakAudio.prototype.noise = function (dur, gain, filt, dest) { if (!this.ctx || this.muted) return; const c=this.ctx, t=c.currentTime, b=c.createBuffer(1, Math.max(1, c.sampleRate*dur), c.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; const s=c.createBufferSource(); s.buffer=b; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filt||600; const g=c.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); s.connect(f).connect(g).connect(dest||this.master); s.start(t); };
  HellbreakAudio.prototype.event = function (type, data) {
    if (type === 'fire') { if (data.weapon === 'shotgun') { this.noise(.24,.28,550); this.tone(75,.13,.11,'sawtooth'); setTimeout(this.tone.bind(this,180,.08,.05,'square',null),220); } else if (data.weapon === 'chaingun') this.noise(.045,.12,1200); else this.noise(.08,.14,900); }
    if (type === 'hurt') this.tone(90,.22,.16,'sawtooth');
    if (type === 'pickup') this.tone(740,.12,.12,'triangle');
    if (type === 'enemyDead') this.noise(.22,.16,300);
    if (type === 'cast') this.tone(330,.18,.1,'sawtooth');
    if (type === 'explode') { this.noise(.5,.35,240); this.tone(55,.35,.18,'sawtooth'); }
    if (type === 'door' || type === 'switch') this.tone(170,.2,.12,'square');
    if (type === 'clear') this.tone(523,.2,.14,'triangle'), setTimeout(this.tone.bind(this,784,.28,.14,'triangle',null),150);
  };
  HellbreakAudio.prototype.update = function (game) { if (!this.ctx || !this.combatGain) return; const s=game.getState(); const combat=s.enemies.length>0 && s.enemies.some(function(e){ const dx=e.x-s.position.x,dz=e.z-s.position.z; return dx*dx+dz*dz<36; }); this.combatGain.gain.setTargetAtTime(combat?.05:0,this.ctx.currentTime,.2); if (s.hp < 30 && game.mode === 'play') this.tone(48,.08,.035,'sine'); };
  window.HellbreakAudio = HellbreakAudio;
})();
