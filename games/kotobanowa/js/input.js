(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var active = null;
  var DRAG_DISTANCE = 22;
  var SAFETY_DISTANCE = 30;
  var SAFETY_PATH = 70;
  var FLICK_SPEED = 400;
  var FLICK_COS = Math.cos(35 * Math.PI / 180);
  var SPRING_K = 150;
  var SPRING_C = 9;
  var EDGE_RESTITUTION = 0.55;
  var PHYSICS_LIMIT_MS = 1500;
  var returnMotions = [];

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function draggableFor(target) {
    var element = target && target.closest ? target.closest("button[data-word]") : null;
    if (!element || element.disabled) { return null; }
    if (K.game.state.mode === "quiz" && element.classList.contains("choice-button")) {
      return { element: element, type: "choice", id: element.dataset.word };
    }
    if ((K.game.state.mode === "walk" || K.game.state.mode === "quest") &&
        element.classList.contains("neighbor-node")) {
      return { element: element, type: "word", id: element.dataset.word };
    }
    return null;
  }

  function setDragOffset(x, y) {
    if (!active || !active.element || !active.dragging) { return; }
    active.currentX = x; active.currentY = y;
    active.element.dataset.dragX = String(x);
    active.element.dataset.dragY = String(y);
    active.element.style.translate = x + "px " + y + "px";
    if (K.renderer.updateDragVisual) {
      K.renderer.updateDragVisual(active.id, active.element, active.hot);
    }
  }

  function follow() {
    if (!active) { return; }
    var factor = reducedMotion() ? 1 : 0.34;
    var x = active.currentX + (active.targetX - active.currentX) * factor;
    var y = active.currentY + (active.targetY - active.currentY) * factor;
    if (Math.abs(active.targetX - x) < 0.15) { x = active.targetX; }
    if (Math.abs(active.targetY - y) < 0.15) { y = active.targetY; }
    setDragOffset(x, y);
    if (x !== active.targetX || y !== active.targetY) {
      active.raf = requestAnimationFrame(follow);
    } else {
      active.raf = 0;
    }
  }

  function aimAt(x, y, magnet) {
    if (!active) { return; }
    active.targetX = active.baseX + x - active.startX;
    active.targetY = active.baseY + y - active.startY;
    if (magnet) {
      var target = centralTarget();
      if (target) {
        var nodeX = active.originX + active.targetX - active.baseX;
        var nodeY = active.originY + active.targetY - active.baseY;
        active.targetX += (target.x - nodeX) * 0.62;
        active.targetY += (target.y - nodeY) * 0.62;
      }
    }
    if (reducedMotion()) {
      setDragOffset(active.targetX, active.targetY);
    } else if (!active.raf) {
      active.raf = requestAnimationFrame(follow);
    }
  }

  function pushSample(x, y, time) {
    if (!active) { return; }
    active.samples.push({ x: x, y: y, time: time });
    var cutoff = time - 120;
    while (active.samples.length > 2 && active.samples[0].time < cutoff) { active.samples.shift(); }
  }

  function centralTarget() {
    var center = document.querySelector(".center-node");
    if (!center) { return null; }
    var rect = center.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: Math.max(rect.width, rect.height) / 2 * 1.3
    };
  }

  function updateDropCue(x, y) {
    if (!active || !active.dragging) { return false; }
    var center = document.querySelector(".center-node");
    var target = centralTarget();
    if (!center || !target) { return false; }
    var nodeX = active.originX + (x - active.startX);
    var nodeY = active.originY + (y - active.startY);
    var inside = Math.hypot(nodeX - target.x, nodeY - target.y) <= target.radius;
    if (inside && !active.hot) { K.audio.play("snap"); }
    active.hot = inside;
    if (K.renderer.setDragHot) { K.renderer.setDragHot(inside); }
    return inside;
  }

  function clearDropCue() {
    var center = document.querySelector(".center-node");
    if (center) { center.classList.remove("drop-ready", "drop-hot"); }
  }

  function velocityFrom(event) {
    if (event.__kotobaVelocity) { return event.__kotobaVelocity; }
    if (!active || active.samples.length < 2) { return { vx: 0, vy: 0 }; }
    var last = active.samples[active.samples.length - 1];
    var first = active.samples[0];
    var dt = Math.max(1, last.time - first.time);
    return { vx: (last.x - first.x) * 1000 / dt, vy: (last.y - first.y) * 1000 / dt };
  }

  function flicksToCenter(releaseX, releaseY, velocity) {
    var target = centralTarget();
    if (!target) { return false; }
    var speed = Math.hypot(velocity.vx, velocity.vy);
    if (speed < FLICK_SPEED) { return false; }
    var nodeX = active.originX + (releaseX - active.startX);
    var nodeY = active.originY + (releaseY - active.startY);
    var towardX = target.x - nodeX, towardY = target.y - nodeY;
    var towardLength = Math.hypot(towardX, towardY);
    if (!towardLength) { return true; }
    return (velocity.vx * towardX + velocity.vy * towardY) / (speed * towardLength) >= FLICK_COS;
  }

  function cleanElement(element) {
    if (!element) { return; }
    var cleanToken = (element.__transitionCleanToken || 0) + 1;
    element.__transitionCleanToken = cleanToken;
    element.style.transition = "none";
    element.classList.remove("tap-press", "dragging", "drag-returning", "drag-flight");
    element.style.removeProperty("translate");
    void element.offsetWidth;
    requestAnimationFrame(function () {
      if (element.__transitionCleanToken === cleanToken && element.style.transition === "none") {
        element.style.removeProperty("transition");
      }
    });
    delete element.dataset.dragX; delete element.dataset.dragY;
  }

  function removeMotion(motion) {
    var index = returnMotions.indexOf(motion);
    if (index >= 0) { returnMotions.splice(index, 1); }
  }

  function stopReturnPhysics(element, settle) {
    for (var i = returnMotions.length - 1; i >= 0; i -= 1) {
      var motion = returnMotions[i];
      if (!element || motion.element === element) {
        removeMotion(motion);
        if (settle) {
          cleanElement(motion.element);
          if (K.renderer.endDragVisual) {
            K.renderer.endDragVisual(motion.id, motion.element, 0);
          }
        }
      }
    }
  }

  function motionBounds(element, offsetX, offsetY, type) {
    var rect = element.getBoundingClientRect();
    var halfW = rect.width / 2, halfH = rect.height / 2;
    var baseX = rect.left + halfW - offsetX;
    var baseY = rect.top + halfH - offsetY;
    var stage = type === "word" ? document.getElementById("word-stage") : null;
    var stageRect = stage ? stage.getBoundingClientRect() :
      { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    var margin = 8;
    return {
      minX: Math.max(halfW, stageRect.left - margin + halfW) - baseX,
      maxX: Math.min(window.innerWidth - halfW, stageRect.right + margin - halfW) - baseX,
      minY: Math.max(halfH, stageRect.top - margin + halfH) - baseY,
      maxY: Math.min(window.innerHeight - halfH, stageRect.bottom + margin - halfH) - baseY
    };
  }

  function springBack(drag, releaseVelocity) {
    var element = drag.element;
    if (!element || !element.isConnected) { return; }
    stopReturnPhysics(element, false);
    if (reducedMotion()) {
      cleanElement(element);
      if (drag.dragging && K.renderer.endDragVisual) { K.renderer.endDragVisual(drag.id, element, 0); }
      return;
    }
    if (drag.dragging && K.renderer.endDragVisual) {
      K.renderer.endDragVisual(drag.id, element, 0);
    }
    element.classList.remove("dragging");
    element.classList.add("drag-returning");
    element.style.transition = "none";
    var x = Number(element.dataset.dragX) || drag.currentX || 0;
    var y = Number(element.dataset.dragY) || drag.currentY || 0;
    var velocity = releaseVelocity || { vx: 0, vy: 0 };
    var bounds = motionBounds(element, x, y, drag.type);
    var motion = {
      id: drag.id, element: element, x: x, y: y,
      vx: velocity.vx || 0, vy: velocity.vy || 0,
      bounds: bounds, bounces: 0, elapsed: 0,
      type: drag.type
    };
    returnMotions.push(motion);
    K.audio.play("return");
  }

  function settleMotion(motion) {
    removeMotion(motion);
    cleanElement(motion.element);
    if (K.renderer.endDragVisual) {
      K.renderer.endDragVisual(motion.id, motion.element, 0);
    }
  }

  function integrateMotion(motion, dt) {
    motion.elapsed += dt * 1000;
    motion.vx += (-SPRING_K * motion.x - SPRING_C * motion.vx) * dt;
    motion.vy += (-SPRING_K * motion.y - SPRING_C * motion.vy) * dt;
    motion.x += motion.vx * dt;
    motion.y += motion.vy * dt;
    if (motion.x < motion.bounds.minX || motion.x > motion.bounds.maxX) {
      motion.x = Math.max(motion.bounds.minX, Math.min(motion.bounds.maxX, motion.x));
      if (motion.bounces < 2) { motion.vx *= -EDGE_RESTITUTION; motion.bounces += 1; }
      else { motion.vx = 0; }
    }
    if (motion.y < motion.bounds.minY || motion.y > motion.bounds.maxY) {
      motion.y = Math.max(motion.bounds.minY, Math.min(motion.bounds.maxY, motion.y));
      if (motion.bounces < 2) { motion.vy *= -EDGE_RESTITUTION; motion.bounces += 1; }
      else { motion.vy = 0; }
    }
  }

  function updatePhysics(ms) {
    if (!returnMotions.length) { return; }
    if (reducedMotion()) {
      stopReturnPhysics(null, true);
      return;
    }
    var total = Math.min(0.05, Math.max(0, (Number(ms) || 0) / 1000));
    if (!total) { return; }
    var steps = Math.ceil(total / 0.025);
    var dt = total / steps;
    for (var i = returnMotions.length - 1; i >= 0; i -= 1) {
      var motion = returnMotions[i];
      var element = motion.element;
      if (!element || !element.isConnected) {
        removeMotion(motion);
        continue;
      }
      for (var step = 0; step < steps; step += 1) {
        integrateMotion(motion, dt);
      }
      element.dataset.dragX = String(motion.x);
      element.dataset.dragY = String(motion.y);
      element.style.translate = motion.x + "px " + motion.y + "px";
      if (K.renderer.updateReturningLink) {
        K.renderer.updateReturningLink(motion.id, element);
      }
      if (motion.elapsed >= 700 && Math.hypot(motion.x, motion.y) <= 2 &&
          Math.hypot(motion.vx, motion.vy) <= 10) {
        settleMotion(motion);
        continue;
      }
      if (motion.elapsed >= PHYSICS_LIMIT_MS) {
        settleMotion(motion);
      }
    }
  }

  function cancelDrag(immediate) {
    var stoppedMotion = returnMotions.length > 0;
    if (immediate) { stopReturnPhysics(null, true); }
    if (!active) { return stoppedMotion; }
    var drag = active;
    active = null;
    if (drag.raf) { cancelAnimationFrame(drag.raf); }
    clearDropCue();
    try { drag.element.releasePointerCapture(drag.pointerId); } catch (ignore) {}
    if (immediate || reducedMotion()) {
      cleanElement(drag.element);
      if (drag.dragging && K.renderer.endDragVisual) { K.renderer.endDragVisual(drag.id, drag.element, 0); }
    }
    else { springBack(drag); }
    return true;
  }

  function beginDrag(event, info) {
    if (active || K.game.state.transitioning || (K.renderer.isBusy && K.renderer.isBusy())) { return false; }
    stopReturnPhysics(info.element, false);
    var rect = info.element.getBoundingClientRect();
    var baseX = Number(info.element.dataset.dragX) || 0;
    var baseY = Number(info.element.dataset.dragY) || 0;
    active = {
      pointerId: event.pointerId,
      element: info.element,
      id: info.id,
      type: info.type,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
      baseX: baseX, baseY: baseY,
      targetX: baseX, targetY: baseY, currentX: baseX, currentY: baseY,
      maxDistance: 0,
      startTime: event.timeStamp,
      samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
      pathLength: 0, lastX: event.clientX, lastY: event.clientY,
      dragging: false, hot: false, raf: 0
    };
    info.element.classList.remove("squash", "drag-returning");
    info.element.classList.add("tap-press");
    try { info.element.setPointerCapture(event.pointerId); } catch (ignore) {}
    event.preventDefault();
    return true;
  }

  function activateDrag(x, y) {
    if (!active || active.dragging) { return; }
    active.dragging = true;
    active.element.classList.remove("tap-press", "is-new");
    active.element.classList.add("dragging");
    active.element.style.transition = "none";
    setDragOffset(active.baseX, active.baseY);
    K.audio.play("grab");
    if (K.renderer.beginDragVisual) { K.renderer.beginDragVisual(active.id, active.element); }
    var inside = updateDropCue(x, y);
    aimAt(x, y, inside);
  }

  function finishDrag(event, cancelled) {
    if (!active || event.pointerId !== active.pointerId) { return false; }
    var drag = active;
    drag.pathLength += Math.hypot(event.clientX - drag.lastX, event.clientY - drag.lastY);
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    drag.maxDistance = Math.max(drag.maxDistance,
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
    pushSample(event.clientX, event.clientY, event.timeStamp);
    if (!drag.dragging && drag.maxDistance >= DRAG_DISTANCE) { activateDrag(event.clientX, event.clientY); }
    var releaseDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    var fallbackTap = drag.dragging && releaseDistance <= SAFETY_DISTANCE &&
      drag.pathLength <= SAFETY_PATH;
    var isTap = !cancelled && (drag.maxDistance < DRAG_DISTANCE || fallbackTap);
    var inside = !cancelled && drag.dragging && updateDropCue(event.clientX, event.clientY);
    if (drag.dragging) {
      aimAt(event.clientX, event.clientY, inside);
      setDragOffset(drag.targetX, drag.targetY);
    }
    var velocity = velocityFrom(event);
    var thrown = !cancelled && drag.dragging && !isTap &&
      flicksToCenter(event.clientX, event.clientY, velocity);
    active = null;
    if (drag.raf) { cancelAnimationFrame(drag.raf); }
    clearDropCue();
    try { drag.element.releasePointerCapture(drag.pointerId); } catch (ignore) {}

    if (isTap) {
      cleanElement(drag.element);
      if (drag.dragging && K.renderer.endDragVisual) { K.renderer.endDragVisual(drag.id, drag.element, 0); }
      K.game.tapWord(drag.id, false);
      return true;
    }
    if ((inside || thrown) && drag.type === "word") {
      if (K.renderer.endDragVisual) { K.renderer.endDragVisual(drag.id, drag.element, 430); }
      var accepted = K.game.tapWord(drag.id, false);
      if (accepted) {
        K.renderer.continueDragToCenter(drag.id, drag.element);
        return true;
      }
    } else if ((inside || thrown) && drag.type === "choice") {
      if (K.renderer.endDragVisual) { K.renderer.endDragVisual(drag.id, drag.element, 0); }
      cleanElement(drag.element);
      K.game.tapWord(drag.id, false);
      return true;
    }
    springBack(drag, velocity);
    return true;
  }

  function handleButton(event, button) {
    K.audio.unlock();
    if (button.dataset.mode) { K.audio.play("tap"); K.game.setMode(button.dataset.mode); return; }
    if (button.id === "back-button") { K.audio.play("tap"); K.game.title(); return; }
    if (button.id === "mute-button") {
      button.textContent = K.audio.toggle() ? "🔇" : "🔊"; return;
    }
    if (button.id === "random-button") { K.audio.play("tap"); K.game.randomJump(); return; }
    if (button.id === "target-card" && K.game.state.target) {
      K.audio.play("tap"); return;
    }
    if (button.id === "center-word" && K.game.state.center) {
      K.audio.play("tap");
      return;
    }
    if (button.dataset.word) { K.game.tapWord(button.dataset.word, false); }
  }

  function init() {
    function preventGesture(event) { event.preventDefault(); }
    document.addEventListener("pointerdown", function (event) {
      if (active) { event.preventDefault(); return; }
      var info = draggableFor(event.target);
      if (info) {
        K.audio.unlock();
        beginDrag(event, info);
        return;
      }
      var button = event.target.closest("button");
      if (button) { handleButton(event, button); }
    });
    document.addEventListener("pointermove", function (event) {
      if (!active || event.pointerId !== active.pointerId) { return; }
      var dx = event.clientX - active.startX, dy = event.clientY - active.startY;
      active.pathLength += Math.hypot(event.clientX - active.lastX, event.clientY - active.lastY);
      active.lastX = event.clientX; active.lastY = event.clientY;
      active.maxDistance = Math.max(active.maxDistance, Math.hypot(dx, dy));
      pushSample(event.clientX, event.clientY, event.timeStamp);
      if (!active.dragging && active.maxDistance >= DRAG_DISTANCE) {
        activateDrag(event.clientX, event.clientY);
      }
      if (active.dragging) {
        var inside = updateDropCue(event.clientX, event.clientY);
        aimAt(event.clientX, event.clientY, inside);
      }
      event.preventDefault();
    });
    document.addEventListener("pointerup", function (event) { finishDrag(event, false); });
    document.addEventListener("pointercancel", function (event) { finishDrag(event, true); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && K.game.state.screen === "game") {
        cancelDrag(true); K.game.title();
      }
    });
    window.addEventListener("resize", function () { cancelDrag(true); });
    window.addEventListener("orientationchange", function () { cancelDrag(true); });
    document.addEventListener("touchmove", function (event) { event.preventDefault(); }, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });
  }

  K.input = {
    init: init,
    cancelDrag: cancelDrag,
    updatePhysics: updatePhysics,
    isDragging: function () { return !!active; }
  };
}());
