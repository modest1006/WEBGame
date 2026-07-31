(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var active = null;
  var DRAG_DISTANCE = 10;
  var TAP_TIME = 300;
  var FLICK_SPEED = 400;
  var FLICK_COS = Math.cos(35 * Math.PI / 180);

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
    if (!active || !active.element) { return; }
    active.currentX = x; active.currentY = y;
    active.element.dataset.dragX = String(x);
    active.element.dataset.dragY = String(y);
    active.element.style.translate = x + "px " + y + "px";
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

  function aimAt(x, y) {
    if (!active) { return; }
    active.targetX = x - active.startX;
    active.targetY = y - active.startY;
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
    var center = document.querySelector(".center-node");
    var target = centralTarget();
    if (!center || !target) { return false; }
    var nodeX = active.originX + (x - active.startX);
    var nodeY = active.originY + (y - active.startY);
    var inside = Math.hypot(nodeX - target.x, nodeY - target.y) <= target.radius;
    center.classList.add("drop-ready");
    center.classList.toggle("drop-hot", inside);
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
    element.classList.remove("dragging", "drag-returning");
    element.style.removeProperty("translate");
    element.style.removeProperty("transition");
    delete element.dataset.dragX; delete element.dataset.dragY;
  }

  function springBack(drag) {
    var element = drag.element;
    if (!element || !element.isConnected) { return; }
    if (reducedMotion()) { cleanElement(element); return; }
    element.classList.remove("dragging");
    element.classList.add("drag-returning");
    element.style.transition = "translate 420ms cubic-bezier(.2,1.55,.35,1)";
    element.style.translate = "0px 0px";
    K.audio.play("return");
    setTimeout(function () {
      if (element.isConnected && element.classList.contains("drag-returning")) { cleanElement(element); }
    }, 450);
  }

  function cancelDrag(immediate) {
    if (!active) { return false; }
    var drag = active;
    active = null;
    if (drag.raf) { cancelAnimationFrame(drag.raf); }
    clearDropCue();
    try { drag.element.releasePointerCapture(drag.pointerId); } catch (ignore) {}
    if (immediate || reducedMotion()) { cleanElement(drag.element); }
    else { springBack(drag); }
    return true;
  }

  function beginDrag(event, info) {
    if (active || K.game.state.transitioning || (K.renderer.isBusy && K.renderer.isBusy())) { return false; }
    var rect = info.element.getBoundingClientRect();
    active = {
      pointerId: event.pointerId,
      element: info.element,
      id: info.id,
      type: info.type,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
      targetX: 0, targetY: 0, currentX: 0, currentY: 0,
      maxDistance: 0,
      startTime: event.timeStamp,
      samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
      raf: 0
    };
    info.element.classList.remove("is-new", "squash", "drag-returning");
    info.element.classList.add("dragging");
    info.element.style.transition = "none";
    setDragOffset(0, 0);
    try { info.element.setPointerCapture(event.pointerId); } catch (ignore) {}
    K.audio.play("grab");
    updateDropCue(event.clientX, event.clientY);
    event.preventDefault();
    return true;
  }

  function finishDrag(event, cancelled) {
    if (!active || event.pointerId !== active.pointerId) { return false; }
    var drag = active;
    aimAt(event.clientX, event.clientY);
    setDragOffset(drag.targetX, drag.targetY);
    drag.maxDistance = Math.max(drag.maxDistance,
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
    pushSample(event.clientX, event.clientY, event.timeStamp);
    var duration = event.timeStamp - drag.startTime;
    var isTap = !cancelled && drag.maxDistance < DRAG_DISTANCE && duration < TAP_TIME;
    var inside = !cancelled && updateDropCue(event.clientX, event.clientY);
    var velocity = velocityFrom(event);
    var thrown = !cancelled && !isTap && flicksToCenter(event.clientX, event.clientY, velocity);
    active = null;
    if (drag.raf) { cancelAnimationFrame(drag.raf); }
    clearDropCue();
    try { drag.element.releasePointerCapture(drag.pointerId); } catch (ignore) {}

    if (isTap) {
      cleanElement(drag.element);
      K.game.tapWord(drag.id, false);
      return true;
    }
    if ((inside || thrown) && drag.type === "word") {
      var accepted = K.game.tapWord(drag.id, false);
      if (accepted) {
        K.renderer.continueDragToCenter(drag.id, drag.element);
        return true;
      }
    } else if ((inside || thrown) && drag.type === "choice") {
      cleanElement(drag.element);
      K.game.tapWord(drag.id, false);
      return true;
    }
    springBack(drag);
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
      K.audio.play("tap"); K.audio.speak(K.WORDS[K.game.state.target].label); return;
    }
    if (button.id === "center-word" && K.game.state.center) {
      K.audio.play("tap"); K.audio.speak(K.WORDS[K.game.state.center].label);
      return;
    }
    if (button.dataset.word) { K.game.tapWord(button.dataset.word, false); }
  }

  function init() {
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
      active.maxDistance = Math.max(active.maxDistance, Math.hypot(dx, dy));
      aimAt(event.clientX, event.clientY);
      pushSample(event.clientX, event.clientY, event.timeStamp);
      updateDropCue(event.clientX, event.clientY);
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
  }

  K.input = {
    init: init,
    cancelDrag: cancelDrag,
    isDragging: function () { return !!active; }
  };
}());
