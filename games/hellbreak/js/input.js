(function () {
  'use strict';
  function HellbreakInput(game, actions, canvas) {
    this.game = game; this.actions = actions; this.canvas = canvas; this.keys = {}; this.touchMove = null; this.touchLook = null; this.stick = document.querySelector('#stick span'); this.install();
  }
  HellbreakInput.prototype.install = function () {
    const self = this;
    window.addEventListener('keydown', function (e) { try {
      const k = e.key.toLowerCase(); self.keys[k] = true;
      if ('wasd '.indexOf(k) >= 0) e.preventDefault();
      if (k === '1') self.game.selectWeapon('pistol');
      if (k === '2') self.game.selectWeapon('shotgun');
      if (k === '3') self.game.selectWeapon('chaingun');
      if (k === 'e' || k === ' ') self.game.setUse();
      if (k === 'r') self.actions.restart();
      if (k === 'm') self.actions.mute();
      if (k === 'escape') self.actions.pause();
      if (k === '`') self.actions.debug();
      self.actions.anyInput();
    } catch (err) { console.error('[keydown]', err); } });
    window.addEventListener('keyup', function (e) { try { self.keys[e.key.toLowerCase()] = false; } catch (err) { console.error('[keyup]', err); } });
    window.addEventListener('mousemove', function (e) { try { if (document.pointerLockElement === self.canvas) self.game.setTurn(e.movementX); } catch (err) { console.error('[mousemove]', err); } });
    this.canvas.addEventListener('click', function () { try { self.actions.anyInput(); self.game.start(); if (self.canvas.requestPointerLock) self.canvas.requestPointerLock(); self.game.setFire(true); setTimeout(function(){ self.game.setFire(false); }, 40); } catch (err) { console.error('[click]', err); } });
    window.addEventListener('mousedown', function (e) { try { if (e.button === 0) { self.actions.anyInput(); self.game.start(); self.game.setFire(true); } } catch (err) { console.error('[mousedown]', err); } });
    window.addEventListener('mouseup', function () { try { self.game.setFire(false); } catch (err) { console.error('[mouseup]', err); } });
    window.addEventListener('wheel', function (e) { try { self.game.cycleWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } catch (err) { console.error('[wheel]', err); } }, { passive: false });
    this.installTouch();
  };
  HellbreakInput.prototype.installTouch = function () {
    const self = this, stickBox = document.getElementById('stick'), fire = document.getElementById('fire-touch'), use = document.getElementById('use-touch');
    function local(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }
    stickBox.addEventListener('pointerdown', function (e) { try { e.preventDefault(); self.actions.anyInput(); self.touchMove = { id: e.pointerId }; stickBox.setPointerCapture(e.pointerId); } catch (err) { console.error('[stickdown]', err); } });
    stickBox.addEventListener('pointermove', function (e) { try { if (!self.touchMove || self.touchMove.id !== e.pointerId) return; const p = local(e, stickBox); const x = (p.x / p.w - .5) * 2, y = (p.y / p.h - .5) * 2; self.touchMove.x = Math.max(-1, Math.min(1, x)); self.touchMove.z = Math.max(-1, Math.min(1, -y)); self.stick.style.transform = 'translate(' + (self.touchMove.x*32) + 'px,' + (-self.touchMove.z*32) + 'px)'; } catch (err) { console.error('[stickmove]', err); } });
    function endMove(e) { if (self.touchMove && self.touchMove.id === e.pointerId) { self.touchMove = null; self.stick.style.transform = ''; } }
    stickBox.addEventListener('pointerup', endMove); stickBox.addEventListener('pointercancel', endMove);
    window.addEventListener('pointerdown', function (e) { try { if (e.clientX > innerWidth * .42 && e.target === self.canvas) { self.touchLook = { id: e.pointerId, x: e.clientX }; self.canvas.setPointerCapture(e.pointerId); } } catch (err) { console.error('[lookdown]', err); } });
    window.addEventListener('pointermove', function (e) { try { if (!self.touchLook || self.touchLook.id !== e.pointerId) return; self.game.setTurn((e.clientX - self.touchLook.x) * 1.7); self.touchLook.x = e.clientX; } catch (err) { console.error('[lookmove]', err); } });
    window.addEventListener('pointerup', function (e) { if (self.touchLook && self.touchLook.id === e.pointerId) self.touchLook = null; });
    fire.addEventListener('pointerdown', function (e) { e.preventDefault(); self.actions.anyInput(); self.game.start(); self.game.setFire(true); });
    fire.addEventListener('pointerup', function () { self.game.setFire(false); }); fire.addEventListener('pointercancel', function () { self.game.setFire(false); });
    use.addEventListener('click', function () { self.actions.anyInput(); self.game.setUse(); });
    document.getElementById('weapon-touch').addEventListener('click', function (e) { if (e.target.dataset.w) self.game.selectWeapon(e.target.dataset.w); });
  };
  HellbreakInput.prototype.update = function () {
    let x = 0, z = 0;
    if (this.keys.w) z += 1; if (this.keys.s) z -= 1; if (this.keys.a) x -= 1; if (this.keys.d) x += 1;
    if (this.touchMove) { x = this.touchMove.x || 0; z = this.touchMove.z || 0; }
    this.game.setMove(x, z);
  };
  window.HellbreakInput = HellbreakInput;
})();
