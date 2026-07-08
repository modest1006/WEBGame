(function () {
  'use strict';
  var C = window.BubbleExConstants;
  var GH = window.BubbleExGridHelpers;

  var COLOR_HEX = {
    red: 0xff3b4e,
    blue: 0x2f8fff,
    green: 0x38d67a,
    yellow: 0xffd438,
    purple: 0xb861ff,
    orange: 0xff9a2e
  };
  var COLOR_EMISSIVE = {
    red: 0x4a0008,
    blue: 0x00234a,
    green: 0x00381c,
    yellow: 0x4a3600,
    purple: 0x2a0040,
    orange: 0x421900
  };

  function BubbleExRenderer(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000); // farはresize()でカメラ距離に連動
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setClearColor(0x0a0e1c, 1);
    this.clock = 0;
    this.bubbleMeshes = {}; // key -> mesh
    this.shotMesh = null;
    this.particles = []; // {mesh, vx,vy,vz, life, maxLife, kind}
    this.stageBgGroup = new THREE.Group();
    this.scene.add(this.stageBgGroup);
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
    this.stageId = 0;

    this.geo = new THREE.SphereGeometry(C.BUBBLE_RADIUS, 20, 16);
    this.starGeo = new THREE.ConeGeometry(3, 7, 4);
    this.shardGeo = new THREE.TetrahedronGeometry(4, 0);
    this.matCache = {};

    this.buildLights();
    this.buildBackground(1);
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));

    // World mapping: board logical space (0..BOARD_W, 0..ROWS*ROW_H) -> XY plane, Z=0.
    // Camera looks straight at board along -Z.
    // 子はY反転(0..-boardH)で置かれるため、中心を原点に合わせるオフセットは「+boardH/2」
    this.boardGroup.position.set(-C.BOARD_W / 2, C.ROWS * C.ROW_H * 0.5, 0);

    this.buildLauncher();
  }

  BubbleExRenderer.prototype.buildLauncher = function () {
    var group = new THREE.Group();
    var baseMat = new THREE.MeshStandardMaterial({ color: 0x3a3f52, metalness: 0.7, roughness: 0.35 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(26, 30, 14, 20), baseMat);
    group.add(base);
    var barrelMat = new THREE.MeshStandardMaterial({ color: 0x8891ad, metalness: 0.8, roughness: 0.25 });
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 34, 14), barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 17, 6);
    group.add(barrel);
    this.launcherBarrel = barrel;
    this.launcherGroup = group;
    this.boardGroup.add(group);

    // Aim guide: dashed line segments, updated each frame.
    var lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 6, gapSize: 5, transparent: true, opacity: 0.55 });
    var lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.computeLineDistances();
    this.boardGroup.add(this.aimLine);
  };

  // Trace the aim ray with one wall bounce (mirrors game.js physics) for the dotted guide.
  BubbleExRenderer.prototype.updateAimLine = function (launchPos, deg, visible) {
    if (!this.aimLine) return;
    this.aimLine.visible = !!visible;
    if (!visible) return;
    var rad = deg * Math.PI / 180;
    var dx = Math.sin(rad), dy = -Math.cos(rad);
    var r = C.BUBBLE_RADIUS;
    var x = launchPos.x, y = launchPos.y;
    var pts = [];
    var p0 = this.toScene(x, y);
    pts.push(new THREE.Vector3(p0.x, p0.y, 1));
    var maxLen = 900;
    var remaining = maxLen;
    var bounced = false;
    for (var iter = 0; iter < 2 && remaining > 0; iter++) {
      var tWallX = Infinity, side = null;
      if (dx > 0) tWallX = (C.BOARD_W - r - x) / dx;
      else if (dx < 0) tWallX = (r - x) / dx;
      var tCeil = dy < 0 ? (r - y) / dy : Infinity;
      var t = Math.min(tWallX, tCeil, remaining);
      var nx = x + dx * t, ny = y + dy * t;
      var ps = this.toScene(nx, ny);
      pts.push(new THREE.Vector3(ps.x, ps.y, 1));
      remaining -= t;
      if (t === tCeil) break;
      if (bounced) break;
      x = nx; y = ny; dx = -dx; bounced = true;
    }
    this.aimLine.geometry.dispose();
    this.aimLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.aimLine.computeLineDistances();
  };

  BubbleExRenderer.prototype.updateLauncher = function (launchPos, deg) {
    if (!this.launcherGroup) return;
    var p = this.toScene(launchPos.x, launchPos.y);
    this.launcherGroup.position.set(p.x, p.y, 4);
    this.launcherBarrel.rotation.z = Math.PI / 2 - (deg * Math.PI / 180);
  };

  BubbleExRenderer.prototype.resize = function () {
    var w = this.canvas.clientWidth || window.innerWidth;
    var h = this.canvas.clientHeight || window.innerHeight;
    var pr = Math.min(window.devicePixelRatio || 1, ('ontouchstart' in window) ? 1.5 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Frame board height (rows*ROW_H + margin) within viewport.
    var boardH = C.ROWS * C.ROW_H + 140;
    var dist = (boardH / 2) / Math.tan((this.camera.fov * Math.PI / 180) / 2);
    this.camera.position.set(0, 0, dist * 1.05);
    this.camera.near = Math.max(0.1, dist * 0.02);
    this.camera.far = dist * 4 + 1000; // シーン全体（背景の奥行き込み）を必ず含める
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  };

  BubbleExRenderer.prototype.buildLights = function () {
    var amb = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(amb);
    var key1 = new THREE.DirectionalLight(0xfff2d8, 1.1);
    key1.position.set(-4, 6, 8);
    this.scene.add(key1);
    var rim = new THREE.PointLight(0x66ccff, 0.7, 0, 2);
    rim.position.set(3, -4, 6);
    this.scene.add(rim);
  };

  var STAGE_BG_PALETTES = [
    { fog: 0x1a0e2e, floor: 0x2a1650, accent: 0xff2fa0 },
    { fog: 0x0e1a2e, floor: 0x163050, accent: 0x2fd8ff },
    { fog: 0x1a2e0e, floor: 0x1c4a20, accent: 0x8bff2f },
    { fog: 0x2e1a0e, floor: 0x4a2c16, accent: 0xffb02f },
    { fog: 0x2e0e1a, floor: 0x4a1630, accent: 0xff2f5c },
    { fog: 0x0e2e26, floor: 0x164a3c, accent: 0x2fffcf },
    { fog: 0x24102e, floor: 0x3a1650, accent: 0xd82fff },
    { fog: 0x2e2a0e, floor: 0x4a4416, accent: 0xfff02f }
  ];

  BubbleExRenderer.prototype.buildBackground = function (stage) {
    while (this.stageBgGroup.children.length) {
      var c = this.stageBgGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    var pal = STAGE_BG_PALETTES[(stage - 1) % STAGE_BG_PALETTES.length];
    // フォグはカメラ距離基準で（固定値60/260だとカメラ距離~855の盤面ごと全部沈んで真っ黒になる）
    var camDist = this.camera.position.z || 855;
    this.scene.fog = new THREE.Fog(pal.fog, camDist + 80, camDist + 900);
    this.renderer.setClearColor(pal.fog, 1);

    // Checker floor, far behind board, slowly rotating.
    var floorGeo = new THREE.PlaneGeometry(700, 700, 14, 14);
    var floorMat = new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.85, metalness: 0.1, wireframe: false });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -40, -160);
    floor.rotation.x = -Math.PI / 2.6;
    this.stageBgGroup.add(floor);
    this._floor = floor;

    // Floating low-poly geometric shapes
    this._floaters = [];
    var shapes = [
      new THREE.IcosahedronGeometry(10, 0),
      new THREE.OctahedronGeometry(9, 0),
      new THREE.TetrahedronGeometry(11, 0)
    ];
    var accentMat = new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.35, metalness: 0.4, emissive: pal.accent, emissiveIntensity: 0.25 });
    for (var i = 0; i < 7; i++) {
      var geo = shapes[i % shapes.length];
      var mesh = new THREE.Mesh(geo, accentMat);
      var ang = (i / 7) * Math.PI * 2;
      mesh.position.set(Math.cos(ang) * 130, Math.sin(ang * 0.7) * 60 - 10, -120 - (i % 3) * 30);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this.stageBgGroup.add(mesh);
      this._floaters.push({ mesh: mesh, spin: 0.2 + Math.random() * 0.3, orbit: ang, radius: 130 + (i % 3) * 10 });
    }
    this.stageId = stage;
  };

  BubbleExRenderer.prototype.matFor = function (color) {
    if (!this.matCache[color]) {
      this.matCache[color] = new THREE.MeshPhysicalMaterial({
        color: COLOR_HEX[color] || 0xffffff,
        emissive: COLOR_EMISSIVE[color] || 0x000000,
        emissiveIntensity: 0.6,
        roughness: 0.18,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        reflectivity: 0.9
      });
    }
    return this.matCache[color];
  };

  // Convert board logical coords (x right, y down, origin top-left) into scene space
  // (boardGroup already offset so board center is world origin; flip Y).
  BubbleExRenderer.prototype.toScene = function (x, y) {
    return { x: x, y: -y };
  };

  BubbleExRenderer.prototype.syncBoard = function (state, wobble) {
    var seen = {};
    var t = this.clock;
    state.cells.forEach((cell) => {
      var kk = cell.row * 64 + cell.col;
      seen[kk] = true;
      var wx = GH.cellX(cell.row, cell.col);
      var wy = GH.cellY(cell.row);
      var pos = this.toScene(wx, wy);
      var mesh = this.bubbleMeshes[kk];
      if (!mesh) {
        mesh = new THREE.Mesh(this.geo, this.matFor(cell.color));
        mesh.userData.baseScale = 1;
        this.boardGroup.add(mesh);
        this.bubbleMeshes[kk] = mesh;
      } else if (mesh.userData.color !== cell.color) {
        mesh.material = this.matFor(cell.color);
      }
      mesh.userData.color = cell.color;
      var pulse = wobble ? (1 + Math.sin(t * 2.2 + cell.row * 0.6 + cell.col * 0.9) * 0.025) : 1;
      mesh.position.set(pos.x, pos.y, 0);
      mesh.scale.setScalar(pulse);
    });
    Object.keys(this.bubbleMeshes).forEach((kk) => {
      if (!seen[kk]) {
        var m = this.bubbleMeshes[kk];
        this.boardGroup.remove(m);
        delete this.bubbleMeshes[kk];
      }
    });
  };

  BubbleExRenderer.prototype.syncShot = function (shot) {
    if (!shot) {
      if (this.shotMesh) { this.boardGroup.remove(this.shotMesh); this.shotMesh = null; }
      return;
    }
    if (!this.shotMesh) {
      this.shotMesh = new THREE.Mesh(this.geo, this.matFor(shot.color));
      this.boardGroup.add(this.shotMesh);
    }
    if (this.shotMesh.userData.color !== shot.color) {
      this.shotMesh.material = this.matFor(shot.color);
      this.shotMesh.userData.color = shot.color;
    }
    var pos = this.toScene(shot.x, shot.y);
    this.shotMesh.position.set(pos.x, pos.y, 0);
  };

  BubbleExRenderer.prototype.spawnPopBurst = function (cells, kind) {
    var self = this;
    cells.forEach((cell) => {
      var pos = self.toScene(cell.x, cell.y);
      var hex = COLOR_HEX[cell.color] || 0xffffff;
      var n = kind === 'drop' ? 4 : 6;
      for (var i = 0; i < n; i++) {
        var isStar = kind === 'pop' && i === 0;
        var geo = isStar ? self.starGeo : self.shardGeo;
        var mat = new THREE.MeshStandardMaterial({ color: hex, emissive: 0x442200, emissiveIntensity: 0.3, roughness: 0.4 });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, pos.y, 0);
        mesh.scale.setScalar(0.6 + Math.random() * 0.6);
        self.particleGroup.add(mesh);
        var speed = kind === 'drop' ? (20 + Math.random() * 30) : (60 + Math.random() * 90);
        var ang = Math.random() * Math.PI * 2;
        var upBias = kind === 'drop' ? -40 : 40;
        self.particles.push({
          mesh: mesh,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed + upBias,
          vz: (Math.random() - 0.5) * speed,
          spin: (Math.random() - 0.5) * 8,
          life: 0,
          maxLife: kind === 'drop' ? 0.9 : 0.6
        });
      }
    });
  };

  BubbleExRenderer.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particleGroup.remove(p.mesh);
        p.mesh.geometry = null;
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 140 * dt; // gravity
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt * 0.7;
      var k = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.05, k) * (0.6 + Math.random() * 0.05));
      if (p.mesh.material) p.mesh.material.opacity = k, p.mesh.material.transparent = true;
    }
  };

  BubbleExRenderer.prototype.updateBackground = function (dt) {
    if (this._floor) this._floor.rotation.z += dt * 0.03;
    var self = this;
    if (this._floaters) {
      this._floaters.forEach((f) => {
        f.orbit += dt * 0.05;
        f.mesh.position.x = Math.cos(f.orbit) * f.radius;
        f.mesh.position.y = Math.sin(f.orbit * 0.7) * 60 - 10;
        f.mesh.rotation.x += dt * f.spin;
        f.mesh.rotation.y += dt * f.spin * 0.6;
      });
    }
  };

  BubbleExRenderer.prototype.render = function (state, dt, launchPos, showAim) {
    this.clock += dt;
    this.updateBackground(dt);
    this.updateParticles(dt);
    this.syncBoard(state, true);
    this.syncShot(state.shot);
    if (launchPos) {
      this.updateLauncher(launchPos, state.aimDeg);
      this.updateAimLine(launchPos, state.aimDeg, showAim && !state.shot);
    }
    this.renderer.render(this.scene, this.camera);
  };

  window.BubbleExRenderer = BubbleExRenderer;
  window.BubbleExColorHex = COLOR_HEX;
})();
