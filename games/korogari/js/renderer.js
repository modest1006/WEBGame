(function () {
  'use strict';
  function mat(color, rough){ return new THREE.MeshStandardMaterial({ color:new THREE.Color(color), roughness:rough == null ? 0.55 : rough, metalness:0.03 }); }
  function Renderer(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb7e6ff, 45, 130);
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.05, 220);
    this.renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true, preserveDrawingBuffer:true });
    this.renderer.setClearColor(0xb7e6ff, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.objectMeshes = {};
    this.attachMeshes = {};
    this.effects = [];
    this.trail = [];
    this.clock = 0;
    this.shake = 0;
    this.resize();
    this.buildLights();
    this.buildWorld();
    window.addEventListener('resize', this.resize.bind(this));
  }
  Renderer.prototype.resize = function(){
    const w=this.canvas.clientWidth||innerWidth, h=this.canvas.clientHeight||innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
  };
  Renderer.prototype.buildLights = function(){
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x75b86b,0.82));
    const sun = new THREE.DirectionalLight(0xfff0c8,1.35); sun.position.set(-12,22,9); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55; sun.shadow.camera.right=80; sun.shadow.camera.top=45; sun.shadow.camera.bottom=-45;
    this.scene.add(sun);
  };
  Renderer.prototype.buildWorld = function(){
    const areas = KorogariConstants.AREAS;
    for(let i=0;i<areas.length;i++){
      const a=areas[i], base=new THREE.Mesh(new THREE.BoxGeometry(a.w,0.18,a.h), mat(a.color,0.62));
      base.position.set(a.x,-0.09,a.z); base.receiveShadow=true; this.world.add(base);
      const label = new THREE.Mesh(new THREE.BoxGeometry(a.w,0.035,0.12), mat('#ffffff',0.4));
      label.position.set(a.x,0.02,a.z-a.h/2+0.1); this.world.add(label);
    }
    const bridge1 = new THREE.Mesh(new THREE.BoxGeometry(14,0.14,8), mat('#83c66e',0.65)); bridge1.position.set(0, -0.07, 0); bridge1.receiveShadow=true; this.world.add(bridge1);
    const bridge2 = new THREE.Mesh(new THREE.BoxGeometry(16,0.14,10), mat('#8794a0',0.7)); bridge2.position.set(34, -0.07, 0); bridge2.receiveShadow=true; this.world.add(bridge2);
    this.addClouds();
    this.ballGroup = new THREE.Group(); this.world.add(this.ballGroup);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.5,32,20), new THREE.MeshStandardMaterial({ color:0xff6fb1, roughness:0.25, metalness:0.05, emissive:0x441122, emissiveIntensity:0.12 }));
    this.ball.castShadow=true; this.ballGroup.add(this.ball);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailLine = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.58 }));
    this.world.add(this.trailLine);
  };
  Renderer.prototype.addClouds = function(){
    const cm = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.82, depthWrite:false });
    for(let i=0;i<18;i++){
      const g=new THREE.Group();
      for(let j=0;j<4;j++){ const s=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),cm); s.scale.set(1.2+Math.random()*1.8,.35,.55+Math.random()); s.position.set(j*1.1,Math.random()*0.4,Math.random()*0.7); g.add(s); }
      g.position.set(-35+Math.random()*120,18+Math.random()*14,-38-Math.random()*18); this.scene.add(g);
    }
  };
  Renderer.prototype.makeObjectMesh = function(o){
    let geo;
    if(o.shape==='sphere') geo = new THREE.SphereGeometry(0.5,14,10);
    else if(o.shape==='cylinder') geo = new THREE.CylinderGeometry(0.42,0.48,0.9,12);
    else if(o.shape==='cone') geo = new THREE.ConeGeometry(0.5,1,12);
    else if(o.shape==='post') geo = new THREE.CylinderGeometry(0.25,0.25,1.15,10);
    else geo = new THREE.BoxGeometry(1,0.72,0.8);
    const mesh = new THREE.Mesh(geo, mat(o.color,0.48));
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.scale.setScalar(o.size);
    mesh.position.set(o.pos.x,o.size*0.45,o.pos.z);
    mesh.rotation.y = (o.id * 1.71) % 6.28;
    return mesh;
  };
  Renderer.prototype.syncObjects = function(game){
    const alive = {};
    for(let i=0;i<game.objects.length;i++){
      const o=game.objects[i]; if(!o.alive) continue; alive[o.id]=true;
      if(!this.objectMeshes[o.id]){ const m=this.makeObjectMesh(o); this.objectMeshes[o.id]=m; this.world.add(m); }
    }
    for(const id in this.objectMeshes){ if(!alive[id]){ this.world.remove(this.objectMeshes[id]); delete this.objectMeshes[id]; } }
  };
  Renderer.prototype.syncAttached = function(game){
    const seen = {};
    for(let i=0;i<game.attached.length;i++){
      const a=game.attached[i]; seen[a.id]=true;
      let m=this.attachMeshes[a.id];
      if(!m){ m=this.makeObjectMesh({ id:a.id, shape:a.shape, color:a.color, size:1, pos:{x:0,z:0} }); this.attachMeshes[a.id]=m; this.ballGroup.add(m); }
      const r=0.52 + a.size / Math.max(game.ball.d,0.1) * 0.34;
      m.position.set(a.dir.x*r, a.dir.y*r*0.65, a.dir.z*r);
      m.scale.setScalar(Math.max(0.05, a.size / game.ball.d));
      m.rotation.x += 0.01 + a.spin*0.001; m.rotation.z += 0.015;
    }
    for(const id in this.attachMeshes){ if(!seen[id]){ this.ballGroup.remove(this.attachMeshes[id]); delete this.attachMeshes[id]; } }
  };
  Renderer.prototype.handleEvent = function(type,data){
    if(type==='absorb') this.effects.push({ type:'pop', t:0, x:data.object.pos.x, z:data.object.pos.z, size:data.object.size, color:data.object.color });
    if(type==='grow') this.effects.push({ type:'ring', t:0 });
    if(type==='bump'){ this.shake=Math.max(this.shake,0.45); for(let i=0;i<18;i++) this.effects.push({ type:'star', t:0, x:data.x, z:data.z, vx:(Math.random()-.5)*8, vz:(Math.random()-.5)*8 }); }
    if(type==='finish') this.effects.push({ type:'ring', t:0 });
  };
  Renderer.prototype.updateEffects = function(dt){
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i]; e.t += dt/1000;
      if(!e.mesh){
        const color = e.type==='star' ? '#ffed54' : (e.color || '#ffffff');
        e.mesh = new THREE.Mesh(e.type==='ring'?new THREE.TorusGeometry(1,0.035,8,64):new THREE.SphereGeometry(0.1,8,6), new THREE.MeshBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.9 }));
        if(e.type==='ring'){ e.mesh.rotation.x=Math.PI/2; this.ballGroup.add(e.mesh); } else { e.mesh.position.set(e.x||0, .4+(e.size||1), e.z||0); this.world.add(e.mesh); }
      }
      if(e.type==='pop'){ e.mesh.scale.setScalar(1+e.t*5); e.mesh.material.opacity=Math.max(0,1-e.t*2.2); }
      if(e.type==='ring'){ e.mesh.scale.setScalar(1+e.t*5); e.mesh.material.opacity=Math.max(0,1-e.t*1.4); }
      if(e.type==='star'){ e.mesh.position.x += e.vx*dt/1000; e.mesh.position.z += e.vz*dt/1000; e.mesh.position.y += (1.5-e.t*4)*dt/1000; e.mesh.material.opacity=Math.max(0,1-e.t*1.8); }
      if(e.t>1.1){ if(e.type==='ring') this.ballGroup.remove(e.mesh); else this.world.remove(e.mesh); this.effects.splice(i,1); }
    }
    this.shake *= Math.pow(0.02, dt/1000);
  };
  Renderer.prototype.render = function(game,dt){
    this.clock += (dt||16.7)/1000;
    this.syncObjects(game); this.syncAttached(game);
    const b=game.ball, r=b.d/2;
    this.ballGroup.position.set(b.x,r,b.z);
    this.ballGroup.rotation.x=b.spinX; this.ballGroup.rotation.z=b.spinZ;
    this.ball.scale.setScalar(r);
    this.trail.push([b.x,0.05,b.z,(this.clock*0.2)%1]); if(this.trail.length>44) this.trail.shift();
    const pts=[]; for(let i=0;i<this.trail.length;i++) pts.push(this.trail[i][0],this.trail[i][1],this.trail[i][2]);
    this.trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
    this.updateEffects(dt||16.7);
    const dist=8 + b.d*3.2, height=4 + b.d*1.15, yaw=game.cameraYaw;
    const target=new THREE.Vector3(b.x, Math.max(0.8,r), b.z);
    const shakeX=(Math.random()-.5)*this.shake, shakeY=(Math.random()-.5)*this.shake;
    const cam=new THREE.Vector3(b.x + Math.sin(yaw)*dist + shakeX, height + shakeY, b.z + Math.cos(yaw)*dist);
    this.camera.position.lerp(cam,0.12); this.camera.lookAt(target);
    this.scene.fog.near = dist + 24; this.scene.fog.far = dist + 90;
    this.renderer.render(this.scene,this.camera);
  };
  window.KorogariRenderer = Renderer;
})();
