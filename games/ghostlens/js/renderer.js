(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const ROOM_RADIUS = 16;
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function shortest(v) { while (v > 180) v -= 360; while (v < -180) v += 360; return v; }

  function GhostLensRenderer(options) {
    options = options || {};
    this.canvas = options.canvas;
    this.game = options.game;
    this.renderer = new THREE.WebGLRenderer({
      canvas:this.canvas,
      antialias:true,
      alpha:false,
      preserveDrawingBuffer:true,
      powerPreference:'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x020506, 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .74;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const near = ROOM_RADIUS / 400;
    const far = ROOM_RADIUS * 3;
    this.camera = new THREE.PerspectiveCamera(70, 1, near, far);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 0, 0);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020506);
    this.scene.fog = new THREE.FogExp2(0x05090a, 1 / (ROOM_RADIUS * 1.42));
    this.roomGroup = new THREE.Group();
    this.ghostGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.scene.add(this.roomGroup, this.ghostGroup, this.effectGroup);
    this.ghostMeshes = {};
    this.effects = [];
    this.mirrorCrackTimer = 0;
    this.time = 0;
    this.lastWidth = 0;
    this.lastHeight = 0;

    this.dom = {
      shell:document.getElementById('game-shell'),
      hud:document.getElementById('hud'),
      time:document.getElementById('time-value'),
      timeBox:document.getElementById('time-box'),
      score:document.getElementById('score-value'),
      combo:document.getElementById('combo-value'),
      film:document.getElementById('film-value'),
      reload:document.getElementById('reload-bar'),
      focusRing:document.getElementById('focus-ring'),
      reticle:document.getElementById('reticle'),
      focusLabel:document.getElementById('focus-label'),
      emf:document.getElementById('emf-needle'),
      noise:document.getElementById('noise-field'),
      breath:document.getElementById('breath-fog'),
      interference:document.getElementById('interference'),
      attackHands:document.getElementById('attack-hands'),
      jumpscare:document.getElementById('jumpscare-face'),
      flash:document.getElementById('flash'),
      message:document.getElementById('message'),
      polaroid:document.getElementById('polaroid-tray'),
      result:document.getElementById('result-screen'),
      album:document.getElementById('album'),
      resultScore:document.getElementById('result-score'),
      resultCaptures:document.getElementById('result-captures'),
      resultCombo:document.getElementById('result-combo'),
      resultBest:document.getElementById('result-best'),
      zoom:document.getElementById('zoom-btn')
    };
    this.makeRoom();
    this.makeLights();
    this.makeDust();
    this.resize();
    const self = this;
    window.addEventListener('resize', function () { self.resize(); });
  }

  GhostLensRenderer.prototype.material = function (color, roughness, metalness) {
    return new THREE.MeshStandardMaterial({
      color:color,
      roughness:roughness == null ? .82 : roughness,
      metalness:metalness == null ? .04 : metalness
    });
  };
  GhostLensRenderer.prototype.box = function (name, sx, sy, sz, x, y, z, color, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.material(color));
    mesh.name = name;
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || this.roomGroup).add(mesh);
    return mesh;
  };

  GhostLensRenderer.prototype.makeRoom = function () {
    const inside = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_RADIUS, 7, ROOM_RADIUS),
      new THREE.MeshStandardMaterial({ color:0x111715, roughness:1, side:THREE.BackSide })
    );
    inside.position.y = .9;
    inside.receiveShadow = true;
    this.roomGroup.add(inside);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_RADIUS, ROOM_RADIUS, 10, 10), this.material(0x171714, .94));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.55;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);
    for (let i = -7; i <= 7; i += 1.15) {
      const seam = this.box('floor seam', ROOM_RADIUS, .012, .018, 0, -2.535, i, 0x090b09);
      seam.castShadow = false;
    }

    this.makeBed();
    this.makeVanity();
    this.makeFireplace();
    this.makeWindow();
    this.makeCurtains();
    this.makeChandelier();
    this.makeDecor();
  };

  GhostLensRenderer.prototype.makeBed = function () {
    const group = new THREE.Group();
    group.position.set(-4.8,-1.65,-3.4);
    group.rotation.y = .1;
    this.roomGroup.add(group);
    this.box('bed frame',4.8,.55,2.65,0,0,0,0x291d19,group);
    this.box('mattress',4.35,.42,2.35,0,.48,0,0x4a4b43,group);
    this.box('blanket',2.7,.1,2.38,-.65,.73,.05,0x303936,group);
    this.box('headboard',.25,2.4,2.9,-2.37,.8,0,0x201714,group);
    this.box('pillow',.72,.25,1.75,-1.52,.82,0,0x67685e,group).rotation.z = -.08;
  };

  GhostLensRenderer.prototype.makeVanity = function () {
    const group = new THREE.Group();
    this.vanityGroup = group;
    group.position.set(5.8,-1.5,-4.6);
    group.rotation.y = -.22;
    this.roomGroup.add(group);
    this.box('vanity table',2.8,.18,1.05,0,.75,0,0x2a1d18,group);
    this.box('vanity left',.22,1.55,.8,-1.12,0,0,0x241914,group);
    this.box('vanity right',.22,1.55,.8,1.12,0,0,0x241914,group);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.15,.12,8,24),this.material(0x34271f,.45,.25));
    frame.position.set(0,2.1,0);
    frame.rotation.y = Math.PI;
    group.add(frame);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(1.05,24),new THREE.MeshStandardMaterial({color:0x364341,metalness:.72,roughness:.18,side:THREE.DoubleSide}));
    mirror.position.set(0,2.1,.02);
    mirror.rotation.y = Math.PI;
    group.add(mirror);
    this.mirrorSurface = mirror;
    const crackPoints = [
      new THREE.Vector3(0,0,0),new THREE.Vector3(.68,.72,0),
      new THREE.Vector3(0,0,0),new THREE.Vector3(-.76,.48,0),
      new THREE.Vector3(0,0,0),new THREE.Vector3(.52,-.82,0),
      new THREE.Vector3(.25,.27,0),new THREE.Vector3(.92,.18,0),
      new THREE.Vector3(-.3,.19,0),new THREE.Vector3(-.45,-.72,0),
      new THREE.Vector3(.17,-.26,0),new THREE.Vector3(-.22,-.91,0)
    ];
    const crackGeometry = new THREE.BufferGeometry().setFromPoints(crackPoints);
    this.mirrorCracks = new THREE.LineSegments(crackGeometry,new THREE.LineBasicMaterial({color:0xdce9e2,transparent:true,opacity:.82}));
    this.mirrorCracks.position.set(0,2.1,.13);
    this.mirrorCracks.visible = false;
    group.add(this.mirrorCracks);
    const stool = this.box('stool',1.05,.18,.8,0,-.05,1.3,0x2b201b,group);
    stool.rotation.y = -.15;
  };

  GhostLensRenderer.prototype.makeFireplace = function () {
    const group = new THREE.Group();
    group.position.set(0,-.8,7.55);
    group.rotation.y = Math.PI;
    this.roomGroup.add(group);
    this.box('fireplace mantle',4,.38,1.25,0,1.9,0,0x383935,group);
    this.box('fireplace left',.72,3.5,1.05,-1.48,.05,0,0x30312e,group);
    this.box('fireplace right',.72,3.5,1.05,1.48,.05,0,0x30312e,group);
    this.box('fireplace top',3.1,.7,1.05,0,1.18,0,0x30312e,group);
    this.box('hearth',3.7,.25,1.8,0,-1.78,.45,0x282925,group);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(2.25,2.15),new THREE.MeshBasicMaterial({color:0x030403}));
    opening.position.set(0,-.35,-.56);
    group.add(opening);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,1.55,7),this.material(0x17110e));
      log.rotation.z = Math.PI/2;
      log.rotation.y = i*.32;
      log.position.set((i-1.5)*.3,-1.2,-.72);
      group.add(log);
    }
  };

  GhostLensRenderer.prototype.makeWindow = function () {
    const group = new THREE.Group();
    group.position.set(-4.4,.8,-7.83);
    this.roomGroup.add(group);
    this.box('window frame',4.4,.22,.18,0,2.05,0,0x282d2a,group);
    this.box('window frame',4.4,.22,.18,0,-2.05,0,0x282d2a,group);
    this.box('window frame',.22,4.3,.18,-2.08,0,0,0x282d2a,group);
    this.box('window frame',.22,4.3,.18,2.08,0,0,0x282d2a,group);
    this.box('window mullion',.12,4.0,.2,0,0,0,0x252a27,group);
    this.box('window mullion',4.05,.12,.2,0,0,0,0x252a27,group);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.95,3.95),new THREE.MeshBasicMaterial({color:0x7696a1,transparent:true,opacity:.33}));
    glass.position.z = .09;
    group.add(glass);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(.8,24),new THREE.MeshBasicMaterial({color:0xd4e4df}));
    moon.position.set(-.85,.95,.12);
    group.add(moon);
    const crackMat = new THREE.LineBasicMaterial({color:0xa9c0bd,transparent:true,opacity:.6});
    const points = [new THREE.Vector3(.55,.25,.14),new THREE.Vector3(1.5,1.42,.14),new THREE.Vector3(.55,.25,.14),new THREE.Vector3(1.72,-.3,.14),new THREE.Vector3(.55,.25,.14),new THREE.Vector3(.18,-1.54,.14)];
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),crackMat));
  };

  GhostLensRenderer.prototype.makeCurtains = function () {
    this.curtains = [];
    const mat = new THREE.MeshStandardMaterial({color:0x222927,roughness:1,side:THREE.DoubleSide});
    [-6.75,-2.05].forEach(function (x, index) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.65,5.3,5,8),mat.clone());
      curtain.position.set(x,.55,-7.54);
      curtain.rotation.y = index ? -.12 : .12;
      curtain.castShadow = true;
      this.roomGroup.add(curtain);
      this.curtains.push({mesh:curtain,base:x,phase:index*1.8});
    },this);
  };

  GhostLensRenderer.prototype.makeChandelier = function () {
    const group = this.chandelier = new THREE.Group();
    group.position.set(1.4,2.25,.4);
    this.roomGroup.add(group);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,2.2,6),this.material(0x383b36,.35,.6));
    chain.position.y = 1.15; group.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2,.06,6,18),this.material(0x383a34,.4,.55));
    ring.rotation.x = Math.PI/2; group.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.85,6),this.material(0x353832,.4,.5));
      arm.position.set(Math.sin(a)*.78,-.18,Math.cos(a)*.78);
      arm.rotation.z = Math.sin(a)*.9;
      arm.rotation.x = Math.cos(a)*.9;
      group.add(arm);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.5,7),this.material(0x5d5a49));
      candle.position.set(Math.sin(a)*1.18,-.18,Math.cos(a)*1.18);
      group.add(candle);
    }
  };

  GhostLensRenderer.prototype.makeDecor = function () {
    const wardrobe = new THREE.Group();
    wardrobe.position.set(7.3,-.35,1.7);
    wardrobe.rotation.y = -Math.PI/2;
    this.roomGroup.add(wardrobe);
    this.box('wardrobe',3.2,4.5,1.5,0,0,0,0x201814,wardrobe);
    this.box('wardrobe door',1.45,4.05,.08,-.78,0,.78,0x2a211c,wardrobe);
    this.box('wardrobe door',1.45,4.05,.08,.78,0,.78,0x2a211c,wardrobe);
    for (let s = -1; s <= 1; s += 2) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.08,8,6),this.material(0x6f644b,.25,.65));
      knob.position.set(s*.22,0,.86);
      wardrobe.add(knob);
    }
    this.box('fallen chair',1.4,.18,1.4,4,-2.12,3.7,0x281d18).rotation.y = .6;
    for (let i = 0; i < 4; i++) {
      const leg = this.box('chair leg',.16,1.5,.16,3.6+(i%2)*.8,-1.65,3.35+Math.floor(i/2)*.7,0x281d18);
      leg.rotation.z = .65;
    }
    const portrait = this.box('portrait',2.25,2.9,.13,-7.82,.85,2.9,0x2b241e);
    portrait.rotation.y = Math.PI/2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7,2.25),new THREE.MeshBasicMaterial({color:0x252a26}));
    face.position.set(-7.73,.85,2.9); face.rotation.y = Math.PI/2; this.roomGroup.add(face);
  };

  GhostLensRenderer.prototype.makeLights = function () {
    const moon = new THREE.DirectionalLight(0x9cc6d4,1.35);
    moon.position.set(-5,5,-6);
    moon.target.position.set(1,-1,2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(768,768);
    moon.shadow.camera.near = ROOM_RADIUS/20;
    moon.shadow.camera.far = ROOM_RADIUS*2;
    moon.shadow.camera.left = -8; moon.shadow.camera.right = 8; moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8;
    this.scene.add(moon,moon.target);
    this.scene.add(new THREE.HemisphereLight(0x344b50,0x100d0b,.24));
    this.flashlight = new THREE.SpotLight(0xd8eee5,2.75,ROOM_RADIUS*1.35,32*DEG,.58,1.15);
    this.flashlight.position.copy(this.camera.position);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(512,512);
    this.flashlight.shadow.camera.near = ROOM_RADIUS/100;
    this.flashlight.shadow.camera.far = ROOM_RADIUS*1.4;
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlight,this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
  };

  GhostLensRenderer.prototype.makeDust = function () {
    const count = 260;
    const positions = new Float32Array(count*3);
    for (let i=0;i<count;i++) {
      positions[i*3]=(Math.random()-.5)*ROOM_RADIUS*.9;
      positions[i*3+1]=Math.random()*6-2.4;
      positions[i*3+2]=(Math.random()-.5)*ROOM_RADIUS*.9;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material = new THREE.PointsMaterial({color:0xbccfc4,size:.035,transparent:true,opacity:.34,depthWrite:false});
    this.dust = new THREE.Points(geometry,material);
    this.roomGroup.add(this.dust);
  };

  GhostLensRenderer.prototype.addOutlinedPart = function (parent, geometry, material, rimMaterial, position, scale) {
    const outline = new THREE.Mesh(geometry,rimMaterial.clone());
    const core = new THREE.Mesh(geometry,material.clone());
    core.position.copy(position);
    outline.position.copy(position);
    core.scale.copy(scale);
    outline.scale.copy(scale).multiplyScalar(1.035);
    outline.userData.rim = true;
    outline.material.userData.rim = true;
    parent.add(outline,core);
    return core;
  };

  GhostLensRenderer.prototype.addCrawlerBone = function (parent, from, to, radius, material, rimMaterial) {
    const direction = new THREE.Vector3().subVectors(to,from);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radius*.72,radius,length,7);
    const midpoint = new THREE.Vector3().addVectors(from,to).multiplyScalar(.5);
    const bone = this.addOutlinedPart(parent,geometry,material,rimMaterial,midpoint,new THREE.Vector3(1,1,1));
    const outline = parent.children[parent.children.length-2];
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    bone.quaternion.copy(rotation);
    outline.quaternion.copy(rotation);
    return bone;
  };

  GhostLensRenderer.prototype.createGhostMesh = function (ghost) {
    const group = new THREE.Group();
    group.userData.type = ghost.type;
    if (ghost.type === 'drifter') {
      const mat = new THREE.MeshStandardMaterial({color:0xdde9e0,emissive:0x91b3a1,emissiveIntensity:.42,transparent:true,opacity:.08,roughness:.9,depthWrite:false});
      const head = new THREE.Mesh(new THREE.SphereGeometry(.32,10,7),mat);
      head.position.y=.68;
      const robe = new THREE.Mesh(new THREE.ConeGeometry(.72,1.7,9,1,true),mat.clone());
      robe.position.y=-.24;
      group.add(head,robe);
      group.userData.materials=[head.material,robe.material];
    } else if (ghost.type === 'crawler') {
      const mat = new THREE.MeshStandardMaterial({color:0x0a0a0a,emissive:0x0c1113,emissiveIntensity:.06,transparent:true,opacity:.12,roughness:.98,depthWrite:false});
      const rim = new THREE.MeshBasicMaterial({color:0x7f9da8,transparent:true,opacity:.035,side:THREE.BackSide,depthWrite:false});
      this.addOutlinedPart(group,new THREE.BoxGeometry(.5,.28,1),mat,rim,new THREE.Vector3(0,0,.15),new THREE.Vector3(1,1,1));
      this.addOutlinedPart(group,new THREE.BoxGeometry(.4,.25,.34),mat,rim,new THREE.Vector3(0,.015,.62),new THREE.Vector3(1,1,1));
      const shoulderL=new THREE.Vector3(-.25,.08,-.22), elbowL=new THREE.Vector3(-.5,.34,-.1), handL=new THREE.Vector3(-.64,-.29,-.58);
      const shoulderR=new THREE.Vector3(.25,.08,-.22), elbowR=new THREE.Vector3(.5,.34,-.1), handR=new THREE.Vector3(.64,-.29,-.58);
      const hipL=new THREE.Vector3(-.2,.07,.56), kneeL=new THREE.Vector3(-.46,.31,.78), footL=new THREE.Vector3(-.58,-.28,1.02);
      const hipR=new THREE.Vector3(.2,.07,.56), kneeR=new THREE.Vector3(.46,.31,.78), footR=new THREE.Vector3(.58,-.28,1.02);
      this.addCrawlerBone(group,shoulderL,elbowL,.075,mat,rim);
      this.addCrawlerBone(group,elbowL,handL,.06,mat,rim);
      this.addCrawlerBone(group,shoulderR,elbowR,.075,mat,rim);
      this.addCrawlerBone(group,elbowR,handR,.06,mat,rim);
      this.addCrawlerBone(group,hipL,kneeL,.085,mat,rim);
      this.addCrawlerBone(group,kneeL,footL,.065,mat,rim);
      this.addCrawlerBone(group,hipR,kneeR,.085,mat,rim);
      this.addCrawlerBone(group,kneeR,footR,.065,mat,rim);
      const headPivot = new THREE.Group();
      headPivot.position.set(0,-.18,-.48);
      const head = this.addOutlinedPart(headPivot,new THREE.SphereGeometry(.25,10,7),mat,rim,new THREE.Vector3(0,0,0),new THREE.Vector3(.82,1.12,.68));
      const faceMat=new THREE.MeshStandardMaterial({color:0xb9b9b1,emissive:0x393c3b,emissiveIntensity:.12,roughness:.95,transparent:true,opacity:.7,depthWrite:false});
      const face=new THREE.Mesh(new THREE.SphereGeometry(.205,10,7),faceMat);
      face.scale.set(.78,1,.24);
      face.position.set(0,-.015,-.185);
      const eyeMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.9,depthWrite:false});
      [-.062,.062].forEach(function(x){
        const eye=new THREE.Mesh(new THREE.SphereGeometry(.026,7,5),eyeMat.clone());
        eye.scale.set(.72,1,.35);
        eye.position.set(x,.02,-.231);
        headPivot.add(eye);
      });
      headPivot.add(face);
      headPivot.rotation.z=.24;
      group.add(headPivot);
      group.userData.headPivot=headPivot;
      group.userData.head=head;
      group.userData.materials=[]; group.traverse(function(o){if(o.material)group.userData.materials.push(o.material);});
    } else if (ghost.type === 'doll') {
      const porcelain = new THREE.MeshStandardMaterial({color:0xd0c9ba,emissive:0x343633,emissiveIntensity:.16,roughness:.86,transparent:true,opacity:.35,depthWrite:false});
      const kimono = new THREE.MeshStandardMaterial({color:0x3a090c,emissive:0x170305,emissiveIntensity:.12,roughness:1,transparent:true,opacity:.42,depthWrite:false});
      const blackCloth = new THREE.MeshStandardMaterial({color:0x100909,emissive:0x090304,emissiveIntensity:.08,roughness:1,transparent:true,opacity:.5,depthWrite:false});
      const torso=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,.22),kimono);
      torso.position.y=-.04;
      const obi=new THREE.Mesh(new THREE.BoxGeometry(.37,.075,.235),blackCloth.clone());
      obi.position.set(0,-.08,-.005);
      const headPivot=new THREE.Group();headPivot.position.y=.25;
      const head=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),porcelain);
      head.scale.set(.94,1,.88);
      headPivot.add(head);
      const hairMat=new THREE.MeshStandardMaterial({color:0x080707,emissive:0x020202,emissiveIntensity:.03,roughness:1,transparent:true,opacity:.82,depthWrite:false});
      const hair=new THREE.Mesh(new THREE.SphereGeometry(.185,11,7,0,Math.PI*2,0,Math.PI*.54),hairMat);
      hair.position.y=.015;
      headPivot.add(hair);
      [-.135,.135].forEach(function(x){
        const bob=new THREE.Mesh(new THREE.BoxGeometry(.09,.27,.17),hairMat.clone());
        bob.position.set(x,-.035,.015);
        headPivot.add(bob);
      });
      const sleeveL=new THREE.Mesh(new THREE.BoxGeometry(.13,.3,.25),kimono.clone());
      sleeveL.position.set(-.225,-.07,.015);
      sleeveL.rotation.z=-.12;
      const sleeveR=sleeveL.clone();
      sleeveR.material=kimono.clone();
      sleeveR.position.x=.225;
      sleeveR.rotation.z=.12;
      const thighL=new THREE.Mesh(new THREE.BoxGeometry(.2,.15,.34),blackCloth.clone());
      thighL.position.set(-.105,-.285,.045);
      const thighR=thighL.clone();
      thighR.material=blackCloth.clone();
      thighR.position.x=.105;
      const footL=new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.3),kimono.clone());
      footL.position.set(-.105,-.39,.09);
      const footR=footL.clone();
      footR.material=kimono.clone();
      footR.position.x=.105;
      group.add(torso,obi,sleeveL,sleeveR,thighL,thighR,footL,footR,headPivot);
      group.userData.headPivot=headPivot;
      group.userData.materials=[];group.traverse(function(o){if(o.material)group.userData.materials.push(o.material);});
    } else if (ghost.type === 'mirror') {
      const dressMat=new THREE.MeshStandardMaterial({color:0x111717,emissive:0x07100f,emissiveIntensity:.1,roughness:1,transparent:true,opacity:.16,depthWrite:false});
      const hairMat=new THREE.MeshStandardMaterial({color:0x050707,emissive:0x020303,emissiveIntensity:.04,roughness:1,transparent:true,opacity:.24,depthWrite:false});
      const faceMat=new THREE.MeshStandardMaterial({color:0xcac9bf,emissive:0x424943,emissiveIntensity:.14,roughness:.92,transparent:true,opacity:.18,depthWrite:false});
      const skirt=new THREE.Mesh(new THREE.BoxGeometry(.58,.72,.055),dressMat);
      skirt.position.set(0,-.39,.018);
      const torso=new THREE.Mesh(new THREE.BoxGeometry(.42,.48,.065),dressMat.clone());
      torso.position.set(0,.02,.025);
      const shoulders=new THREE.Mesh(new THREE.BoxGeometry(.58,.13,.07),dressMat.clone());
      shoulders.position.set(0,.22,.028);
      const face=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),faceMat);
      face.scale.set(.75,1,.22);
      face.position.set(0,.49,.07);
      const hairDome=new THREE.Mesh(new THREE.SphereGeometry(.235,12,8,0,Math.PI*2,0,Math.PI*.57),hairMat);
      hairDome.position.set(0,.52,.04);
      const hairL=new THREE.Mesh(new THREE.BoxGeometry(.15,.65,.055),hairMat.clone());
      hairL.position.set(-.205,.26,.052);
      const hairR=hairL.clone();
      hairR.material=hairMat.clone();
      hairR.position.x=.205;
      group.add(skirt,torso,shoulders,hairDome,hairL,hairR,face);
      group.userData.mirrorClipRadius=1.0;
      group.userData.materials=[];group.traverse(function(o){if(o.material)group.userData.materials.push(o.material);});
    } else {
      const mat = new THREE.MeshBasicMaterial({color:0xffd36b,transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending});
      const core=new THREE.Mesh(new THREE.OctahedronGeometry(.55,1),mat);
      const halo=new THREE.Mesh(new THREE.TorusGeometry(.86,.035,6,24),mat.clone());
      halo.rotation.x=Math.PI/2;
      const trail=new THREE.Mesh(new THREE.ConeGeometry(.35,1.5,8,1,true),mat.clone());
      trail.rotation.x=-Math.PI/2;
      trail.position.z=.65;
      group.add(core,halo,trail);
      group.userData.materials=[core.material,halo.material,trail.material];
    }
    group.visible=true;
    this.ghostGroup.add(group);
    this.ghostMeshes[ghost.id]=group;
    return group;
  };

  GhostLensRenderer.prototype.syncGhosts = function (state) {
    const alive={};
    for(let i=0;i<state.ghosts.length;i++){
      const ghost=state.ghosts[i];
      alive[ghost.id]=true;
      const mesh=this.ghostMeshes[ghost.id]||this.createGhostMesh(ghost);
      const yaw=ghost.yaw*DEG,pitch=ghost.pitch*DEG;
      const rawReveal=ghost.state==='banishing'?1:clamp((8.5-ghost.angleErrorDeg)/5.5,0,1);
      const reveal=ghost.type==='doll'?Math.max(.35,rawReveal):rawReveal;
      const pulse=.88+Math.sin(this.time*(ghost.type==='gold'?8:2.2)+ghost.id)*.12;
      const banishScale=ghost.state==='banishing'?(1+Math.max(0,1-ghost.remainingMs/800)*.12):1;
      const targetScale=(ghost.type==='doll'||ghost.type==='mirror'?1:(ghost.type==='crawler'?1:pulse)*(1+rawReveal*.2))*banishScale;
      let preferredRadius;
      if(ghost.type==='crawler'){
        const approach=clamp((ghost.distance-.55)/(10-.55),0,1);
        preferredRadius=1.3+approach*5.15;
      }else{
        preferredRadius=6.15;
      }
      const verticalExtent=(ghost.type==='drifter'?1.12:ghost.type==='crawler'?.62:ghost.type==='doll'?.45:.78)*targetScale;
      const horizontalExtent=(ghost.type==='drifter'?.76:ghost.type==='crawler'?.7:ghost.type==='doll'?.32:.42)*targetScale;
      const sinPitch=Math.sin(pitch);
      let verticalRadiusLimit=preferredRadius;
      if(sinPitch>.001)verticalRadiusLimit=(4.22-verticalExtent)/sinPitch;
      else if(sinPitch<-.001)verticalRadiusLimit=(-2.38+verticalExtent)/sinPitch;
      const horizontalRadiusLimit=7.72-horizontalExtent;
      const radius=clamp(Math.min(preferredRadius,verticalRadiusLimit,horizontalRadiusLimit),1.15,preferredRadius);
      if(ghost.world){
        mesh.position.set(ghost.world.x,ghost.world.y,ghost.world.z);
        if(ghost.type==='mirror'){
          const towardCamera=new THREE.Vector3().copy(mesh.position).multiplyScalar(-1).normalize();
          mesh.position.addScaledVector(towardCamera,.045);
        }
      }else{
        mesh.position.set(Math.sin(yaw)*Math.cos(pitch)*radius,Math.sin(pitch)*radius,-Math.cos(yaw)*Math.cos(pitch)*radius);
      }
      if(ghost.type==='mirror'){
        mesh.rotation.y=-.22;
        mesh.rotation.z=Math.sin(this.time*.72+ghost.id)*2*DEG;
      }else mesh.rotation.y=Math.PI-yaw;
      const opacity=ghost.type==='doll'?.3+reveal*.62:ghost.type==='mirror'?.02+reveal*.82:.025+reveal*.75;
      mesh.scale.setScalar(targetScale);
      const mats=mesh.userData.materials||[];
      for(let m=0;m<mats.length;m++){
        if(mats[m].opacity!=null)mats[m].opacity=mats[m].userData.rim?(ghost.type==='crawler'?(.012+reveal*.05):(.08+reveal*.22)):opacity*(mats[m].blending===THREE.AdditiveBlending?1:.92);
        if(mats[m].emissiveIntensity!=null){
          mats[m].emissiveIntensity=ghost.type==='crawler'?(.045+reveal*.075):ghost.type==='doll'?(.1+reveal*.22):ghost.type==='mirror'?(.08+reveal*.2):(.35+reveal*.85);
        }
      }
      if(ghost.type==='crawler'){
        const frame=ghost.jerkFrame%5;
        const offsets=[0,.045,-.018,.072,.012];
        mesh.position.y+=offsets[frame];
        mesh.rotation.z=(frame===1?-.035:frame===3?.045:0);
        if(mesh.userData.headPivot){
          mesh.userData.headPivot.rotation.x=-.74+ghost.headLift*1.12+(frame===2?.1:0);
          mesh.userData.headPivot.rotation.z=.24+(frame-2)*.035;
        }
      }
      if(ghost.type==='doll'&&mesh.userData.headPivot){
        const dollTilt=clamp(ghost.dollHeadTurn,-20,20)*DEG;
        mesh.userData.headPivot.rotation.y=dollTilt*.35;
        mesh.userData.headPivot.rotation.z=dollTilt+(ghost.state==='banishing'?clamp((900-ghost.banishRemainingMs)/500,0,1)*1.28:0);
        mesh.userData.headPivot.position.y=.25-(ghost.state==='banishing'?clamp((900-ghost.banishRemainingMs)/700,0,1)*.2:0);
      }
      if(ghost.type==='gold') mesh.rotation.z+=.018;
    }
    const ids=Object.keys(this.ghostMeshes);
    for(let j=0;j<ids.length;j++){
      if(!alive[ids[j]]){this.ghostGroup.remove(this.ghostMeshes[ids[j]]);delete this.ghostMeshes[ids[j]];}
    }
  };

  GhostLensRenderer.prototype.spawnBanishEffect = function (type, ghostId) {
    const source=this.ghostMeshes[ghostId];
    if(!source)return;
    const count=type==='gold'?90:type==='mirror'?62:type==='doll'?38:type==='crawler'?48:42;
    const positions=new Float32Array(count*3);
    const velocities=[];
    for(let i=0;i<count;i++){
      positions[i*3]=source.position.x;positions[i*3+1]=source.position.y;positions[i*3+2]=source.position.z;
      const outward=type==='crawler'?-1:1;
      velocities.push(new THREE.Vector3((Math.random()-.5)*2.6,(Math.random()*.9+.1)*outward,(Math.random()-.5)*2.6));
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const color=type==='gold'?0xffc94d:type==='crawler'?0x080908:type==='doll'?0x9f777c:type==='mirror'?0xc7e8e2:0xd9eee3;
    const mat=new THREE.PointsMaterial({color:color,size:type==='gold'?.12:type==='mirror'?.095:.08,transparent:true,opacity:1,depthWrite:false,blending:type==='crawler'?THREE.NormalBlending:THREE.AdditiveBlending});
    const points=new THREE.Points(geo,mat);this.effectGroup.add(points);
    this.effects.push({points:points,velocities:velocities,age:0,life:type==='gold'?1.25:type==='mirror'?1.05:.85,type:type});
  };

  GhostLensRenderer.prototype.updateEffects = function (dt) {
    for(let i=this.effects.length-1;i>=0;i--){
      const effect=this.effects[i];effect.age+=dt;
      const pos=effect.points.geometry.attributes.position;
      for(let p=0;p<effect.velocities.length;p++){
        const v=effect.velocities[p];
        if(effect.type==='crawler'){v.multiplyScalar(.94);}else v.y+=dt*.35;
        pos.array[p*3]+=v.x*dt;pos.array[p*3+1]+=v.y*dt;pos.array[p*3+2]+=v.z*dt;
      }
      pos.needsUpdate=true;
      effect.points.material.opacity=clamp(1-effect.age/effect.life,0,1);
      effect.points.material.size*=1+dt*.18;
      if(effect.age>=effect.life){this.effectGroup.remove(effect.points);effect.points.geometry.dispose();effect.points.material.dispose();this.effects.splice(i,1);}
    }
  };

  GhostLensRenderer.prototype.resize = function () {
    const width=Math.max(1,this.canvas.clientWidth||window.innerWidth||1);
    const height=Math.max(1,this.canvas.clientHeight||window.innerHeight||1);
    if(width===this.lastWidth&&height===this.lastHeight)return;
    this.lastWidth=width;this.lastHeight=height;
    this.renderer.setSize(width,height,false);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  };

  GhostLensRenderer.prototype.render = function (state, dtMs) {
    if(!state)return;
    this.resize();
    const dt=clamp((Number(dtMs)||0)/1000,0,.1);
    this.time+=dt;
    this.camera.fov=state.camera.zoom?40:70;
    this.camera.aspect=this.lastWidth/this.lastHeight;
    this.camera.rotation.x=state.camera.pitch*DEG;
    this.camera.rotation.y=-state.camera.yaw*DEG;
    this.camera.updateProjectionMatrix();
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    this.flashlight.position.copy(this.camera.position);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(direction,8);
    this.flashlight.intensity=state.interferenceMs>0?.65:2.75;
    this.syncGhosts(state);
    this.updateEffects(dt);
    if(this.mirrorCrackTimer>0){
      this.mirrorCrackTimer=Math.max(0,this.mirrorCrackTimer-dt);
      this.mirrorCracks.visible=true;
      this.mirrorCracks.material.opacity=clamp(this.mirrorCrackTimer/.35,0,.9);
      if(this.mirrorCrackTimer===0)this.mirrorCracks.visible=false;
    }
    if(this.dust){this.dust.rotation.y+=dt*.012;this.dust.position.y=Math.sin(this.time*.22)*.08;}
    if(this.chandelier){this.chandelier.rotation.z=Math.sin(this.time*.55)*.018;this.chandelier.rotation.x=Math.cos(this.time*.43)*.012;}
    if(this.curtains)for(let i=0;i<this.curtains.length;i++)this.curtains[i].mesh.rotation.y=(i?-.12:.12)+Math.sin(this.time*.72+this.curtains[i].phase)*.035;
    this.updateHUD(state);
    this.renderer.render(this.scene,this.camera);
  };

  GhostLensRenderer.prototype.updateHUD = function (state) {
    this.dom.time.textContent=(state.remainingMs/1000).toFixed(1);
    this.dom.score.textContent=String(state.score).padStart(6,'0');
    this.dom.combo.textContent=state.combo?'COMBO '+state.combo+'  ×'+state.comboMultiplier.toFixed(2):'NO COMBO';
    this.dom.film.textContent=String(state.film).padStart(2,'0');
    this.dom.reload.classList.toggle('active',state.reloading);
    this.dom.reload.style.setProperty('--reload',state.reloading?((1-state.reloadRemainingMs/2000)*100).toFixed(1)+'%':'0%');
    this.dom.reticle.style.setProperty('--focus',state.focus.progress);
    this.dom.reticle.classList.toggle('locked',state.focus.locked);
    const focusGhost=state.ghosts.find(function(g){return g.id===state.focus.ghostId;});
    this.dom.reticle.classList.toggle('gold',!!focusGhost&&focusGhost.type==='gold');
    this.dom.focusLabel.textContent=state.focus.locked?'FOCUS LOCK':state.focus.ghostId!=null?'FOCUSING '+Math.round(state.focus.progress*100)+'%':'SEARCH';
    this.dom.emf.parentElement.style.setProperty('--emf',state.emf);
    this.dom.shell.classList.toggle('danger',state.remainingMs<=10000&&state.mode==='play');
    const attackPhase=state.crawlerAttack?state.crawlerAttack.phase:'idle';
    this.dom.interference.classList.toggle('active',attackPhase==='noise');
    this.dom.interference.classList.toggle('silence',attackPhase==='silence');
    this.dom.attackHands.className='attack-hands'+(attackPhase==='grab'?' grab':attackPhase==='noise'?' noise':'');
    this.dom.jumpscare.classList.toggle('active',!!(state.jumpscare&&state.jumpscare.active));
    this.dom.zoom.setAttribute('aria-pressed',state.camera.zoom?'true':'false');
    this.dom.zoom.textContent=state.camera.zoom?'⌕ 1.75×':'⌕ 1.0×';
    let nearest=null;
    for(let i=0;i<state.ghosts.length;i++)if(!nearest||state.ghosts[i].angleErrorDeg<nearest.angleErrorDeg)nearest=state.ghosts[i];
    if(nearest){
      const dx=shortest(nearest.yaw-state.camera.yaw);
      const x=clamp(50+Math.sin(dx*DEG)*49,2,98);
      const edgeCenter=state.camera.zoom?18:32;
      const edgeWidth=state.camera.zoom?13:22;
      const edgePeak=Math.exp(-Math.pow(nearest.angleErrorDeg-edgeCenter,2)/(2*edgeWidth*edgeWidth));
      const strength=clamp(.035+edgePeak*.68,.035,.72);
      this.dom.noise.style.setProperty('--noise-x',x.toFixed(1)+'%');
      this.dom.noise.style.setProperty('--noise-strength',strength.toFixed(3));
      const breath=nearest.angleErrorDeg<25?clamp((25-nearest.angleErrorDeg)/22*(nearest.type==='crawler'?1:.72),0,.82):0;
      this.dom.breath.style.setProperty('--breath',breath.toFixed(3));
    }else this.dom.noise.style.setProperty('--noise-strength','.03');
    if(!nearest)this.dom.breath.style.setProperty('--breath','0');
  };

  GhostLensRenderer.prototype.showMessage = function (text, className) {
    const el=this.dom.message;
    el.textContent=text;
    el.className='message';
    void el.offsetWidth;
    el.classList.add('show');
    if(className)el.classList.add(className);
  };

  GhostLensRenderer.prototype.flash = function (blur) {
    const el=this.dom.flash;
    el.className='flash';void el.offsetWidth;el.classList.add(blur?'blur':'fire');
  };

  GhostLensRenderer.prototype.capturePhoto = function (photoId, data) {
    this.render(this.game.getState(),0);
    const source=this.renderer.domElement;
    const maxWidth=480;
    const scale=Math.min(1,maxWidth/source.width);
    const width=Math.max(1,Math.round(source.width*scale));
    const height=Math.max(1,Math.round(source.height*scale));
    const photoCanvas=document.createElement('canvas');
    photoCanvas.width=width;photoCanvas.height=height;
    const ctx=photoCanvas.getContext('2d');
    ctx.drawImage(source,0,0,width,height);
    const vignette=ctx.createRadialGradient(width*.5,height*.45,Math.min(width,height)*.16,width*.5,height*.45,Math.max(width,height)*.72);
    vignette.addColorStop(0,'rgba(17,30,24,0)');
    vignette.addColorStop(1,'rgba(0,4,3,.72)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='rgba(205,226,214,.82)';
    ctx.font=Math.max(10,Math.round(width*.026))+'px monospace';
    const stamp=this.currentStamp();
    ctx.fillText(stamp,12,height-14);
    ctx.textAlign='right';
    ctx.fillStyle=data.type==='gold'?'#f8d66b':'rgba(217,237,226,.88)';
    ctx.fillText(data.quality+'  #'+String(photoId).padStart(2,'0'),width-12,height-14);
    ctx.textAlign='left';
    let url=null;
    try{url=photoCanvas.toDataURL('image/jpeg',.74);}catch(error){console.error('[GHOST LENS photo]',error);}
    this.game.setPhotoData(photoId,url,stamp);
    if(url)this.ejectPolaroid(url);
    return url;
  };

  GhostLensRenderer.prototype.currentStamp = function () {
    const d=new Date();
    function p(n){return String(n).padStart(2,'0');}
    return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate())+'  '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
  };

  GhostLensRenderer.prototype.ejectPolaroid = function (url) {
    const tray=this.dom.polaroid;
    tray.innerHTML='';
    const img=document.createElement('img');img.alt='撮影した心霊写真';img.src=url;tray.appendChild(img);
    tray.className='polaroid-tray';void tray.offsetWidth;tray.classList.add('eject');
  };

  GhostLensRenderer.prototype.showResult = function (state) {
    this.dom.resultScore.textContent=String(state.score);
    this.dom.resultCaptures.textContent=String(state.captures);
    this.dom.resultCombo.textContent=String(state.maxCombo);
    this.dom.resultBest.textContent=String(state.bestScore);
    this.dom.album.innerHTML='';
    for(let i=0;i<state.photos.length;i++){
      const p=state.photos[i];
      const figure=document.createElement('figure');
      figure.style.setProperty('--tilt',((i%5)-2)*1.2+'deg');
      if(p.dataUrl){const img=document.createElement('img');img.src=p.dataUrl;img.alt=p.quality+' '+p.type+'の心霊写真';figure.appendChild(img);}
      const caption=document.createElement('figcaption');
      caption.textContent=p.quality+' / '+p.type.toUpperCase()+' / +'+p.score;
      figure.appendChild(caption);this.dom.album.appendChild(figure);
    }
    this.dom.result.classList.remove('hidden');
  };

  GhostLensRenderer.prototype.handleEvent = function (type, data) {
    if(type==='capture'){
      this.flash(false);
      this.dom.shell.classList.add('shaking');
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},260);
      this.spawnBanishEffect(data.type,data.ghostId);
      const suffix='  +'+data.score;
      this.showMessage(data.quality+suffix,data.type==='gold'?'gold':data.quality.toLowerCase());
      this.capturePhoto(data.photoId,data);
    }else if(type==='blur'){
      this.flash(true);this.showMessage('OUT OF FOCUS','');
    }else if(type==='reloadStart'){
      this.showMessage('DEVELOPING…','');
    }else if(type==='reloadComplete'){
      this.showMessage('FILM LOADED','');
    }else if(type==='crawlerAttack'){
      this.dom.shell.classList.add('shaking');this.showMessage('SIGNAL HIJACKED','');
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},900);
    }else if(type==='jumpscare'){
      this.dom.shell.classList.add('shaking');
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},420);
    }else if(type==='expired'){
      this.showMessage(data.type==='gold'?'RARE SIGNAL LOST':'SIGNAL LOST','');
    }
    if(type==='capture'&&data.type==='mirror'){
      this.mirrorCrackTimer=2.1;
      this.mirrorCracks.visible=true;
    }
  };

  GhostLensRenderer.prototype.getInfo = function () {
    return {
      width:this.renderer.domElement.width,
      height:this.renderer.domElement.height,
      pixelRatio:this.renderer.getPixelRatio(),
      preserveDrawingBuffer:true,
      fov:this.camera.fov,
      near:this.camera.near,
      far:this.camera.far,
      fogDensity:this.scene.fog.density,
      ghostMeshes:Object.keys(this.ghostMeshes).length,
      effects:this.effects.length
    };
  };

  window.GhostLensRenderer=GhostLensRenderer;
})();
