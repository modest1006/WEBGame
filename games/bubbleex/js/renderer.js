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

  var RAINBOW = [0xff4040, 0xffb020, 0xfff040, 0x40ff70, 0x40c0ff, 0xb060ff];

  function makeStarGeo(outerR, innerR) {
    var shape = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? outerR : innerR;
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  function BubbleExRenderer(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000); // farはresize()でカメラ距離に連動
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setClearColor(0x0a0e1c, 1);
    this.clock = 0;
    this.bubbleMeshes = {}; // key -> mesh
    this.shotMesh = null;
    this.particles = []; // {mesh, vx,vy,vz, spin, life, maxLife, growTo?}
    this.popSeqs = [];   // popcorn-chain pop sequences
    this.fallGhosts = []; // physics-falling dropped bubbles
    this.shakeT = 0;
    this.shakeDur = 0.001;
    this.shakeAmp = 0;
    this.camBaseZ = 855;
    this.stageBgGroup = new THREE.Group();
    this.scene.add(this.stageBgGroup);
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
    this.stageId = 0;

    this.geo = new THREE.SphereGeometry(C.BUBBLE_RADIUS, 20, 16);
    this.shardGeo = new THREE.TetrahedronGeometry(5, 0);
    this.sparkGeo = makeStarGeo(7, 2.8);
    this.ringGeo = new THREE.RingGeometry(5, 8.5, 24);
    this.matCache = {};

    this.buildLights();
    this.buildBackground(1);
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));

    // World mapping: board logical space (0..BOARD_W, 0..ROWS*ROW_H) -> XY plane, Z=0.
    // Camera looks straight at board along -Z.
    // 子はY反転(0..-boardH)で置かれるため、中心を原点に合わせるオフセットは「+boardH/2」
    this.boardGroup.position.set(-C.BOARD_W / 2, C.ROWS * C.ROW_H * 0.5, 0);
    // Pop shards, falling ghosts and sparks are all computed in the same board-logical
    // space via toScene(), so the particle group must carry the SAME offset as the board.
    // Without this they spawn shifted by (+BOARD_W/2, -ROWS*ROW_H/2) — off the bottom-right
    // (off-screen on mobile portrait), which hid the popcorn-chain and fall effects entirely.
    this.particleGroup.position.copy(this.boardGroup.position);

    this.buildLauncher();
    this.buildWalls();
    this.buildCeiling();
  }

  // Suspended ceiling that descends with ceilingOffsetRows. A metal beam sits just above
  // the top bubble row (grid row 0), the bubble mass "hangs" from it, and two hydraulic
  // rods telescope down from the fixed frame top so it reads as being lowered — instead of
  // the mass appearing to float in mid-air after a descent.
  BubbleExRenderer.prototype.buildCeiling = function () {
    var W = C.BOARD_W;
    var grp = new THREE.Group();
    var beamMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3e, metalness: 0.82, roughness: 0.34 });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(W + 26, 16, 16), beamMat);
    grp.add(beam);
    // glowing underside strip (matches the neon side rails)
    var trim = new THREE.Mesh(new THREE.BoxGeometry(W + 26, 3, 18),
      new THREE.MeshBasicMaterial({ color: 0x59c7ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    trim.position.y = -9;
    grp.add(trim);
    // downward teeth/hooks the bubbles hang off
    var hookMat = new THREE.MeshStandardMaterial({ color: 0x3a4152, metalness: 0.7, roughness: 0.4 });
    var nHooks = C.COLS;
    for (var i = 0; i < nHooks; i++) {
      var hook = new THREE.Mesh(new THREE.ConeGeometry(4, 11, 4), hookMat);
      hook.rotation.x = Math.PI; // point down
      hook.position.set(-W / 2 + (i + 0.5) * (W / nHooks), -13, 0);
      grp.add(hook);
    }
    grp.position.set(C.BOARD_W / 2, 0, -2); // x-centered in board-local; y set per frame
    this.ceilingBeamGroup = grp;
    this.boardGroup.add(grp);

    // Telescoping hydraulic rods from the fixed frame top down to the beam.
    this.ceilingRods = [];
    var rodMat = new THREE.MeshStandardMaterial({ color: 0x5a6274, metalness: 0.85, roughness: 0.3 });
    var rodXs = [-W * 0.34, W * 0.34];
    for (var k = 0; k < rodXs.length; k++) {
      var rod = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1, 8), rodMat); // unit height, scaled in Y
      rod.userData.rx = rodXs[k];
      rod.position.z = -4;
      this.ceilingRods.push(rod);
      this.boardGroup.add(rod);
    }
  };

  // Position the descending ceiling for the current vertical offset (oy = physical px).
  BubbleExRenderer.prototype.updateCeiling = function (oy) {
    if (!this.ceilingBeamGroup) return;
    var beamY = -oy + 7; // scene-local: just above grid row 0 (which renders at -(20+oy))
    this.ceilingBeamGroup.position.y = beamY;
    var topAnchor = (C.ROWS * C.ROW_H) / 2 + 60; // fixed, off the top of the frame
    var botY = beamY + 8; // top face of the beam
    for (var i = 0; i < this.ceilingRods.length; i++) {
      var rod = this.ceilingRods[i];
      var len = Math.max(1, topAnchor - botY);
      rod.position.set(C.BOARD_W / 2 + rod.userData.rx, (topAnchor + botY) / 2, -4);
      rod.scale.y = len;
    }
  };

  // Neon side rails drawn exactly at the ball-CENTER reflection line (board x = r and
  // BOARD_W - r). The shot bounces when its center reaches these lines, so putting a
  // visible wall there makes the aim guide read as reflecting off a real edge instead
  // of "slightly before the frame". Purely cosmetic (additive glow), in board space.
  BubbleExRenderer.prototype.buildWalls = function () {
    var r = C.BUBBLE_RADIUS;
    var h = C.ROWS * C.ROW_H + 80;
    var yc = -(C.ROWS * C.ROW_H) / 2 + C.CELL / 2; // vertical center of the board span (scene-local)
    var mkRail = function (localX) {
      var g = new THREE.Group();
      var core = new THREE.Mesh(
        new THREE.BoxGeometry(3, h, 3),
        new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      var glow = new THREE.Mesh(
        new THREE.BoxGeometry(11, h, 3),
        new THREE.MeshBasicMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      g.add(glow); g.add(core);
      g.position.set(localX, yc, 1);
      return g;
    };
    this.wallL = mkRail(r);
    this.wallR = mkRail(C.BOARD_W - r);
    this.boardGroup.add(this.wallL);
    this.boardGroup.add(this.wallR);
  };

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

    // Loaded bubble sitting in the cannon mouth + small NEXT bubble waiting beside it.
    this.loadedMesh = new THREE.Mesh(this.geo, this.matFor('red'));
    this.loadedMesh.visible = false;
    this.boardGroup.add(this.loadedMesh);
    this.nextWaitMesh = new THREE.Mesh(this.geo, this.matFor('blue'));
    this.nextWaitMesh.visible = false;
    this.boardGroup.add(this.nextWaitMesh);
    this.lastCurrent = null;
    this.reloadT = 10; // large = reload animation finished

    // Aim guide: dashed line, always drawn on top (depthTest off + max renderOrder)
    // so it never sinks into the floor plane, with additive glow.
    var lineMat = new THREE.LineDashedMaterial({
      color: 0xaffdff,
      dashSize: 7,
      gapSize: 5,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.renderOrder = 999;
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
      var tWallX = Infinity;
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

  // Loaded bubble in the cannon mouth + waiting NEXT bubble, with a
  // spin-in reload animation whenever the loaded color changes.
  BubbleExRenderer.prototype.updateCannonBubbles = function (state, launchPos, dt) {
    if (!this.loadedMesh) return;
    var p = this.toScene(launchPos.x, launchPos.y);
    var mouth = { x: p.x, y: p.y + 30, z: 10 };
    var wait = { x: p.x + 48, y: p.y - 2, z: 10 };
    var inPlay = state.status === 'aiming' || state.status === 'flying' || state.status === 'resolving' || state.status === 'title';
    if (!inPlay) {
      this.loadedMesh.visible = false;
      this.nextWaitMesh.visible = false;
      return;
    }
    // NEXT waiting bubble (small)
    this.nextWaitMesh.visible = true;
    if (this.nextWaitMesh.userData.color !== state.next) {
      this.nextWaitMesh.material = this.matFor(state.next);
      this.nextWaitMesh.userData.color = state.next;
    }

    if (state.shot) {
      // Ball is in flight: mouth is empty, next waits.
      this.loadedMesh.visible = false;
      this.nextWaitMesh.position.set(wait.x, wait.y, wait.z);
      this.nextWaitMesh.scale.setScalar(0.55);
      this.hadShot = true;
      return;
    }
    // Reload animation after every settled shot (even same color), and on first show.
    // hadShot covers the render-observed flight; triggerReload() (from the game's
    // 'snap' event) covers headless/frame-skipped settles deterministically.
    if (this.hadShot || this.lastCurrent === null) {
      this.hadShot = false;
      this.reloadT = 0;
    }
    this.lastCurrent = state.current;
    if (this.loadedMesh.userData.color !== state.current) {
      this.loadedMesh.material = this.matFor(state.current);
      this.loadedMesh.userData.color = state.current;
    }
    this.loadedMesh.visible = true;
    var DUR = 0.28;
    if (this.reloadT < DUR) {
      this.reloadT += dt;
      var k = Math.min(1, this.reloadT / DUR);
      var e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      // Loaded bubble swings from the waiting slot into the mouth with a full spin.
      this.loadedMesh.position.set(
        wait.x + (mouth.x - wait.x) * e,
        wait.y + (mouth.y - wait.y) * e + Math.sin(e * Math.PI) * 14,
        mouth.z
      );
      this.loadedMesh.scale.setScalar(0.55 + 0.45 * e);
      this.loadedMesh.rotation.z = (1 - e) * Math.PI * 2;
      // Fresh NEXT pops up into the waiting slot.
      this.nextWaitMesh.position.set(wait.x, wait.y, wait.z);
      this.nextWaitMesh.scale.setScalar(0.55 * e);
    } else {
      var pulse = 1 + Math.sin(this.clock * 3.1) * 0.03;
      this.loadedMesh.position.set(mouth.x, mouth.y, mouth.z);
      this.loadedMesh.scale.setScalar(pulse);
      this.loadedMesh.rotation.z = 0;
      this.nextWaitMesh.position.set(wait.x, wait.y, wait.z);
      this.nextWaitMesh.scale.setScalar(0.55);
    }
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
    this.camBaseZ = dist * 1.05;
    this.camera.position.set(0, 0, this.camBaseZ);
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

  // Project board-logical coords to canvas CSS pixels (for DOM score popups).
  BubbleExRenderer.prototype.projectToScreen = function (lx, ly) {
    var v = new THREE.Vector3(lx - C.BOARD_W / 2, C.ROWS * C.ROW_H * 0.5 - ly, 0);
    v.project(this.camera);
    var w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
  };

  BubbleExRenderer.prototype.syncBoard = function (state, wobble) {
    var seen = {};
    var t = this.clock;
    // The board slides down by ceilingOffsetRows; bubbles keep their grid cells but
    // render (and collide, per game.js) at cellY + this offset. Pop/drop particles are
    // emitted with the offset already baked into their y, so they stay aligned.
    var oy = (state.ceilingOffsetRows || 0) * C.ROW_H;
    state.cells.forEach((cell) => {
      var kk = cell.row * 64 + cell.col;
      seen[kk] = true;
      var wx = GH.cellX(cell.row, cell.col);
      var wy = GH.cellY(cell.row) + oy;
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

  // Kick the cannon reload animation (called on the game's 'snap' event).
  BubbleExRenderer.prototype.triggerReload = function () {
    this.reloadT = 0;
    this.hadShot = false;
  };

  BubbleExRenderer.prototype.shake = function (dur, amp) {
    this.shakeT = dur;
    this.shakeDur = dur;
    this.shakeAmp = amp;
  };

  // ---- Popcorn-chain pop sequence -----------------------------------------
  // cells arrive in BFS order from the landing cell; each bubble expands for
  // 40ms then bursts, staggered ~35ms apart, outward from the impact point.
  var POP_STAGGER = 0.035;
  var POP_EXPAND = 0.04;

  BubbleExRenderer.prototype.spawnPopSequence = function (cells, opts) {
    opts = opts || {};
    var seq = { t: 0, cells: [], opts: opts, done: 0 };
    var self = this;
    cells.forEach(function (cell, i) {
      var pos = self.toScene(cell.x, cell.y);
      var ghost = new THREE.Mesh(self.geo, self.matFor(cell.color));
      ghost.position.set(pos.x, pos.y, 0);
      self.particleGroup.add(ghost);
      seq.cells.push({
        ghost: ghost,
        color: cell.color,
        x: pos.x, y: pos.y,
        expandAt: i * POP_STAGGER,
        idx: i,
        bursted: false
      });
    });
    this.popSeqs.push(seq);
  };

  BubbleExRenderer.prototype.updatePopSeqs = function (dt) {
    for (var s = this.popSeqs.length - 1; s >= 0; s--) {
      var seq = this.popSeqs[s];
      seq.t += dt;
      for (var i = 0; i < seq.cells.length; i++) {
        var cell = seq.cells[i];
        if (cell.bursted) continue;
        var local = seq.t - cell.expandAt;
        if (local < 0) continue;
        if (local < POP_EXPAND) {
          // 40ms expansion to 1.15x before bursting
          cell.ghost.scale.setScalar(1 + 0.15 * (local / POP_EXPAND));
        } else {
          this.burstCell(cell, seq.opts);
          cell.bursted = true;
          seq.done++;
        }
      }
      if (seq.done >= seq.cells.length) this.popSeqs.splice(s, 1);
    }
  };

  BubbleExRenderer.prototype.burstCell = function (cell, opts) {
    var hex = COLOR_HEX[cell.color] || 0xffffff;
    var escalated = (opts.total || 0) >= 5;
    this.particleGroup.remove(cell.ghost);

    // Glossy 3D shards of the bubble shell (6-8, more when escalated)
    var nShards = 6 + Math.floor(Math.random() * 3) + (escalated ? 3 : 0);
    for (var i = 0; i < nShards; i++) {
      var mat = new THREE.MeshStandardMaterial({
        color: hex, emissive: hex, emissiveIntensity: 0.25,
        roughness: 0.15, metalness: 0.3, transparent: true
      });
      var mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.position.set(cell.x, cell.y, 2);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6);
      this.particleGroup.add(mesh);
      var ang = (i / nShards) * Math.PI * 2 + Math.random() * 0.5;
      var speed = 100 + Math.random() * 110;
      this.particles.push({
        mesh: mesh,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed + 40,
        vz: (Math.random() - 0.5) * 60,
        spin: (Math.random() - 0.5) * 12,
        life: 0, maxLife: 0.55 + Math.random() * 0.2
      });
    }

    // White flash ring at the center (additive, always on top)
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide
    });
    var ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(cell.x, cell.y, 4);
    ring.renderOrder = 900;
    this.particleGroup.add(ring);
    this.particles.push({ mesh: ring, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, maxLife: 0.22, growTo: 3.4 });

    // Colored star sparks (+rainbow ones when escalated)
    var nSparks = 3 + Math.floor(Math.random() * 2) + (escalated ? 3 : 0);
    for (var j = 0; j < nSparks; j++) {
      var sparkHex = (escalated && j >= 3) ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)] : hex;
      var sparkMat = new THREE.MeshBasicMaterial({
        color: sparkHex, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide
      });
      var spark = new THREE.Mesh(this.sparkGeo, sparkMat);
      spark.position.set(cell.x, cell.y, 5);
      spark.renderOrder = 901;
      spark.scale.setScalar(0.5 + Math.random() * 0.6);
      this.particleGroup.add(spark);
      var sAng = Math.random() * Math.PI * 2;
      var sSpeed = 130 + Math.random() * 120;
      this.particles.push({
        mesh: spark,
        vx: Math.cos(sAng) * sSpeed,
        vy: Math.sin(sAng) * sSpeed + 30,
        vz: 0,
        spin: (Math.random() - 0.5) * 16,
        life: 0, maxLife: 0.45 + Math.random() * 0.15
      });
    }

    if (escalated) this.shake(0.18, 5);
    if (opts.onBurst) {
      try { opts.onBurst(cell.idx, cell); } catch (e) { console.error('onBurst error', e); }
    }
  };

  // ---- Physics fall for detached (dropped) clusters ------------------------
  // Visual only: logic already removed them from the grid. Gravity ~1800 logical
  // px/s^2; each bubble gets a small random initial velocity and tumble.
  var FALL_GRAVITY = 1800;

  BubbleExRenderer.prototype.spawnFallingCluster = function (cells) {
    var self = this;
    cells.forEach(function (cell) {
      var pos = self.toScene(cell.x, cell.y);
      var mesh = new THREE.Mesh(self.geo, self.matFor(cell.color));
      mesh.position.set(pos.x, pos.y, 0);
      self.particleGroup.add(mesh);
      self.fallGhosts.push({
        mesh: mesh,
        startY: pos.y,
        vx: (Math.random() - 0.5) * 70,
        vy: 20 + Math.random() * 50, // slight upward kick (scene +y), gravity takes over
        spinX: (Math.random() - 0.5) * 6,
        spinZ: (Math.random() - 0.5) * 6
      });
    });
  };

  BubbleExRenderer.prototype.updateFallGhosts = function (dt) {
    var bottomY = -(C.ROWS * C.ROW_H + 180); // below launcher, past screen bottom
    for (var i = this.fallGhosts.length - 1; i >= 0; i--) {
      var g = this.fallGhosts[i];
      g.vy -= FALL_GRAVITY * dt; // scene y up; falling = decreasing
      g.mesh.position.x += g.vx * dt;
      g.mesh.position.y += g.vy * dt;
      g.mesh.rotation.x += g.spinX * dt;
      g.mesh.rotation.z += g.spinZ * dt;
      if (g.mesh.position.y < bottomY) {
        // Tiny sparkle as it vanishes off-screen
        for (var j = 0; j < 3; j++) {
          var mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide
          });
          var star = new THREE.Mesh(this.sparkGeo, mat);
          star.position.copy(g.mesh.position);
          star.position.y = bottomY + 8;
          star.renderOrder = 901;
          star.scale.setScalar(0.35 + Math.random() * 0.3);
          this.particleGroup.add(star);
          this.particles.push({
            mesh: star,
            vx: (Math.random() - 0.5) * 80,
            vy: 60 + Math.random() * 60,
            vz: 0,
            spin: (Math.random() - 0.5) * 10,
            life: 0, maxLife: 0.35
          });
        }
        this.particleGroup.remove(g.mesh);
        this.fallGhosts.splice(i, 1);
      }
    }
  };

  BubbleExRenderer.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particleGroup.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      var k = p.life / p.maxLife;
      if (p.growTo) {
        // Flash ring: expand + fade, no motion
        var s = 1 + (p.growTo - 1) * k;
        p.mesh.scale.setScalar(s);
        p.mesh.material.opacity = 0.9 * (1 - k);
        continue;
      }
      p.vy -= 260 * dt; // light gravity on debris
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt * 0.7;
      p.mesh.scale.setScalar(Math.max(0.05, p.mesh.scale.x * (1 - dt * 1.2)));
      if (p.mesh.material) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = 1 - k;
      }
    }
  };

  BubbleExRenderer.prototype.updateBackground = function (dt) {
    if (this._floor) this._floor.rotation.z += dt * 0.03;
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
    this.updatePopSeqs(dt);
    this.updateFallGhosts(dt);
    this.syncBoard(state, true);
    this.updateCeiling((state.ceilingOffsetRows || 0) * C.ROW_H);
    this.syncShot(state.shot);
    if (launchPos) {
      this.updateLauncher(launchPos, state.aimDeg);
      this.updateAimLine(launchPos, state.aimDeg, showAim && !state.shot);
      this.updateCannonBubbles(state, launchPos, dt);
    }
    // Camera shake (translation-only jitter, decaying)
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      var f = this.shakeT / this.shakeDur;
      var amp = this.shakeAmp * f;
      this.camera.position.set((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp, this.camBaseZ);
    } else {
      this.camera.position.set(0, 0, this.camBaseZ);
    }
    // Two-pass render to GUARANTEE the stage background sits strictly behind every
    // foreground object. The tilted floor plane is large enough that its near edge would
    // otherwise poke forward past the play plane (Z=0) and occlude bottom bubbles / the
    // loaded ball. Pass 1 draws only the background; we then wipe the depth buffer so
    // pass 2 (board + particles + aim) always paints on top regardless of Z overlap.
    var r = this.renderer;
    this.boardGroup.visible = false;
    this.particleGroup.visible = false;
    this.stageBgGroup.visible = true;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    this.boardGroup.visible = true;
    this.particleGroup.visible = true;
    this.stageBgGroup.visible = false;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    this.stageBgGroup.visible = true;
    r.autoClear = true;
  };

  window.BubbleExRenderer = BubbleExRenderer;
  window.BubbleExColorHex = COLOR_HEX;
})();
