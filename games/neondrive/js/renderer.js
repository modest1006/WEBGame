class NeonDriveRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 1280;
    this.h = 720;
    this.dpr = 1;
    this.frame = 0;
    this.events = [];
    this.particles = [];
    this.boostFlash = 0;
    this.resize();
  }

  resize() {
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.floor(rect.width));
    this.h = Math.max(240, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  handleEvent(type, data) {
    if (type === 'nearmiss') {
      this.events.push({ type, text: `NEAR MISS +${data.bonus}`, x: this.w * (0.5 + data.side * 0.22), y: this.h * 0.45, life: 1, max: 1 });
      for (let i = 0; i < 18; i++) this.particles.push({ x: this.w * 0.5 + data.side * this.w * 0.16, y: this.h * 0.75, vx: data.side * (70 + Math.random() * 220), vy: -90 - Math.random() * 220, life: 0.35 + Math.random() * 0.35, color: '#67f8ff' });
    }
    if (type === 'checkpoint') this.events.push({ type, text: `CHECKPOINT +${data.bonus}s`, x: this.w * 0.5, y: this.h * 0.28, life: 1.4, max: 1.4 });
    if (type === 'boost') {
      this.boostFlash = 0.15;
      this.events.push({ type, text: 'BOOST', x: this.w * 0.5, y: this.h * 0.62, life: 0.85, max: 0.85 });
    }
    if (type === 'crash') {
      this.events.push({ type, text: 'CRASH -4.5s', x: this.w * 0.5, y: this.h * 0.42, life: 1.1, max: 1.1 });
      for (let i = 0; i < 38; i++) this.particles.push({ x: this.w * 0.5, y: this.h * 0.76, vx: -240 + Math.random() * 480, vy: -260 + Math.random() * 170, life: 0.4 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ff3bd7' : '#ffd45f' });
    }
  }

  project(seg, camX, camY, camZ, camDepth, roadWidth, curveOffset, hillOffset) {
    const dz = Math.max(0.1, seg.z - camZ);
    const scale = camDepth / (dz + camDepth);
    const horizon = this.h * 0.54;
    const bottom = this.h * 0.99;
    const hill = ((seg.y + hillOffset) - camY) * scale * this.h * 0.09;
    const x = this.w * 0.5 + scale * (curveOffset - camX) * this.w * 0.5;
    const y = horizon + (bottom - horizon) * scale - hill;
    const w = scale * roadWidth * this.w * 0.34;
    return { x, y, w, scale, dz };
  }

  render(game, dtMs) {
    const ctx = this.ctx;
    const dt = Math.min(0.05, dtMs / 1000);
    this.frame += dt;
    const s = game.getSnapshot();
    const boost = game.boostTime > 0 ? 1 : 0;
    const speedT = ndClamp(game.speed / ND.physics.boostMaxSpeed, 0, 1);
    const shake = (game.shake + game.offroad * 0.5 + (speedT > 0.74 ? 0.12 : 0)) * 8;
    ctx.save();
    ctx.clearRect(0, 0, this.w, this.h);
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    this.drawSky(ctx, game, speedT, boost);
    const road = this.drawRoad(ctx, game, speedT, boost);
    this.drawTraffic(ctx, game, road, boost);
    this.drawSpeedLines(ctx, speedT, boost);
    this.drawPlayer(ctx, game, road, boost);
    this.drawParticles(ctx, dt);
    this.drawPopups(ctx, dt);
    if (boost) this.drawChromatic(ctx);
    this.drawBoostFlash(ctx, dt);
    if (game.slowmo > 0) this.drawCrashVignette(ctx, game.slowmo);
    ctx.restore();
  }

  drawSky(ctx, game, speedT, boost) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#070516');
    g.addColorStop(0.42, '#18072d');
    g.addColorStop(1, '#0b0617');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    const par = game.distance * 0.01;
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 90; i++) {
      const x = ndWrap(i * 137.3 - par * (1 + (i % 5) * 0.15), this.w);
      const y = 18 + (i * 71) % (this.h * 0.38);
      ctx.globalAlpha = 0.35 + (i % 7) * 0.08;
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;

    const sunX = this.w * 0.5 + Math.sin(game.distance * 0.0007) * this.w * 0.04;
    const sunY = this.h * 0.29;
    const sunR = Math.min(this.w, this.h) * 0.16;
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sg.addColorStop(0, '#fff06d');
    sg.addColorStop(0.45, '#ff5fb7');
    sg.addColorStop(1, 'rgba(255,55,195,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let y = sunY - sunR * 0.75; y < sunY + sunR; y += 13) {
      ctx.fillRect(sunX - sunR - 2, y, sunR * 2 + 4, 5);
    }
    ctx.restore();

    this.drawMountains(ctx, game.distance, 0.18, '#24104b', this.h * 0.45);
    this.drawMountains(ctx, game.distance, 0.35, '#120c32', this.h * 0.51);
    this.drawGrid(ctx, game.distance, speedT, boost);
  }

  drawMountains(ctx, dist, parallax, color, baseY) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    const offset = ndWrap(dist * parallax * 0.06, 240);
    for (let x = -240; x <= this.w + 240; x += 80) {
      const h = 35 + ((x + offset) * 17 % 70 + 70) % 70;
      ctx.lineTo(x + offset, baseY - h);
      ctx.lineTo(x + offset + 80, baseY);
    }
    ctx.lineTo(this.w, this.h); ctx.lineTo(0, this.h); ctx.fill();
  }

  drawGrid(ctx, dist, speedT, boost) {
    const horizon = this.h * 0.53;
    ctx.strokeStyle = boost ? 'rgba(112,249,255,.42)' : 'rgba(255,48,219,.26)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const y = horizon + Math.pow(t, 1.95) * this.h * 0.5 + ndWrap(dist * (0.018 + speedT * 0.02), 28);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
    }
    for (let i = -11; i <= 11; i++) {
      const x = this.w * 0.5 + i * this.w * 0.065;
      ctx.beginPath(); ctx.moveTo(this.w * 0.5, horizon); ctx.lineTo(x, this.h); ctx.stroke();
    }
  }

  drawRoad(ctx, game, speedT, boost) {
    const segs = game.getForwardSegments(ND.road.drawDistance);
    const baseIndex = Math.floor(game.distance / ND.road.segmentLength);
    const camZ = game.distance - baseIndex * ND.road.segmentLength;
    const camX = game.playerX * ND.road.roadWidth * 0.5;
    const camY = ND.road.cameraHeight;
    const camDepth = 74 * ndLerp(1.08, 0.72, speedT) * (boost ? 0.82 : 1);
    let x = 0, dx = 0;
    const projected = [];
    for (let n = 0; n < segs.length; n++) {
      const seg = segs[n];
      const p = this.project({ z: n * ND.road.segmentLength + camZ, y: seg.y }, camX, camY, 0, camDepth, ND.road.roadWidth, x, 0);
      p.world = seg;
      p.n = n;
      x += dx;
      dx += seg.curve * 0.05;
      projected.push(p);
    }
    for (let n = projected.length - 2; n >= 0; n--) {
      const p1 = projected[n], p2 = projected[n + 1];
      const q1 = p1.y > this.h ? Object.assign({}, p1, { y: this.h }) : p1;
      const q2 = p2.y > this.h ? Object.assign({}, p2, { y: this.h }) : p2;
      if (q1.y < 0 && q2.y < 0) continue;
      const band = Math.floor((baseIndex + n) * (boost ? 1.85 : 1) / ND.road.rumbleLength) % 2;
      const roadColor = band ? '#21142f' : '#2d1840';
      const shoulder = band ? '#ff2bd1' : '#62f6ff';
      this.poly(ctx, q1.x - q1.w * 1.28, q1.y, q1.x - q1.w, q1.y, q2.x - q2.w, q2.y, q2.x - q2.w * 1.28, q2.y, shoulder);
      this.poly(ctx, q1.x + q1.w, q1.y, q1.x + q1.w * 1.28, q1.y, q2.x + q2.w * 1.28, q2.y, q2.x + q2.w, q2.y, shoulder);
      this.poly(ctx, q1.x - q1.w, q1.y, q1.x + q1.w, q1.y, q2.x + q2.w, q2.y, q2.x - q2.w, q2.y, roadColor);
      const laneW1 = q1.w * 2 / ND.road.laneCount;
      const laneW2 = q2.w * 2 / ND.road.laneCount;
      if (band) {
        for (let l = 1; l < ND.road.laneCount; l++) {
          const lx1 = q1.x - q1.w + laneW1 * l;
          const lx2 = q2.x - q2.w + laneW2 * l;
          this.poly(ctx, lx1 - q1.w * 0.018, q1.y, lx1 + q1.w * 0.018, q1.y, lx2 + q2.w * 0.018, q2.y, lx2 - q2.w * 0.018, q2.y, '#f8fbff');
        }
      }
      if (p1.world.checkpoint && n < 80) this.drawGate(ctx, q1, q2);
      if (n % 7 === 0) this.drawRoadside(ctx, q1, q2, p1.world.propSeed, boost);
    }
    return projected;
  }

  poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  }

  drawGate(ctx, p1, p2) {
    ctx.save();
    ctx.strokeStyle = '#76fbff';
    ctx.shadowColor = '#ff38d4';
    ctx.shadowBlur = 14;
    ctx.lineWidth = Math.max(2, p2.w * 0.025);
    ctx.beginPath();
    ctx.moveTo(p2.x - p2.w * 1.35, p2.y);
    ctx.lineTo(p2.x - p2.w * 1.2, p2.y - p2.w * 0.7);
    ctx.lineTo(p2.x + p2.w * 1.2, p2.y - p2.w * 0.7);
    ctx.lineTo(p2.x + p2.w * 1.35, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  drawRoadside(ctx, p1, p2, seed, boost) {
    const side = seed < 0.5 ? -1 : 1;
    const x = p2.x + side * p2.w * (1.55 + (seed * 2 % 1) * 0.9);
    const y = p2.y;
    const scale = p2.scale * this.w;
    if (scale < 1 || y > this.h + 20) return;
    ctx.save();
    if (boost) {
      ctx.globalAlpha = 0.16;
      ctx.translate(x, y + scale * 0.1);
      ctx.scale(1, 1.25);
      ctx.fillStyle = '#66f7ff';
      ctx.fillRect(-scale * 0.035, -scale * 0.22, scale * 0.07, scale * 0.24);
      ctx.restore();
      ctx.save();
    }
    ctx.translate(x, y);
    ctx.globalAlpha = ndClamp(p2.scale * 44, 0.12, 0.95);
    ctx.shadowBlur = boost ? 18 : 10;
    if (seed % 0.31 < 0.14) {
      ctx.strokeStyle = '#60f7ff'; ctx.shadowColor = '#60f7ff'; ctx.lineWidth = Math.max(1, scale * 0.012);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -scale * 0.22); ctx.stroke();
      ctx.fillStyle = '#ff3bd7'; ctx.shadowColor = '#ff3bd7';
      ctx.fillRect(-scale * 0.075, -scale * 0.33, scale * 0.15, scale * 0.07);
    } else {
      ctx.strokeStyle = '#31ffd2'; ctx.shadowColor = '#31ffd2'; ctx.lineWidth = Math.max(1, scale * 0.01);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * scale * 0.04, -scale * 0.12, 0, -scale * 0.25); ctx.stroke();
      ctx.strokeStyle = '#ff38d4'; ctx.shadowColor = '#ff38d4';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(0, -scale * 0.25); ctx.quadraticCurveTo(i * scale * 0.045, -scale * 0.32, i * scale * 0.09, -scale * 0.28); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawTraffic(ctx, game, road, boost) {
    const cars = game.cars.slice().sort((a, b) => b.z - a.z);
    const colors = { cyan: '#55f7ff', magenta: '#ff39d3', yellow: '#ffe66b', blue: '#5a7dff', white: '#f8fbff' };
    for (const car of cars) {
      const dz = car.z - game.distance;
      if (dz < 1 || dz > ND.road.drawDistance * ND.road.segmentLength) continue;
      const idx = Math.min(road.length - 1, Math.max(1, Math.floor(dz / ND.road.segmentLength)));
      const p = road[idx];
      if (!p) continue;
      const x = p.x + car.x * p.w;
      const y = p.y;
      const w = Math.max(7, p.w * 0.48);
      const h = w * 0.52;
      const lateral = Math.abs(car.x - game.playerX);
      const warning = dz < 25 && lateral < 0.46;
      ctx.save();
      ctx.globalAlpha = ndClamp(1.3 - dz / 700, 0.25, 1);
      ctx.shadowColor = colors[car.color] || '#fff';
      ctx.shadowBlur = warning ? 28 + Math.sin(this.frame * 28) * 10 : car.near ? 24 : boost ? 18 : 10;
      if (warning) {
        ctx.fillStyle = 'rgba(255,32,72,.28)';
        ctx.beginPath();
        ctx.ellipse(x, y - h * 0.25, w * 0.9, h * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (car.near) {
        ctx.strokeStyle = 'rgba(255,238,92,.85)';
        ctx.lineWidth = Math.max(2, w * 0.045);
        ctx.beginPath();
        ctx.ellipse(x, y - h * 0.18, w * 0.68, h * 0.58, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (game.speed > 100 && dz < 80) {
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(x - w * 0.35, y - h * 0.45, w * 0.7, h * 2.8);
      }
      ctx.fillStyle = colors[car.color] || '#fff';
      ctx.beginPath();
      ctx.moveTo(x - w * 0.55, y);
      ctx.lineTo(x - w * 0.34, y - h * 0.55);
      ctx.lineTo(x + w * 0.34, y - h * 0.55);
      ctx.lineTo(x + w * 0.55, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#080617';
      ctx.fillRect(x - w * 0.23, y - h * 0.48, w * 0.46, h * 0.18);
      ctx.fillStyle = car.dir < 0 ? '#ffd86a' : '#ff255f';
      ctx.fillRect(x - w * 0.44, y - h * 0.08, w * 0.18, h * 0.08);
      ctx.fillRect(x + w * 0.26, y - h * 0.08, w * 0.18, h * 0.08);
      ctx.restore();
    }
  }

  drawSpeedLines(ctx, speedT, boost) {
    if (speedT < 0.38) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const count = Math.floor(18 + speedT * 44 + boost * 90);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side < 0 ? Math.random() * this.w * 0.23 : this.w - Math.random() * this.w * 0.23;
      const y = Math.random() * this.h;
      const len = (70 + Math.random() * 220) * speedT * (boost ? 2.1 : 1);
      ctx.strokeStyle = i % 3 === 0 ? `rgba(255,52,210,${boost ? .62 : .34})` : `rgba(93,246,255,${boost ? .58 : .32})`;
      ctx.lineWidth = (1 + Math.random() * 2) * (boost ? 1.45 : 1);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - side * len, y + len * 0.12); ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx, game, road, boost) {
    const targetY = this.h * 0.84;
    let row = road && road[1];
    if (road && road.length) {
      for (const p of road) {
        if (!row || Math.abs(p.y - targetY) < Math.abs(row.y - targetY)) row = p;
      }
    }
    const x = row ? row.x + game.playerX * row.w : this.w * 0.5 + game.playerX * this.w * 0.19;
    const y = row ? ndClamp(row.y, this.h * 0.72, this.h * 0.9) : targetY;
    const steerLean = game.steerInput * 0.12 - game.getSegmentAt(game.distance).curve * 48;
    const w = Math.min(this.w, this.h) * 0.19;
    const h = w * 0.48;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steerLean);
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#66f7ff';
    if (boost) {
      ctx.fillStyle = 'rgba(93,246,255,.42)';
      ctx.beginPath(); ctx.moveTo(-w * 0.34, h * 0.38); ctx.lineTo(0, h * 1.6 + Math.random() * 46); ctx.lineTo(w * 0.34, h * 0.38); ctx.fill();
      ctx.fillStyle = 'rgba(255,57,211,.38)';
      ctx.beginPath(); ctx.moveTo(-w * 0.16, h * 0.35); ctx.lineTo(0, h * 1.18 + Math.random() * 28); ctx.lineTo(w * 0.16, h * 0.35); ctx.fill();
    }
    ctx.fillStyle = '#111126';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.18); ctx.lineTo(-w * 0.32, -h * 0.22); ctx.lineTo(0, -h * 0.42); ctx.lineTo(w * 0.32, -h * 0.22); ctx.lineTo(w * 0.5, h * 0.18); ctx.lineTo(w * 0.33, h * 0.35); ctx.lineTo(-w * 0.33, h * 0.35); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff3bd7'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#68f8ff'; ctx.fillRect(-w * 0.18, -h * 0.25, w * 0.36, h * 0.18);
    ctx.fillStyle = '#ffe86d'; ctx.fillRect(-w * 0.42, h * 0.1, w * 0.14, h * 0.08); ctx.fillRect(w * 0.28, h * 0.1, w * 0.14, h * 0.08);
    if (game.spark > 0) {
      ctx.strokeStyle = '#ffd15f'; ctx.shadowColor = '#ffd15f';
      for (let i = 0; i < 8; i++) {
        const sx = Math.sign(game.playerX || 1) * w * 0.55;
        ctx.beginPath(); ctx.moveTo(sx, h * 0.2); ctx.lineTo(sx + Math.random() * 60 * Math.sign(game.playerX || 1), h * (Math.random() - 0.3)); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawParticles(ctx, dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 360 * dt;
      ctx.globalAlpha = ndClamp(p.life * 2.5, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.restore();
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawPopups(ctx, dt) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.max(18, this.w * 0.025)}px Orbitron, sans-serif`;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.events) {
      e.life -= dt;
      const t = ndClamp(e.life / e.max, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = e.type === 'crash' ? '#ff3868' : e.type === 'checkpoint' ? '#ffe66b' : '#69f8ff';
      ctx.shadowColor = '#ff39d3'; ctx.shadowBlur = 16;
      ctx.fillText(e.text, e.x, e.y - (1 - t) * 55);
    }
    ctx.restore();
    this.events = this.events.filter((e) => e.life > 0);
  }

  drawChromatic(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pulse = 1 + Math.sin(this.frame * 34) * 0.35;
    ctx.strokeStyle = 'rgba(255,50,210,.32)';
    ctx.lineWidth = 5 * pulse;
    ctx.strokeRect(8 - pulse * 2, 5, this.w - 16 + pulse * 4, this.h - 10);
    ctx.strokeStyle = 'rgba(93,246,255,.28)';
    ctx.strokeRect(18 + pulse * 2, 12, this.w - 36 - pulse * 4, this.h - 24);
    ctx.restore();
  }

  drawBoostFlash(ctx, dt) {
    if (this.boostFlash <= 0) return;
    this.boostFlash = Math.max(0, this.boostFlash - dt);
    const t = this.boostFlash / 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(220,255,255,${0.55 * t})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = `rgba(83,244,255,${0.35 * (1 - t)})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  drawCrashVignette(ctx, amount) {
    ctx.save();
    ctx.globalAlpha = ndClamp(amount, 0, 1) * 0.36;
    ctx.fillStyle = '#ff254d';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
}
