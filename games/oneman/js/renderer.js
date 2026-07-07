(function () {
  'use strict';

  function mat(color, emissive) {
    return new THREE.MeshLambertMaterial({ color: color, emissive: emissive || 0x000000 });
  }
  function phong(color, emissive, shininess) {
    return new THREE.MeshPhongMaterial({ color: color, emissive: emissive || 0x000000, shininess: shininess || 24, specular: 0xffffff });
  }
  function basic(color) { return new THREE.MeshBasicMaterial({ color: color }); }
  function tex(draw, w, h) {
    const c = document.createElement('canvas'); c.width = w || 256; c.height = h || 128;
    const g = c.getContext('2d'); draw(g, c);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  function labelTexture(text, sub, fg, bg) {
    return tex(function (g, c) {
      g.fillStyle = bg || '#f7f7ef'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#243746'; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8);
      g.fillStyle = fg || '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 44px sans-serif'; g.fillText(text, c.width / 2, c.height * 0.43);
      g.font = 'bold 22px sans-serif'; g.fillText(sub || '', c.width / 2, c.height * 0.72);
    }, 384, 160);
  }

  const THEMES = [
    { name: 'morning-rural', skyTop: '#57b8f0', skyMid: '#bfe8ff', skyBottom: '#eef9ff', ground: 0x77a95e, sun: 0xffffff, hemiSky: 0xdff7ff, hemiGround: 0x779466, fog: 0xcdeef8, sunPos: [140, 145, -110], sunDisc: null },
    { name: 'afternoon-town', skyTop: '#4fa8e2', skyMid: '#c2dff0', skyBottom: '#f3dfb8', ground: 0x95a56c, sun: 0xffe2a4, hemiSky: 0xe9f0ff, hemiGround: 0x8b875b, fog: 0xd8d4bd, sunPos: [70, 105, -35], sunDisc: null },
    { name: 'evening-mountain', skyTop: '#476d9c', skyMid: '#c0b7ca', skyBottom: '#f1b06e', ground: 0x506f4e, sun: 0xffbc78, hemiSky: 0xb9c7e4, hemiGround: 0x59633f, fog: 0xb8a987, sunPos: [-85, 68, 60], sunDisc: 0xffbf69 },
    { name: 'magic-hour-sea', skyTop: '#211946', skyMid: '#8b4b84', skyBottom: '#ff873f', ground: 0x5a6f5a, sun: 0xff7d38, hemiSky: 0x58407f, hemiGround: 0x4c463f, fog: 0xce7651, sunPos: [-190, 18, 120], sunDisc: 0xffc15b }
  ];

  function OneManRenderer(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud || {};
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 2200);
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.clock = 0;
    this.drawCalls = 0;
    this.sectionBuilt = -1;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5b6a70, 1.15);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.3);
    this.scene.add(this.hemi); this.scene.add(this.sun);
    this.train = this.buildTrain();
    this.cab = this.buildCab();
    this.trainShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 32), new THREE.MeshBasicMaterial({ color: 0x1a120f, transparent: true, opacity: 0.0, depthWrite: false }));
    this.trainShadow.rotation.x = -Math.PI / 2;
    this.themeParams = THEMES;
    this.scene.add(this.train); this.scene.add(this.cab); this.scene.add(this.trainShadow);
    this.resize();
  }

  OneManRenderer.prototype.resize = function () {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  OneManRenderer.prototype.curve = function (section, z, length) {
    const p = Math.max(0, Math.min(1, z / length));
    const amp = [18, 22, 28, 16][section] || 18;
    const x = Math.sin((p - 0.15) * Math.PI * 2) * amp * Math.sin(Math.PI * p);
    const dx = (Math.sin((p + 0.002 - 0.15) * Math.PI * 2) * amp * Math.sin(Math.PI * (p + 0.002)) - x) / (0.002 * length);
    return { x: x, y: 0, z: z, yaw: Math.atan(dx) };
  };

  OneManRenderer.prototype.trackPoint = function (s, z) {
    return this.curve(s.stationIndex || 0, z, s.sectionLength || 1000);
  };

  OneManRenderer.prototype.applyTrack = function (obj, p, y) {
    obj.position.set(p.x, y || 0, p.z);
    obj.rotation.y = p.yaw;
  };

  OneManRenderer.prototype.rand = function (idx, salt) {
    const x = Math.sin((idx + 1) * 127.1 + (salt + 1) * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  OneManRenderer.prototype.buildSection = function (s) {
    while (this.world.children.length) this.world.remove(this.world.children[0]);
    const idx = s.stationIndex || 0;
    const route = s.station || { name: 'たばがわ', kanji: '田場川', theme: '田園' };
    const length = s.sectionLength || 1000;
    const th = THEMES[idx] || THEMES[0];
    this.renderer.setClearColor(th.fog, 1);
    this.scene.fog = new THREE.Fog(th.fog, idx === 3 ? 300 : 430, idx === 3 ? 1850 : 1650);
    this.sun.color.setHex(th.sun);
    this.sun.position.set(th.sunPos[0], th.sunPos[1], th.sunPos[2]);
    this.sun.intensity = idx === 3 ? 1.75 : idx === 2 ? 1.35 : 1.2;
    this.hemi.color.setHex(th.hemiSky);
    this.hemi.groundColor.setHex(th.hemiGround);
    this.hemi.intensity = idx === 3 ? 0.58 : idx === 2 ? 0.78 : 1.05;
    this.buildSky(th);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, length + 800), mat(th.ground));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.08, length / 2);
    this.world.add(ground);
    this.buildTrack(idx, length);
    this.buildStation(idx, route, length);
    this.buildDistantMountains(idx, length);
    this.buildTrees(idx, length);
    if (idx === 0) this.buildRural(length);
    else if (idx === 1) this.buildTown(length);
    else if (idx === 2) this.buildMountain(length);
    else this.buildSea(length);
    this.sectionBuilt = idx;
  };

  OneManRenderer.prototype.buildSky = function (th) {
    if (this.sky) this.scene.remove(this.sky);
    if (this.skyObjects) this.scene.remove(this.skyObjects);
    const t = tex(function (g, c) {
      const gr = g.createLinearGradient(0, 0, 0, c.height);
      gr.addColorStop(0, th.skyTop);
      gr.addColorStop(0.55, th.skyMid);
      gr.addColorStop(1, th.skyBottom);
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    }, 16, 256);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 24, 12), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(this.sky);
    this.skyObjects = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: th.name.indexOf('magic') >= 0 ? 0xf2a66f : 0xffffff, transparent: true, opacity: th.name.indexOf('magic') >= 0 ? 0.38 : 0.58, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(70 + i * 9, 18 + (i % 3) * 6), cloudMat);
      cloud.position.set(-360 + i * 105, 135 + (i % 4) * 22, 220 + i * 155);
      cloud.rotation.y = Math.PI;
      this.skyObjects.add(cloud);
    }
    if (th.sunDisc) {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(th.name.indexOf('magic') >= 0 ? 42 : 30, 40), new THREE.MeshBasicMaterial({ color: th.sunDisc, transparent: true, opacity: 0.95, depthWrite: false }));
      sun.position.set(th.name.indexOf('magic') >= 0 ? -420 : -260, th.name.indexOf('magic') >= 0 ? 78 : 115, 720);
      this.skyObjects.add(sun);
    }
    this.scene.add(this.skyObjects);
  };

  OneManRenderer.prototype.buildDistantMountains = function (idx, length) {
    const colors = [0x78a778, 0x7d8d6c, 0x3f5b48, 0x3b3157];
    for (let side of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const z = 50 + i * (length / 11);
        const p = this.curve(idx, z, length);
        const m = new THREE.Mesh(new THREE.ConeGeometry(70 + (i % 4) * 18, 60 + (i % 5) * 18, 5), mat(colors[idx]));
        m.position.set(p.x + side * (idx === 3 && side < 0 ? 360 : 180 + (i % 3) * 35), 22, z + (i % 2) * 26);
        m.rotation.y = (i % 4) * 0.3;
        this.world.add(m);
      }
    }
  };

  OneManRenderer.prototype.buildTrees = function (idx, length) {
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3.2, 6);
    const leafGeo = new THREE.ConeGeometry(2.4, 6.2, 7);
    const trunkMat = mat(0x68452b);
    const leafMats = [mat(0x3f7f3d), mat(0x4d8b42), mat(0x2f6a3b), mat(0x5f7e3a)];
    const count = idx === 2 ? 110 : idx === 3 ? 56 : 82;
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leafMeshes = leafMats.map(function (m) { return new THREE.InstancedMesh(leafGeo, m, Math.ceil(count / leafMats.length)); });
    const trunkMatrix = new THREE.Matrix4();
    const leafMatrix = new THREE.Matrix4();
    let trunkIndex = 0;
    const leafCounts = [0, 0, 0, 0];
    for (let i = 0; i < count; i++) {
      const z = 35 + this.rand(i, idx) * (length - 100);
      const p = this.curve(idx, z, length);
      const side = this.rand(i, idx + 4) > 0.5 ? 1 : -1;
      if (idx === 3 && side < 0) continue;
      const dist = 20 + this.rand(i, idx + 8) * 60;
      const x = p.x + side * dist + (this.rand(i, 9) - 0.5) * 20;
      const scale = 0.75 + this.rand(i, 11) * 0.75;
      const ry = this.rand(i, 12) * Math.PI;
      trunkMatrix.compose(new THREE.Vector3(x, 1.6 * scale, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(scale, scale, scale));
      trunkMesh.setMatrixAt(trunkIndex++, trunkMatrix);
      const matIndex = (i + idx) % leafMeshes.length;
      leafMatrix.compose(new THREE.Vector3(x, 6.0 * scale, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(scale, scale, scale));
      leafMeshes[matIndex].setMatrixAt(leafCounts[matIndex]++, leafMatrix);
    }
    trunkMesh.count = trunkIndex;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.world.add(trunkMesh);
    for (let j = 0; j < leafMeshes.length; j++) {
      leafMeshes[j].count = leafCounts[j];
      leafMeshes[j].instanceMatrix.needsUpdate = true;
      this.world.add(leafMeshes[j]);
    }
  };

  OneManRenderer.prototype.buildTrack = function (idx, length) {
    const railMat = mat(0x2d3234), sleeperMat = mat(0x4c3829), ballastMat = mat(0x686d70);
    const segLen = 8;
    for (let z = 0; z <= length; z += segLen) {
      const p = this.curve(idx, z, length);
      const ballast = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, segLen + 0.6), ballastMat);
      this.applyTrack(ballast, p, 0.04); this.world.add(ballast);
      for (let off of [-0.82, 0.82]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, segLen + 0.9), railMat);
        const px = { x: p.x + Math.cos(p.yaw) * off, z: p.z - Math.sin(p.yaw) * off, yaw: p.yaw };
        this.applyTrack(rail, px, 0.23); this.world.add(rail);
      }
      if (Math.round(z) % 16 === 0) {
        const sleeper = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.13, 0.42), sleeperMat);
        this.applyTrack(sleeper, p, 0.13); this.world.add(sleeper);
      }
      if (Math.round(z) % 64 === 0) {
        const pole = new THREE.Group();
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.13, 4.2, 0.13), mat(0x6f7472));
        mast.position.y = 2.1; pole.add(mast);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), mat(0x6f7472));
        arm.position.set(-1.25, 3.8, 0); pole.add(arm);
        const pp = { x: p.x + Math.cos(p.yaw) * -4.2, z: p.z - Math.sin(p.yaw) * -4.2, yaw: p.yaw };
        this.applyTrack(pole, pp, 0); this.world.add(pole);
      }
    }
    if (idx === 2) {
      const p = this.curve(idx, length * 0.48, length);
      const tunnel = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 90), mat(0x383d3f));
      this.applyTrack(tunnel, p, 3.2); this.world.add(tunnel);
      const hole = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.6, 92), basic(0x111315));
      this.applyTrack(hole, p, 2.7); this.world.add(hole);
      const river = new THREE.Mesh(new THREE.BoxGeometry(240, 0.04, 34), basic(0x3f88b8));
      river.position.set(0, 0.015, length * 0.68); this.world.add(river);
    }
  };

  OneManRenderer.prototype.buildStation = function (idx, route, length) {
    const p = this.curve(idx, length, length);
    const station = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.BoxGeometry(7.0, 1.1, 88), mat(0x9b948a));
    platform.position.set(5.4, 0.55, 0); station.add(platform);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 34), mat(0x33404b));
    roof.position.set(5.5, 3.0, 12); station.add(roof);
    for (let z of [-2, 12, 26]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), mat(0x4b555c));
      post.position.set(3.2, 2.0, z); station.add(post);
    }
    const stopLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 5.8), mat(0xffffff));
    stopLine.position.set(1.95, 1.13, 0); station.add(stopLine);
    const signPole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), mat(0xeeeeee));
    signPole.position.set(2.35, 1.8, 1.0); station.add(signPole);
    const two = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), basic(0xffffff));
    two.position.set(2.35, 2.55, 1.0); station.add(two);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.85), new THREE.MeshBasicMaterial({ map: labelTexture(route.name, route.kanji), side: THREE.DoubleSide }));
    name.rotation.y = -Math.PI / 2; name.position.set(2.65, 2.15, -16); station.add(name);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.55), mat(0x6c442a));
    bench.position.set(5.5, 1.35, -8); station.add(bench);
    const vending = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 1.1), mat(0xffffff, 0x223355));
    vending.position.set(6.1, 1.95, 22); station.add(vending);
    this.applyTrack(station, p, 0);
    this.world.add(station);
  };

  OneManRenderer.prototype.buildRural = function (length) {
    const waterMats = [basic(0x86c8df), basic(0xa9def0), basic(0x73b9d1)];
    const bank = mat(0x6c8a4d);
    for (let side of [-1, 1]) for (let z = 45; z < length - 105; z += 74) {
      const p = this.curve(0, z, length);
      const w = 95 + (Math.floor(z) % 3) * 16;
      const field = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 62), waterMats[Math.floor(z / 74) % waterMats.length]);
      field.position.set(p.x + side * 58, 0.012, z); this.world.add(field);
      for (let dz of [-31, 31]) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 0.08, 1.8), bank);
        ridge.position.set(p.x + side * 58, 0.06, z + dz); this.world.add(ridge);
      }
      const path = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 64), mat(0xa98f55));
      path.position.set(p.x + side * 12, 0.07, z); this.world.add(path);
    }
  };
  OneManRenderer.prototype.buildTown = function (length) {
    const roofColors = [0x6f3f35, 0x334b68, 0x7c5c35];
    for (let side of [-1, 1]) for (let z = 80; z < length - 150; z += 58) {
      const p = this.curve(1, z, length);
      const house = new THREE.Group();
      const bw = 6 + (Math.floor(z) % 3), bd = 5 + (Math.floor(z / 2) % 3);
      const body = new THREE.Mesh(new THREE.BoxGeometry(bw, 3.4 + (z % 2), bd), mat(side < 0 ? 0xd8c3a2 : 0xc9d0d3));
      body.position.y = 2; house.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 1.1, bd + 0.8), mat(roofColors[Math.floor(z / 58) % roofColors.length]));
      roof.position.y = 4.55; house.add(roof);
      house.position.set(p.x + side * (38 + (z % 3) * 8), 0, z);
      house.rotation.y = side * (0.08 + (z % 5) * 0.03);
      this.world.add(house);
      if (Math.floor(z) % 116 === 0) {
        const pole = new THREE.Group();
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8, 8), mat(0x5b4633)); mast.position.y = 4; pole.add(mast);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.12), mat(0x4c3a2b)); arm.position.set(side * -1.6, 7.1, 0); pole.add(arm);
        pole.position.set(p.x + side * 21, 0, z + 14); this.world.add(pole);
      }
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(92, 0.04, 7), mat(0x3c3c3c));
    cross.position.set(0, 0.04, length * 0.46); this.world.add(cross);
    for (let side of [-1, 1]) {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 8), mat(0xffd42a));
      gate.position.set(side * 4, 1.3, length * 0.46); gate.rotation.z = side * 0.45; this.world.add(gate);
      const signal = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), mat(0x303030)); post.position.y = 1.6; signal.add(post);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.2), mat(0x151515)); board.position.y = 3.1; signal.add(board);
      const red1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), basic(0xff2020)); red1.position.set(0.12, 3.28, -0.25); signal.add(red1);
      const red2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), basic(0xff2020)); red2.position.set(0.12, 3.28, 0.25); signal.add(red2);
      signal.position.set(side * 7.2, 0, length * 0.46 - 5); this.world.add(signal);
    }
  };
  OneManRenderer.prototype.buildMountain = function (length) {
    for (let i = 0; i < 48; i++) {
      const z = 40 + i * 34;
      const p = this.curve(2, z, length);
      for (let side of [-1, 1]) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(34 + (i % 5) * 8, 58 + (i % 4) * 18, 6), mat(i % 2 ? 0x3d5a43 : 0x506a4c));
        hill.position.set(p.x + side * (70 + (i % 4) * 18), 23, z);
        this.world.add(hill);
      }
    }
    const bridgeZ = length * 0.68;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 70), mat(0x4f5962));
    deck.position.set(0, 2.3, bridgeZ); this.world.add(deck);
    for (let x of [-4.5, 4.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 70), mat(0x6a737a));
      rail.position.set(x, 3.0, bridgeZ); this.world.add(rail);
    }
  };
  OneManRenderer.prototype.buildSea = function (length) {
    const seaMat = new THREE.MeshPhongMaterial({ color: 0x2b5f91, emissive: 0x15163f, shininess: 80, specular: 0xffb56b });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, length + 900), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(390, 0.005, length / 2); this.world.add(sea);
    const reflect = new THREE.Mesh(new THREE.PlaneGeometry(54, length * 0.72), new THREE.MeshBasicMaterial({ color: 0xffa34c, transparent: true, opacity: 0.45, depthWrite: false }));
    reflect.rotation.x = -Math.PI / 2; reflect.position.set(245, 0.018, length * 0.55); this.world.add(reflect);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, length + 250), mat(0xb6b1a0));
    wall.position.set(52, 0.8, length / 2); this.world.add(wall);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(180, length + 500), mat(0xd0b77d));
    beach.rotation.x = -Math.PI / 2; beach.position.set(-125, 0.01, length / 2); this.world.add(beach);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(36, 40), basic(0xffc15b));
    sun.position.set(430, 82, length * 0.66); this.world.add(sun);
  };

  OneManRenderer.prototype.buildTrain = function () {
    const g = new THREE.Group();
    const bodyMat = phong(0xf4f2e8, 0x000000, 72), stripeMat = phong(0xb94825, 0x150602, 38), winMat = new THREE.MeshBasicMaterial({ color: 0x2a4c68, emissive: 0x173047 });
    this.trainBodyMat = bodyMat;
    this.trainStripeMat = stripeMat;
    for (let i = 0; i < 2; i++) {
      const car = new THREE.Group(); car.position.z = i * 20.5;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.55, 18.5), bodyMat); body.position.y = 1.65; car.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.32, 18.7), stripeMat); stripe.position.set(0, 1.7, 0); car.add(stripe);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.55, 0.09), mat(0xd8d8d0)); door.position.set(0, 1.75, -9.35); car.add(door);
      const front = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.95, 0.1), winMat); front.position.set(0, 2.2, -9.42); car.add(front);
      for (let z = -6; z <= 6; z += 3) for (let side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 1.45), winMat);
        w.position.set(side * 1.49, 2.08, z); car.add(w);
      }
      for (let z of [-5.8, 5.8]) for (let side of [-1, 1]) {
        const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 1.4), mat(0x202326));
        bogie.position.set(0, 0.35, z); car.add(bogie);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 14), mat(0x17191b));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 0.85, 0.24, z); car.add(wheel);
      }
      const equip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.38, 2.6), mat(0x303437));
      equip.position.set(0, 0.58, 1.2); car.add(equip);
      g.add(car);
    }
    return g;
  };

  OneManRenderer.prototype.buildCab = function () {
    const cab = new THREE.Group();
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.75, 1.55), mat(0x24282d)); desk.position.set(0, 0.55, 1.4); cab.add(desk);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), mat(0x101214)); panel.position.set(-0.55, 1.05, 1.05); cab.add(panel);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.16, 0.18), mat(0x171a1d)); frameTop.position.set(0, 2.55, 2.25); cab.add(frameTop);
    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.16, 0.18), mat(0x171a1d)); frameBottom.position.set(0, 1.15, 2.25); cab.add(frameBottom);
    for (let x of [-2.25, 2.25]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), mat(0x171a1d));
      p.position.set(x, 1.65, 2.25); cab.add(p);
    }
    for (let x of [-0.55, 0.55]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), mat(0x111));
      wiper.position.set(x, 1.8, 2.32); wiper.rotation.z = x < 0 ? -0.5 : 0.5; cab.add(wiper);
    }
    return cab;
  };

  OneManRenderer.prototype.render = function (game, dtMs) {
    this.clock += (dtMs || 16) / 1000;
    const s = game.getState();
    if (this.sectionBuilt !== s.stationIndex) this.buildSection(s);
    if (this.trainBodyMat) {
      const shine = Math.max(0, Math.sin(this.clock * 1.5 + (s.routePos || 0) * 0.018)) * (s.stationIndex === 3 ? 0.18 : 0.06);
      this.trainBodyMat.emissive.setRGB(shine, shine * 0.72, shine * 0.36);
      this.trainStripeMat.emissive.setRGB(shine * 0.7, shine * 0.25, shine * 0.08);
    }
    const p = this.trackPoint(s, s.routePos || 0);
    this.applyTrack(this.train, p, 0.2);
    this.trainShadow.position.set(p.x + (s.stationIndex === 3 ? 18 : 5), 0.025, p.z + 5);
    this.trainShadow.rotation.z = -0.42 + p.yaw;
    this.trainShadow.material.opacity = s.stationIndex === 3 ? 0.32 : s.stationIndex === 2 ? 0.18 : 0.11;
    if (s.shot === 'COCKPIT') this.renderCockpit(s, p);
    else if (s.shot === 'SIDE_STOP') this.renderSideStop(s);
    else if (s.shot === 'PLATFORM') this.renderPlatform(s);
    else this.renderCine(s);
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.syncHud(s);
  };

  OneManRenderer.prototype.renderCockpit = function (s, p) {
    const shake = Math.min(0.025, s.kmh / 3600);
    const cam = this.curve(s.stationIndex, (s.routePos || 0) - 7.8, s.sectionLength);
    this.camera.position.set(cam.x + Math.sin(this.clock * 21) * shake, 2.2 + Math.sin(this.clock * 17) * shake, cam.z);
    const look = this.curve(s.stationIndex, (s.routePos || 0) + 95, s.sectionLength);
    this.camera.lookAt(new THREE.Vector3(look.x, 1.45, look.z));
    this.cab.position.set(cam.x, 0, cam.z - 0.4);
    this.cab.rotation.y = cam.yaw;
    this.cab.visible = true;
    this.train.visible = false;
  };
  OneManRenderer.prototype.renderSideStop = function (s) {
    const stop = this.curve(s.stationIndex, s.sectionLength, s.sectionLength);
    const train = this.curve(s.stationIndex, s.routePos || 0, s.sectionLength);
    this.camera.position.set(stop.x + 14, 3.0, stop.z - 10);
    this.camera.lookAt(new THREE.Vector3((stop.x + train.x) * 0.5, 1.45, stop.z - 2));
    this.cab.visible = false; this.train.visible = true;
  };
  OneManRenderer.prototype.renderPlatform = function (s) {
    const stop = this.curve(s.stationIndex, s.sectionLength, s.sectionLength);
    this.camera.position.set(stop.x + 30, 10.5, stop.z - 42);
    this.camera.lookAt(new THREE.Vector3(stop.x + 3, 1.6, stop.z));
    this.cab.visible = false; this.train.visible = true;
  };
  OneManRenderer.prototype.renderCine = function (s) {
    const z = s.routePos || 0, p = this.curve(s.stationIndex, z, s.sectionLength);
    const t = this.clock;
    const wob = Math.sin(t * 2.1) * 0.25;
    if (s.shot === 'CINE_FRONT') {
      const ahead = this.curve(s.stationIndex, Math.min(s.sectionLength, z + 88), s.sectionLength);
      this.camera.position.set(ahead.x + 9, 2.8 + wob, ahead.z + 6);
      this.camera.lookAt(new THREE.Vector3(p.x, 1.55, p.z + 5));
    } else if (s.shot === 'CINE_AERIAL') {
      this.camera.position.set(p.x + 48, 42 + wob, p.z - 55);
      this.camera.lookAt(new THREE.Vector3(p.x, 1.2, p.z + 20));
    } else if (s.shot === 'CINE_TAIL') {
      const tail = this.curve(s.stationIndex, Math.max(0, z - 52), s.sectionLength);
      this.camera.position.set(tail.x - 5, 4.4 + wob, tail.z - 42);
      this.camera.lookAt(new THREE.Vector3(p.x, 1.65, p.z + 20));
    } else {
      const side = 1;
      this.camera.position.set(p.x + side * 20, 4.1 + wob, p.z - 16);
      this.camera.lookAt(new THREE.Vector3(p.x, 1.55, p.z + 7));
    }
    this.cab.visible = false; this.train.visible = true;
  };

  OneManRenderer.prototype.syncHud = function (s) {
    const h = this.hud;
    if (!h.speedNeedle) return;
    h.speedText.textContent = Math.round(s.kmh).toString().padStart(3, '0');
    h.speedNeedle.style.transform = 'rotate(' + (-126 + Math.min(120, s.kmh) / 120 * 252).toFixed(1) + 'deg)';
    if (s.dist < 0) { h.distText.textContent = '過走 ' + Math.abs(s.dist).toFixed(1) + 'm'; h.distText.parentElement.classList.add('overrun'); }
    else { h.distText.textContent = 'のこり ' + s.dist.toFixed(0).padStart(3, ' ') + 'm'; h.distText.parentElement.classList.remove('overrun'); }
    const final = s.dist >= 1 ? s.dist.toFixed(2) + 'm' : Math.max(0, s.dist * 100).toFixed(0) + 'cm';
    h.finalCounter.textContent = final;
    h.finalCounter.className = s.dist < 2 ? 'danger' : s.dist < 6 ? 'warn' : '';
    h.finalCounter.parentElement.classList.toggle('show', s.phase === 'FINAL' || s.phase === 'STOPPED' || s.phase === 'STATION_RESULT');
    h.phase.textContent = s.phase; h.notch.textContent = s.notchName; h.eff.textContent = s.effectiveBrake.toFixed(2); h.grade.textContent = s.gradePermille.toFixed(1) + '‰';
    const y = 8 + s.notch * 9.15;
    h.leverKnob.style.top = y + '%';
    h.leverKnob.style.transform = 'translate(-50%, -50%) rotate(' + (s.notch - 4.5) * 2.2 + 'deg)';
    h.lever.querySelectorAll('.notch').forEach(function (n, i) { n.classList.toggle('active', i === s.notch); });
    h.dimension.classList.toggle('show', s.dimensionFlash > 0 || s.phase === 'STATION_RESULT');
    h.dimension.classList.toggle('pitari', !!(s.result && Math.abs(s.result.errorM) <= 0.3));
    if (s.result) {
      const cm = Math.round(Math.abs(s.result.errorM) * 100);
      const countT = s.dimensionFlash > 0 ? Math.min(1, (1.6 - s.dimensionFlash) / 0.65) : 1;
      h.dimensionValue.textContent = (s.result.errorM >= 0 ? '+' : '-') + Math.round(cm * countT) + 'cm';
      h.resultTitle.textContent = s.result.rank;
      h.resultBody.textContent = '誤差 ' + Math.round(s.result.errorM * 100) + 'cm / ' + s.result.score + '点';
    } else { h.dimensionValue.textContent = ''; h.resultTitle.textContent = ''; h.resultBody.textContent = ''; }
    if (s.phase === 'FINAL_RESULT') {
      h.resultTitle.textContent = s.finalResult.title;
      h.resultBody.textContent = '総合 ' + s.finalResult.total + '点 / 4駅';
    }
    h.result.classList.toggle('show', s.phase === 'STATION_RESULT' || s.phase === 'FINAL_RESULT');
    h.result.classList.toggle('pitari', !!(s.result && Math.abs(s.result.errorM) <= 0.3));
    h.result.setAttribute('data-best', document.body.getAttribute('data-best') || '0');
    if (h.routeIntro) {
      h.routeIntro.classList.toggle('show', s.phase === 'RUN_INTRO');
      h.routeMap.textContent = ['田場川', '木漏台', '深山口', '海風浜', '終点'].map(function (name, i) { return (i === s.stationIndex ? '●' : '○') + name; }).join('  ');
    }
    if (h.topLedText && s.station) h.topLedText.textContent = '次は　' + s.station.name + '　' + s.station.kanji + '　　' + s.station.theme + '区間　停止位置 2両';
    h.overlay.className = s.transition.type + (s.transition.t < 1 ? ' show' : '') + (s.transition.warning ? ' warning' : '');
    h.overlay.style.opacity = s.transition.type === 'fade' ? String(Math.sin((1 - s.transition.t) * Math.PI)) : String(Math.max(0, 1 - s.transition.t));
  };
  OneManRenderer.prototype.handleEvent = function () {};

  window.OneManRenderer = OneManRenderer;
})();
