(function () {
  'use strict';

  function makeCanvasTexture(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    draw(g, c);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  function noFog(mat) {
    mat.fog = false;
    return mat;
  }

  function RollMazeRenderer(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x91a8d3, 36, 76);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x18274f, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.effects = [];
    this.trail = [];
    this.stageId = 0;
    this.meshes = {};
    this.clock = 0;
    this.cameraDistance = 0;
    this.cameraTarget = new THREE.Vector3();
    this.woodTex = makeCanvasTexture(function (g) {
      g.fillStyle = '#9b6133';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 55; i++) {
        g.strokeStyle = 'rgba(63,31,11,' + (0.10 + (i % 5) * 0.025) + ')';
        g.lineWidth = 1 + (i % 3);
        g.beginPath();
        const y = (i * 19) % 256;
        g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin((x + i * 13) * 0.045) * 8);
        g.stroke();
      }
    });
    this.padTex = {};
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
    this.buildLights();
    this.buildSky('#18274f');
  }

  RollMazeRenderer.prototype.resize = function () {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cameraDistance = 0;
  };

  RollMazeRenderer.prototype.buildLights = function () {
    const amb = new THREE.AmbientLight(0xffe2bd, 0.62);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffd39a, 1.35);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);
  };

  RollMazeRenderer.prototype.buildSky = function (color) {
    if (this.stars) this.scene.remove(this.stars);
    if (this.clouds) this.scene.remove(this.clouds);
    this.renderer.setClearColor(new THREE.Color(color), 1);
    this.scene.fog.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.42);
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 620; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 24;
      pos.push(Math.cos(a) * r, 4 + Math.random() * 18, Math.sin(a) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.055, transparent: true, opacity: 0.8 }));
    this.scene.add(this.stars);
    this.clouds = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xdde7ff, transparent: true, opacity: 0.16, depthWrite: false });
    for (let c = 0; c < 18; c++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
      m.scale.set(2 + Math.random() * 4, 0.16, 0.7 + Math.random() * 1.5);
      m.position.set(-13 + Math.random() * 26, -2.5 - Math.random() * 1.6, -9 + Math.random() * 18);
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);
  };

  RollMazeRenderer.prototype.clearBoard = function () {
    while (this.boardGroup.children.length) this.boardGroup.remove(this.boardGroup.children[0]);
    this.meshes = { walls: [], holes: [], pads: [], bars: [], checkpoints: [] };
    this.trail = [];
  };

  RollMazeRenderer.prototype.buildStage = function (game) {
    const s = game.stage;
    this.stageId = s.def.id;
    this.cameraDistance = 0;
    this.clearBoard();
    this.buildSky(s.def.sky);
    const tileMat = noFog(new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0xb8783d, roughness: 0.46, metalness: 0.03 }));
    const wallMat = noFog(new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0xd09957, roughness: 0.42 }));
    const voidMat = noFog(new THREE.MeshStandardMaterial({ color: 0x5d371d, roughness: 0.5 }));
    const tileGeo = new THREE.BoxGeometry(0.98, 0.16, 0.98);
    const wallGeo = new THREE.BoxGeometry(1, 0.62, 1);
    for (let z = 0; z < s.h; z++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.cells[z][x] || ' ';
        if (ch === ' ') continue;
        const wx = x - s.w / 2 + 0.5;
        const wz = z - s.h / 2 + 0.5;
        if (ch !== '#') {
          const tile = new THREE.Mesh(tileGeo, tileMat);
          tile.receiveShadow = true;
          tile.position.set(wx, -0.08, wz);
          if (ch === 'I') tile.material = noFog(new THREE.MeshStandardMaterial({ color: 0x9bd8e7, roughness: 0.08, metalness: 0.18, transparent: true, opacity: 0.88 }));
          this.boardGroup.add(tile);
        } else {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.castShadow = wall.receiveShadow = true;
          wall.position.set(wx, 0.23, wz);
          this.boardGroup.add(wall);
          this.meshes.walls.push(wall);
        }
      }
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.5, 0.22, 0.16), voidMat);
    lip.position.set(0, -0.03, -s.h / 2 - 0.1);
    lip.receiveShadow = true;
    this.boardGroup.add(lip, lip.clone());
    this.boardGroup.children[this.boardGroup.children.length - 1].position.z = s.h / 2 + 0.1;
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, s.h + 0.5), voidMat);
    side.position.set(-s.w / 2 - 0.1, -0.03, 0);
    this.boardGroup.add(side, side.clone());
    this.boardGroup.children[this.boardGroup.children.length - 1].position.x = s.w / 2 + 0.1;
    this.addMarkers(game);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 18), noFog(new THREE.MeshStandardMaterial({ color: 0x36d8ff, emissive: 0x0a6f9a, emissiveIntensity: 0.25, roughness: 0.16, metalness: 0.5, envMapIntensity: 0.7 })));
    this.ball.castShadow = true;
    this.boardGroup.add(this.ball);
    this.ballRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 42), noFog(new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.5, depthWrite: false })));
    this.ballRing.rotation.x = Math.PI / 2;
    this.boardGroup.add(this.ballRing);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailLine = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xdff7ff, transparent: true, opacity: 0.45 }));
    this.boardGroup.add(this.trailLine);
  };

  RollMazeRenderer.prototype.arrowTexture = function (key) {
    if (this.padTex[key]) return this.padTex[key];
    const tex = makeCanvasTexture(function (g, c) {
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(62,190,255,0.18)';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#dff8ff';
      g.lineWidth = 18;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      if (key === '>') { g.moveTo(68, 128); g.lineTo(180, 128); g.lineTo(140, 88); g.moveTo(180, 128); g.lineTo(140, 168); }
      if (key === '<') { g.moveTo(188, 128); g.lineTo(76, 128); g.lineTo(116, 88); g.moveTo(76, 128); g.lineTo(116, 168); }
      if (key === '^') { g.moveTo(128, 188); g.lineTo(128, 76); g.lineTo(88, 116); g.moveTo(128, 76); g.lineTo(168, 116); }
      if (key === 'v') { g.moveTo(128, 68); g.lineTo(128, 180); g.lineTo(88, 140); g.moveTo(128, 180); g.lineTo(168, 140); }
      g.stroke();
    });
    this.padTex[key] = tex;
    return tex;
  };

  RollMazeRenderer.prototype.addMarkers = function (game) {
    const s = game.stage;
    const holeMat = noFog(new THREE.MeshBasicMaterial({ color: 0x030306 }));
    for (let i = 0; i < s.holes.length; i++) {
      const h = s.holes[i];
      const m = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r * 0.72, 0.025, 38), holeMat);
      m.position.set(h.x, 0.015, h.z);
      this.boardGroup.add(m);
      this.meshes.holes.push(m);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(h.r, 0.035, 8, 36), noFog(new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.35 })));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(h.x, 0.035, h.z);
      this.boardGroup.add(rim);
    }
    for (let p = 0; p < s.pads.length; p++) {
      const pad = s.pads[p];
      const key = pad.dx > 0 ? '>' : pad.dx < 0 ? '<' : pad.dz < 0 ? '^' : 'v';
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), noFog(new THREE.MeshBasicMaterial({ map: this.arrowTexture(key), transparent: true, depthWrite: false })));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pad.x, 0.035, pad.z);
      this.boardGroup.add(mesh);
      this.meshes.pads.push(mesh);
    }
    const goal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 36), noFog(new THREE.MeshStandardMaterial({ color: 0x55ffd4, emissive: 0x36ffd3, emissiveIntensity: 1.45 })));
    goal.position.set(s.goal.x, 0.06, s.goal.z);
    this.boardGroup.add(goal);
    const goalGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.025, 40), noFog(new THREE.MeshBasicMaterial({ color: 0x7dffdf, transparent: true, opacity: 0.28, depthWrite: false })));
    goalGlow.position.set(s.goal.x, 0.08, s.goal.z);
    this.boardGroup.add(goalGlow);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), noFog(new THREE.MeshStandardMaterial({ color: 0xf4e7c1 })));
    pole.position.set(s.goal.x + 0.22, 0.42, s.goal.z);
    this.boardGroup.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.26), noFog(new THREE.MeshBasicMaterial({ color: 0xffdf5d, side: THREE.DoubleSide })));
    flag.position.set(s.goal.x + 0.45, 0.62, s.goal.z);
    this.boardGroup.add(flag);
    this.meshes.goal = goal;
    for (let c = 0; c < s.checkpoints.length; c++) {
      const cp = s.checkpoints[c];
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 24), noFog(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x498cff, emissiveIntensity: 0.35 })));
      base.position.set(cp.x, 0.04, cp.z);
      this.boardGroup.add(base);
      this.meshes.checkpoints.push(base);
    }
    for (let b = 0; b < s.bars.length; b++) {
      const bar = s.bars[b];
      const bm = new THREE.Mesh(new THREE.BoxGeometry(bar.len, 0.22, bar.thick), noFog(new THREE.MeshStandardMaterial({ color: 0x8a4a2d, roughness: 0.35 })));
      bm.position.set(bar.x, 0.24, bar.z);
      bm.castShadow = true;
      this.boardGroup.add(bm);
      this.meshes.bars.push(bm);
    }
  };

  RollMazeRenderer.prototype.handleEvent = function (type, data) {
    if (type === 'fall') this.effects.push({ type: 'suck', t: 0, x: data.x || 0, z: data.z || 0 });
    if (type === 'goal') this.spawnConfetti();
    if (type === 'pad') this.effects.push({ type: 'line', t: 0, x: data.x, z: data.z, dx: data.dx, dz: data.dz });
    if (type === 'checkpoint') this.effects.push({ type: 'pulse', t: 0, x: data.x, z: data.z });
  };

  RollMazeRenderer.prototype.spawnConfetti = function () {
    const geo = new THREE.BufferGeometry();
    const pos = [], col = [];
    for (let i = 0; i < 150; i++) {
      pos.push((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      const c = new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.08, vertexColors: true }));
    if (this.meshes.goal) pts.position.copy(this.meshes.goal.position);
    this.boardGroup.add(pts);
    this.effects.push({ type: 'confetti', t: 0, mesh: pts });
  };

  RollMazeRenderer.prototype.updateEffects = function (dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt / 1000;
      if (e.mesh && e.type === 'confetti') {
        e.mesh.rotation.y += dt * 0.0015;
        e.mesh.position.y -= dt * 0.00025;
      }
      if (e.t > 1.4) {
        if (e.mesh) this.boardGroup.remove(e.mesh);
        this.effects.splice(i, 1);
      }
    }
  };

  RollMazeRenderer.prototype.getBoardFitCorners = function (stage) {
    const pad = 0.45;
    const xs = [-stage.w / 2 - pad, stage.w / 2 + pad];
    const zs = [-stage.h / 2 - pad, stage.h / 2 + pad];
    const ys = [-0.22, 1.1];
    const out = [];
    for (let xi = 0; xi < xs.length; xi++) {
      for (let yi = 0; yi < ys.length; yi++) {
        for (let zi = 0; zi < zs.length; zi++) {
          out.push(this.boardGroup.localToWorld(new THREE.Vector3(xs[xi], ys[yi], zs[zi])));
        }
      }
    }
    return out;
  };

  RollMazeRenderer.prototype.fitCameraDistance = function (stage, targetWorld, cameraDir) {
    const forward = cameraDir.clone().multiplyScalar(-1).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(forward, worldUp);
    if (right.lengthSq() < 0.0001) right = new THREE.Vector3(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const tanH = tanV * this.camera.aspect;
    const corners = this.getBoardFitCorners(stage);
    let halfW = 0;
    let halfH = 0;
    for (let i = 0; i < corners.length; i++) {
      const o = corners[i].clone().sub(targetWorld);
      halfW = Math.max(halfW, Math.abs(o.dot(right)));
      halfH = Math.max(halfH, Math.abs(o.dot(up)));
    }
    const fill = 1.12; // 平面近似では奥行き分の目減りがあるため実測合わせで強め（0.88だと実占有67%だった）
    const byWidth = halfW / (tanH * fill);
    const byHeight = halfH / (tanV * fill);
    return Math.max(Math.max(byWidth, byHeight) + 0.35, 6);
  };

  RollMazeRenderer.prototype.getCameraTargetLocal = function (st) {
    const boardW = st.board.w;
    const boardH = st.board.h;
    const maxX = boardW * 0.5 * 0.13;
    const maxZ = boardH * 0.5 * 0.13;
    const x = THREE.MathUtils.clamp(st.ball.x * 0.12, -maxX, maxX);
    const z = THREE.MathUtils.clamp(st.ball.z * 0.12, -maxZ, maxZ);
    return new THREE.Vector3(x, 0.12, z);
  };

  RollMazeRenderer.prototype.render = function (game, dt) {
    if (this.stageId !== game.stage.def.id) this.buildStage(game);
    this.clock += (dt || 16.7) / 1000;
    const st = game.getState();
    this.boardGroup.rotation.x = st.tilt.x;
    this.boardGroup.rotation.z = -st.tilt.z;
    this.ball.position.set(st.ball.x, st.ball.y, st.ball.z);
    this.ball.rotation.x = st.ball.spinX;
    this.ball.rotation.z = st.ball.spinZ;
    if (this.ballRing) {
      this.ballRing.position.set(st.ball.x, 0.035, st.ball.z);
      this.ballRing.scale.setScalar(1 + Math.sin(this.clock * 8) * 0.08);
    }
    this.trail.push([st.ball.x, Math.max(0.04, st.ball.y - 0.16), st.ball.z]);
    if (this.trail.length > 42) this.trail.shift();
    const pts = [];
    for (let i = 0; i < this.trail.length; i++) pts.push(this.trail[i][0], this.trail[i][1], this.trail[i][2]);
    this.trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    if (this.meshes.goal) this.meshes.goal.scale.setScalar(1 + Math.sin(this.clock * 5) * 0.06);
    for (let b = 0; b < game.stage.bars.length; b++) {
      const bar = game.stage.bars[b];
      this.meshes.bars[b].rotation.y = game.timeMs / 1000 * bar.speed + bar.phase;
    }
    this.updateEffects(dt || 16.7);
    const orbit = st.mode === 'goal' ? this.clock * 1.4 : -0.14;
    const cameraDir = new THREE.Vector3(Math.sin(orbit), 0.72, Math.cos(orbit)).normalize();
    const targetLocal = this.getCameraTargetLocal(st);
    const targetWorld = this.boardGroup.localToWorld(targetLocal.clone());
    const fitDist = this.fitCameraDistance(game.stage, targetWorld, cameraDir);
    const distLerp = this.cameraDistance > 0 ? 0.1 : 1;
    this.cameraDistance = THREE.MathUtils.lerp(this.cameraDistance || fitDist, fitDist, distLerp);
    const cam = targetWorld.clone().add(cameraDir.multiplyScalar(this.cameraDistance));
    this.cameraTarget.lerp(targetWorld, this.cameraTarget.lengthSq() > 0 ? 0.12 : 1);
    this.camera.position.lerp(cam, 0.12);
    this.camera.lookAt(this.cameraTarget);
    if (this.scene.fog) {
      this.scene.fog.near = this.cameraDistance + 8;
      this.scene.fog.far = this.cameraDistance + 42;
    }
    if (this.stars) this.stars.rotation.y += 0.00004 * (dt || 16.7);
    this.renderer.render(this.scene, this.camera);
  };

  window.RollMazeRenderer = RollMazeRenderer;
})();
