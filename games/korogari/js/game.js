(function () {
  'use strict';
  const STEP_MS = 1000 / 60;
  const GOALS = [0.8, 2.0, 5.0];
  const AREAS = [
    { name:'巨大な部屋', x:-18, z:0, w:28, h:24, color:'#dba063' },
    { name:'ぽかぽか庭', x:16, z:0, w:32, h:28, color:'#71c765' },
    { name:'まち角', x:54, z:0, w:44, h:34, color:'#7c8b99' }
  ];
  const CATALOG = [
    ['画鋲','消しゴム','五円玉','ラムネ玉','梅キャンディ','ちび鉛筆','折り紙星','豆こけし'],
    ['りんご','文庫本','湯のみ','ねずみ太郎','まんじゅう箱','小だるま','手まり','茶わん'],
    ['三毛ねこ','植木鉢','自転車','赤ポスト','石灯ろう','縁台','たぬき看板','物干し台'],
    ['軽トラ','牛若号','屋台','松の木','電話ボックス','祭り太鼓','小舟','だんご屋台'],
    ['町家','引越しトラック','観覧輪の欠片','銭湯煙突','倉庫','大鳥居','バス停ごと','時計塔']
  ];
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function len(x,z){ return Math.sqrt(x*x+z*z); }
  function norm(x,z){ const l=len(x,z)||1; return {x:x/l,z:z/l}; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function volume(d){ return d*d*d; }
  function diameterFromVolume(v){ return Math.pow(Math.max(0.001,v), 1/3); }
  function band(size){ return size<0.18?0:size<0.55?1:size<1.3?2:size<3.4?3:4; }
  function shapeFor(i){ return ['box','cylinder','sphere','cone','post'][i % 5]; }

  function KorogariGame(options) {
    options = options || {};
    this.seed = options.seed || 1;
    this.listeners = [];
    this.best = this.loadBest();
    this.restart();
  }
  KorogariGame.prototype.on = function(fn){ this.listeners.push(fn); };
  KorogariGame.prototype.emit = function(type,data){ for(let i=0;i<this.listeners.length;i++) this.listeners[i](type,data||{}); };
  KorogariGame.prototype.loadBest = function(){ try { return JSON.parse(localStorage.getItem('korogari.best') || 'null'); } catch(e){ return null; } };
  KorogariGame.prototype.saveBest = function(){ try { localStorage.setItem('korogari.best', JSON.stringify(this.best)); } catch(e){} };
  KorogariGame.prototype.restart = function(){
    this.rng = new KorogariRng(this.seed);
    this.mode = 'ready';
    this.paused = false;
    this.timeMs = 180000;
    this.goalIndex = 0;
    this.combo = 0;
    this.comboMs = 0;
    this.count = 0;
    this.lastInput = { x:0, z:0 };
    this.cameraYaw = -0.55;
    this.ball = { x:-26, z:0, y:0.2, vx:0, vz:0, d:0.4, volume:volume(0.4), spinX:0, spinZ:0 };
    this.objects = this.generateObjects();
    this.attached = [];
    this.flying = [];
    this.validation = this.validate();
  };
  KorogariGame.prototype.start = function(){ if(this.mode === 'ready') this.mode = 'play'; };
  KorogariGame.prototype.generateObjects = function(){
    const out = []; let id = 1;
    const specs = [
      { area:0, n:98, min:0.05, max:0.45, weights:[7,4,1,0,0] },
      { area:1, n:72, min:0.18, max:1.5, weights:[1,5,4,1,0] },
      { area:2, n:66, min:0.55, max:7.2, weights:[0,1,4,5,2] }
    ];
    for (let s=0;s<specs.length;s++) {
      const sp = specs[s], a = AREAS[sp.area];
      for (let i=0;i<sp.n;i++) {
        let r = this.rng.next(), acc = 0, b = 0, sum = sp.weights.reduce(function(p,c){return p+c;},0);
        for (let k=0;k<sp.weights.length;k++){ acc += sp.weights[k]/sum; if(r<=acc){ b=k; break; } }
        const ranges = [[0.05,0.15],[0.2,0.5],[0.6,1.2],[1.5,3.0],[4.0,8.0]][b];
        const size = this.rng.range(Math.max(sp.min,ranges[0]), Math.min(sp.max,ranges[1]));
        const x = this.rng.range(a.x-a.w/2+1, a.x+a.w/2-1);
        const z = this.rng.range(a.z-a.h/2+1, a.z+a.h/2-1);
        const hue = Math.floor(this.rng.range(0,360));
        out.push({ id:id++, name:this.rng.pick(CATALOG[b]), size:size, pos:{x:x,z:z}, shape:shapeFor(id+b), color:'hsl('+hue+',72%,62%)', points:Math.round(size*100), alive:true, area:sp.area });
      }
    }
    out.sort(function(a,b){ return a.size-b.size; });
    return out;
  };
  KorogariGame.prototype.setMove = function(x,z){ this.lastInput.x=clamp(x||0,-1,1); this.lastInput.z=clamp(z||0,-1,1); };
  KorogariGame.prototype.rotateCamera = function(dx){ this.cameraYaw += clamp(dx || 0, -0.25, 0.25); };
  KorogariGame.prototype.update = function(dtMs){
    dtMs = Math.min(Math.max(dtMs||0,0),100);
    if (this.paused || this.mode === 'ready' || this.mode === 'result') return;
    let rest = dtMs; while(rest>0){ const d=Math.min(rest,STEP_MS); this.step(d); rest-=d; }
  };
  KorogariGame.prototype.step = function(dtMs){
    const dt = dtMs/1000;
    if(this.mode === 'play') this.timeMs -= dtMs;
    if(this.timeMs <= 0 && this.mode === 'play') return this.finish(false);
    const b = this.ball, inp = this.lastInput;
    const mag = Math.min(1, len(inp.x, inp.z));
    if(mag > 0.001){
      const ca=Math.cos(this.cameraYaw), sa=Math.sin(this.cameraYaw);
      const ix=inp.x/mag, iz=inp.z/mag;
      const wx = ix*ca + iz*sa, wz = -ix*sa + iz*ca;
      const accel = 4.2 + b.d * 1.35;
      b.vx += wx * accel * dt; b.vz += wz * accel * dt;
    }
    const maxSpeed = 3.6 + b.d * 1.25;
    const sp = len(b.vx,b.vz);
    if(sp > maxSpeed){ b.vx=b.vx/sp*maxSpeed; b.vz=b.vz/sp*maxSpeed; }
    const fr = Math.max(0, 1 - (1.25 + 0.18*b.d) * dt);
    b.vx *= fr; b.vz *= fr;
    b.x = clamp(b.x + b.vx*dt, -33, 78);
    b.z = clamp(b.z + b.vz*dt, -20, 20);
    b.y = b.d/2;
    b.spinZ -= b.vx*dt/(b.d/2); b.spinX += b.vz*dt/(b.d/2);
    if(this.comboMs > 0){ this.comboMs -= dtMs; if(this.comboMs <= 0) this.combo = 0; }
    this.updateFlying(dt);
    this.checkObjects();
    this.checkGoals();
  };
  KorogariGame.prototype.updateFlying = function(dt){
    for(let i=this.flying.length-1;i>=0;i--){
      const f=this.flying[i]; f.pos.x += f.vx*dt; f.pos.z += f.vz*dt; f.life -= dt;
      if(f.life <= 0){ f.alive = true; this.objects.push(f); this.flying.splice(i,1); }
    }
  };
  KorogariGame.prototype.checkObjects = function(){
    const b=this.ball, r=b.d/2;
    for(let i=0;i<this.objects.length;i++){
      const o=this.objects[i]; if(!o.alive) continue;
      const d=len(b.x-o.pos.x,b.z-o.pos.z);
      if(d < r + o.size*0.55){
        if(b.d > o.size*0.9) this.absorb(o);
        else if(d < r + o.size*0.45 && len(b.vx,b.vz)>0.8) this.bump(o);
      }
    }
  };
  KorogariGame.prototype.absorb = function(o){
    if(!o.alive) return;
    o.alive = false; this.count++; this.combo++; this.comboMs = 1600;
    const prevBand = band(this.ball.d);
    this.ball.volume += volume(o.size) * 0.42;
    this.ball.d = diameterFromVolume(this.ball.volume);
    this.ball.y = this.ball.d/2;
    const n = norm(this.rng.range(-1,1), this.rng.range(-1,1));
    const attach = { id:o.id, name:o.name, size:o.size, shape:o.shape, color:o.color, dir:{x:n.x,y:this.rng.range(-0.8,0.9),z:n.z}, spin:this.rng.range(-3,3), scale:1 };
    this.attached.push(attach);
    if(this.attached.length > 60) this.attached.splice(0, this.attached.length - 60);
    this.emit('absorb', { object:clone(o), diameter:this.ball.d, combo:this.combo, attach:clone(attach) });
    if(band(this.ball.d) > prevBand) this.emit('grow', { diameter:this.ball.d });
  };
  KorogariGame.prototype.bump = function(o){
    const b=this.ball, n=norm(b.x-o.pos.x,b.z-o.pos.z), vn=b.vx*n.x+b.vz*n.z;
    b.vx -= (1.45*vn - 1.3) * n.x; b.vz -= (1.45*vn - 1.3) * n.z;
    const lost = Math.min(this.attached.length, 2 + Math.floor(this.rng.next()*3));
    for(let k=0;k<lost;k++){
      const a=this.attached.shift(); if(!a) break;
      this.flying.push({ id:10000+a.id, name:a.name, size:Math.max(0.05,a.size*0.65), pos:{x:b.x+n.x*(b.d*.6),z:b.z+n.z*(b.d*.6)}, shape:a.shape, color:a.color, points:1, alive:false, vx:n.x*this.rng.range(1,3), vz:n.z*this.rng.range(1,3), life:1.0 });
    }
    this.emit('bump', { x:b.x, z:b.z, strength:Math.min(1, len(b.vx,b.vz)/7), lost:lost, object:clone(o) });
  };
  KorogariGame.prototype.checkGoals = function(){
    while(this.goalIndex < GOALS.length && this.ball.d >= GOALS[this.goalIndex]){
      this.emit('goal', { goal:GOALS[this.goalIndex], index:this.goalIndex, diameter:this.ball.d });
      this.timeMs += 18000 + this.goalIndex * 7000;
      this.goalIndex++;
      if(this.goalIndex >= GOALS.length) this.finish(true);
    }
  };
  KorogariGame.prototype.finish = function(win){
    if(this.mode === 'result') return;
    this.mode = 'result'; this.winState = !!win;
    const result = { diameter:this.ball.d, count:this.count, win:!!win, timeMs:Math.max(0,this.timeMs) };
    if(!this.best || result.diameter > this.best.diameter || (win && !this.best.win)){ this.best = result; this.saveBest(); }
    this.emit('finish', result);
  };
  KorogariGame.prototype.areaName = function(){
    const x=this.ball.x; if(x<0) return AREAS[0].name; if(x<34) return AREAS[1].name; return AREAS[2].name;
  };
  KorogariGame.prototype.nearObjects = function(n){
    const arr=this.objects.filter(o=>o.alive).map(o=>({name:o.name,size:o.size,dist:len(this.ball.x-o.pos.x,this.ball.z-o.pos.z)}));
    arr.sort((a,b)=>a.dist-b.dist); return arr.slice(0,n||8);
  };
  KorogariGame.prototype.getState = function(){
    return { mode:this.mode, paused:this.paused, diameter:this.ball.d, position:{x:this.ball.x,y:this.ball.y,z:this.ball.z}, velocity:{x:this.ball.vx,z:this.ball.vz}, spin:{x:this.ball.spinX,z:this.ball.spinZ}, remainingMs:Math.max(0,Math.round(this.timeMs)), target:GOALS[Math.min(this.goalIndex,GOALS.length-1)], goalIndex:this.goalIndex, count:this.count, combo:this.combo, area:this.areaName(), cameraYaw:this.cameraYaw, objects:this.objects.filter(o=>o.alive).length, attached:this.attached.length, near:this.nearObjects(10), validation:this.validation, best:this.best, win:this.winState };
  };
  KorogariGame.prototype.dump = function(){
    const lines=['KOROGARI map seed='+this.seed+' validate='+(this.validation.ok?'ok':'fail')+' finalPotential='+this.validation.finalPotential.toFixed(2)+'m'];
    for(let a=0;a<AREAS.length;a++){ const ar=AREAS[a], alive=this.objects.filter(o=>o.alive&&o.area===a).length; lines.push(ar.name+' center=('+ar.x+','+ar.z+') objects='+alive); }
    lines.push('ball=('+this.ball.x.toFixed(1)+','+this.ball.z.toFixed(1)+') d='+this.ball.d.toFixed(2)+' attached='+this.attached.length);
    return lines.join('\n');
  };
  KorogariGame.prototype.validate = function(){
    let d=0.4, v=volume(d), absorbed=0, changed=true, pass=[d];
    const list=this.objects.map(o=>({size:o.size})).sort((a,b)=>a.size-b.size);
    while(changed){ changed=false; for(let i=0;i<list.length;i++){ const o=list[i]; if(!o.done && d > o.size*0.9){ o.done=true; v += volume(o.size)*0.42; d=diameterFromVolume(v); absorbed++; changed=true; } } pass.push(d); if(pass.length>16) break; }
    return { ok:d>=5, finalPotential:d, absorbed:absorbed, total:list.length, pass:pass };
  };
  KorogariGame.prototype.setDiameter = function(m){ this.ball.d=clamp(Number(m)||0.4,0.1,12); this.ball.volume=volume(this.ball.d); this.ball.y=this.ball.d/2; return this.getState(); };
  KorogariGame.prototype.teleport = function(x,z){ this.ball.x=Number(x)||0; this.ball.z=Number(z)||0; this.ball.vx=this.ball.vz=0; return this.getState(); };
  KorogariGame.prototype.absorbNearest = function(n){ const near=this.objects.filter(o=>o.alive).map(o=>({o:o,d:len(this.ball.x-o.pos.x,this.ball.z-o.pos.z)})).sort((a,b)=>a.d-b.d); for(let i=0;i<Math.min(n||1,near.length);i++) this.absorb(near[i].o); return this.getState(); };
  KorogariGame.prototype.clearTime = function(){ this.timeMs=0; this.finish(false); return this.getState(); };
  KorogariGame.prototype.win = function(){ this.setDiameter(5.05); this.checkGoals(); this.finish(true); return this.getState(); };
  window.KorogariGame = KorogariGame;
  window.KorogariConstants = { STEP_MS:STEP_MS, GOALS:GOALS, AREAS:AREAS };
})();
