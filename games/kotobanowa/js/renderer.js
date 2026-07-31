(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var canvas, ctx, width = 0, height = 0, dpr = 1, lastTime = 0;
  var particles = [], decorations = [], refs = {};
  var nodeMap = {}, angleById = {}, currentLayoutKey = "", pendingEdge = null, treeBusy = false;
  var lastViewportKey = "", resizeQueued = false;
  var dragVisual = null;

  function cacheRefs() {
    ["app", "title-screen", "game-screen", "word-stage", "neighbors", "center-word", "links",
      "target-card", "target-emoji", "target-label", "quiz-choices", "random-button",
      "mode-badge", "message", "debug-overlay"].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
    if (refs["center-word"] && refs["center-word"].parentNode) {
      refs["center-word"].parentNode.removeChild(refs["center-word"]);
      refs["center-word"] = null;
    }
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function multiEmoji(word) {
    return !word.icon &&
      Array.from(word.emoji).filter(function (char) { return char !== "\uFE0F"; }).length > 1;
  }

  function renderVisual(slot, word, question) {
    slot.textContent = "";
    slot.classList.remove("multi-emoji", "icon-visual");
    if (question) {
      slot.textContent = "❓";
      return;
    }
    if (word.icon && K.icons) {
      var image = K.icons.createImage(word.icon);
      if (image) {
        slot.classList.add("icon-visual");
        slot.appendChild(image);
        return;
      }
    }
    slot.textContent = word.emoji;
    slot.classList.toggle("multi-emoji", multiEmoji(word));
  }

  function wordContent(element, word, question) {
    var emoji = element.querySelector(".word-emoji");
    renderVisual(emoji, word, question);
    element.querySelector(".word-label").textContent = question ? "だれかな？" : word.label;
    element.querySelector(".word-label").classList.toggle("long-label", !question && word.label.length >= 6);
  }

  function createNode(key) {
    var button = document.createElement("button");
    button.innerHTML = '<span class="word-emoji"></span><span class="word-label"></span>';
    button.style.setProperty("--breath", (3.2 + K.game.random() * 1.8).toFixed(2) + "s");
    refs.neighbors.appendChild(button);
    nodeMap[key] = button;
    return button;
  }

  function slotPosition(index, count) {
    var angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    var lowLandscape = window.matchMedia && window.matchMedia("(max-height:650px) and (orientation:landscape)").matches;
    var radiusX = 36, radiusY = 36, centerY = 50;
    if (lowLandscape && refs["word-stage"]) {
      var rect = refs["word-stage"].getBoundingClientRect();
      var messageRect = refs.message.getBoundingClientRect();
      var nodeDiameter = 72 * 1.01;
      var nodeRadius = nodeDiameter / 2;
      var centerRadius = 108 * 1.025 / 2;
      var edgeGap = 4, pairGap = 2;
      var topLimit = Math.max(0, messageRect.bottom - rect.top) + nodeRadius + edgeGap;
      var bottomLimit = Math.min(window.innerHeight - rect.top, rect.height + 12) - nodeRadius - edgeGap;
      var ringCenterY = (topLimit + bottomLimit) / 2;
      var ringRadiusY = Math.max(0, (bottomLimit - topLimit) / 2);
      var maxRadiusX = Math.max(0, rect.width / 2 - nodeRadius - edgeGap);
      var ringRadiusX = Math.min(rect.width * 0.36, maxRadiusX);
      var centerNeed = centerRadius + nodeRadius + edgeGap;
      var pairNeed = nodeDiameter + pairGap;

      function layoutFits(testRadiusX) {
        var points = [];
        for (var pIndex = 0; pIndex < count; pIndex++) {
          var pAngle = -Math.PI / 2 + pIndex * Math.PI * 2 / count;
          var px = Math.cos(pAngle) * testRadiusX;
          var py = ringCenterY + Math.sin(pAngle) * ringRadiusY - rect.height / 2;
          if (Math.sqrt(px * px + py * py) < centerNeed) { return false; }
          points.push({ x: px, y: py });
        }
        for (var a = 0; a < points.length; a++) {
          for (var b = a + 1; b < points.length; b++) {
            if (Math.abs(points[a].x - points[b].x) < pairNeed &&
                Math.abs(points[a].y - points[b].y) < pairNeed) { return false; }
          }
        }
        return true;
      }

      while (ringRadiusX < maxRadiusX && !layoutFits(ringRadiusX)) { ringRadiusX += 0.5; }
      ringRadiusX = Math.min(ringRadiusX, maxRadiusX);
      radiusX = rect.width ? ringRadiusX / rect.width * 100 : 36;
      radiusY = rect.height ? ringRadiusY / rect.height * 100 : 36;
      centerY = rect.height ? ringCenterY / rect.height * 100 : 50;
    }
    return {
      angle: angle,
      x: 50 + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    };
  }

  function setNodeRole(element, key, role, slot, count, isNew, moving) {
    var s = K.game.state;
    var id = key === "__quiz__" ? s.quizAnswer : key;
    element.className = "word-node " + (role === "center" ? "center-node" : "neighbor-node");
    if (isNew) { element.classList.add("is-new"); }
    if (moving) { element.classList.add("tree-moving"); }
    if (role === "center" && s.mode === "quiz" && s.center) { element.classList.add("revealed"); }
    if (role === "neighbor" && s.hintWord === id) { element.classList.add("hint"); }
    if (id && K.WORDS[id]) {
      element.dataset.word = id;
      element.setAttribute("aria-label", K.WORDS[id].label);
    } else {
      delete element.dataset.word;
      element.setAttribute("aria-label", "だれかな");
    }
    if (role === "center") {
      element.id = "center-word";
      element.style.left = "50%"; element.style.top = "50%";
      element.style.removeProperty("--delay");
      refs["center-word"] = element;
      wordContent(element, id && K.WORDS[id] ? K.WORDS[id] : { emoji: "", label: "" },
        s.mode === "quiz" && !s.center);
    } else {
      if (element.id === "center-word") { element.removeAttribute("id"); }
      var p = slotPosition(slot, count);
      element.style.left = p.x + "%"; element.style.top = p.y + "%";
      element.style.setProperty("--delay", ((isNew ? 100 : 0) + slot * 50) + "ms");
      wordContent(element, K.WORDS[id], false);
    }
    element.dataset.role = role;
    element.dataset.slot = role === "neighbor" ? String(slot) : "";
  }

  function layoutKey() {
    var s = K.game.state;
    if (s.mode === "quiz") { return "quiz:" + s.quizAnswer + ":" + s.neighbors.join(","); }
    return s.mode + ":" + s.center + ":" + s.neighbors.join(",");
  }

  function removeAllNodes() {
    Object.keys(nodeMap).forEach(function (key) {
      var el = nodeMap[key];
      if (el.parentNode) { el.parentNode.removeChild(el); }
    });
    nodeMap = {}; angleById = {}; refs["center-word"] = null;
  }

  function renderLinks(assignments) {
    var s = K.game.state, svg = refs.links;
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }
    s.neighbors.forEach(function (id) {
      var slot = assignments[id], p = slotPosition(slot, s.neighbors.length);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("data-word", id);
      line.setAttribute("x1", "50%"); line.setAttribute("y1", "50%");
      line.setAttribute("x2", p.x + "%"); line.setAttribute("y2", p.y + "%");
      svg.appendChild(line);
    });
  }

  function dragLine(id) {
    return refs.links ? refs.links.querySelector('line[data-word="' + id + '"]') : null;
  }

  function resetLinkToSlot(id) {
    var line = dragLine(id);
    var s = K.game.state;
    var node = nodeMap[id];
    var slot = node ? Number(node.dataset.slot) : NaN;
    if (!Number.isFinite(slot)) { slot = s.neighbors.indexOf(id); }
    if (line && slot >= 0 && s.neighbors.length) {
      var point = slotPosition(slot, s.neighbors.length);
      line.setAttribute("x2", point.x + "%");
      line.setAttribute("y2", point.y + "%");
      line.classList.remove("drag-link");
    } else if (line) {
      line.classList.remove("drag-link");
    }
    if (refs.links) { refs.links.classList.remove("links-fading"); }
  }

  function elementPoint(element) {
    if (!element || !element.isConnected || !refs["word-stage"]) { return null; }
    var rect = element.getBoundingClientRect();
    var stage = refs["word-stage"].getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - stage.left,
      y: rect.top + rect.height / 2 - stage.top
    };
  }

  function updateLineEndpoint(id, element, emphasize) {
    var line = dragLine(id);
    var point = elementPoint(element);
    if (!line || !point) { return; }
    line.setAttribute("x2", point.x.toFixed(2));
    line.setAttribute("y2", point.y.toFixed(2));
    line.classList.toggle("drag-link", !!emphasize);
  }

  function setDragHot(hot) {
    if (!dragVisual) { return; }
    dragVisual.hot = !!hot;
    if (dragVisual.ring) { dragVisual.ring.classList.toggle("is-hot", !!hot); }
    var center = document.querySelector(".center-node");
    if (center) {
      center.classList.add("drop-ready");
      center.classList.toggle("drop-hot", !!hot);
    }
  }

  function updateDragVisual(id, element, hot) {
    if (!dragVisual || dragVisual.id !== id) { return; }
    updateLineEndpoint(id, element, true);
    var from = elementPoint(element);
    var center = elementPoint(document.querySelector(".center-node"));
    if (dragVisual.guide && from && center) {
      dragVisual.guide.setAttribute("x1", from.x.toFixed(2));
      dragVisual.guide.setAttribute("y1", from.y.toFixed(2));
      dragVisual.guide.setAttribute("x2", center.x.toFixed(2));
      dragVisual.guide.setAttribute("y2", center.y.toFixed(2));
    }
    setDragHot(hot);
  }

  function beginDragVisual(id, element) {
    if (dragVisual) { endDragVisual(dragVisual.id, dragVisual.element, 0); }
    var ring = document.createElement("div");
    ring.className = "drop-target-ring";
    ring.setAttribute("aria-hidden", "true");
    refs["word-stage"].appendChild(ring);
    var guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
    guide.setAttribute("class", "drag-guide");
    guide.setAttribute("aria-hidden", "true");
    refs.links.appendChild(guide);
    dragVisual = { id: id, element: element, ring: ring, guide: guide, hot: false };
    var center = document.querySelector(".center-node");
    if (center) { center.classList.add("drop-ready"); }
    updateDragVisual(id, element, false);
  }

  function followReleasedLink(id, element, duration) {
    var started = performance.now();
    function pump(now) {
      if (!element || !element.isConnected) {
        resetLinkToSlot(id);
        return;
      }
      updateLineEndpoint(id, element, now - started < duration);
      if (now - started < duration) {
        requestAnimationFrame(pump);
      } else {
        resetLinkToSlot(id);
      }
    }
    requestAnimationFrame(pump);
  }

  function endDragVisual(id, element, followMs) {
    if (dragVisual) {
      if (dragVisual.ring && dragVisual.ring.parentNode) { dragVisual.ring.parentNode.removeChild(dragVisual.ring); }
      if (dragVisual.guide && dragVisual.guide.parentNode) { dragVisual.guide.parentNode.removeChild(dragVisual.guide); }
      dragVisual = null;
    }
    var center = document.querySelector(".center-node");
    if (center) { center.classList.remove("drop-ready", "drop-hot"); }
    if (followMs > 0) { followReleasedLink(id, element, followMs); }
    else { resetLinkToSlot(id); }
  }

  function fullRebuild() {
    var s = K.game.state;
    removeAllNodes();
    var centerKey = s.mode === "quiz" ? "__quiz__" : s.center;
    var center = createNode(centerKey);
    setNodeRole(center, centerKey, "center", 0, s.neighbors.length, true, false);
    var assignments = {};
    s.neighbors.forEach(function (id, index) {
      var node = createNode(id);
      assignments[id] = index;
      angleById[id] = slotPosition(index, s.neighbors.length).angle;
      setNodeRole(node, id, "neighbor", index, s.neighbors.length, true, false);
    });
    renderLinks(assignments);
    refs.links.classList.remove("links-fading");
    currentLayoutKey = layoutKey();
    lastViewportKey = window.innerWidth + "x" + window.innerHeight;
    treeBusy = false;
  }

  function angleDistance(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  }

  function assignMinimalSlots(newNeighbors, edge) {
    var count = newNeighbors.length, available = [], assigned = {}, candidates = [];
    for (var i = 0; i < count; i++) { available.push(i); }
    newNeighbors.forEach(function (id) {
      if (!nodeMap[id]) { return; }
      var preferred = id === edge.oldCenter ? edge.oldAngles[edge.tapped] : edge.oldAngles[id];
      if (typeof preferred !== "number") { return; }
      available.forEach(function (slot) {
        candidates.push({ id: id, slot: slot, distance: angleDistance(preferred, slotPosition(slot, count).angle) });
      });
    });
    candidates.sort(function (a, b) { return a.distance - b.distance; });
    candidates.forEach(function (candidate) {
      if (Object.prototype.hasOwnProperty.call(assigned, candidate.id) ||
          available.indexOf(candidate.slot) < 0) { return; }
      assigned[candidate.id] = candidate.slot;
      available.splice(available.indexOf(candidate.slot), 1);
    });
    newNeighbors.forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(assigned, id)) { assigned[id] = available.shift(); }
    });
    return assigned;
  }

  function beginExit(key, element) {
    delete nodeMap[key];
    delete angleById[key];
    element.removeAttribute("id");
    element.classList.remove("is-new", "hint", "squash");
    element.classList.add("tree-exiting");
    if (reducedMotion()) {
      if (element.parentNode) { element.parentNode.removeChild(element); }
      return;
    }
    requestAnimationFrame(function () {
      element.style.transform = "translate(-50%,-50%) scale(.1)";
      element.style.opacity = "0";
    });
    setTimeout(function () {
      if (element.parentNode) { element.parentNode.removeChild(element); }
    }, 230);
  }

  function animateTree(edge) {
    var s = K.game.state, desired = [s.center].concat(s.neighbors);
    var assignments = assignMinimalSlots(s.neighbors, edge);
    var retained = [], fresh = [];

    if (edge.draggedId && nodeMap[edge.draggedId]) {
      edge.rects[edge.draggedId] = nodeMap[edge.draggedId].getBoundingClientRect();
      nodeMap[edge.draggedId].style.removeProperty("translate");
      nodeMap[edge.draggedId].style.removeProperty("transition");
      delete nodeMap[edge.draggedId].dataset.dragX;
      delete nodeMap[edge.draggedId].dataset.dragY;
    }

    Object.keys(nodeMap).forEach(function (key) {
      if (desired.indexOf(key) < 0) { beginExit(key, nodeMap[key]); }
    });

    desired.forEach(function (id) {
      if (nodeMap[id]) { retained.push(id); }
      else { createNode(id); fresh.push(id); }
    });

    retained.forEach(function (id) {
      setNodeRole(nodeMap[id], id, id === s.center ? "center" : "neighbor",
        assignments[id], s.neighbors.length, false, true);
    });
    fresh.forEach(function (id) {
      setNodeRole(nodeMap[id], id, id === s.center ? "center" : "neighbor",
        assignments[id], s.neighbors.length, true, false);
    });

    delete angleById[s.center];
    s.neighbors.forEach(function (id) {
      angleById[id] = slotPosition(assignments[id], s.neighbors.length).angle;
    });

    renderLinks(assignments);
    refs.links.classList.add("links-fading");

    if (reducedMotion()) {
      retained.forEach(function (id) { nodeMap[id].classList.remove("tree-moving"); });
      refs.links.classList.remove("links-fading");
      currentLayoutKey = layoutKey(); pendingEdge = null; treeBusy = false;
      lastViewportKey = window.innerWidth + "x" + window.innerHeight; return;
    }

    retained.forEach(function (id) {
      var element = nodeMap[id], first = edge.rects[id], last = element.getBoundingClientRect();
      if (!first || !last.width || !last.height) { return; }
      var dx = first.left + first.width / 2 - (last.left + last.width / 2);
      var dy = first.top + first.height / 2 - (last.top + last.height / 2);
      var sx = first.width / last.width, sy = first.height / last.height;
      element.style.transition = "none";
      element.style.transform = "translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px)) scale(" + sx + "," + sy + ")";
    });
    refs["word-stage"].offsetWidth;

    var released = false;
    function release() {
      if (released) { return; }
      released = true;
      retained.forEach(function (id) {
        var element = nodeMap[id];
        if (!element) { return; }
        element.style.transition = "transform 400ms cubic-bezier(.25,1.35,.45,1), border-radius 400ms ease";
        element.style.transform = "translate(-50%,-50%) scale(1)";
      });
      refs.links.classList.remove("links-fading");
      setTimeout(function () {
        retained.forEach(function (id) {
          var element = nodeMap[id];
          if (!element) { return; }
          element.classList.remove("tree-moving");
          element.style.removeProperty("transition");
          element.style.removeProperty("transform");
        });
        treeBusy = false;
      }, 430);
    }
    requestAnimationFrame(function () { requestAnimationFrame(release); });
    setTimeout(release, 32);
    currentLayoutKey = layoutKey(); pendingEdge = null;
    lastViewportKey = window.innerWidth + "x" + window.innerHeight;
  }

  function relayoutNow() {
    var s = K.game.state;
    if (!refs.app || s.screen !== "game" || !s.mode || !s.neighbors.length) {
      lastViewportKey = window.innerWidth + "x" + window.innerHeight; return;
    }
    refs["word-stage"].classList.toggle("degree-high", s.neighbors.length >= 7);
    refs["word-stage"].classList.toggle("degree-eight", s.neighbors.length >= 8);
    var assignments = {}, used = [];
    s.neighbors.forEach(function (id, index) {
      var node = nodeMap[id], slot = node ? Number(node.dataset.slot) : index;
      if (!Number.isFinite(slot) || slot < 0 || slot >= s.neighbors.length || used.indexOf(slot) >= 0) {
        slot = index;
        while (used.indexOf(slot) >= 0) { slot = (slot + 1) % s.neighbors.length; }
      }
      assignments[id] = slot; used.push(slot);
    });
    var centerKey = s.mode === "quiz" ? "__quiz__" : s.center;
    if (nodeMap[centerKey]) {
      nodeMap[centerKey].style.removeProperty("transition");
      nodeMap[centerKey].style.removeProperty("transform");
      nodeMap[centerKey].style.removeProperty("opacity");
      setNodeRole(nodeMap[centerKey], centerKey, "center", 0, s.neighbors.length, false, false);
    }
    s.neighbors.forEach(function (id) {
      if (!nodeMap[id]) { return; }
      nodeMap[id].style.removeProperty("transition");
      nodeMap[id].style.removeProperty("transform");
      nodeMap[id].style.removeProperty("opacity");
      setNodeRole(nodeMap[id], id, "neighbor", assignments[id], s.neighbors.length, false, false);
      angleById[id] = slotPosition(assignments[id], s.neighbors.length).angle;
    });
    renderLinks(assignments);
    refs.links.classList.remove("links-fading");
    if (pendingEdge) {
      pendingEdge.rects = {}; pendingEdge.oldAngles = {};
      Object.keys(nodeMap).forEach(function (key) {
        if (key !== "__quiz__") { pendingEdge.rects[key] = nodeMap[key].getBoundingClientRect(); }
      });
      Object.keys(angleById).forEach(function (key) { pendingEdge.oldAngles[key] = angleById[key]; });
    } else {
      treeBusy = false;
    }
    lastViewportKey = window.innerWidth + "x" + window.innerHeight;
  }

  function queueRelayout() {
    if (resizeQueued) { return; }
    if (K.input && K.input.cancelDrag) { K.input.cancelDrag(true); }
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      resize();
      relayoutNow();
    });
  }

  function updateStableNodes() {
    var s = K.game.state;
    if (s.mode === "quiz" && nodeMap.__quiz__) {
      setNodeRole(nodeMap.__quiz__, "__quiz__", "center", 0, s.neighbors.length, false, false);
    }
    s.neighbors.forEach(function (id) {
      if (nodeMap[id]) { nodeMap[id].classList.toggle("hint", s.hintWord === id); }
    });
  }

  function renderChoices() {
    var s = K.game.state;
    refs["quiz-choices"].innerHTML = "";
    s.choices.forEach(function (id) {
      var word = K.WORDS[id], b = document.createElement("button");
      b.className = "choice-button"; b.dataset.word = id;
      if (word.label.length >= 6) { b.classList.add("long-label"); }
      if (s.disabledChoices.indexOf(id) >= 0) { b.classList.add("disabled"); b.disabled = true; }
      var visual = document.createElement("span");
      visual.className = "choice-visual";
      renderVisual(visual, word, false);
      var label = document.createElement("small");
      label.textContent = word.label;
      b.appendChild(visual); b.appendChild(label);
      refs["quiz-choices"].appendChild(b);
    });
  }

  function renderAll() {
    if (!refs.app) { return; }
    var s = K.game.state;
    refs["title-screen"].classList.toggle("hidden", s.screen !== "title");
    refs["game-screen"].classList.toggle("hidden", s.screen !== "game");
    refs.app.className = "theme-" + (s.screen === "title" ? "title" : s.mode);
    if (s.screen === "title") {
      currentLayoutKey = ""; pendingEdge = null; treeBusy = false; return;
    }
    refs["mode-badge"].textContent = s.mode === "walk" ? "🐾 さんぽ" : s.mode === "quest" ? "🎯 めざせ" : "❓ だれかな";
    refs["random-button"].classList.toggle("hidden", s.mode !== "walk");
    refs["target-card"].classList.toggle("hidden", s.mode !== "quest");
    refs["quiz-choices"].classList.toggle("hidden", s.mode !== "quiz");
    refs["word-stage"].classList.toggle("quiz-stage", s.mode === "quiz");
    refs["word-stage"].classList.toggle("degree-high", s.neighbors.length >= 7);
    refs["word-stage"].classList.toggle("degree-eight", s.neighbors.length >= 8);
    refs.message.textContent = s.message;
    refs.message.classList.toggle("has-message", !!s.message);
    if (s.target) {
      renderVisual(refs["target-emoji"], K.WORDS[s.target], false);
      refs["target-label"].textContent = K.WORDS[s.target].label;
    }

    var nextKey = layoutKey();
    if (pendingEdge && (s.mode === "walk" || s.mode === "quest") && s.center === pendingEdge.tapped) {
      animateTree(pendingEdge);
    } else if (nextKey !== currentLayoutKey) {
      pendingEdge = null; fullRebuild();
    } else if (lastViewportKey !== window.innerWidth + "x" + window.innerHeight) {
      relayoutNow();
    } else {
      updateStableNodes();
    }
    if (s.mode === "quiz") { renderChoices(); }
    updateDebug();
  }

  function flyToCenter(id, done) {
    var rects = {}, oldAngles = {};
    Object.keys(nodeMap).forEach(function (key) {
      if (key !== "__quiz__") { rects[key] = nodeMap[key].getBoundingClientRect(); }
    });
    Object.keys(angleById).forEach(function (key) { oldAngles[key] = angleById[key]; });
    pendingEdge = {
      tapped: id,
      oldCenter: K.game.state.center,
      rects: rects,
      oldAngles: oldAngles,
      done: done
    };
    treeBusy = true;
    refs.links.classList.add("links-fading");
    if (nodeMap[id] && !reducedMotion()) { nodeMap[id].classList.add("squash"); }
  }

  function continueDragToCenter(id, element) {
    if (!pendingEdge || pendingEdge.tapped !== id || !element || !element.isConnected) { return false; }
    var center = nodeMap[pendingEdge.oldCenter];
    if (!center) { return false; }
    var from = element.getBoundingClientRect();
    var target = center.getBoundingClientRect();
    var currentX = Number(element.dataset.dragX) || 0;
    var currentY = Number(element.dataset.dragY) || 0;
    var dx = target.left + target.width / 2 - (from.left + from.width / 2);
    var dy = target.top + target.height / 2 - (from.top + from.height / 2);
    pendingEdge.draggedId = id;
    element.classList.remove("dragging", "squash");
    element.classList.add("drag-flight");
    element.style.transition = reducedMotion() ? "none" :
      "translate 390ms cubic-bezier(.2,.85,.3,1), filter 180ms ease";
    element.style.translate = (currentX + dx) + "px " + (currentY + dy) + "px";
    return true;
  }

  function shakeChoice(id) {
    var node = refs["quiz-choices"].querySelector('[data-word="' + id + '"]');
    if (node) { node.classList.add("shake"); }
  }

  function resize() {
    var nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = innerWidth, h = innerHeight;
    if (w === width && h === height && nextDpr === dpr) { return; }
    width = w; height = h; dpr = nextDpr;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    decorations = [];
    for (var i = 0; i < 11; i++) {
      decorations.push({ x: K.game.random() * width, y: K.game.random() * height,
        size: 10 + K.game.random() * 28, speed: 2 + K.game.random() * 5, phase: K.game.random() * 6.28 });
    }
  }

  function confetti(word) {
    var emoji = typeof word === "string" ? word : word.emoji;
    var icon = typeof word === "object" ? word.icon : null;
    for (var i = 0; i < 70; i++) {
      particles.push({ x: width * (0.25 + K.game.random() * 0.5), y: height * 0.35,
        vx: (K.game.random() - 0.5) * 360, vy: -100 - K.game.random() * 280,
        life: 2.5 + K.game.random(), age: 0, rot: K.game.random() * 6.28,
        spin: (K.game.random() - 0.5) * 9, size: 7 + K.game.random() * 12,
        color: ["#ff7998", "#ffd65a", "#6edbc1", "#7ea7ff", "#c58cff"][i % 5],
        emoji: i % 11 === 0 ? emoji : null,
        icon: i % 11 === 0 ? icon : null });
    }
  }

  function draw(dt) {
    resize();
    ctx.clearRect(0, 0, width, height);
    var night = K.game.state.mode === "quiz";
    decorations.forEach(function (d) {
      d.x += d.speed * dt; if (d.x > width + 50) { d.x = -50; }
      var y = d.y + Math.sin(K.game.state.now / 2500 + d.phase) * 8;
      ctx.globalAlpha = night ? 0.45 : 0.18;
      ctx.fillStyle = night ? "#fff4bd" : "#ffffff";
      if (night) {
        ctx.save(); ctx.translate(d.x, y); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-d.size * 0.12, -d.size * 0.12, d.size * 0.24, d.size * 0.24); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(d.x, y, d.size * 0.46, 0, 6.29);
        ctx.arc(d.x + d.size * 0.5, y + 3, d.size * 0.34, 0, 6.29);
        ctx.arc(d.x - d.size * 0.43, y + 5, d.size * 0.3, 0, 6.29); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    particles = particles.filter(function (p) {
      p.age += dt; if (p.age >= p.life) { return false; }
      p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, (p.life - p.age) * 2);
      if (p.icon && K.icons) {
        var iconImage = K.icons.getImage(p.icon);
        if (iconImage && iconImage.complete) { ctx.drawImage(iconImage, -p.size, -p.size, p.size * 2, p.size * 2); }
        else { ctx.font = (p.size * 2) + "px sans-serif"; ctx.fillText(p.emoji || "🏍️", -p.size, p.size); }
      } else if (p.emoji) {
        ctx.font = (p.size * 2) + "px sans-serif"; ctx.fillText(p.emoji, -p.size, p.size);
      }
      else {
        ctx.fillStyle = p.color;
        if (Math.floor(p.age * 8) % 2) { ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * 0.66); }
        else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.7, 0, 6.29); ctx.fill(); }
      }
      ctx.restore(); return true;
    });
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    var dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000 || 0));
    lastTime = time;
    K.game.update(dt * 1000);
    if (K.input && K.input.updatePhysics) { K.input.updatePhysics(dt * 1000); }
    draw(dt); updateDebug(); requestAnimationFrame(frame);
  }

  function updateDebug() {
    if (!refs["debug-overlay"] || refs["debug-overlay"].classList.contains("hidden")) { return; }
    var s = K.game.state;
    refs["debug-overlay"].textContent = "seed " + s.seed + "\nmode " + s.mode + "\ncenter " + s.center +
      "\ntarget " + s.target + "\nhint " + s.hintWord + "\nparticles " + particles.length;
  }

  function init() {
    canvas = document.getElementById("effects"); ctx = canvas.getContext("2d");
    cacheRefs(); resize(); renderAll();
    window.addEventListener("resize", queueRelayout);
    window.addEventListener("orientationchange", queueRelayout);
    requestAnimationFrame(frame);
  }

  K.renderer = {
    init: init,
    renderAll: renderAll,
    flyToCenter: flyToCenter,
    shakeChoice: shakeChoice,
    confetti: confetti,
    draw: draw,
    getNode: function (id) { return nodeMap[id] || null; },
    isBusy: function () { return treeBusy; },
    beginDragVisual: beginDragVisual,
    updateDragVisual: updateDragVisual,
    updateReturningLink: function (id, element) { updateLineEndpoint(id, element, true); },
    resetLinkToSlot: resetLinkToSlot,
    endDragVisual: endDragVisual,
    setDragHot: setDragHot,
    continueDragToCenter: continueDragToCenter,
    relayoutNow: relayoutNow,
    renderOnce: function (dt) {
      K.game.update(dt);
      if (K.input && K.input.updatePhysics) { K.input.updatePhysics(dt); }
      draw(Math.max(0, dt) / 1000);
      renderAll();
    }
  };
}());
