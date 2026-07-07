(function () {
  'use strict';

  function mat(color) { return new THREE.MeshLambertMaterial({ color: color }); }
  function OneManRenderer(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud || {};
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1800);
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x9fc5de, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.clock = 0;
    this.drawCalls = 0;
    this.lastShot = 'COCKPIT';
    this.build();
    this.resize();
  }

  OneManRenderer.prototype.resize = function () {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  OneManRenderer.prototype.build = function () {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5b6a70, 1.2);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.2);
    sun.position.set(80, 120, 90);
    this.scene.add(sun);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), new THREE.MeshBasicMaterial({ color: 0xb8d9ee, side: THREE.BackSide }));
    this.scene.add(sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat(0x7f9274));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    this.scene.add(ground);

    const ballast = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 760), mat(0x686d70));
    ballast.position.set(0, 0.03, -220);
    this.scene.add(ballast);
    const railMat = mat(0x2b3034);
    for (let x of [-0.82, 0.82]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 780), railMat);
      r.position.set(x, 0.23, -220);
      this.scene.add(r);
    }
    const sleeperMat = mat(0x4c3829);
    for (let z = 70; z > -690; z -= 4.8) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 0.38), sleeperMat);
      s.position.set(0, 0.12, z);
      this.scene.add(s);
    }

    const platform = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 62), mat(0x9b948a));
    platform.position.set(5.3, 0.55, 0);
    this.scene.add(platform);
    const stopLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 5.8), mat(0xffffff));
    stopLine.position.set(1.95, 1.13, 0);
    this.scene.add(stopLine);
    const signPole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), mat(0xeeeeee));
    signPole.position.set(2.35, 1.8, 0.8);
    this.scene.add(signPole);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), mat(0xffffff));
    sign.position.set(2.35, 2.55, 0.8);
    this.scene.add(sign);
    this.sign = sign;

    this.train = new THREE.Group();
    this.scene.add(this.train);
    const bodyMat = mat(0xf4f2e8), stripeMat = mat(0xb94825), winMat = new THREE.MeshBasicMaterial({ color: 0x243746 });
    for (let i = 0; i < 2; i++) {
      const car = new THREE.Group();
      car.position.z = i * 20.5;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.55, 18.5), bodyMat);
      body.position.y = 1.65; car.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.32, 18.7), stripeMat);
      stripe.position.set(0, 1.7, 0); car.add(stripe);
      for (let z = -6; z <= 6; z += 3) {
        for (let side of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 1.45), winMat);
          w.position.set(side * 1.49, 2.05, z); car.add(w);
        }
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.25, 0.08), winMat);
      front.position.set(0, 2.0, -9.3); car.add(front);
      this.train.add(car);
    }
    this.cab = new THREE.Group();
    this.scene.add(this.cab);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.6), mat(0x2b2d31));
    desk.position.set(0, 0.58, 1.25); this.cab.add(desk);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 0.16), mat(0x1a1c20));
    frameTop.position.set(0, 2.55, 2.25); this.cab.add(frameTop);
    for (let x of [-2.25, 2.25]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.16), mat(0x1a1c20));
      p.position.set(x, 1.45, 2.25); this.cab.add(p);
    }
  };

  OneManRenderer.prototype.render = function (game, dtMs) {
    this.clock += (dtMs || 16) / 1000;
    const s = game.getState();
    const trainZ = -s.dist;
    this.train.position.set(0, 0.2, trainZ);
    if (s.shot === 'SIDE_STOP') {
      this.camera.position.set(10.5, 3.0, trainZ - 4.5);
      this.camera.lookAt(new THREE.Vector3(0, 1.4, -1));
      this.cab.visible = false;
      this.train.visible = true;
    } else {
      const shake = Math.min(0.025, s.kmh / 3600);
      this.camera.position.set(Math.sin(this.clock * 21) * shake, 2.2 + Math.sin(this.clock * 17) * shake, trainZ - 7.8);
      this.camera.lookAt(new THREE.Vector3(0, 1.45, trainZ + 92));
      this.cab.position.set(0, 0.0, trainZ - 8.2);
      this.cab.visible = true;
      this.train.visible = false;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.syncHud(s);
  };

  OneManRenderer.prototype.syncHud = function (s) {
    const h = this.hud;
    if (!h.speedNeedle) return;
    h.speedText.textContent = Math.round(s.kmh).toString().padStart(3, '0');
    h.speedNeedle.style.transform = 'rotate(' + (-126 + Math.min(120, s.kmh) / 120 * 252).toFixed(1) + 'deg)';
    if (s.dist < 0) {
      h.distText.textContent = '過走 ' + Math.abs(s.dist).toFixed(1) + 'm';
      h.distText.parentElement.classList.add('overrun');
    } else {
      h.distText.textContent = 'のこり ' + s.dist.toFixed(0).padStart(3, ' ') + 'm';
      h.distText.parentElement.classList.remove('overrun');
    }
    const final = s.dist >= 1 ? s.dist.toFixed(2) + 'm' : Math.max(0, s.dist * 100).toFixed(0) + 'cm';
    h.finalCounter.textContent = final;
    h.finalCounter.className = s.dist < 2 ? 'danger' : s.dist < 6 ? 'warn' : '';
    h.finalCounter.parentElement.classList.toggle('show', s.phase === 'FINAL' || s.phase === 'STOPPED' || s.phase === 'STATION_RESULT');
    h.phase.textContent = s.phase;
    h.notch.textContent = s.notchName;
    h.eff.textContent = s.effectiveBrake.toFixed(2);
    h.grade.textContent = s.gradePermille.toFixed(1) + '‰';
    const y = 8 + s.notch * 9.15;
    h.leverKnob.style.top = y + '%';
    h.leverKnob.style.transform = 'translate(-50%, -50%) rotate(' + (s.notch - 4.5) * 2.2 + 'deg)';
    h.lever.querySelectorAll('.notch').forEach(function (n, i) { n.classList.toggle('active', i === s.notch); });
    h.dimension.classList.toggle('show', s.dimensionFlash > 0 || s.phase === 'STATION_RESULT');
    if (s.result) {
      h.dimensionValue.textContent = (s.result.errorM >= 0 ? '+' : '-') + Math.round(Math.abs(s.result.errorM) * 100) + 'cm';
      h.resultTitle.textContent = s.result.rank;
      h.resultBody.textContent = '誤差 ' + Math.round(s.result.errorM * 100) + 'cm / ' + s.result.score + '点';
    } else {
      h.dimensionValue.textContent = '';
      h.resultTitle.textContent = '';
      h.resultBody.textContent = '';
    }
    h.result.classList.toggle('show', s.phase === 'STATION_RESULT' || s.phase === 'FINAL_RESULT');
    h.overlay.className = s.transition.type + (s.transition.t < 1 ? ' show' : '');
    h.overlay.style.opacity = s.transition.type === 'fade' ? String(Math.sin((1 - s.transition.t) * Math.PI)) : String(Math.max(0, 1 - s.transition.t));
  };
  OneManRenderer.prototype.handleEvent = function () {};

  window.OneManRenderer = OneManRenderer;
})();
