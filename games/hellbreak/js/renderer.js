(function () {
  'use strict';
  function tex(draw, size) {
    const c = document.createElement('canvas'); c.width = c.height = size || 128;
    const g = c.getContext('2d'); draw(g, c);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t;
  }
  function mat(c) { return new THREE.MeshBasicMaterial({ color: c, fog: true }); }
  function HellbreakRenderer(canvas, weaponCanvas, faceCanvas) {
    this.canvas = canvas; this.weaponCanvas = weaponCanvas; this.faceCanvas = faceCanvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x250607, 4, 18);
    this.camera = new THREE.PerspectiveCamera(68, 400 / 250, 0.05, 40);
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x1d0608, 1);
    this.lowW = 400; this.lowH = 250;
    this.levelId = 0; this.meshes = {}; this.sprites = {};
    this.clock = 0; this.drawCalls = 0;
    this.makeTextures();
    this.resize();
  }
  HellbreakRenderer.prototype.resize = function () {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.lowW = coarse ? 320 : 400; this.lowH = coarse ? 200 : 250;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.lowW, this.lowH, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.weaponCanvas.width = this.lowW; this.weaponCanvas.height = this.lowH;
    this.camera.aspect = this.lowW / this.lowH; this.camera.updateProjectionMatrix();
  };
  HellbreakRenderer.prototype.makeTextures = function () {
    this.wallTex = {
      '#': tex(function (g) { g.fillStyle = '#4a3430'; g.fillRect(0,0,128,128); for (let y=0;y<128;y+=16){ for(let x=0;x<128;x+=32){ g.fillStyle=(x+y)%64?'#5b4039':'#382520'; g.fillRect(x+(y%32?16:0),y,30,14); } } g.strokeStyle='#1d1110'; for(let i=0;i<30;i++){ g.beginPath(); g.moveTo(Math.random()*128,Math.random()*128); g.lineTo(Math.random()*128,Math.random()*128); g.stroke(); } }),
      metal: tex(function (g) { g.fillStyle='#2b3034'; g.fillRect(0,0,128,128); for(let y=0;y<128;y+=24){ g.fillStyle='#4b555b'; g.fillRect(0,y,128,5); } for(let i=0;i<20;i++){ g.fillStyle='#101315'; g.fillRect((i*37)%128,(i*53)%128,4,4); } }),
      flesh: tex(function (g) { g.fillStyle='#5a1117'; g.fillRect(0,0,128,128); for(let i=0;i<38;i++){ g.strokeStyle=i%2?'#8b2028':'#2c080b'; g.lineWidth=3; g.beginPath(); const y=(i*17)%128; g.moveTo(0,y); for(let x=0;x<128;x+=16) g.lineTo(x,y+Math.sin((x+i)*.25)*9); g.stroke(); } })
    };
    this.floorTex = tex(function (g) { g.fillStyle='#241817'; g.fillRect(0,0,128,128); for(let i=0;i<220;i++){ g.fillStyle=i%3?'#33211e':'#140d0d'; g.fillRect(Math.random()*128,Math.random()*128,2,2); } });
    this.enemyTex = {};
    const self = this;
    ['grunt','imp','brute'].forEach(function (type) {
      ['walk0','walk1','attack','dead','pain'].forEach(function (pose) { self.enemyTex[type + pose] = tex(function (g,c) { drawEnemy(g,c,type,pose); }, 128); });
    });
    this.pickupTex = {};
    ['health','armor','bullet','shell','keyr','keyb','keyy','barrel','fireball','blood','fire'].forEach((k) => { this.pickupTex[k] = tex(function (g,c) { drawIcon(g,c,k); }, 96); });
  };
  HellbreakRenderer.prototype.clearLevel = function () {
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.meshes = { walls: [], doors: {}, floors: [], pickups: [], enemies: [], barrels: [], projectiles: [], particles: [], bodies: [] };
  };
  HellbreakRenderer.prototype.buildLevel = function (game) {
    this.clearLevel();
    const lv = game.level; this.levelId = lv.def.id;
    this.scene.fog.color.setHex(lv.def.id === 2 ? 0x1f1110 : 0x250607);
    this.renderer.setClearColor(lv.def.id === 3 ? 0x160406 : 0x240609, 1);
    const floorMat = new THREE.MeshBasicMaterial({ map: this.floorTex, color: 0x9a7560, fog: true });
    const ceilMat = mat(0x2b1012);
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    const wallGeo = new THREE.BoxGeometry(1, 1.6, 1);
    for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) {
      const ch = lv.cells[z][x]; if (ch === ' ') continue;
      const f = new THREE.Mesh(floorGeo, floorMat); f.rotation.x = -Math.PI / 2; f.position.set(x + .5, 0, z + .5); this.scene.add(f);
      const ce = new THREE.Mesh(floorGeo, ceilMat); ce.rotation.x = Math.PI / 2; ce.position.set(x + .5, 1.62, z + .5); this.scene.add(ce);
      if (ch === '#' || 'RBYD'.indexOf(ch) >= 0) {
        const key = (x + z) % 5 === 0 ? 'flesh' : (x + z) % 3 === 0 ? 'metal' : '#';
        const m = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ map: this.wallTex[key], color: ch === 'R' ? 0xc33228 : ch === 'B' ? 0x3156c8 : ch === 'Y' ? 0xc7ad28 : 0xffffff, fog: true }));
        m.position.set(x + .5, .8, z + .5); this.scene.add(m);
        if ('RBYD'.indexOf(ch) >= 0) this.meshes.doors[x + ',' + z] = m; else this.meshes.walls.push(m);
      }
    }
    this.buildSkyline(lv);
    this.syncDynamic(game);
  };
  HellbreakRenderer.prototype.buildSkyline = function (lv) {
    const geo = new THREE.PlaneGeometry(30, 5);
    const t = tex(function (g,c) {
      const gr = g.createLinearGradient(0,0,0,c.height); gr.addColorStop(0,'#050103'); gr.addColorStop(.45,'#6d0b0b'); gr.addColorStop(1,'#120405'); g.fillStyle=gr; g.fillRect(0,0,c.width,c.height);
      g.fillStyle='#080305'; for(let x=0;x<c.width;x+=18){ const h=30+Math.random()*45; g.fillRect(x,c.height-h,10+Math.random()*16,h); }
    }, 256);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, fog: false, depthWrite: false }));
    m.position.set(lv.w/2, 2.2, -3); this.scene.add(m);
  };
  HellbreakRenderer.prototype.makeSprite = function (texture, scale) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(scale, scale, 1); this.scene.add(s); return s;
  };
  HellbreakRenderer.prototype.syncDynamic = function (game) {
    const lv = game.level, st = game.getState();
    for (let k in this.meshes.doors) this.meshes.doors[k].visible = !lv.open[k];
    syncList(this, 'pickups', lv.pickups, function (r, it) {
      const key = it.type === 'key' ? 'key' + it.key : it.type;
      return r.makeSprite(r.pickupTex[key], .62);
    }, function (s, it, i, r) {
      const key = it.type === 'key' ? 'key' + it.key : it.type;
      if (s.userData.key !== key) { s.material.map = r.pickupTex[key]; s.material.needsUpdate = true; s.userData.key = key; }
      s.position.set(it.x, .46 + Math.sin(r.clock*3+i)*.07, it.z);
      const sc = it.type === 'key' ? .7 : .66;
      s.scale.set(sc + Math.sin(r.clock * 4 + i) * .025, sc, 1);
    });
    syncList(this, 'barrels', lv.barrels.filter(function (b) { return !b.dead; }), function (r) { return r.makeSprite(r.pickupTex.barrel, .92); }, function (s, b, i, r) { s.position.set(b.x, .58, b.z); s.scale.set(.92, .92 + Math.sin(r.clock * 2 + i) * .02, 1); });
    syncList(this, 'enemies', lv.enemies.filter(function (e) { return !e.dead; }), function (r) { return r.makeSprite(r.enemyTex.gruntwalk0, 1.16); }, function (s, e, i, r) {
      const pose = e.pain > 0 ? 'pain' : (e.cooldown > 600 ? 'attack' : (Math.floor(r.clock * 5 + i) % 2 ? 'walk1' : 'walk0'));
      const key = e.type + pose;
      if (s.userData.key !== key) { s.material.map = r.enemyTex[key]; s.material.needsUpdate = true; s.userData.key = key; }
      s.material.opacity = 1;
      const sc = e.type === 'brute' ? 1.68 : e.type === 'imp' ? 1.16 : 0.98;
      s.scale.set(sc, sc, 1); s.position.set(e.x, sc * .52, e.z);
    });
    syncList(this, 'bodies', game.deadBodies, function (r, b) { return r.makeSprite(r.enemyTex[b.type + 'dead'], 1.0); }, function (s, b) { const sc = b.type === 'brute' ? 1.55 : 1.0; s.scale.set(sc, sc*.55, 1); s.position.set(b.x, .25, b.z); });
    syncList(this, 'projectiles', game.projectiles, function (r) { return r.makeSprite(r.pickupTex.fireball, .5); }, function (s, p, i, r) { s.position.set(p.x, .58 + Math.sin(r.clock*12+i)*.04, p.z); s.scale.set(.5 + Math.sin(r.clock * 16) * .04, .5, 1); });
    syncList(this, 'particles', game.particles, function (r, p) { return r.makeSprite(r.pickupTex[p.fire ? 'fire' : 'blood'], .18); }, function (s, p) { s.position.set(p.x, .25 + p.life*.6, p.z); s.material.opacity = Math.max(0, p.life); });
    this.camera.position.set(st.position.x, .72 + Math.sin(this.clock * 10) * (Math.abs(game.input.mx)+Math.abs(game.input.mz))*0.01, st.position.z);
    this.camera.rotation.set(0, st.position.yaw + Math.PI, 0, 'YXZ');
  };
  HellbreakRenderer.prototype.render = function (game, dtMs) {
    this.clock += (dtMs || 16) / 1000;
    if (this.levelId !== game.level.def.id) this.buildLevel(game);
    this.syncDynamic(game);
    const st = game.getState(), sh = st.shake || 0;
    this.camera.rotation.z = Math.sin(this.clock * 50) * sh * .01;
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.drawWeapon(game);
    this.drawFace(st);
  };
  HellbreakRenderer.prototype.handleEvent = function () {};
  HellbreakRenderer.prototype.drawWeapon = function (game) {
    const c = this.weaponCanvas, g = c.getContext('2d'), w = c.width, h = c.height, st = game.getState();
    g.clearRect(0,0,w,h);
    g.imageSmoothingEnabled = false;
    const moving = Math.min(1, Math.abs(game.input.mx) + Math.abs(game.input.mz));
    const bob = Math.sin(this.clock * 12) * moving * 4;
    const sway = Math.sin(this.clock * 7) * moving * 3;
    const kick = st.weaponKick * 13;
    const cx = w/2, base = h - 6 + kick + bob;
    g.save(); g.translate(cx, base);
    drawHand(g, -48 + sway, -36, false);
    drawHand(g, 48 + sway, -36, true);
    if (st.weapon === 'pistol') {
      outlineRect(g, -16, -88, 32, 68, '#0b0b0c');
      g.fillStyle = '#6e7376'; g.fillRect(-12,-84,24,42);
      g.fillStyle = '#34373a'; g.fillRect(-16,-43,32,28);
      g.fillStyle = '#aeb4b7'; g.fillRect(-8,-92,16,10);
      g.fillStyle = '#1a1b1d'; g.fillRect(-6,-24,12,22);
    } else if (st.weapon === 'shotgun') {
      outlineRect(g, -56, -47, 112, 27, '#160c08');
      g.fillStyle = '#5a331d'; g.fillRect(-52,-43,104,19);
      g.fillStyle = '#221f1d'; g.fillRect(-26,-110,18,82); g.fillRect(8,-110,18,82);
      g.fillStyle = '#777b76'; g.fillRect(-29,-118,58,12);
      g.fillStyle = '#c7c0aa'; g.fillRect(-25,-115,50,4);
    } else {
      outlineRect(g, -62, -55, 124, 34, '#08090a');
      g.fillStyle = '#303337'; g.fillRect(-57,-50,114,24);
      g.fillStyle = '#151719'; g.fillRect(-47,-43,94,10);
      for(let i=-35;i<=35;i+=14){ g.fillStyle=i%28?'#8b8f8d':'#4b5052'; g.fillRect(i,-116,9,84); g.fillStyle='#161819'; g.fillRect(i+2,-112,5,77); }
      g.fillStyle='#b5b8b1'; g.fillRect(-43,-124,86,10);
      g.fillStyle='#6b2017'; g.fillRect(43,-46,18,12);
    }
    if (st.weaponKick > 0.15) {
      g.fillStyle = '#fff8a8'; g.beginPath(); g.moveTo(0,-140); g.lineTo(-33,-101); g.lineTo(-9,-111); g.lineTo(0,-96); g.lineTo(10,-112); g.lineTo(34,-101); g.closePath(); g.fill();
      g.fillStyle = '#ff6b1a'; g.beginPath(); g.moveTo(0,-130); g.lineTo(-18,-106); g.lineTo(0,-115); g.lineTo(20,-106); g.closePath(); g.fill();
    }
    g.restore();
  };
  HellbreakRenderer.prototype.drawFace = function (st) {
    const c = this.faceCanvas, g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0,0,w,h); g.fillStyle='#3a211d'; g.fillRect(0,0,w,h);
    const hurt = st.face === 'pain' || st.hp < 30;
    g.fillStyle = hurt ? '#b9826c' : '#c99367'; g.fillRect(22,8,52,48);
    g.fillStyle = '#2a120f'; g.fillRect(30,24,10,8); g.fillRect(56,24,10,8);
    if (st.face === 'grin') { g.fillStyle='#f4d8b8'; g.fillRect(36,45,24,7); }
    else { g.fillStyle='#180909'; g.fillRect(37,47,22,5); }
    if (hurt) { g.fillStyle='#8d0c0c'; g.fillRect(20,8,12,26); g.fillRect(64,34,10,22); }
    if (st.face === 'fire') { g.fillStyle='#f0d34d'; g.fillRect(28,22,14,5); g.fillRect(54,22,14,5); }
  };
  function syncList(r, name, data, make, update) {
    const arr = r.meshes[name];
    while (arr.length < data.length) arr.push(make(r, data[arr.length]));
    while (arr.length > data.length) r.scene.remove(arr.pop());
    for (let i = 0; i < data.length; i++) { arr[i].visible = true; update(arr[i], data[i], i, r); }
  }
  function outlineRect(g, x, y, w, h, color) {
    g.fillStyle = color || '#100608';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
  }
  function px(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function drawHand(g, x, y, flip) {
    px(g, x - 18, y - 4, 36, 32, '#120808');
    px(g, x - 15, y, 30, 25, '#b27354');
    px(g, x - 13, y + 4, 26, 9, '#d19167');
    px(g, x - 17, y + 19, 8, 18, '#6d382d');
    px(g, x + 9, y + 19, 8, 18, '#6d382d');
    if (flip) px(g, x - 20, y + 9, 8, 13, '#d19167');
    else px(g, x + 12, y + 9, 8, 13, '#d19167');
  }
  function drawEnemy(g,c,type,pose) {
    g.clearRect(0,0,c.width,c.height);
    g.imageSmoothingEnabled = false;
    px(g, 24, 111, 80, 8, 'rgba(0,0,0,.35)');
    if (type === 'grunt') drawGrunt(g, pose);
    if (type === 'imp') drawImp(g, pose);
    if (type === 'brute') drawBrute(g, pose);
  }
  function drawGrunt(g, pose) {
    const step = pose === 'walk1' ? 4 : -4;
    if (pose === 'dead') {
      px(g, 22, 87, 70, 14, '#15100f'); px(g, 25, 78, 55, 20, '#46523a'); px(g, 54, 72, 28, 19, '#89a06b'); px(g, 22, 96, 72, 8, '#6b0c0c'); return;
    }
    px(g, 37, 20, 38, 34, '#130909');
    px(g, 42, 23, 30, 27, pose === 'pain' ? '#c8d890' : '#85a36a');
    px(g, 45, 28, 23, 7, '#b8c98a');
    px(g, 49, 38, 7, 5, '#101010'); px(g, 63, 36, 7, 5, '#101010');
    px(g, 54, 48, 16, 5, '#3b1714');
    px(g, 35, 54, 42, 42, '#17100f');
    px(g, 39, 57, 34, 36, '#384536'); px(g, 45, 57, 8, 36, '#505f49');
    px(g, 23, 58, 15, 34, '#12100f'); px(g, 25, 60, 11, 29, '#7c9365');
    px(g, 75, 57, 15, 37, '#12100f'); px(g, 77, 59, 11, 31, '#7c9365');
    if (pose === 'attack') { px(g, 18, 45, 20, 11, '#85a36a'); px(g, 84, 43, 21, 11, '#85a36a'); px(g, 14, 45, 6, 4, '#d7d5a2'); px(g, 103, 43, 6, 4, '#d7d5a2'); }
    px(g, 41, 95, 13, 22 + step, '#242523'); px(g, 61, 95, 13, 22 - step, '#242523');
    px(g, 36, 113 + step, 20, 6, '#111'); px(g, 59, 113 - step, 20, 6, '#111');
    if (pose === 'pain') px(g, 40, 22, 34, 6, '#ffffff');
  }
  function drawImp(g, pose) {
    const step = pose === 'walk1' ? 5 : -5;
    if (pose === 'dead') {
      px(g, 20, 90, 80, 16, '#170707'); px(g, 25, 82, 65, 20, '#8a3e1e'); px(g, 48, 74, 35, 18, '#b7602d'); px(g, 26, 101, 72, 8, '#77120e'); return;
    }
    px(g, 37, 18, 10, 24, '#160806'); px(g, 75, 18, 10, 24, '#160806');
    px(g, 40, 21, 7, 21, '#d9b46a'); px(g, 75, 21, 7, 21, '#d9b46a');
    px(g, 35, 34, 52, 52, '#160806');
    px(g, 40, 37, 43, 45, '#8d3c20'); px(g, 47, 40, 29, 13, '#bc6a31'); px(g, 48, 58, 28, 24, '#a84f25');
    px(g, 49, 50, 8, 7, '#ffd94d'); px(g, 67, 50, 8, 7, '#ffd94d'); px(g, 55, 68, 18, 5, '#230907');
    px(g, 21, 58, 20, 39, '#150706'); px(g, 25, 61, 14, 32, '#7b351d');
    px(g, 83, 58, 20, 39, '#150706'); px(g, 85, 61, 14, 32, '#7b351d');
    px(g, 48, 84, 13, 28 + step, '#5b2518'); px(g, 66, 84, 13, 28 - step, '#5b2518');
    if (pose === 'attack') {
      px(g, 84, 35, 18, 13, '#9c4521');
      drawFire(g, 102, 31, 13);
      px(g, 20, 43, 18, 12, '#9c4521');
    }
    if (pose === 'pain') px(g, 41, 41, 42, 6, '#f2c28a');
  }
  function drawBrute(g, pose) {
    const step = pose === 'walk1' ? 4 : -4;
    if (pose === 'dead') {
      px(g, 12, 84, 100, 23, '#130507'); px(g, 18, 75, 86, 28, '#a44556'); px(g, 44, 67, 45, 20, '#d06c78'); px(g, 20, 101, 86, 9, '#7d0d13'); return;
    }
    px(g, 23, 17, 17, 34, '#140507'); px(g, 89, 17, 17, 34, '#140507');
    px(g, 26, 19, 14, 30, '#e7c28b'); px(g, 89, 19, 14, 30, '#e7c28b');
    px(g, 29, 31, 70, 42, '#140507');
    px(g, 35, 34, 58, 34, '#b74d62'); px(g, 44, 37, 40, 12, '#e0838d');
    px(g, 45, 47, 10, 8, '#ffe15c'); px(g, 74, 47, 10, 8, '#ffe15c'); px(g, 56, 60, 21, 7, '#24080b');
    px(g, 24, 69, 80, 35, '#140507');
    px(g, 30, 72, 68, 29, '#8c3140'); px(g, 39, 73, 18, 28, '#c75c6d'); px(g, 69, 73, 18, 28, '#c75c6d');
    px(g, 6, 62, 28, 45, '#140507'); px(g, 11, 66, 21, 37, '#a94655');
    px(g, 96, 62, 28, 45, '#140507'); px(g, 98, 66, 21, 37, '#a94655');
    if (pose === 'attack') { px(g, 0, 48, 34, 17, '#b95562'); px(g, 95, 47, 35, 17, '#b95562'); }
    px(g, 39, 101, 20, 21 + step, '#5b1c28'); px(g, 70, 101, 20, 21 - step, '#5b1c28');
    if (pose === 'pain') px(g, 34, 36, 62, 8, '#ffd0d8');
  }
  function drawFire(g, x, y, r) {
    px(g, x - r - 4, y - r, (r + 4) * 2, r * 2, 'rgba(255,64,10,.35)');
    px(g, x - r, y - r, r * 2, r * 2, '#e32b12');
    px(g, x - Math.floor(r * .55), y - Math.floor(r * .55), Math.floor(r * 1.1), Math.floor(r * 1.1), '#ffd64b');
    px(g, x - Math.floor(r * .2), y - Math.floor(r * .2), Math.floor(r * .45), Math.floor(r * .45), '#fff3aa');
  }
  function drawIcon(g,c,k) {
    g.clearRect(0,0,c.width,c.height);
    g.imageSmoothingEnabled = false;
    if (k === 'barrel') {
      px(g, 22, 11, 52, 74, '#130607'); px(g, 26, 13, 44, 70, '#6b1714'); px(g, 29, 18, 38, 7, '#b7462c'); px(g, 29, 63, 38, 7, '#b7462c');
      px(g, 38, 34, 20, 18, '#f5b72a'); px(g, 43, 37, 10, 10, '#1a0b09'); px(g, 46, 31, 4, 26, '#1a0b09'); return;
    }
    if (k === 'fireball' || k === 'fire') {
      px(g, 18, 44, 25, 11, 'rgba(255,67,14,.45)'); px(g, 10, 49, 32, 8, 'rgba(255,120,20,.35)');
      drawFire(g, 54, 48, 26); return;
    }
    if (k === 'blood') { px(g, 36, 34, 25, 25, '#2a0303'); px(g, 39, 37, 19, 19, '#9b0808'); px(g, 29, 52, 9, 7, '#7a0505'); return; }
    if (k === 'health') {
      px(g, 23, 28, 50, 38, '#130607'); px(g, 27, 31, 42, 31, '#e8e8df'); px(g, 35, 40, 26, 10, '#c71921'); px(g, 43, 32, 10, 26, '#c71921'); px(g, 27, 60, 42, 5, '#9fa7a1'); return;
    }
    if (k === 'armor') {
      px(g, 28, 18, 40, 62, '#06101a'); px(g, 33, 22, 30, 52, '#1666b8'); px(g, 39, 25, 18, 44, '#39b5ff'); px(g, 43, 22, 10, 48, '#0c3b78'); px(g, 28, 51, 40, 7, '#d8e9ff'); return;
    }
    if (k === 'bullet' || k === 'shell') {
      const box = k === 'bullet' ? '#5f4b19' : '#6a2d14';
      px(g, 18, 30, 60, 34, '#110907'); px(g, 23, 34, 50, 26, box); px(g, 28, 38, 40, 8, '#d2b247');
      px(g, 30, 49, 8, 7, '#f4d54c'); px(g, 42, 49, 8, 7, '#f4d54c'); px(g, 54, 49, 8, 7, '#f4d54c');
      g.fillStyle = '#120807'; g.font = 'bold 16px monospace'; g.fillText(k === 'bullet' ? 'BUL' : 'SHL', 31, 59); return;
    }
    if (k.indexOf('key') === 0) {
      const color = k === 'keyr' ? '#e72d31' : k === 'keyb' ? '#2777f2' : '#f1d238';
      px(g, 22, 30, 54, 36, '#110809'); px(g, 26, 34, 46, 28, color); px(g, 31, 39, 36, 5, 'rgba(255,255,255,.5)'); px(g, 34, 49, 8, 8, '#140708'); px(g, 47, 49, 21, 4, '#140708'); return;
    }
  }
  window.HellbreakRenderer = HellbreakRenderer;
})();
