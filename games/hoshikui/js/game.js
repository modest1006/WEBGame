(function () {
  'use strict';
  const STEP_MS = 1000 / 60;
  const WORLD = 220;
  const DISPLAY_MOONS = 40;
  const STAGES = [
    { name:'岩石', mass:1, radius:.7, time:0 },
    { name:'小惑星', mass:3.2, radius:.95, time:25000 },
    { name:'惑星', mass:10, radius:1.35, time:30000 },
    { name:'巨大惑星', mass:32, radius:1.8, time:35000 },
    { name:'恒星', mass:95, radius:2.45, time:42000 },
    { name:'超巨星', mass:260, radius:3.2, time:52000 },
    { name:'ブラックホール', mass:620, radius:3.8, time:80000 }
  ];
  const NAMES = {
    dust:['ねむたい塵','銀の砂粒','まいごの石','夜明けのかけら'],
    rock:['こげた岩石','ひびわれ小惑星','忘れられた礫','古い流星'],
    moon:['わすれられた月','うたたね衛星','白いちび月','欠けた月'],
    planet:['青い惑星','しましま惑星','雨待ちの星','雲まく星'],
    star:['小さな恒星','金色の太陽','まぶしい星','歌う恒星'],
    comet:['こおりの彗星','青しっぽ彗星','寝坊した彗星','寄り道彗星'],
    core:['銀河コア']
  };
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function len(x,z){ return Math.sqrt(x*x+z*z); }
  function norm(x,z){ const l=len(x,z)||1; return {x:x/l,z:z/l}; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function massRadius(m){ return Math.max(.18, Math.pow(m, 1/3) * .7); }
  function stageForMass(m){ let s=0; for(let i=0;i<STAGES.length;i++) if(m>=STAGES[i].mass) s=i; return s; }
  function typeByMass(m){ return m<.35?'dust':m<1.4?'rock':m<3.6?'moon':m<18?'planet':m<120?'star':'core'; }

  function HoshikuiGame(options) {
    options = options || {};
    this.seed = options.seed || 1;
    this.listeners = [];
    this.best = this.loadBest();
    this.restart();
  }
  HoshikuiGame.prototype.on = function(fn){ this.listeners.push(fn); };
  HoshikuiGame.prototype.emit = function(type,data){ for(let i=0;i<this.listeners.length;i++){ try { this.listeners[i](type,data||{}); } catch(e){ console.error('[game event]', e); } } };
  HoshikuiGame.prototype.loadBest = function(){ try { return JSON.parse(localStorage.getItem('hoshikui.best') || 'null'); } catch(e){ return null; } };
  HoshikuiGame.prototype.saveBest = function(){ try { localStorage.setItem('hoshikui.best', JSON.stringify(this.best)); } catch(e){} };
  HoshikuiGame.prototype.restart = function(){
    this.rng = new HoshikuiRng(this.seed);
    this.mode = 'ready'; this.paused = false; this.timeMs = 240000;
    this.cameraYaw = -0.65; this.count = 0; this.winState = false; this.combo = 0; this.comboMs = 0;
    this.lastInput = { x:0, z:0 };
    this.player = { x:-82, z:18, vx:0, vz:0, mass:1, radius:massRadius(1), stage:0, spin:0 };
    this.bodies = this.generateGalaxy();
    this.satellites = []; this.flying = []; this.events = [];
    this.validation = this.validate();
  };
  HoshikuiGame.prototype.generateGalaxy = function(){
    const out=[]; let id=1, rng=this.rng;
    out.push({ id:id++, type:'core', name:'銀河コア', mass:820, radius:8.5, x:0, z:0, baseX:0, baseZ:0, color:'#fff1aa', alive:true, phase:0, spin:0, target:true });
    const systems = rng.int(10,15);
    for(let s=0;s<systems;s++){
      const arm=s%3, t=1.2+s*.55+rng.range(-.18,.18), r=26+s*8+rng.range(-5,7), ang=t+arm*Math.PI*2/3;
      const sx=Math.cos(ang)*r, sz=Math.sin(ang)*r*.72;
      const starMass=rng.range(18,70), star={ id:id++, type:'star', name:rng.pick(NAMES.star), mass:starMass, radius:massRadius(starMass), x:sx, z:sz, baseX:sx, baseZ:sz, color:rng.pick(['#ffe08a','#fff4bf','#ffc46b','#d8f4ff']), alive:true, phase:rng.range(0,9), spin:rng.range(.2,.8), system:s };
      out.push(star);
      const planets=rng.int(3,6);
      for(let p=0;p<planets;p++){
        const orbit=5.5+p*rng.range(3.4,5.2), pm=rng.range(2.2,13.5)*(p>3?1.5:1), phase=rng.range(0,Math.PI*2);
        const pl={ id:id++, type:'planet', name:rng.pick(NAMES.planet), mass:pm, radius:massRadius(pm), x:sx, z:sz, baseX:sx, baseZ:sz, color:rng.pick(['#65b7ff','#79d17a','#d7a36a','#b895ff','#e4dfc2']), alive:true, parent:star.id, orbit:orbit, orbitSpeed:rng.range(.10,.26)/(p*.35+1), phase:phase, tilt:rng.range(-.45,.45), spin:rng.range(.9,2.6), system:s };
        out.push(pl);
        const moons=rng.int(1,3);
        for(let m=0;m<moons;m++){
          out.push({ id:id++, type:'moon', name:rng.pick(NAMES.moon), mass:rng.range(.28,1.5), radius:rng.range(.22,.55), x:pl.x, z:pl.z, baseX:sx, baseZ:sz, color:'#d9d9cc', alive:true, parent:pl.id, orbit:rng.range(1.3,2.3)+m*.65, orbitSpeed:rng.range(.42,.8), phase:rng.range(0,Math.PI*2), tilt:rng.range(-.6,.6), spin:rng.range(.5,1.8), system:s });
        }
      }
    }
    for(let belt=0;belt<3;belt++){
      const br=42+belt*28;
      for(let i=0;i<48;i++){
        const a=i/48*Math.PI*2+rng.range(-.08,.08), rr=br+rng.range(-4,4);
        out.push({ id:id++, type:'rock', name:rng.pick(NAMES.rock), mass:rng.range(.18,1.8), radius:rng.range(.18,.55), x:Math.cos(a)*rr, z:Math.sin(a)*rr*.78, baseX:0, baseZ:0, color:rng.pick(['#9b8978','#766b65','#b39c80','#6d7480']), alive:true, belt:true, orbit:rr, orbitSpeed:rng.range(.018,.045), phase:a, tilt:rng.range(-.15,.15), spin:rng.range(.2,1.5) });
      }
    }
    for(let i=0;i<70;i++){
      out.push({ id:id++, type:'dust', name:rng.pick(NAMES.dust), mass:rng.range(.05,.28), radius:rng.range(.08,.18), x:rng.range(-105,105), z:rng.range(-75,75), baseX:0, baseZ:0, color:rng.pick(['#bcd4ff','#f7e6b5','#c9fff2']), alive:true, wander:true, vx:rng.range(-.12,.12), vz:rng.range(-.12,.12), spin:rng.range(.1,1.2) });
    }
    for(let i=0;i<16;i++){
      const elliptical=i<10, a=rng.range(54,120), b=rng.range(18,45), ph=rng.range(0,Math.PI*2);
      out.push({ id:id++, type:'comet', name:rng.pick(NAMES.comet), mass:rng.range(.45,3.8), radius:rng.range(.18,.5), x:Math.cos(ph)*a, z:Math.sin(ph)*b, baseX:0, baseZ:0, color:'#bfeeff', alive:true, comet:true, elliptical:elliptical, orbitA:a, orbitB:b, orbitSpeed:rng.range(.18,.42), phase:ph, vx:rng.range(-7,7), vz:rng.range(-5,5), spin:rng.range(1,3) });
    }
    return out;
  };
  HoshikuiGame.prototype.start = function(){ if(this.mode === 'ready') this.mode = 'play'; };
  HoshikuiGame.prototype.setMove = function(x,z){ this.lastInput.x=clamp(x||0,-1,1); this.lastInput.z=clamp(z||0,-1,1); };
  HoshikuiGame.prototype.rotateCamera = function(dx){ this.cameraYaw += clamp(dx||0,-.25,.25); };
  HoshikuiGame.prototype.update = function(dtMs){
    dtMs = Math.min(Math.max(dtMs||0,0),100);
    if(this.paused || this.mode === 'ready' || this.mode === 'result') return;
    let rest=dtMs; while(rest>0){ const d=Math.min(rest,STEP_MS); this.step(d); rest-=d; }
  };
  HoshikuiGame.prototype.step = function(dtMs){
    const dt=dtMs/1000, p=this.player;
    this.timeMs -= dtMs; if(this.timeMs<=0 && this.mode==='play') return this.finish(false);
    this.updateBodies(dt); this.updatePlayer(dt); this.updateSatellites(dt); this.checkBodies(dt); this.checkEvolution();
    if(this.comboMs>0){ this.comboMs-=dtMs; if(this.comboMs<=0) this.combo=0; }
  };
  HoshikuiGame.prototype.updatePlayer = function(dt){
    const p=this.player, inp=this.lastInput, mag=Math.min(1,len(inp.x,inp.z));
    if(mag>.001){
      const ca=Math.cos(this.cameraYaw), sa=Math.sin(this.cameraYaw), ix=inp.x/mag, iz=inp.z/mag;
      const wx=ix*ca+iz*sa, wz=-ix*sa+iz*ca, accel=8.8/(1+Math.sqrt(p.mass)*.05);
      p.vx += wx*accel*dt; p.vz += wz*accel*dt;
    }
    const max=9.5+Math.min(10,Math.sqrt(p.mass)*.35), sp=len(p.vx,p.vz);
    if(sp>max){ p.vx=p.vx/sp*max; p.vz=p.vz/sp*max; }
    const friction=Math.pow(.985, dt*60); p.vx*=friction; p.vz*=friction;
    p.x=clamp(p.x+p.vx*dt,-WORLD,WORLD); p.z=clamp(p.z+p.vz*dt,-WORLD,WORLD); p.spin+=sp*dt/Math.max(.5,p.radius);
  };
  HoshikuiGame.prototype.updateBodies = function(dt){
    const byId={}; for(let i=0;i<this.bodies.length;i++) byId[this.bodies[i].id]=this.bodies[i];
    for(let i=0;i<this.bodies.length;i++){
      const o=this.bodies[i]; if(!o.alive) continue; o.spin=(o.spin||0)+dt*(o.type==='star'?.25:.8);
      if(o.parent && byId[o.parent] && byId[o.parent].alive){ const par=byId[o.parent]; o.phase+=o.orbitSpeed*dt; o.x=par.x+Math.cos(o.phase)*o.orbit; o.z=par.z+Math.sin(o.phase)*o.orbit*Math.cos(o.tilt||0); }
      else if(o.belt){ o.phase+=o.orbitSpeed*dt; o.x=Math.cos(o.phase)*o.orbit; o.z=Math.sin(o.phase)*o.orbit*.78; }
      else if(o.comet && o.elliptical){ o.phase+=o.orbitSpeed*dt; o.x=Math.cos(o.phase)*o.orbitA; o.z=Math.sin(o.phase)*o.orbitB; o.vx=-Math.sin(o.phase)*o.orbitA*o.orbitSpeed; o.vz=Math.cos(o.phase)*o.orbitB*o.orbitSpeed; }
      else if(o.comet || o.wander){ o.x+=o.vx*dt; o.z+=o.vz*dt; if(Math.abs(o.x)>WORLD){ o.vx*=-1; o.x=clamp(o.x,-WORLD,WORLD); } if(Math.abs(o.z)>WORLD*.82){ o.vz*=-1; o.z=clamp(o.z,-WORLD*.82,WORLD*.82); } }
    }
  };
  HoshikuiGame.prototype.gravityRadius = function(){ return (this.player.stage>=6?18:7) + Math.sqrt(this.player.mass)*1.35; };
  HoshikuiGame.prototype.checkBodies = function(dt){
    const p=this.player, gr=this.gravityRadius();
    for(let i=0;i<this.bodies.length;i++){
      const o=this.bodies[i]; if(!o.alive) continue;
      const dx=p.x-o.x, dz=p.z-o.z, d=len(dx,dz), eatable=p.mass > o.mass*.9;
      if(eatable && d<gr && o.type!=='core'){
        const pull=(this.player.stage>=6?22:4.2)*(1-d/gr)*dt, n=norm(dx,dz);
        if(!o.parent && !o.belt && !o.elliptical){ o.vx=(o.vx||0)+n.x*pull; o.vz=(o.vz||0)+n.z*pull; }
        o.x += n.x*pull; o.z += n.z*pull;
      }
      if(d < p.radius + o.radius){
        if(eatable) this.absorb(o);
        else this.bump(o, d);
      }
    }
  };
  HoshikuiGame.prototype.absorb = function(o){
    if(!o.alive) return;
    o.alive=false; this.count++; this.combo++; this.comboMs=1800;
    const add=o.mass*(o.type==='core'?1:.72), oldMass=this.player.mass;
    this.player.mass += add; this.player.radius = massRadius(this.player.mass);
    this.addSatellite(o);
    this.emit('absorb', { object:clone(o), mass:this.player.mass, combo:this.combo });
    if(o.type==='core' && this.player.stage>=6) return this.finish(true);
    if(stageForMass(this.player.mass)>stageForMass(oldMass)) this.checkEvolution();
  };
  HoshikuiGame.prototype.addSatellite = function(o){
    if(o.type==='core') return;
    this.satellites.push({ id:o.id, name:o.name, type:o.type, mass:o.mass, radius:o.radius, color:o.color, phase:this.rng.range(0,Math.PI*2), speed:this.rng.range(.55,1.8)*(this.rng.next()<.5?-1:1), tilt:this.rng.range(-.75,.75), layer:0, spin:this.rng.range(.2,2.4) });
    this.satellites.sort(function(a,b){ return b.mass-a.mass; });
    while(this.satellites.length>DISPLAY_MOONS){
      const small=this.satellites.pop(); if(small) this.player.mass += small.mass*.18;
    }
    this.relayerSatellites();
  };
  HoshikuiGame.prototype.relayerSatellites = function(){ for(let i=0;i<this.satellites.length;i++) this.satellites[i].layer=i; };
  HoshikuiGame.prototype.updateSatellites = function(dt){ for(let i=0;i<this.satellites.length;i++) this.satellites[i].phase += this.satellites[i].speed*dt/(1+i*.045); };
  HoshikuiGame.prototype.bump = function(o){
    const p=this.player, n=norm(p.x-o.x,p.z-o.z), sp=len(p.vx,p.vz), power=o.type==='star'&&p.stage<4?2.2:1.25;
    p.vx += n.x*(2.4+sp*.35)*power; p.vz += n.z*(2.4+sp*.35)*power;
    const lost=Math.min(this.satellites.length, o.type==='star'&&p.stage<4?5:3);
    for(let i=0;i<lost;i++){ const s=this.satellites.pop(); if(!s) break; this.flying.push(s); this.player.mass=Math.max(1,this.player.mass-s.mass*.08); }
    this.player.radius=massRadius(this.player.mass); this.emit('bump', { object:clone(o), lost:lost, burn:o.type==='star'&&p.stage<4, x:p.x, z:p.z });
  };
  HoshikuiGame.prototype.checkEvolution = function(){
    const ns=stageForMass(this.player.mass);
    if(ns>this.player.stage){ this.player.stage=ns; this.player.radius=Math.max(this.player.radius,STAGES[ns].radius); this.timeMs+=STAGES[ns].time; this.emit('evolve', { stage:clone(STAGES[ns]), index:ns, mass:this.player.mass }); }
  };
  HoshikuiGame.prototype.finish = function(win){
    if(this.mode==='result') return;
    this.mode='result'; this.winState=!!win;
    const result={ win:!!win, mass:this.player.mass, count:this.count, satellites:this.satellites.length, timeMs:Math.max(0,this.timeMs) };
    if(!this.best || result.mass>this.best.mass || (win&&!this.best.win)){ this.best=result; this.saveBest(); }
    this.emit('finish', result);
  };
  HoshikuiGame.prototype.nearBodies = function(n){
    const p=this.player, arr=this.bodies.filter(o=>o.alive).map(o=>({ id:o.id, name:o.name, type:o.type, mass:o.mass, dist:len(p.x-o.x,p.z-o.z) }));
    arr.sort((a,b)=>a.dist-b.dist); return arr.slice(0,n||10);
  };
  HoshikuiGame.prototype.getState = function(){
    const p=this.player, next=STAGES[Math.min(p.stage+1,STAGES.length-1)];
    return { mode:this.mode, paused:this.paused, mass:p.mass, stage:p.stage, stageName:STAGES[p.stage].name, radius:p.radius, position:{x:p.x,z:p.z}, velocity:{x:p.vx,z:p.vz}, spin:p.spin, remainingMs:Math.max(0,Math.round(this.timeMs)), nextMass:p.stage>=STAGES.length-1?null:next.mass, count:this.count, combo:this.combo, satellites:this.satellites.length, displaySatellites:this.satellites.slice(), bodies:this.bodies.filter(o=>o.alive).length, near:this.nearBodies(10), cameraYaw:this.cameraYaw, gravityRadius:this.gravityRadius(), validation:this.validation, best:this.best, win:this.winState };
  };
  HoshikuiGame.prototype.dump = function(){
    const alive=this.bodies.filter(o=>o.alive), by={}; for(let i=0;i<alive.length;i++) by[alive[i].type]=(by[alive[i].type]||0)+1;
    return ['HOSHIKUI seed='+this.seed+' validate='+(this.validation.ok?'ok':'fail')+' potentialMass='+this.validation.finalMass.toFixed(1),'stage='+STAGES[this.player.stage].name+' mass='+this.player.mass.toFixed(2)+' pos=('+this.player.x.toFixed(1)+','+this.player.z.toFixed(1)+')','alive='+alive.length+' stars='+(by.star||0)+' planets='+(by.planet||0)+' comets='+(by.comet||0)+' moons='+(by.moon||0),'satellites='+this.satellites.length+' coreReachable='+(this.validation.coreReachable?'yes':'no')].join('\n');
  };
  HoshikuiGame.prototype.validate = function(){
    let m=1, absorbed=0, changed=true; const list=this.bodies.map(o=>({mass:o.mass,type:o.type})).sort((a,b)=>a.mass-b.mass), pass=[m];
    while(changed){ changed=false; for(let i=0;i<list.length;i++){ const o=list[i]; if(!o.done && o.type!=='core' && m>o.mass*.9){ o.done=true; m+=o.mass*.72; absorbed++; changed=true; } } pass.push(m); if(pass.length>24) break; }
    const black=m>=STAGES[6].mass, core=list.filter(o=>o.type==='core')[0], coreReachable=!!core && black && m>core.mass*.9;
    return { ok:black && coreReachable, finalMass:m, absorbed:absorbed, total:list.length, blackHoleReachable:black, coreReachable:coreReachable, requiredBlackHoleMass:STAGES[6].mass, requiredCoreMass:core?core.mass*.9:0, pass:pass };
  };
  HoshikuiGame.prototype.setMass = function(m){ this.player.mass=clamp(Number(m)||1,1,3000); this.player.stage=stageForMass(this.player.mass); this.player.radius=massRadius(this.player.mass); return this.getState(); };
  HoshikuiGame.prototype.teleport = function(x,z){ this.player.x=Number(x)||0; this.player.z=Number(z)||0; this.player.vx=this.player.vz=0; return this.getState(); };
  HoshikuiGame.prototype.absorbNearest = function(n){ const near=this.nearBodies(n||1); for(let i=0;i<near.length;i++){ const o=this.bodies.filter(b=>b.id===near[i].id)[0]; if(o) this.absorb(o); } return this.getState(); };
  HoshikuiGame.prototype.evolve = function(){ const ns=Math.min(this.player.stage+1,STAGES.length-1); this.player.mass=STAGES[ns].mass; this.checkEvolution(); this.player.radius=massRadius(this.player.mass); return this.getState(); };
  HoshikuiGame.prototype.win = function(){ this.setMass(1800); const core=this.bodies.filter(o=>o.type==='core')[0]; if(core) this.absorb(core); else this.finish(true); return this.getState(); };
  HoshikuiGame.prototype.finishDebug = function(){ this.finish(false); return this.getState(); };
  window.HoshikuiGame = HoshikuiGame;
  window.HoshikuiConstants = { STEP_MS:STEP_MS, STAGES:STAGES, WORLD:WORLD, DISPLAY_MOONS:DISPLAY_MOONS };
})();
