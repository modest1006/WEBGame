(function () {
  'use strict';

  const COURSE_LOOKAHEAD = 8;
  const MAX_RING_SPACING = 250;
  const VIEW_SPAN = COURSE_LOOKAHEAD * MAX_RING_SPACING + 400;
  const CAMERA_NEAR = Math.max(.1, VIEW_SPAN / 10000);
  const CAMERA_FAR = VIEW_SPAN;
  const FOG_NEAR = VIEW_SPAN * .38;
  const FOG_FAR = VIEW_SPAN * .92;

  function colorMaterial(color, roughness, emissive) {
    return new THREE.MeshStandardMaterial({
      color:new THREE.Color(color),
      roughness:roughness == null ? .72 : roughness,
      metalness:.03,
      emissive:emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
      emissiveIntensity:emissive ? .32 : 0
    });
  }

  function setObjectFacing(mesh, forward) {
    const normal = new THREE.Vector3(forward.x, forward.y, forward.z).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }

  function disposeObject(object) {
    object.traverse(function (node) {
      if (node.geometry && node.geometry.dispose) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) {
          for (let i = 0; i < node.material.length; i++) node.material[i].dispose();
        } else if (node.material.dispose) node.material.dispose();
      }
    });
  }

  function PropellaRenderer(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x74c9ef);
    this.scene.fog = new THREE.Fog(0xa8def2, FOG_NEAR, FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(66, 1, CAMERA_NEAR, CAMERA_FAR);
    this.renderer = new THREE.WebGLRenderer({
      canvas:canvas,
      antialias:true,
      alpha:false,
      preserveDrawingBuffer:true,
      powerPreference:'high-performance'
    });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setClearColor(0x75caef, 1);
    this.renderer.shadowMap.enabled = false;

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.ringGroup = new THREE.Group();
    this.balloonGroup = new THREE.Group();
    this.islandGroup = new THREE.Group();
    this.cloudGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.world.add(this.islandGroup, this.cloudGroup, this.ringGroup, this.balloonGroup, this.effectGroup);

    this.ringMeshes = {};
    this.balloonMeshes = {};
    this.islandMeshes = {};
    this.cloudMeshes = {};
    this.effects = [];
    this.clock = 0;
    this.oceanTick = 0;
    this.shake = 0;
    this.fov = 66;
    this.forward = new THREE.Vector3();
    this.tempVector = new THREE.Vector3();

    this.buildLights();
    this.buildOcean();
    this.buildSkyDecor();
    this.resize();
    this.boundResize = this.resize.bind(this);
    window.addEventListener('resize', this.boundResize);
  }

  PropellaRenderer.prototype.buildLights = function () {
    this.scene.add(new THREE.HemisphereLight(0xeafaff, 0x3d8193, 1.15));
    const sun = new THREE.DirectionalLight(0xfff1bd, 1.45);
    sun.position.set(-620, 850, 430);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8bd7ff, .5);
    fill.position.set(400, 180, -500);
    this.scene.add(fill);
  };

  PropellaRenderer.prototype.buildOcean = function () {
    const size = VIEW_SPAN * 1.75;
    const segments = 56;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.oceanBase = new Float32Array(geometry.attributes.position.array);
    const material = new THREE.MeshPhongMaterial({
      color:0x187dac,
      specular:0x9fe7ff,
      shininess:64,
      flatShading:true,
      transparent:false
    });
    this.ocean = new THREE.Mesh(geometry, material);
    this.ocean.position.y = PropellaGame.constants.SEA_Y;
    this.world.add(this.ocean);
  };

  PropellaRenderer.prototype.buildSkyDecor = function () {
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(28, 16, 10),
      new THREE.MeshBasicMaterial({ color:0xfff2a8, transparent:true, opacity:.95, fog:false })
    );
    sunDisc.position.set(-620, 850, 430);
    this.scene.add(sunDisc);

    const hazeGeometry = new THREE.PlaneGeometry(VIEW_SPAN * 1.2, 160);
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color:0xe7f7f2,
      transparent:true,
      opacity:.32,
      depthWrite:false,
      fog:false
    });
    this.haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
    this.haze.visible = false;
    this.scene.add(this.haze);
  };

  PropellaRenderer.prototype.resize = function () {
    const width = this.canvas.clientWidth || window.innerWidth || 1;
    const height = this.canvas.clientHeight || window.innerHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  PropellaRenderer.prototype.makeRing = function (ring) {
    const group = new THREE.Group();
    const color = ring.gold ? 0xffd342 : 0xff7044;
    const glow = ring.gold ? 0xffa500 : 0xff3b1f;
    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(ring.radius, ring.gold ? 2.5 : 2.05, 10, 52),
      new THREE.MeshStandardMaterial({
        color:color,
        emissive:glow,
        emissiveIntensity:ring.gold ? 1.05 : .72,
        roughness:.28,
        metalness:.25
      })
    );
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(ring.radius - 2.8, .28, 6, 52),
      new THREE.MeshBasicMaterial({ color:0xfff4bd, transparent:true, opacity:.9 })
    );
    group.add(outer, inner);
    if (ring.gold) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 14, 170, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color:0xffdf62,
          transparent:true,
          opacity:.1,
          depthWrite:false,
          side:THREE.DoubleSide
        })
      );
      pillar.rotation.x = Math.PI / 2;
      group.add(pillar);
      for (let i = 0; i < 5; i++) {
        const star = new THREE.Mesh(
          new THREE.OctahedronGeometry(.7 + i * .08, 0),
          new THREE.MeshBasicMaterial({ color:0xfff09b })
        );
        const angle = i / 5 * Math.PI * 2;
        star.position.set(Math.cos(angle) * (ring.radius + 5), Math.sin(angle) * (ring.radius + 5), 0);
        group.add(star);
      }
    }
    group.userData.ring = ring;
    group.position.set(ring.position.x, ring.position.y, ring.position.z);
    setObjectFacing(group, ring.forward);
    return group;
  };

  PropellaRenderer.prototype.makeBalloon = function (balloon) {
    const group = new THREE.Group();
    const envelope = new THREE.Mesh(
      new THREE.SphereGeometry(balloon.radius, 14, 10),
      colorMaterial(balloon.color, .62, balloon.color)
    );
    envelope.scale.y = 1.18;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(balloon.radius * .72, .7, 6, 18),
      colorMaterial('#f3d28a', .8)
    );
    band.rotation.x = Math.PI / 2;
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 3.2, 4.2),
      colorMaterial('#7b4b2a', .9)
    );
    basket.position.y = -balloon.radius * 1.52;
    const ropeMaterial = new THREE.LineBasicMaterial({ color:0x59412b });
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -2.5 : 2.5;
      const sz = i % 2 ? -2.5 : 2.5;
      const points = [
        new THREE.Vector3(sx, -balloon.radius * .65, sz),
        new THREE.Vector3(sx * .68, -balloon.radius * 1.4, sz * .68)
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ropeMaterial));
    }
    group.add(envelope, band, basket);
    group.position.set(balloon.position.x, balloon.position.y, balloon.position.z);
    group.userData.baseY = balloon.position.y;
    return group;
  };

  PropellaRenderer.prototype.makeIsland = function (mountain) {
    const group = new THREE.Group();
    const beach = new THREE.Mesh(
      new THREE.CylinderGeometry(mountain.beach, mountain.beach * 1.08, 3, 18),
      colorMaterial('#e6c477', .95)
    );
    beach.position.y = 1.2;
    const green = new THREE.Mesh(
      new THREE.ConeGeometry(mountain.radius, mountain.height, 16),
      colorMaterial('#4f9950', .88)
    );
    green.position.y = mountain.height * .5 + PropellaGame.constants.SEA_Y;
    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(mountain.radius * .48, mountain.height * .44, 16),
      colorMaterial('#80674e', .92)
    );
    peak.position.y = mountain.height * .78 + PropellaGame.constants.SEA_Y;
    group.add(beach, green, peak);
    group.position.set(mountain.x, 0, mountain.z);
    group.rotation.y = (mountain.id * 1.77) % (Math.PI * 2);
    return group;
  };

  PropellaRenderer.prototype.makeCloud = function (cloud) {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({
      color:0xffffff,
      transparent:true,
      opacity:.88,
      depthWrite:false
    });
    const count = 7;
    for (let i = 0; i < count; i++) {
      const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(cloud.radius * (.32 + (i % 3) * .07), 1), material);
      const angle = i / count * Math.PI * 2;
      sphere.position.set(
        Math.cos(angle) * cloud.radius * .45,
        (i % 2 ? .12 : -.06) * cloud.radius,
        Math.sin(angle) * cloud.radius * .32
      );
      sphere.scale.y = .75;
      group.add(sphere);
    }
    group.position.set(cloud.position.x, cloud.position.y, cloud.position.z);
    return group;
  };

  PropellaRenderer.prototype.syncCollection = function (items, meshes, group, make, active) {
    const seen = {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (active && !active(item)) continue;
      seen[item.id] = true;
      if (!meshes[item.id]) {
        meshes[item.id] = make.call(this, item);
        group.add(meshes[item.id]);
      }
    }
    for (const id in meshes) {
      if (!seen[id]) {
        group.remove(meshes[id]);
        disposeObject(meshes[id]);
        delete meshes[id];
      }
    }
  };

  PropellaRenderer.prototype.syncWorld = function (game) {
    this.syncCollection(game.rings, this.ringMeshes, this.ringGroup, this.makeRing, function (ring) {
      return ring.status === 'active';
    });
    this.syncCollection(game.balloons, this.balloonMeshes, this.balloonGroup, this.makeBalloon, function (balloon) {
      return balloon.alive;
    });
    this.syncCollection(game.mountains, this.islandMeshes, this.islandGroup, this.makeIsland);
    this.syncCollection(game.clouds, this.cloudMeshes, this.cloudGroup, this.makeCloud);
  };

  PropellaRenderer.prototype.makeBurst = function (options) {
    const count = options.count || 32;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const origin = options.position;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - .5) * (options.spreadY == null ? 1 : options.spreadY);
      const radius = Math.sqrt(Math.random());
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const speed = (options.speed || 22) * (.45 + Math.random() * .85);
      velocities[i * 3] = Math.cos(angle) * speed * radius;
      velocities[i * 3 + 1] = elevation * speed + (options.rise || 0);
      velocities[i * 3 + 2] = Math.sin(angle) * speed * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color:new THREE.Color(options.color || '#ffffff'),
      size:options.size || 2.2,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:options.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    this.effectGroup.add(points);
    this.effects.push({
      object:points,
      velocities:velocities,
      life:options.life || .9,
      maxLife:options.life || .9,
      gravity:options.gravity == null ? 8 : options.gravity,
      kind:options.kind || 'burst'
    });
  };

  PropellaRenderer.prototype.makeBalloonFragments = function (data) {
    const group = new THREE.Group();
    group.position.set(data.position.x, data.position.y, data.position.z);
    const pieces = [];
    for (let i = 0; i < 11; i++) {
      const piece = new THREE.Mesh(
        new THREE.TetrahedronGeometry(1.2 + Math.random() * 1.4, 0),
        new THREE.MeshBasicMaterial({ color:new THREE.Color(data.color), transparent:true, opacity:1 })
      );
      const angle = Math.random() * Math.PI * 2;
      piece.userData.velocity = new THREE.Vector3(Math.cos(angle) * (12 + Math.random() * 18), 8 + Math.random() * 16, Math.sin(angle) * (12 + Math.random() * 18));
      piece.userData.spin = new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5);
      pieces.push(piece);
      group.add(piece);
    }
    this.effectGroup.add(group);
    this.effects.push({ object:group, pieces:pieces, life:1.15, maxLife:1.15, gravity:25, kind:'fragments' });
  };

  PropellaRenderer.prototype.handleEvent = function (type, data) {
    if (type === 'ring') {
      this.makeBurst({
        position:data.position,
        count:data.gold ? 82 : 48,
        speed:data.gold ? 38 : 29,
        rise:data.gold ? 12 : 3,
        color:data.gold ? '#ffd84c' : '#ff6a39',
        size:data.gold ? 3.4 : 2.6,
        life:data.gold ? 1.25 : .82,
        additive:true,
        gravity:data.gold ? 4 : 7
      });
      this.shake = Math.max(this.shake, data.gold ? .22 : .1);
    } else if (type === 'balloon') {
      this.makeBalloonFragments(data);
      this.makeBurst({ position:data.position, count:32, speed:34, color:'#fff0bd', size:2.2, life:.65, gravity:13 });
      this.shake = Math.max(this.shake, .28);
    } else if (type === 'mountain') {
      this.makeBurst({ position:data.position, count:44, speed:30, rise:12, color:'#d7bd81', size:3, life:1.05, gravity:18 });
      this.shake = Math.max(this.shake, 1.15);
    } else if (type === 'seaSkim') {
      this.makeBurst({ position:{ x:data.position.x, y:PropellaGame.constants.SEA_Y + 1, z:data.position.z }, count:8, speed:13, rise:16, color:'#d9f7ff', size:2.2, life:.5, gravity:24 });
    } else if (type === 'cloud') {
      this.makeBurst({ position:data.position, count:55, speed:23, color:'#ffffff', size:5.5, life:.75, gravity:0 });
    }
  };

  PropellaRenderer.prototype.updateOcean = function (game) {
    this.oceanTick++;
    const position = this.ocean.geometry.attributes.position;
    const array = position.array;
    for (let i = 0; i < array.length; i += 3) {
      const x = this.oceanBase[i];
      const z = this.oceanBase[i + 2];
      array[i + 1] = Math.sin((x + this.clock * 28) * .026) * .62 +
        Math.cos((z - this.clock * 21) * .031) * .46;
    }
    position.needsUpdate = true;
    if (this.oceanTick % 18 === 0) this.ocean.geometry.computeVertexNormals();
    this.ocean.position.x = Math.round(game.position.x / 200) * 200;
    this.ocean.position.z = Math.round(game.position.z / 200) * 200;
  };

  PropellaRenderer.prototype.updateEffects = function (dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.life -= dt;
      if (effect.kind === 'fragments') {
        for (let j = 0; j < effect.pieces.length; j++) {
          const piece = effect.pieces[j];
          const velocity = piece.userData.velocity;
          piece.position.addScaledVector(velocity, dt);
          velocity.y -= effect.gravity * dt;
          piece.rotation.x += piece.userData.spin.x * dt;
          piece.rotation.y += piece.userData.spin.y * dt;
          piece.rotation.z += piece.userData.spin.z * dt;
          piece.material.opacity = Math.max(0, effect.life / effect.maxLife);
        }
      } else {
        const attribute = effect.object.geometry.attributes.position;
        const positions = attribute.array;
        for (let j = 0; j < positions.length; j += 3) {
          positions[j] += effect.velocities[j] * dt;
          positions[j + 1] += effect.velocities[j + 1] * dt;
          positions[j + 2] += effect.velocities[j + 2] * dt;
          effect.velocities[j + 1] -= effect.gravity * dt;
        }
        attribute.needsUpdate = true;
        effect.object.material.opacity = Math.max(0, effect.life / effect.maxLife);
      }
      if (effect.life <= 0) {
        this.effectGroup.remove(effect.object);
        disposeObject(effect.object);
        this.effects.splice(i, 1);
      }
    }
  };

  PropellaRenderer.prototype.updateAnimatedObjects = function () {
    for (const id in this.ringMeshes) {
      const ring = this.ringMeshes[id];
      const gold = ring.userData.ring && ring.userData.ring.gold;
      ring.scale.setScalar(1 + Math.sin(this.clock * (gold ? 5 : 3) + Number(id)) * (gold ? .045 : .025));
      if (gold) {
        for (let i = 2; i < ring.children.length; i++) {
          if (ring.children[i].geometry && ring.children[i].geometry.type === 'OctahedronGeometry') {
            ring.children[i].rotation.y += .035;
            ring.children[i].rotation.x += .022;
          }
        }
      }
    }
    for (const id in this.balloonMeshes) {
      const balloon = this.balloonMeshes[id];
      balloon.position.y = balloon.userData.baseY + Math.sin(this.clock * 1.1 + Number(id)) * 2.2;
      balloon.rotation.y = Math.sin(this.clock * .35 + Number(id)) * .12;
    }
    for (const id in this.cloudMeshes) {
      this.cloudMeshes[id].rotation.y += .0004;
    }
  };

  PropellaRenderer.prototype.render = function (game, dtMs) {
    const dt = Math.min(Math.max(Number(dtMs) || 16.7, 0), 100) / 1000;
    this.clock += dt;
    this.syncWorld(game);
    this.updateOcean(game);
    this.updateEffects(dt);
    this.updateAnimatedObjects();

    this.shake *= Math.pow(.025, dt);
    const shakeX = (Math.random() - .5) * this.shake;
    const shakeY = (Math.random() - .5) * this.shake;
    const shakeZ = (Math.random() - .5) * this.shake;
    this.camera.position.set(game.position.x + shakeX, game.position.y + shakeY, game.position.z + shakeZ);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      game.pitch + shakeY * .005,
      game.yaw + Math.PI + shakeX * .004,
      -game.roll + shakeZ * .005
    );

    const multiplier = PropellaGame.comboMultiplier(game.combo);
    const targetFov = 66 + (multiplier - 1) * 1.15 + (game.boosting ? 5 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3.5);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
  };

  PropellaRenderer.prototype.projectTarget = function (position) {
    const world = new THREE.Vector3(position.x, position.y, position.z);
    const cameraSpace = world.clone();
    this.camera.worldToLocal(cameraSpace);
    const behind = cameraSpace.z > 0;
    const distanceToTarget = world.distanceTo(this.camera.position);
    const projected = world.project(this.camera);
    let x = projected.x;
    let y = projected.y;
    if (behind) { x = -x; y = -y; }
    const offscreen = behind || Math.abs(x) > .86 || Math.abs(y) > .75;
    if (offscreen) {
      const length = Math.sqrt(x * x + y * y) || 1;
      x /= length;
      y /= length;
    }
    return {
      x:x,
      y:y,
      behind:behind,
      offscreen:offscreen,
      angle:Math.atan2(y, x),
      distance:distanceToTarget
    };
  };

  PropellaRenderer.prototype.destroy = function () {
    window.removeEventListener('resize', this.boundResize);
    this.renderer.dispose();
  };

  PropellaRenderer.constants = {
    VIEW_SPAN:VIEW_SPAN,
    CAMERA_NEAR:CAMERA_NEAR,
    CAMERA_FAR:CAMERA_FAR,
    FOG_NEAR:FOG_NEAR,
    FOG_FAR:FOG_FAR
  };
  window.PropellaRenderer = PropellaRenderer;
})();
