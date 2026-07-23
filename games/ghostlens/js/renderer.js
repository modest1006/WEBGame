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
    this.handprints = [];
    this.mirrorCrackTimer = 0;
    this.time = 0;
    this.resultRunId = 0;
    this.resultTimers = [];
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
      filmPanel:document.getElementById('film-panel'),
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
      lightning:document.getElementById('lightning-flash'),
      flash:document.getElementById('flash'),
      perfectStamp:document.getElementById('perfect-stamp'),
      scorePopLayer:document.getElementById('score-pop-layer'),
      message:document.getElementById('message'),
      lost:document.getElementById('lost-indicator'),
      polaroid:document.getElementById('polaroid-tray'),
      dex:document.getElementById('dex-screen'),
      dexGrid:document.getElementById('dex-grid'),
      dexProgress:document.getElementById('dex-progress'),
      dexSeal:document.getElementById('dex-seal'),
      titleBest:document.getElementById('title-best-title'),
      dexMedal:document.getElementById('dex-medal'),
      result:document.getElementById('result-screen'),
      album:document.getElementById('album'),
      resultScore:document.getElementById('result-score'),
      resultCaptures:document.getElementById('result-captures'),
      resultCombo:document.getElementById('result-combo'),
      resultBest:document.getElementById('result-best'),
      resultRank:document.getElementById('result-rank-name'),
      promotion:document.getElementById('promotion-stamp'),
      newRecord:document.getElementById('new-record-stamp'),
      lightbox:document.getElementById('photo-lightbox'),
      lightboxImage:document.getElementById('photo-lightbox-image'),
      lightboxCaption:document.getElementById('photo-lightbox-caption'),
      zoom:document.getElementById('zoom-btn')
    };
    this.artTextures = this.createArtTextures();
    this.makeRoom();
    this.makeLights();
    this.makeDust();
    this.resize();
    const self = this;
    window.addEventListener('resize', function () { self.resize(); });
    this.dom.lightbox.addEventListener('click', function () { self.closePhoto(); });
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
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(1.05,24),new THREE.MeshStandardMaterial({
      color:0x596462,
      map:this.artTextures.mirrorFog,
      metalness:.58,
      roughness:.42,
      transparent:true,
      opacity:.88,
      side:THREE.DoubleSide
    }));
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
    this.emberLight = new THREE.PointLight(0xff7130,.48,5.6,2);
    this.emberLight.position.set(0,-.86,-1);
    group.add(this.emberLight);
    this.embers = new THREE.Group();
    for (let j=0;j<9;j++) {
      const ember=new THREE.Mesh(
        new THREE.SphereGeometry(.035+(j%3)*.012,5,4),
        new THREE.MeshBasicMaterial({color:j%2?0xff6b27:0xffb04a,transparent:true,opacity:.72})
      );
      ember.position.set((j-4)*.14,-1.15+(j%2)*.045,-.82+(j%3)*.05);
      this.embers.add(ember);
    }
    group.add(this.embers);
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

    const clock=this.clockGroup=new THREE.Group();
    clock.position.set(7.78,-.15,-2.3);
    clock.rotation.y=-Math.PI/2;
    this.roomGroup.add(clock);
    this.box('grandfather clock',1.12,4.25,.72,0,0,0,0x241914,clock);
    const clockFace=new THREE.Mesh(new THREE.CircleGeometry(.43,18),new THREE.MeshStandardMaterial({color:0x8d856e,roughness:.7,metalness:.15}));
    clockFace.position.set(0,1.38,.38);
    clock.add(clockFace);
    const handMat=new THREE.LineBasicMaterial({color:0x171815});
    const hands=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0,1.38,.405),new THREE.Vector3(0,1.7,.405),
      new THREE.Vector3(0,1.38,.407),new THREE.Vector3(.25,1.28,.407)
    ]),handMat);
    clock.add(hands);
    this.clockPendulum=new THREE.Group();
    this.clockPendulum.position.set(0,-.48,.39);
    const rod=new THREE.Mesh(new THREE.BoxGeometry(.035,1.15,.025),this.material(0x70634a,.35,.6));
    rod.position.y=-.5;
    const bob=new THREE.Mesh(new THREE.CircleGeometry(.2,14),this.material(0x76684c,.35,.65));
    bob.position.set(0,-1.06,.01);
    this.clockPendulum.add(rod,bob);
    clock.add(this.clockPendulum);
  };

  GhostLensRenderer.prototype.makeLights = function () {
    const moon = this.moonLight = new THREE.DirectionalLight(0x9cc6d4,1.35);
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

  GhostLensRenderer.prototype.makeCanvasTexture = function (width, height, painter) {
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');
    painter(context,width,height);
    const texture=new THREE.CanvasTexture(canvas);
    texture.encoding=THREE.sRGBEncoding;
    texture.minFilter=THREE.LinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=false;
    return texture;
  };

  GhostLensRenderer.prototype.createArtTextures = function () {
    const self=this;
    let seed=0x6d2b79f5;
    function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
    function clear(ctx,w,h){ctx.clearRect(0,0,w,h);}
    const drifterFace=self.makeCanvasTexture(256,320,function(ctx,w,h){
      clear(ctx,w,h);
      const skin=ctx.createRadialGradient(w*.45,h*.4,8,w*.5,h*.45,w*.48);
      skin.addColorStop(0,'rgba(215,221,213,.93)');
      skin.addColorStop(.58,'rgba(164,174,169,.75)');
      skin.addColorStop(1,'rgba(70,82,81,0)');
      ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(w*.5,h*.49,w*.4,h*.47,0,0,Math.PI*2);ctx.fill();
      for(let i=0;i<28;i++){
        ctx.fillStyle='rgba(45,52,50,'+(.025+random()*.08)+')';
        ctx.beginPath();ctx.ellipse(random()*w,random()*h,5+random()*30,3+random()*18,random()*2,0,Math.PI*2);ctx.fill();
      }
      function socket(x,y,rx,ry){
        const g=ctx.createRadialGradient(x,y,1,x,y,rx);
        g.addColorStop(0,'rgba(0,3,4,.96)');g.addColorStop(.42,'rgba(20,29,30,.84)');g.addColorStop(1,'rgba(65,75,72,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx,ry,.12,0,Math.PI*2);ctx.fill();
      }
      socket(w*.35,h*.39,w*.14,h*.13);socket(w*.64,h*.375,w*.11,h*.155);
      const mouth=ctx.createRadialGradient(w*.51,h*.66,2,w*.51,h*.66,w*.12);
      mouth.addColorStop(0,'rgba(0,2,3,.98)');mouth.addColorStop(.55,'rgba(13,18,18,.88)');mouth.addColorStop(1,'rgba(70,75,70,0)');
      ctx.fillStyle=mouth;ctx.beginPath();ctx.ellipse(w*.51,h*.67,w*.085,h*.19,-.04,0,Math.PI*2);ctx.fill();
    });
    const soot=self.makeCanvasTexture(256,256,function(ctx,w,h){
      ctx.fillStyle='#090a0a';ctx.fillRect(0,0,w,h);
      for(let i=0;i<1100;i++){const c=5+Math.floor(random()*24);ctx.fillStyle='rgba('+c+','+c+','+c+','+(.04+random()*.15)+')';ctx.fillRect(random()*w,random()*h,1+random()*3,1+random()*3);}
      ctx.strokeStyle='rgba(88,102,104,.22)';ctx.lineWidth=1;
      for(let i=0;i<18;i++){let x=random()*w,y=random()*h;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=(random()-.5)*30;y+=8+random()*22;ctx.lineTo(x,y);}ctx.stroke();}
    });
    soot.wrapS=soot.wrapT=THREE.RepeatWrapping;
    const crawlerFace=self.makeCanvasTexture(256,300,function(ctx,w,h){
      clear(ctx,w,h);
      const mask=ctx.createRadialGradient(w*.47,h*.45,4,w*.5,h*.48,w*.47);
      mask.addColorStop(0,'rgba(225,223,208,.98)');mask.addColorStop(.7,'rgba(165,169,162,.94)');mask.addColorStop(1,'rgba(49,55,55,0)');
      ctx.fillStyle=mask;ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*.38,h*.47,.04,0,Math.PI*2);ctx.fill();
      function bleedingEye(x,y){
        const g=ctx.createRadialGradient(x,y,1,x,y,30);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.18,'rgba(0,0,0,.9)');g.addColorStop(1,'rgba(20,20,18,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,30,22,random()-.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#020202';ctx.beginPath();ctx.arc(x,y,5.5,0,Math.PI*2);ctx.fill();
      }
      bleedingEye(w*.37,h*.4);bleedingEye(w*.65,h*.44);
      ctx.strokeStyle='rgba(16,5,4,.96)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(w*.26,h*.68);ctx.quadraticCurveTo(w*.5,h*.62,w*.76,h*.72);ctx.stroke();
      ctx.strokeStyle='rgba(0,0,0,.48)';ctx.lineWidth=2;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(w*(.27+i*.08),h*(.67+random()*.04));ctx.lineTo(w*(.29+i*.08),h*(.72+random()*.05));ctx.stroke();}
    });
    function paintDollFace(blink){
      return self.makeCanvasTexture(256,280,function(ctx,w,h){
        clear(ctx,w,h);
        const porcelain=ctx.createRadialGradient(w*.42,h*.38,4,w*.5,h*.5,w*.48);
        porcelain.addColorStop(0,'rgba(255,247,225,1)');porcelain.addColorStop(.72,'rgba(226,211,184,.98)');porcelain.addColorStop(1,'rgba(132,116,101,0)');
        ctx.fillStyle=porcelain;ctx.beginPath();ctx.ellipse(w*.5,h*.51,w*.39,h*.46,0,0,Math.PI*2);ctx.fill();
        const blush=ctx.createRadialGradient(w*.27,h*.59,1,w*.27,h*.59,31);blush.addColorStop(0,'rgba(164,53,57,.26)');blush.addColorStop(1,'rgba(164,53,57,0)');
        ctx.fillStyle=blush;ctx.beginPath();ctx.arc(w*.27,h*.59,31,0,Math.PI*2);ctx.fill();
        const blush2=ctx.createRadialGradient(w*.73,h*.59,1,w*.73,h*.59,31);blush2.addColorStop(0,'rgba(164,53,57,.26)');blush2.addColorStop(1,'rgba(164,53,57,0)');
        ctx.fillStyle=blush2;ctx.beginPath();ctx.arc(w*.73,h*.59,31,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#120e0e';ctx.lineCap='round';ctx.lineWidth=blink?6:12;
        [w*.36,w*.65].forEach(function(x){ctx.beginPath();ctx.arc(x,h*.45,blink?22:25,.16*Math.PI,.84*Math.PI);ctx.stroke();});
        ctx.fillStyle='#8c242b';ctx.beginPath();ctx.ellipse(w*.51,h*.69,12,6,.08,0,Math.PI*2);ctx.fill();
      });
    }
    const hair=self.makeCanvasTexture(128,256,function(ctx,w,h){
      ctx.fillStyle='#080708';ctx.fillRect(0,0,w,h);
      for(let i=0;i<90;i++){const x=random()*w;ctx.strokeStyle='rgba(90,83,81,'+(.04+random()*.13)+')';ctx.lineWidth=.5+random();ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+(random()-.5)*14,h*.35,x+(random()-.5)*18,h*.7,x+(random()-.5)*10,h);ctx.stroke();}
    });
    hair.wrapS=THREE.RepeatWrapping;
    const kimono=self.makeCanvasTexture(256,256,function(ctx,w,h){
      ctx.fillStyle='#31080d';ctx.fillRect(0,0,w,h);
      for(let row=-1;row<7;row++)for(let col=-1;col<7;col++){
        const x=col*48+(row%2)*24,y=row*48;
        ctx.fillStyle=(row+col)%2?'#17090c':'#68131c';
        ctx.beginPath();ctx.moveTo(x+24,y);ctx.lineTo(x+44,y+24);ctx.lineTo(x+24,y+48);ctx.lineTo(x+30,y+24);ctx.closePath();ctx.fill();
        ctx.beginPath();ctx.moveTo(x+20,y);ctx.lineTo(x,y+24);ctx.lineTo(x+20,y+48);ctx.lineTo(x+14,y+24);ctx.closePath();ctx.fill();
      }
      ctx.strokeStyle='rgba(210,157,118,.2)';ctx.lineWidth=1;for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(0,i*20);ctx.lineTo(w,i*20-60);ctx.stroke();}
    });
    kimono.wrapS=kimono.wrapT=THREE.RepeatWrapping;kimono.repeat.set(1.4,1.4);
    const mirrorWoman=self.makeCanvasTexture(256,512,function(ctx,w,h){
      clear(ctx,w,h);
      const dress=ctx.createLinearGradient(0,h*.37,0,h);
      dress.addColorStop(0,'rgba(22,22,24,.97)');dress.addColorStop(.7,'rgba(6,7,9,.95)');dress.addColorStop(1,'rgba(6,7,9,0)');
      ctx.fillStyle=dress;
      ctx.beginPath();ctx.moveTo(w*.37,h*.37);
      ctx.quadraticCurveTo(w*.2,h*.52,w*.17,h*.97);
      ctx.lineTo(w*.83,h*.97);
      ctx.quadraticCurveTo(w*.8,h*.52,w*.63,h*.37);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(214,211,196,.97)';
      ctx.beginPath();ctx.ellipse(w*.5,h*.245,w*.135,h*.115,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(70,45,45,.85)';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(w*.455,h*.297);ctx.quadraticCurveTo(w*.5,h*.305,w*.545,h*.297);ctx.stroke();
      ctx.fillStyle='rgba(6,6,8,.99)';
      ctx.beginPath();ctx.ellipse(w*.5,h*.19,w*.245,h*.145,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(w*.26,h*.2);
      ctx.quadraticCurveTo(w*.38,h*.295,w*.46,h*.252);
      ctx.quadraticCurveTo(w*.5,h*.272,w*.54,h*.252);
      ctx.quadraticCurveTo(w*.62,h*.295,w*.74,h*.2);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(w*.27,h*.16);ctx.quadraticCurveTo(w*.18,h*.4,w*.24,h*.74);ctx.quadraticCurveTo(w*.32,h*.66,w*.34,h*.4);ctx.quadraticCurveTo(w*.33,h*.24,w*.3,h*.17);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(w*.73,h*.16);ctx.quadraticCurveTo(w*.82,h*.4,w*.76,h*.74);ctx.quadraticCurveTo(w*.68,h*.66,w*.66,h*.4);ctx.quadraticCurveTo(w*.67,h*.24,w*.7,h*.17);ctx.closePath();ctx.fill();
      for(let i=0;i<26;i++){
        ctx.strokeStyle='rgba(80,86,90,'+(.05+random()*.09)+')';ctx.lineWidth=.8+random();
        const x0=w*(.27+random()*.46);
        ctx.beginPath();ctx.moveTo(x0,h*(.09+random()*.06));
        ctx.bezierCurveTo(x0+(random()-.5)*12,h*.3,x0+(random()-.5)*20,h*.5,x0+(random()-.5)*26,h*(.62+random()*.12));
        ctx.stroke();
      }
    });
    const mirrorFog=self.makeCanvasTexture(256,256,function(ctx,w,h){
      ctx.fillStyle='rgb(91,107,105)';ctx.fillRect(0,0,w,h);
      for(let i=0;i<26;i++){const g=ctx.createRadialGradient(random()*w,random()*h,1,random()*w,random()*h,25+random()*70);g.addColorStop(0,'rgba(218,226,220,.1)');g.addColorStop(1,'rgba(220,230,224,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
      ctx.strokeStyle='rgba(225,232,226,.14)';ctx.lineWidth=5;ctx.lineCap='round';
      for(let finger=0;finger<4;finger++){ctx.beginPath();ctx.arc(w*(.7+finger*.045),h*.43,20+finger*5,Math.PI*.7,Math.PI*1.35);ctx.stroke();}
    });
    const handprint=self.makeCanvasTexture(128,160,function(ctx,w,h){
      clear(ctx,w,h);ctx.fillStyle='rgba(0,0,0,.92)';
      ctx.beginPath();ctx.ellipse(w*.5,h*.68,w*.25,h*.24,-.08,0,Math.PI*2);ctx.fill();
      const xs=[.29,.4,.51,.62,.73],lens=[.42,.31,.25,.29,.4];
      for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(w*xs[i],h*lens[i],w*.06,h*(.18-i%2*.025),0,0,Math.PI*2);ctx.fill();}
    });
    return {
      drifterFace:drifterFace,
      soot:soot,
      crawlerFace:crawlerFace,
      dollFaceOpen:paintDollFace(false),
      dollFaceBlink:paintDollFace(true),
      hair:hair,
      kimono:kimono,
      mirrorWoman:mirrorWoman,
      mirrorFog:mirrorFog,
      handprint:handprint
    };
  };

  GhostLensRenderer.prototype.makeFresnelMaterial = function (baseColor, rimColor, texture, alpha) {
    return new THREE.ShaderMaterial({
      uniforms:{
        uBase:{value:new THREE.Color(baseColor)},
        uRim:{value:new THREE.Color(rimColor)},
        uMap:{value:texture||this.artTextures.soot},
        uUseMap:{value:texture?1:0},
        uReveal:{value:.1},
        uAlpha:{value:alpha == null ? .82 : alpha}
      },
      vertexShader:[
        'varying vec2 vUv; varying vec3 vNormalV; varying vec3 vView;',
        'void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0);',
        'vNormalV=normalize(normalMatrix*normal); vView=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}'
      ].join(''),
      fragmentShader:[
        'uniform vec3 uBase; uniform vec3 uRim; uniform sampler2D uMap;',
        'uniform float uUseMap; uniform float uReveal; uniform float uAlpha;',
        'varying vec2 vUv; varying vec3 vNormalV; varying vec3 vView;',
        'void main(){vec3 tex=texture2D(uMap,vUv).rgb; vec3 body=mix(uBase,uBase*tex*1.7,uUseMap);',
        'float fres=pow(1.0-abs(dot(normalize(vNormalV),normalize(vView))),3.2);',
        'float back=clamp(.35+dot(normalize(vNormalV),normalize(vec3(-.2,.5,-.8))),0.0,1.0);',
        'vec3 color=body+uRim*fres*(.22+.78*back); float a=(.18+.82*uReveal)*uAlpha+fres*.16;',
        'gl_FragColor=vec4(color,a);}'
      ].join(''),
      transparent:true,
      depthWrite:false,
      side:THREE.DoubleSide
    });
  };

  GhostLensRenderer.prototype.makeVeilMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uReveal:{value:.1}},
      vertexShader:[
        'uniform float uTime; varying vec2 vUv; varying vec3 vNormalV; varying vec3 vView;',
        'void main(){vUv=uv; vec3 p=position; float hem=pow(1.0-uv.y,1.55);',
        'float wave=sin(uTime*1.7+p.y*4.1+p.z*2.4)+.55*sin(uTime*2.3+p.y*7.3-p.x*3.2);',
        'p.x+=wave*.075*(.22+hem); p.z+=sin(uTime*1.3+p.y*5.4+p.x*4.0)*.055*(.2+hem);',
        'vec4 mv=modelViewMatrix*vec4(p,1.0);vNormalV=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}'
      ].join(''),
      fragmentShader:[
        'uniform float uTime;uniform float uReveal;varying vec2 vUv;varying vec3 vNormalV;varying vec3 vView;',
        'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
        'void main(){float fres=pow(1.0-abs(dot(normalize(vNormalV),normalize(vView))),2.2);',
        'float stain=.72+.22*sin(vUv.y*31.0+sin(vUv.x*17.0));float torn=smoothstep(.03,.2,vUv.y+hash(floor(vUv*vec2(18.0,8.0)))*.17);',
        'float holes=smoothstep(.16,.42,hash(floor(vUv*vec2(14.0,22.0))));',
        'float alpha=torn*(.055+uReveal*.16+fres*(.25+uReveal*.38))*mix(.3,1.0,holes);',
        'vec3 cloth=mix(vec3(.18,.23,.23),vec3(.65,.78,.77),fres)*stain;',
        'gl_FragColor=vec4(cloth,alpha);}'
      ].join(''),
      transparent:true,
      depthWrite:false,
      side:THREE.DoubleSide,
      blending:THREE.NormalBlending
    });
  };

  GhostLensRenderer.prototype.addCrawlerBone = function (parent, from, to, radius, material, bones) {
    const direction=new THREE.Vector3().subVectors(to,from);
    const geometry=new THREE.CylinderGeometry(radius*.72,radius,direction.length(),7,1);
    const bone=new THREE.Mesh(geometry,material);
    bone.position.copy(new THREE.Vector3().addVectors(from,to).multiplyScalar(.5));
    bone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    bone.userData.baseQuaternion=bone.quaternion.clone();
    bone.userData.jitterIndex=bones.length;
    parent.add(bone);bones.push(bone);
    return bone;
  };

  GhostLensRenderer.prototype.makeGoldParticles = function () {
    const count=210;
    const targets=new Float32Array(count*3);
    const scatter=new Float32Array(count*3);
    let seed=0x9e3779b9;
    function rnd(){seed=(seed*1103515245+12345)>>>0;return seed/4294967296;}
    for(let i=0;i<count;i++){
      let x,y,z;
      const part=rnd();
      if(part<.16){
        const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*.22;
        x=Math.cos(a)*r;y=.72+Math.sin(a)*r;z=(rnd()-.5)*.18;
      }else if(part<.64){
        y=.52-rnd()*1.02;const taper=.18+.16*(y+.5);x=(rnd()-.5)*2*taper;z=(rnd()-.5)*.22;
      }else if(part<.82){
        const side=rnd()<.5?-1:1;y=.32-rnd()*.68;x=side*(.2+rnd()*.32);z=(rnd()-.5)*.16;
      }else{
        const side=rnd()<.5?-1:1;y=-.5-rnd()*.55;x=side*(.06+rnd()*.18);z=(rnd()-.5)*.15;
      }
      targets[i*3]=x;targets[i*3+1]=y;targets[i*3+2]=z;
      scatter[i*3]=(rnd()-.5)*2.3;scatter[i*3+1]=(rnd()-.5)*2.5;scatter[i*3+2]=(rnd()-.5)*2.1;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(targets,3));
    geometry.setAttribute('aScatter',new THREE.BufferAttribute(scatter,3));
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uReveal:{value:.1},uGather:{value:.8}},
      vertexShader:[
        'uniform float uTime;uniform float uGather;attribute vec3 aScatter;varying float vGlow;',
        'void main(){float breathe=.5+.5*sin(uTime*4.0+position.y*8.0);',
        'vec3 turbulence=aScatter+vec3(sin(uTime*1.7+aScatter.y*4.0),cos(uTime*1.3+aScatter.x*3.0),sin(uTime*1.9+aScatter.z*5.0))*.18;',
        'vec3 p=mix(turbulence,position,clamp(uGather+.1*sin(uTime*2.1+aScatter.x*5.0),0.0,1.0));',
        'vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;',
        'gl_PointSize=(2.5+breathe*1.8)*(38.0/max(1.0,-mv.z));vGlow=breathe;}'
      ].join(''),
      fragmentShader:[
        'uniform float uReveal;varying float vGlow;',
        'void main(){vec2 p=gl_PointCoord-.5;float d=dot(p,p);if(d>.25)discard;',
        'float a=smoothstep(.25,.02,d)*(.14+.45*uReveal);vec3 c=mix(vec3(.55,.28,.03),vec3(.95,.78,.28),vGlow);gl_FragColor=vec4(c,a);}'
      ].join(''),
      transparent:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    });
    return new THREE.Points(geometry,material);
  };

  GhostLensRenderer.prototype.createGhostMesh = function (ghost) {
    const group=new THREE.Group();
    group.userData.type=ghost.type;
    group.userData.materials=[];
    group.userData.shaderMaterials=[];
    if(ghost.type==='drifter'){
      const veilMat=this.makeVeilMaterial();
      const veil=new THREE.Mesh(new THREE.CylinderGeometry(.42,.6,1.62,18,22,true),veilMat);
      veil.position.y=-.2;
      const hood=new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),this.makeFresnelMaterial(0x283334,0x9ec9cb,null,.38));
      hood.position.y=.7;hood.scale.set(.92,1.08,.82);
      const faceMat=new THREE.MeshBasicMaterial({map:this.artTextures.drifterFace,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide});
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.43,.54),faceMat);
      face.position.set(0,.69,-.286);
      face.renderOrder=3;
      const shardPositions=new Float32Array([-0.54,.62,.04,.48,.25,-.08,-.4,-.22,.08,.35,-.62,.03]);
      const shardGeo=new THREE.BufferGeometry();shardGeo.setAttribute('position',new THREE.BufferAttribute(shardPositions,3));
      const shards=new THREE.Points(shardGeo,new THREE.PointsMaterial({color:0xbfe9e4,size:.075,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
      group.add(veil,hood,face,shards);
      group.userData.materials=[faceMat,shards.material];
      group.userData.shaderMaterials=[veilMat,hood.material];
      group.userData.soulShards=shards;
      group.userData.proportions={head:.43,torso:1.36,width:1.2,height:2.08};
    }else if(ghost.type==='crawler'){
      const bodyMat=this.makeFresnelMaterial(0x050606,0x6f929d,this.artTextures.soot,.92);
      const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.64,5,8),bodyMat);
      torso.rotation.x=Math.PI/2;torso.scale.set(1,.82,1);torso.position.z=.05;
      const pelvis=new THREE.Mesh(new THREE.BoxGeometry(.38,.22,.3),bodyMat);pelvis.position.z=.52;
      const bones=[];
      const joints=[
        [new THREE.Vector3(-.18,.05,-.22),new THREE.Vector3(-.21,.57,-.08),.07],
        [new THREE.Vector3(-.21,.57,-.08),new THREE.Vector3(-.25,-.61,-.48),.055],
        [new THREE.Vector3(.18,.05,-.22),new THREE.Vector3(.21,.57,-.08),.07],
        [new THREE.Vector3(.21,.57,-.08),new THREE.Vector3(.25,-.61,-.48),.055],
        [new THREE.Vector3(-.15,.04,.47),new THREE.Vector3(-.21,.54,.69),.078],
        [new THREE.Vector3(-.21,.54,.69),new THREE.Vector3(-.26,-.61,.92),.06],
        [new THREE.Vector3(.15,.04,.47),new THREE.Vector3(.21,.54,.69),.078],
        [new THREE.Vector3(.21,.54,.69),new THREE.Vector3(.26,-.61,.92),.06]
      ];
      for(let b=0;b<joints.length;b++)this.addCrawlerBone(group,joints[b][0],joints[b][1],joints[b][2],bodyMat,bones);
      const headPivot=new THREE.Group();headPivot.position.set(0,-.17,-.43);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.24,14,10),bodyMat);head.scale.set(.82,1.08,.7);
      const faceMat=new THREE.MeshBasicMaterial({map:this.artTextures.crawlerFace,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.32,.39),faceMat);face.position.set(0,-.01,-.205);
      face.renderOrder=3;
      headPivot.add(head,face);headPivot.rotation.z=.24;
      group.add(torso,pelvis,headPivot);
      group.userData.headPivot=headPivot;group.userData.bones=bones;
      group.userData.materials=[faceMat];group.userData.shaderMaterials=[bodyMat];
      group.userData.proportions={head:.39,torso:1.08,width:.62,height:1.32};
    }else if(ghost.type==='doll'){
      const kimonoMat=new THREE.MeshStandardMaterial({color:0x6b1b22,map:this.artTextures.kimono,emissive:0x230306,emissiveIntensity:.14,roughness:1,transparent:true,opacity:.45,depthWrite:false});
      const hairMat=new THREE.MeshBasicMaterial({color:0x161214,map:this.artTextures.hair,transparent:true,opacity:.78,depthWrite:false,side:THREE.DoubleSide});
      const body=new THREE.Mesh(new THREE.BoxGeometry(.31,.36,.22),kimonoMat);body.position.y=-.04;
      const sleeves=new THREE.Mesh(new THREE.BoxGeometry(.48,.3,.2),kimonoMat.clone());sleeves.position.y=-.05;
      const knees=new THREE.Mesh(new THREE.BoxGeometry(.42,.16,.36),kimonoMat.clone());knees.position.set(0,-.29,.06);
      const headPivot=new THREE.Group();headPivot.position.y=.25;
      const headBase=new THREE.Mesh(new THREE.SphereGeometry(.17,14,10),new THREE.MeshBasicMaterial({color:0xd8cdb8,transparent:true,opacity:.72,depthWrite:false}));
      headBase.scale.set(.94,1,.85);
      const faceMat=new THREE.MeshBasicMaterial({map:this.artTextures.dollFaceOpen,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide});
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.25,.28),faceMat);face.position.set(0,-.005,-.151);
      face.renderOrder=3;
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.177,14,9,0,Math.PI*2,0,Math.PI*.58),hairMat);cap.position.y=.015;
      const hairL=new THREE.Mesh(new THREE.PlaneGeometry(.105,.29),hairMat.clone());hairL.position.set(-.125,-.045,-.02);hairL.rotation.y=.28;
      const hairR=new THREE.Mesh(new THREE.PlaneGeometry(.105,.29),hairMat.clone());hairR.position.set(.125,-.045,-.02);hairR.rotation.y=-.28;
      headPivot.add(headBase,face,cap,hairL,hairR);
      group.add(body,sleeves,knees,headPivot);
      group.userData.headPivot=headPivot;group.userData.faceMaterial=faceMat;group.userData.lastDollMoveCount=ghost.dollMoveCount||0;
      group.userData.materials=[kimonoMat,sleeves.material,knees.material,hairMat,hairL.material,hairR.material,faceMat,headBase.material];
      group.userData.proportions={head:.28,torso:.78,width:.48,height:.92};
    }else if(ghost.type==='mirror'){
      const ladyMat=new THREE.MeshBasicMaterial({map:this.artTextures.mirrorWoman,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});
      const lady=new THREE.Mesh(new THREE.PlaneGeometry(1.02,2.05),ladyMat);
      lady.position.z=.025;
      group.add(lady);
      group.userData.materials=[ladyMat];group.userData.mirrorClipRadius=1;
      group.userData.proportions={head:.36,torso:1.12,width:.82,height:1.68};
    }else{
      const points=this.makeGoldParticles();
      const coreMat=this.makeFresnelMaterial(0x9b5a08,0xffdc68,null,.7);
      coreMat.blending=THREE.AdditiveBlending;
      const core=new THREE.Mesh(new THREE.CapsuleGeometry(.21,.85,6,10),coreMat);
      core.scale.set(.5,1,.34);core.position.y=-.08;
      const head=new THREE.Mesh(new THREE.SphereGeometry(.15,12,9),coreMat);head.position.y=.72;
      group.add(points,core,head);
      group.userData.goldParticles=points;
      group.userData.shaderMaterials=[points.material,coreMat];
      group.userData.proportions={head:.44,torso:1.2,width:.66,height:1.86};
    }
    group.visible=true;
    this.ghostGroup.add(group);
    this.ghostMeshes[ghost.id]=group;
    return group;
  };

  GhostLensRenderer.prototype.dropCrawlerHandprint = function (mesh, ghost) {
    if(this.handprints.length>=8){
      const oldest=this.handprints.shift();
      this.effectGroup.remove(oldest);
      oldest.geometry.dispose();oldest.material.dispose();
    }
    const material=new THREE.MeshBasicMaterial({
      map:this.artTextures.handprint,
      color:0x050606,
      transparent:true,
      opacity:.44,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-1
    });
    const print=new THREE.Mesh(new THREE.PlaneGeometry(.34,.46),material);
    print.rotation.x=-Math.PI/2;
    print.rotation.z=(ghost.id*.73+ghost.jerkFrame*.91)%Math.PI*2;
    const side=ghost.jerkFrame%2?-.34:.34;
    const local=new THREE.Vector3(side,0,.05).applyAxisAngle(new THREE.Vector3(0,1,0),mesh.rotation.y);
    print.position.set(mesh.position.x+local.x,-2.525,mesh.position.z+local.z);
    print.userData.born=this.time;
    this.effectGroup.add(print);this.handprints.push(print);
  };

  GhostLensRenderer.prototype.updateHandprints = function () {
    for(let i=this.handprints.length-1;i>=0;i--){
      const print=this.handprints[i];
      const age=this.time-print.userData.born;
      print.material.opacity=.42*clamp(1-age/2.6,0,1);
      if(age>=2.6){
        this.effectGroup.remove(print);print.geometry.dispose();print.material.dispose();
        this.handprints.splice(i,1);
      }
    }
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
      let targetScale=(ghost.type==='doll'?1.55:ghost.type==='mirror'?1:(ghost.type==='crawler'?1:pulse)*(1+rawReveal*.2))*banishScale;
      if(ghost.type==='mirror'){
        const lifeProgress=clamp(1-ghost.remainingMs/Math.max(1,ghost.lifetimeMs),0,1);
        targetScale=(.95+lifeProgress*.3)*banishScale;
      }
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
        if(ghost.type==='doll')mesh.position.y+=(targetScale-1)*.37;
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
      }else mesh.rotation.y=Math.PI-yaw+(ghost.type==='crawler'?.5:0);
      const opacity=ghost.type==='doll'?.3+reveal*.62:ghost.type==='mirror'?.02+reveal*.82:.025+reveal*.75;
      mesh.scale.setScalar(targetScale);
      const mats=mesh.userData.materials||[];
      for(let m=0;m<mats.length;m++){
        if(mats[m].opacity!=null)mats[m].opacity=mats[m].userData.rim?(ghost.type==='crawler'?(.012+reveal*.05):(.08+reveal*.22)):opacity*(mats[m].blending===THREE.AdditiveBlending?1:.92);
        if(mats[m].emissiveIntensity!=null){
          mats[m].emissiveIntensity=ghost.type==='crawler'?(.045+reveal*.075):ghost.type==='doll'?(.1+reveal*.22):ghost.type==='mirror'?(.08+reveal*.2):(.35+reveal*.85);
        }
      }
      const shaderMats=mesh.userData.shaderMaterials||[];
      for(let sm=0;sm<shaderMats.length;sm++){
        const uniforms=shaderMats[sm].uniforms||{};
        if(uniforms.uTime)uniforms.uTime.value=this.time;
        if(uniforms.uReveal)uniforms.uReveal.value=reveal;
      }
      if(mesh.userData.soulShards){
        mesh.userData.soulShards.rotation.y=this.time*.34+ghost.id;
        mesh.userData.soulShards.rotation.z=Math.sin(this.time*.8+ghost.id)*.18;
      }
      if(ghost.type==='crawler'){
        const frame=ghost.jerkFrame%5;
        const offsets=[0,.045,-.018,.072,.012];
        mesh.position.y+=offsets[frame];
        mesh.rotation.z=(frame===1?-.035:frame===3?.045:0);
        if(mesh.userData.lastJerkFrame!==ghost.jerkFrame){
          mesh.userData.lastJerkFrame=ghost.jerkFrame;
          const bones=mesh.userData.bones||[];
          for(let b=0;b<bones.length;b++){
            const hash=Math.sin((ghost.jerkFrame+1)*91.731+(ghost.id+3)*17.17+b*53.41)*43758.5453;
            const jitter=(hash-Math.floor(hash)-.5)*.18;
            const twist=Math.sin(hash*8.13)*.07;
            bones[b].quaternion.copy(bones[b].userData.baseQuaternion);
            bones[b].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(jitter,twist,-jitter*.55)));
          }
          if(ghost.jerkFrame>0)this.dropCrawlerHandprint(mesh,ghost);
        }
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
        if(mesh.userData.lastDollMoveCount!==ghost.dollMoveCount){
          mesh.userData.lastDollMoveCount=ghost.dollMoveCount;
          mesh.userData.blinkUntil=this.time+.18;
        }
        if(mesh.userData.faceMaterial){
          mesh.userData.faceMaterial.map=this.time<(mesh.userData.blinkUntil||0)?this.artTextures.dollFaceBlink:this.artTextures.dollFaceOpen;
        }
      }
      if(ghost.type==='gold'){
        mesh.rotation.z+=.018;
        if(mesh.userData.goldParticles){
          const goldUniforms=mesh.userData.goldParticles.material.uniforms;
          goldUniforms.uGather.value=ghost.state==='banishing'?clamp(ghost.banishRemainingMs/800,0,1):.8+Math.sin(this.time*2.1+ghost.id)*.12;
        }
      }
    }
    const ids=Object.keys(this.ghostMeshes);
    for(let j=0;j<ids.length;j++){
      if(!alive[ids[j]]){this.ghostGroup.remove(this.ghostMeshes[ids[j]]);delete this.ghostMeshes[ids[j]];}
    }
    this.updateHandprints();
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
    const dt=state.hitStop&&state.hitStop.active?0:clamp((Number(dtMs)||0)/1000,0,.1);
    this.time=state.animationMs==null?this.time+dt:state.animationMs/1000;
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
    const gust=Math.pow(Math.max(0,Math.sin(this.time*.27-1.1)),14);
    if(this.curtains)for(let i=0;i<this.curtains.length;i++){
      this.curtains[i].mesh.rotation.y=(i?-.12:.12)+Math.sin(this.time*.72+this.curtains[i].phase)*.035+(i?1:-1)*gust*.34;
      this.curtains[i].mesh.position.x=this.curtains[i].base+Math.sin(this.time*5.5+i)*gust*.18;
    }
    if(this.emberLight){
      const emberFlicker=.42+Math.sin(this.time*8.7)*.12+Math.sin(this.time*14.3+.8)*.08;
      this.emberLight.intensity=emberFlicker;
      this.embers.rotation.z=Math.sin(this.time*3.2)*.025;
      for(let e=0;e<this.embers.children.length;e++)this.embers.children[e].material.opacity=.48+.28*Math.abs(Math.sin(this.time*(4.2+e*.17)+e));
    }
    if(this.moonLight)this.moonLight.intensity=1.08+Math.sin(this.time*.11)*.2+Math.sin(this.time*.037+1.2)*.1;
    if(this.clockPendulum)this.clockPendulum.rotation.z=Math.sin(this.time*1.45)*.23;
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
    const danger=state.remainingMs<=10000&&state.mode==='play';
    const emfValue=danger?clamp(state.emf*.25+Math.abs(Math.sin(this.time*18.7))*1.02,0,1):state.emf;
    this.dom.emf.parentElement.style.setProperty('--emf',emfValue.toFixed(3));
    this.dom.shell.classList.toggle('danger',state.remainingMs<=10000&&state.mode==='play');
    this.dom.shell.classList.toggle('combo-hot',state.combo>=3&&state.mode==='play');
    this.dom.shell.classList.toggle('hitstop',!!(state.hitStop&&state.hitStop.active));
    this.dom.shell.classList.toggle('perfect-freeze',!!(state.hitStop&&state.hitStop.perfect));
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

  GhostLensRenderer.prototype.triggerLightning = function () {
    const shell=this.dom.shell;
    shell.classList.remove('lightning');
    void shell.offsetWidth;
    shell.classList.add('lightning');
    setTimeout(function(){shell.classList.remove('lightning');},360);
  };

  GhostLensRenderer.prototype.showPerfectStamp = function () {
    const stamp=this.dom.perfectStamp;
    stamp.className='perfect-stamp';
    void stamp.offsetWidth;
    stamp.classList.add('slam');
  };

  GhostLensRenderer.prototype.captureScreenPoint = function (ghostId) {
    const mesh=this.ghostMeshes[ghostId];
    if(!mesh)return{x:50,y:50};
    const point=mesh.position.clone().project(this.camera);
    return{
      x:clamp((point.x*.5+.5)*100,8,92),
      y:clamp((.5-point.y*.5)*100,12,82)
    };
  };

  GhostLensRenderer.prototype.showScorePop = function (data) {
    const point=this.captureScreenPoint(data.ghostId);
    const pop=document.createElement('div');
    pop.className='score-pop'+(data.type==='gold'||data.type==='mirror'?' rare':'');
    pop.style.setProperty('--pop-x',point.x.toFixed(2)+'%');
    pop.style.setProperty('--pop-y',point.y.toFixed(2)+'%');
    pop.innerHTML='+'+data.score+'<small>COMBO '+data.combo+' ×'+Number(data.comboMultiplier).toFixed(2)+'</small>';
    this.dom.scorePopLayer.appendChild(pop);
    const remove=function(){if(pop.parentNode)pop.parentNode.removeChild(pop);};
    pop.addEventListener('animationend',remove,{once:true});
    setTimeout(remove,1300);
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
    if(data.quality==='PERFECT'){
      ctx.save();
      ctx.translate(width*.5,height*.43);
      ctx.rotate(-12*DEG);
      ctx.globalAlpha=.78;
      ctx.strokeStyle='#a4161c';
      ctx.lineWidth=Math.max(3,width*.009);
      ctx.font='900 '+Math.max(28,Math.round(width*.105))+'px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      const stampWidth=ctx.measureText('PERFECT').width;
      ctx.strokeRect(-stampWidth*.56,-width*.07,stampWidth*1.12,width*.14);
      ctx.strokeText('PERFECT',0,0);
      ctx.restore();
    }
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

  GhostLensRenderer.prototype.updateProgression = function (progress) {
    if(!progress)return;
    this.dom.titleBest.textContent=progress.bestTitle.name;
    this.dom.dexMedal.classList.toggle('active',!!progress.complete);
  };

  GhostLensRenderer.prototype.showDex = function (progress) {
    if(!progress)return;
    this.dom.dexGrid.innerHTML='';
    this.dom.dexProgress.textContent=progress.discovered+' / '+progress.total;
    this.dom.dexSeal.classList.toggle('active',!!progress.complete);
    for(let i=0;i<progress.entries.length;i++){
      const entry=progress.entries[i];
      const article=document.createElement('article');
      article.className='dex-entry'+(entry.discovered?'':' locked');
      article.dataset.type=entry.type;
      const photo=document.createElement('div');
      photo.className='dex-photo';
      if(entry.discovered&&entry.bestPhoto){
        const image=document.createElement('img');
        image.src=entry.bestPhoto;
        image.alt=entry.name+'の最高得点写真';
        photo.appendChild(image);
      }
      const details=document.createElement('div');
      const heading=document.createElement('h3');
      heading.textContent=entry.discovered?entry.name:'？？？';
      const record=document.createElement('div');
      record.className='dex-record';
      record.innerHTML='<span>撮影 <b>'+entry.count+'</b> 回</span><span>最良 <b>'+(entry.bestQuality||'---')+'</b></span><span>写真 <b>+'+entry.bestScore+'</b></span>';
      const flavor=document.createElement('p');
      flavor.className='dex-flavor';
      flavor.textContent=entry.discovered?entry.flavor:'記録は黒く塗り潰されている。\\n撮影による照合を要す。';
      details.appendChild(heading);details.appendChild(record);details.appendChild(flavor);
      article.appendChild(photo);article.appendChild(details);
      this.dom.dexGrid.appendChild(article);
    }
    this.dom.dex.classList.remove('hidden');
  };

  GhostLensRenderer.prototype.hideDex = function () {
    this.dom.dex.classList.add('hidden');
  };

  GhostLensRenderer.prototype.showResult = function (state, meta) {
    this.resultRunId++;
    const runId=this.resultRunId;
    for(let t=0;t<this.resultTimers.length;t++)clearTimeout(this.resultTimers[t]);
    this.resultTimers=[];
    this.closePhoto();
    this.dom.resultScore.textContent='0';
    this.dom.resultScore.dataset.target=String(state.score);
    this.dom.resultCaptures.textContent=String(state.captures);
    this.dom.resultCombo.textContent=String(state.maxCombo);
    this.dom.resultBest.textContent=String(state.bestScore);
    this.dom.newRecord.classList.toggle('active',!!state.newRecord);
    this.dom.resultRank.textContent=meta&&meta.title?meta.title:'見習い霊能写真家';
    this.dom.promotion.classList.toggle('active',!!(meta&&meta.promoted));
    this.dom.album.innerHTML='';
    for(let i=0;i<state.photos.length;i++){
      const p=state.photos[i];
      const figure=document.createElement('figure');
      const tilt=(((p.id*37)%19)-9)*.72;
      figure.style.setProperty('--tilt',tilt.toFixed(2)+'deg');
      figure.style.setProperty('--delay',(i*150)+'ms');
      figure.tabIndex=0;
      if(p.dataUrl){const img=document.createElement('img');img.src=p.dataUrl;img.alt=p.quality+' '+p.type+'の心霊写真';figure.appendChild(img);}
      const caption=document.createElement('figcaption');
      caption.textContent=p.quality+' / '+p.type.toUpperCase()+' / +'+p.score;
      figure.appendChild(caption);
      const self=this;
      const toggle=function(){
        const opening=!figure.classList.contains('expanded');
        self.closePhoto();
        if(opening){
          figure.classList.add('expanded');
          const image=figure.querySelector('img');
          if(image){
            self.dom.lightboxImage.src=image.src;
            self.dom.lightboxImage.alt=image.alt;
            self.dom.lightboxCaption.textContent=caption.textContent;
            self.dom.lightbox.classList.add('open');
          }
        }
      };
      figure.addEventListener('click',toggle);
      figure.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
      this.dom.album.appendChild(figure);
    }
    this.dom.album.classList.remove('revealing');
    void this.dom.album.offsetWidth;
    this.dom.album.classList.add('revealing');
    this.dom.result.classList.remove('hidden');
    const countDelay=state.photos.length*150+520;
    this.resultTimers.push(setTimeout(function(){
      const started=performance.now();
      const duration=900;
      function count(now){
        if(runId!==this.resultRunId)return;
        const progress=clamp((now-started)/duration,0,1);
        const eased=1-Math.pow(1-progress,3);
        this.dom.resultScore.textContent=String(Math.round(state.score*eased));
        if(progress<1)requestAnimationFrame(count.bind(this));
      }
      requestAnimationFrame(count.bind(this));
    }.bind(this),countDelay));
  };

  GhostLensRenderer.prototype.closePhoto = function () {
    if(!this.dom||!this.dom.lightbox)return;
    this.dom.lightbox.classList.remove('open');
    this.dom.lightboxImage.removeAttribute('src');
    const expanded=this.dom.album?this.dom.album.querySelectorAll('figure.expanded'):[];
    for(let i=0;i<expanded.length;i++)expanded[i].classList.remove('expanded');
  };

  GhostLensRenderer.prototype.showLost = function () {
    const lost=this.dom.lost;
    lost.className='lost-indicator';
    void lost.offsetWidth;
    lost.classList.add('show');
  };

  GhostLensRenderer.prototype.showDryFire = function () {
    const panel=this.dom.filmPanel;
    panel.classList.remove('dry-fire');
    void panel.offsetWidth;
    panel.classList.add('dry-fire');
    setTimeout(function(){panel.classList.remove('dry-fire');},820);
  };

  GhostLensRenderer.prototype.handleEvent = function (type, data) {
    if(type==='capture'){
      this.flash(false);
      this.dom.shell.classList.add('shaking');
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},260);
      this.spawnBanishEffect(data.type,data.ghostId);
      this.showScorePop(data);
      if(data.quality==='PERFECT')this.showPerfectStamp();
      else this.showMessage(data.quality,data.type==='gold'?'gold':data.quality.toLowerCase());
      this.capturePhoto(data.photoId,data);
    }else if(type==='blur'){
      this.flash(true);this.showMessage('OUT OF FOCUS','');
    }else if(type==='reloadStart'){
      this.showMessage('DEVELOPING…','');
    }else if(type==='reloadComplete'){
      this.showMessage('FILM LOADED','');
    }else if(type==='dryFire'){
      if(data.reloading)this.showDryFire();
    }else if(type==='crawlerAttack'){
      this.dom.shell.classList.add('shaking');this.showMessage('SIGNAL HIJACKED','');
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},900);
    }else if(type==='jumpscare'){
      this.dom.shell.classList.add('shaking');
      this.triggerLightning();
      setTimeout(function(){document.getElementById('game-shell').classList.remove('shaking');},420);
    }else if(type==='clockChime'){
      this.showMessage('XII','');
    }else if(type==='expired'){
      this.showLost();
    }else if(type==='reset'||type==='start'){
      this.closePhoto();
      this.hideDex();
      this.dom.newRecord.classList.remove('active');
      this.dom.promotion.classList.remove('active');
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
      effects:this.effects.length,
      animationTimeMs:Math.round(this.time*1000),
      albumItems:this.dom.album.children.length,
      lightboxOpen:this.dom.lightbox.classList.contains('open'),
      dexItems:this.dom.dexGrid.children.length,
      dexOpen:!this.dom.dex.classList.contains('hidden')
    };
  };

  window.GhostLensRenderer=GhostLensRenderer;
})();
