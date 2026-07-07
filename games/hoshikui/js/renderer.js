(function () {
  'use strict';
  function color(c){ return new THREE.Color(c); }
  function bodyMat(o){
    const opt={ color:color(o.color||'#ffffff'), roughness:.62, metalness:.02 };
    if(o.type==='star'){ opt.emissive=color(o.color||'#ffe89b'); opt.emissiveIntensity=1.55; opt.roughness=.18; }
    if(o.type==='core'){ opt.emissive=color('#ffe6a0'); opt.emissiveIntensity=1.2; }
    return new THREE.MeshStandardMaterial(opt);
  }
  function glowMat(hex, opacity){ return new THREE.MeshBasicMaterial({ color:hex, transparent:true, opacity:opacity, blending:THREE.AdditiveBlending, depthWrite:false }); }
  function blackHoleMaterial(){
    return new THREE.ShaderMaterial({
      transparent:true,
      depthWrite:false,
      depthTest:true,
      uniforms:{ time:{ value:0 }, doppler:{ value:.62 }, massScale:{ value:1 } },
      vertexShader:[
        'varying vec2 vUv;',
        'void main(){',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader:[
        'precision mediump float;',
        'uniform float time;',
        'uniform float doppler;',
        'uniform float massScale;',
        'varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
        'float noise(vec2 p){',
        '  vec2 i=floor(p), f=fract(p);',
        '  f=f*f*(3.0-2.0*f);',
        '  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));',
        '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
        '}',
        'float fbm(vec2 p){',
        '  float v=0.0, a=.5;',
        '  for(int i=0;i<4;i++){ v += a * noise(p); p *= 2.03; a *= .5; }',
        '  return v;',
        '}',
        'float band(float d, float w){ return exp(-d*d/(w*w)); }',
        'void main(){',
        '  vec2 p = (vUv - .5) * 2.0;',
        '  vec2 q = p;',
        '  q.x *= 1.28;',
        '  float r = length(p);',
        '  float rq = length(q);',
        '  float th = atan(q.y, q.x);',
        '  float shadow = .255;',
        '  float outer = 1.12;',
        '  float spin = th * 5.5 + time * 1.45;',
        '  float streak = fbm(vec2(spin, r * 7.0 - time * .35));',
        '  streak = smoothstep(.18, 1.0, streak);',
        '  float beam = 1.0 + doppler * smoothstep(-.95, .95, q.x) - doppler * .34 * smoothstep(.15, 1.0, -q.x);',
        '  vec3 hot = vec3(1.0, .86, .50);',
        '  vec3 orange = vec3(1.0, .43, .08);',
        '  vec3 red = vec3(.44, .07, .015);',
        '  vec3 col = vec3(0.0);',
        '  float alpha = 0.0;',
        '  float diskRad = abs(q.x);',
        '  float diskMask = smoothstep(shadow*.95, shadow*1.35, diskRad) * (1.0 - smoothstep(.95, outer, diskRad));',
        '  float diskThin = band(q.y + .012 * sin(th * 7.0 + time), .075 + .035 * smoothstep(.45, 1.0, diskRad));',
        '  float heat = pow(1.0 - smoothstep(shadow*.9, outer, diskRad), 1.35);',
        '  float disk = diskMask * diskThin * (.62 + .72 * streak) * beam;',
        '  vec3 diskColor = mix(red, orange, heat);',
        '  diskColor = mix(diskColor, hot, pow(heat, 2.2));',
        '  col += diskColor * disk * 1.18;',
        '  alpha = max(alpha, clamp(disk, 0.0, 1.0));',
        '  float eTop = sqrt((q.x/.74)*(q.x/.74) + ((q.y+.045)/.42)*((q.y+.045)/.42));',
        '  float topArc = band(eTop - 1.0, .038) * smoothstep(.03, .18, q.y) * (1.0 - smoothstep(.98, 1.24, abs(q.x)));',
        '  topArc *= (.82 + .55 * fbm(vec2(th*4.0 + time*.9, eTop*8.0)));',
        '  topArc *= 1.0 + doppler * .38 * smoothstep(-.65, .75, q.x);',
        '  col += mix(orange, hot, .52) * topArc * 1.45;',
        '  alpha = max(alpha, clamp(topArc * .95, 0.0, 1.0));',
        '  float eBot = sqrt((q.x/.64)*(q.x/.64) + ((q.y-.02)/.27)*((q.y-.02)/.27));',
        '  float botArc = band(eBot - 1.0, .030) * smoothstep(.02, .20, -q.y) * (1.0 - smoothstep(.78, 1.08, abs(q.x)));',
        '  botArc *= (.66 + .45 * fbm(vec2(th*4.0 - time*.7, eBot*8.0)));',
        '  col += mix(red, orange, .72) * botArc * .95;',
        '  alpha = max(alpha, clamp(botArc * .82, 0.0, 1.0));',
        '  float photon = band(r - shadow, .010) * (1.0 + .26 * sin(th * 11.0 + time * 2.0));',
        '  col += vec3(1.0, .88, .58) * photon * 1.65;',
        '  alpha = max(alpha, clamp(photon, 0.0, 1.0));',
        '  float glow = exp(-rq*rq/1.15) * .20 + diskThin * diskMask * .16;',
        '  col += vec3(1.0, .38, .08) * glow;',
        '  alpha = max(alpha, glow * .55);',
        '  float shadowEdge = smoothstep(shadow + .018, shadow - .006, r);',
        '  col = mix(col, vec3(0.0), shadowEdge);',
        '  alpha = max(alpha, shadowEdge);',
        '  alpha *= 1.0 - smoothstep(1.18, 1.34, rq);',
        '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));',
        '}'
      ].join('\n')
    });
  }
  function HoshikuiRenderer(canvas) {
    this.canvas=canvas; this.scene=new THREE.Scene(); this.scene.fog=new THREE.FogExp2(0x050714,.010);
    this.camera=new THREE.PerspectiveCamera(56,1,.05,520);
    this.renderer=new THREE.WebGLRenderer({ canvas:canvas, antialias:true, preserveDrawingBuffer:true });
    this.renderer.setClearColor(0x050714,1);
    this.world=new THREE.Group(); this.scene.add(this.world);
    this.meshes={}; this.satMeshes={}; this.effects=[]; this.clock=0; this.shake=0; this.lastStage=-1;
    this.resize(); this.buildLights(); this.buildBackground(); this.buildPlayer();
    window.addEventListener('resize', this.resize.bind(this));
  }
  HoshikuiRenderer.prototype.resize=function(){
    const w=this.canvas.clientWidth||innerWidth, h=this.canvas.clientHeight||innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
  };
  HoshikuiRenderer.prototype.buildLights=function(){
    this.scene.add(new THREE.AmbientLight(0x6688bb,.46));
    const sun=new THREE.PointLight(0xffe6ae,2.3,340); sun.position.set(-22,50,18); this.scene.add(sun);
    const rim=new THREE.DirectionalLight(0x88bbff,.85); rim.position.set(30,40,-60); this.scene.add(rim);
  };
  HoshikuiRenderer.prototype.makeSpriteTexture=function(){
    const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'), grd=g.createRadialGradient(32,32,1,32,32,31);
    grd.addColorStop(0,'rgba(255,255,255,1)'); grd.addColorStop(.25,'rgba(190,220,255,.9)'); grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grd; g.fillRect(0,0,64,64); return new THREE.CanvasTexture(c);
  };
  HoshikuiRenderer.prototype.makeNebulaTexture=function(stops){
    const c=document.createElement('canvas'); c.width=c.height=192; const g=c.getContext('2d');
    const grd=g.createRadialGradient(96,96,3,96,96,94);
    for(let i=0;i<stops.length;i++) grd.addColorStop(stops[i][0],stops[i][1]);
    g.fillStyle=grd; g.fillRect(0,0,192,192);
    return new THREE.CanvasTexture(c);
  };
  HoshikuiRenderer.prototype.buildBackground=function(){
    const tex=this.makeSpriteTexture();
    for(let layer=0;layer<3;layer++){
      const count=[520,340,180][layer], pos=[], col=[], sizes=[];
      for(let i=0;i<count;i++){
        const a=Math.random()*Math.PI*2, r=140+Math.random()*260; let y=-35+Math.random()*110;
        let x=Math.cos(a)*r, z=Math.sin(a)*r;
        if(layer===2){ z*=.25; y+=Math.sin(x*.02)*8; }
        pos.push(x,y,z); const cc=new THREE.Color(layer===2?'#b88cff':(Math.random()<.5?'#b9d8ff':'#fff1c9')); col.push(cc.r,cc.g,cc.b); sizes.push((layer+1)*(1.2+Math.random()*2.6));
      }
      const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); geo.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
      const mat=new THREE.PointsMaterial({ size:layer?1.6:1.1, map:tex, vertexColors:true, transparent:true, opacity:layer===2 ? .42 : .85, depthWrite:false, blending:THREE.AdditiveBlending });
      const pts=new THREE.Points(geo,mat); pts.userData.base=pos.slice(); pts.userData.layer=layer; this.scene.add(pts);
    }
    const nebulaTextures=[
      this.makeNebulaTexture([[0,'rgba(116,170,255,.42)'],[.28,'rgba(128,76,210,.24)'],[.62,'rgba(30,80,170,.08)'],[1,'rgba(0,0,0,0)']]),
      this.makeNebulaTexture([[0,'rgba(255,170,96,.24)'],[.34,'rgba(188,82,160,.16)'],[.72,'rgba(80,35,120,.06)'],[1,'rgba(0,0,0,0)']]),
      this.makeNebulaTexture([[0,'rgba(126,255,224,.20)'],[.38,'rgba(64,126,255,.12)'],[.74,'rgba(25,40,96,.05)'],[1,'rgba(0,0,0,0)']])
    ];
    for(let i=0;i<24;i++){
      const mat=new THREE.SpriteMaterial({ map:nebulaTextures[i%nebulaTextures.length], transparent:true, opacity:.16+Math.random()*.16, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false });
      const s=new THREE.Sprite(mat);
      s.position.set(-180+Math.random()*360,-38+Math.random()*88,-210+Math.random()*420);
      s.scale.set(44+Math.random()*92,18+Math.random()*42,1);
      s.material.rotation=Math.random()*Math.PI;
      this.scene.add(s);
    }
  };
  HoshikuiRenderer.prototype.buildPlayer=function(){
    this.playerGroup=new THREE.Group(); this.world.add(this.playerGroup);
    this.stageRoot=new THREE.Group(); this.playerGroup.add(this.stageRoot);
    this.stageModels=[]; this.buildStageModels();
    this.orbitGroup=new THREE.Group(); this.playerGroup.add(this.orbitGroup);
    this.gravityRing=new THREE.Mesh(new THREE.TorusGeometry(1,.012,8,96), new THREE.MeshBasicMaterial({ color:0x7ce7ff, transparent:true, opacity:.18 }));
    this.gravityRing.rotation.x=Math.PI/2; this.world.add(this.gravityRing);
  };
  HoshikuiRenderer.prototype.addCrater=function(group,x,y,z,scale){
    const c=new THREE.Mesh(new THREE.SphereGeometry(.09,10,6),new THREE.MeshBasicMaterial({ color:0x34302c, transparent:true, opacity:.62 }));
    c.position.set(x,y,z); c.scale.set(scale,scale*.28,scale); group.add(c);
  };
  HoshikuiRenderer.prototype.buildStageModels=function(){
    const roughRock=new THREE.MeshStandardMaterial({ color:0x806f5d, roughness:.9, flatShading:true });
    const asteroidMat=new THREE.MeshStandardMaterial({ color:0xaaa08f, roughness:.82, flatShading:true });
    const planetMat=new THREE.MeshStandardMaterial({ color:0x2278d7, roughness:.38, emissive:0x03192f, emissiveIntensity:.08 });
    const gasMat=new THREE.MeshStandardMaterial({ color:0xce8b52, roughness:.32, emissive:0x1f0c03, emissiveIntensity:.08 });
    const starMat=new THREE.MeshBasicMaterial({ color:0xfff2be });
    const giantMat=new THREE.MeshBasicMaterial({ color:0xff6638 });
    const mk=function(){ const g=new THREE.Group(); g.visible=false; return g; };
    let g,m;
    g=mk(); m=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),roughRock); m.scale.set(1.06,.92,.98); g.add(m); this.stageRoot.add(g); this.stageModels[0]=g;
    g=mk(); m=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),asteroidMat); g.add(m); this.addCrater(g,.42,.78,.28,1.6); this.addCrater(g,-.68,.36,.5,1.1); this.addCrater(g,.18,-.24,.9,.9); this.stageRoot.add(g); this.stageModels[1]=g;
    g=mk(); m=new THREE.Mesh(new THREE.SphereGeometry(1,32,18),planetMat); g.add(m);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.08,32,18),glowMat(0x6ed4ff,.20)));
    for(let i=-2;i<=2;i++){ const band=new THREE.Mesh(new THREE.TorusGeometry(.92+Math.abs(i)*.012,.018,8,80),glowMat(0xffffff,.22)); band.rotation.x=Math.PI/2+i*.08; band.position.y=i*.18; band.userData.cloud=true; g.add(band); }
    this.stageRoot.add(g); this.stageModels[2]=g;
    g=mk(); m=new THREE.Mesh(new THREE.SphereGeometry(1,32,18),gasMat); g.add(m);
    for(let i=-5;i<=5;i++){ const hue=i%2?0xffe0a2:0x9b563e; const band=new THREE.Mesh(new THREE.TorusGeometry(.94+Math.abs(i)*.006,.026,8,96),glowMat(hue,.38)); band.rotation.x=Math.PI/2; band.position.y=i*.13; band.scale.z=.18; band.userData.gas=true; g.add(band); }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.42,.025,8,128),glowMat(0xd7c08a,.42)); ring.rotation.x=Math.PI*.62; ring.rotation.z=.25; g.add(ring);
    this.stageRoot.add(g); this.stageModels[3]=g;
    g=mk(); m=new THREE.Mesh(new THREE.SphereGeometry(1,42,22),starMat); g.add(m); g.add(new THREE.Mesh(new THREE.SphereGeometry(1.32,32,16),glowMat(0xffd66b,.38))); g.add(new THREE.Mesh(new THREE.SphereGeometry(1.7,24,12),glowMat(0xff9b3d,.16))); g.userData.pulse=true; this.stageRoot.add(g); this.stageModels[4]=g;
    g=mk(); m=new THREE.Mesh(new THREE.SphereGeometry(1,42,22),giantMat); g.add(m); g.add(new THREE.Mesh(new THREE.SphereGeometry(1.2,32,16),glowMat(0xff5a28,.42))); g.add(new THREE.Mesh(new THREE.SphereGeometry(1.72,24,12),glowMat(0xff2b12,.20))); g.userData.pulse=true; this.stageRoot.add(g); this.stageModels[5]=g;
    g=mk(); m=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),blackHoleMaterial()); m.userData.blackHoleBillboard=true; g.add(m);
    this.stageRoot.add(g); this.stageModels[6]=g;
  };
  HoshikuiRenderer.prototype.applyStageMaterial=function(stage){
    if(stage===this.lastStage) return; this.lastStage=stage;
    for(let i=0;i<this.stageModels.length;i++) this.stageModels[i].visible=i===stage;
  };
  HoshikuiRenderer.prototype.makeBodyMesh=function(o){
    let geo=o.type==='rock'?new THREE.DodecahedronGeometry(1,0):new THREE.SphereGeometry(1,o.type==='dust'?8:18,o.type==='dust'?6:12);
    const mesh=new THREE.Mesh(geo,bodyMat(o)); mesh.scale.setScalar(o.radius); mesh.userData.type=o.type;
    if(o.type==='star'||o.type==='core'){
      const corona=new THREE.Mesh(new THREE.SphereGeometry(1.34,24,12),glowMat(color(o.color),o.type==='star'?.34:.26));
      corona.userData.corona=true; mesh.add(corona);
      const halo=new THREE.Mesh(new THREE.SphereGeometry(1.8,18,10),glowMat(0xffd470,o.type==='star'?.12:.16));
      halo.userData.corona=true; mesh.add(halo);
    }
    if(o.type==='comet'){
      const tail=new THREE.Mesh(new THREE.ConeGeometry(.45,4.5,12),new THREE.MeshBasicMaterial({ color:0x9deaff, transparent:true, opacity:.38, blending:THREE.AdditiveBlending, depthWrite:false }));
      tail.rotation.x=-Math.PI/2; tail.position.z=2.3; mesh.add(tail); mesh.userData.tail=tail;
    }
    return mesh;
  };
  HoshikuiRenderer.prototype.syncBodies=function(game){
    const alive={};
    for(let i=0;i<game.bodies.length;i++){
      const o=game.bodies[i]; if(!o.alive) continue; alive[o.id]=true;
      let m=this.meshes[o.id]; if(!m){ m=this.makeBodyMesh(o); this.meshes[o.id]=m; this.world.add(m); }
      m.position.set(o.x,0,o.z); m.scale.setScalar(o.radius*(o.type==='star'?1+.045*Math.sin(this.clock*4+o.id):1)); m.rotation.y=o.spin||0;
      if(o.type==='star'){ m.children.forEach(c=>{ if(c.userData.corona) c.scale.setScalar(1+.08*Math.sin(this.clock*5+o.id)); }); }
      if(m.userData.tail){ const v=new THREE.Vector3(-(o.vx||0),0,-(o.vz||0)); if(v.lengthSq()>.01){ m.lookAt(m.position.clone().add(v)); } }
    }
    for(const id in this.meshes){ if(!alive[id]){ this.world.remove(this.meshes[id]); delete this.meshes[id]; } }
  };
  HoshikuiRenderer.prototype.makeSatMesh=function(s){
    const geo=s.type==='rock'?new THREE.DodecahedronGeometry(1,0):new THREE.SphereGeometry(1,12,8);
    return new THREE.Mesh(geo,new THREE.MeshStandardMaterial({ color:color(s.color||'#ddd'), roughness:.58, emissive:s.type==='star'?color(s.color):0x000000, emissiveIntensity:s.type==='star'?.35:0 }));
  };
  HoshikuiRenderer.prototype.syncSatellites=function(game){
    const seen={}, pr=game.player.radius;
    for(let i=0;i<game.satellites.length;i++){
      const s=game.satellites[i]; seen[s.id]=true; let m=this.satMeshes[s.id];
      if(!m){ m=this.makeSatMesh(s); this.satMeshes[s.id]=m; this.orbitGroup.add(m); }
      const layer=Math.floor(i/7), slot=i%7, r=pr*1.7+1.4+layer*.95+slot*.09, y=Math.sin(s.phase*1.7+s.tilt)*(.28+layer*.08);
      m.position.set(Math.cos(s.phase)*r, y, Math.sin(s.phase)*r*Math.cos(s.tilt));
      m.scale.setScalar(Math.max(.09, Math.min(.62, s.radius/pr*.62)));
      m.rotation.y += .03+s.spin*.01;
    }
    for(const id in this.satMeshes){ if(!seen[id]){ this.orbitGroup.remove(this.satMeshes[id]); delete this.satMeshes[id]; } }
  };
  HoshikuiRenderer.prototype.handleEvent=function(type,data){
    if(type==='absorb') this.effects.push({ type:'spark', t:0, x:data.object.x, z:data.object.z, color:data.object.color, size:data.object.radius });
    if(type==='evolve'){ this.effects.push({ type:'ring', t:0 }); this.shake=Math.max(this.shake,.75); }
    if(type==='bump'){ this.shake=Math.max(this.shake,.45); this.effects.push({ type:data.burn?'burn':'spark', t:0, x:data.x, z:data.z, color:data.burn?'#ff5a22':'#ffffff', size:2 }); }
    if(type==='finish'){ this.effects.push({ type:'ring', t:0, finish:data.win }); this.shake=Math.max(this.shake,1.1); }
  };
  HoshikuiRenderer.prototype.updateEffects=function(dt){
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i]; e.t+=dt/1000;
      if(!e.mesh){
        e.mesh=new THREE.Mesh(e.type==='ring'?new THREE.TorusGeometry(1,.035,8,128):new THREE.SphereGeometry(.14,10,6),new THREE.MeshBasicMaterial({ color:color(e.color||'#ffffff'), transparent:true, opacity:.9, blending:THREE.AdditiveBlending }));
        if(e.type==='ring'){ e.mesh.rotation.x=Math.PI/2; this.playerGroup.add(e.mesh); } else { e.mesh.position.set(e.x||0,0,e.z||0); this.world.add(e.mesh); }
      }
      if(e.type==='ring'){ e.mesh.scale.setScalar(1+e.t*9); e.mesh.material.opacity=Math.max(0,.75-e.t*.7); }
      else { e.mesh.position.y=e.t*3; e.mesh.scale.setScalar(1+e.t*8*(e.size||1)); e.mesh.material.opacity=Math.max(0,1-e.t*1.8); }
      if(e.t>1.4){ if(e.type==='ring') this.playerGroup.remove(e.mesh); else this.world.remove(e.mesh); this.effects.splice(i,1); }
    }
    this.shake*=Math.pow(.035,dt/1000);
  };
  HoshikuiRenderer.prototype.distortStars=function(game){
    const black=game.player.stage>=6, px=game.player.x, pz=game.player.z;
    this.scene.traverse(function(o){
      if(!o.isPoints || !o.userData.base) return;
      const arr=o.geometry.attributes.position.array, base=o.userData.base, amt=black ? .08 : 0;
      for(let i=0;i<arr.length;i+=3){ const bx=base[i], by=base[i+1], bz=base[i+2], dx=px-bx, dz=pz-bz, d=Math.sqrt(dx*dx+dz*dz)||1, pull=amt*Math.min(1,45/d); arr[i]=bx+dx*pull; arr[i+1]=by; arr[i+2]=bz+dz*pull; }
      o.geometry.attributes.position.needsUpdate=true;
    });
  };
  HoshikuiRenderer.prototype.render=function(game,dt){
    this.clock+=(dt||16.7)/1000; this.applyStageMaterial(game.player.stage); this.syncBodies(game); this.syncSatellites(game); this.updateEffects(dt||16.7); this.distortStars(game);
    const p=game.player, r=p.radius; this.playerGroup.position.set(p.x,0,p.z); this.playerGroup.rotation.y=p.spin*.45;
    this.stageRoot.scale.setScalar(r);
    this.stageRoot.traverse(o=>{
      if(o.userData.cloud) o.rotation.z+=.006;
      if(o.userData.gas) o.rotation.z+=.004;
      if(o.userData.blackHoleBillboard && o.material.uniforms) o.material.uniforms.time.value=this.clock;
    });
    const active=this.stageModels[p.stage]; if(active&&active.userData.pulse) active.scale.setScalar(1+.035*Math.sin(this.clock*6));
    this.gravityRing.position.set(p.x,-.02,p.z); this.gravityRing.scale.setScalar(game.gravityRadius); this.gravityRing.material.opacity=p.stage>=6?.34:.13;
    const dist=16+r*6+(p.stage>=4?10:0), height=10+r*2.4, yaw=game.cameraYaw, shake=(Math.random()-.5)*this.shake;
    const target=new THREE.Vector3(p.x,0,p.z), cam=new THREE.Vector3(p.x+Math.sin(yaw)*dist+shake,height+Math.abs(shake)*2,p.z+Math.cos(yaw)*dist+shake);
    this.camera.position.lerp(cam,.12); this.camera.lookAt(target);
    if(p.stage>=6){
      const activeBh=this.stageModels[6], q=new THREE.Quaternion(), inv=new THREE.Quaternion();
      this.playerGroup.getWorldQuaternion(inv).invert();
      q.copy(this.camera.quaternion).premultiply(inv);
      activeBh.quaternion.copy(q);
      activeBh.traverse(o=>{ if(o.userData.blackHoleBillboard && o.material.uniforms){ o.material.uniforms.time.value=this.clock; o.material.uniforms.massScale.value=Math.max(1,r*.25); } });
    }
    this.renderer.render(this.scene,this.camera);
  };
  window.HoshikuiRenderer = HoshikuiRenderer;
})();
