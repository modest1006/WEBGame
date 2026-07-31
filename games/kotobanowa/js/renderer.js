(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var canvas, ctx, width = 0, height = 0, dpr = 1, lastTime = 0;
  var particles = [], decorations = [], refs = {};
  var nodeMap = {}, angleById = {}, currentLayoutKey = "", pendingEdge = null, treeBusy = false;

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

  function wordContent(element, word, question) {
    element.querySelector(".word-emoji").textContent = question ? "❓" : word.emoji;
    element.querySelector(".word-label").textContent = question ? "だれかな？" : word.label;
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
    var radiusY = lowLandscape ? 34 : 36;
    return {
      angle: angle,
      x: 50 + Math.cos(angle) * 36,
      y: 50 + Math.sin(angle) * radiusY
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
      currentLayoutKey = layoutKey(); pendingEdge = null; treeBusy = false; return;
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
      if (s.disabledChoices.indexOf(id) >= 0) { b.classList.add("disabled"); b.disabled = true; }
      b.innerHTML = '<span>' + word.emoji + '</span><small>' + word.label + '</small>';
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
    refs.message.textContent = s.message;
    refs.message.classList.toggle("has-message", !!s.message);
    if (s.target) {
      refs["target-emoji"].textContent = K.WORDS[s.target].emoji;
      refs["target-label"].textContent = K.WORDS[s.target].label;
    }

    var nextKey = layoutKey();
    if (pendingEdge && (s.mode === "walk" || s.mode === "quest") && s.center === pendingEdge.tapped) {
      animateTree(pendingEdge);
    } else if (nextKey !== currentLayoutKey) {
      pendingEdge = null; fullRebuild();
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

  function confetti(emoji) {
    for (var i = 0; i < 70; i++) {
      particles.push({ x: width * (0.25 + K.game.random() * 0.5), y: height * 0.35,
        vx: (K.game.random() - 0.5) * 360, vy: -100 - K.game.random() * 280,
        life: 2.5 + K.game.random(), age: 0, rot: K.game.random() * 6.28,
        spin: (K.game.random() - 0.5) * 9, size: 7 + K.game.random() * 12,
        color: ["#ff7998", "#ffd65a", "#6edbc1", "#7ea7ff", "#c58cff"][i % 5],
        emoji: i % 11 === 0 ? emoji : null });
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
      if (p.emoji) { ctx.font = (p.size * 2) + "px sans-serif"; ctx.fillText(p.emoji, -p.size, p.size); }
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
    lastTime = time; K.game.update(dt * 1000); draw(dt); updateDebug(); requestAnimationFrame(frame);
  }

  function updateDebug() {
    if (!refs["debug-overlay"] || refs["debug-overlay"].classList.contains("hidden")) { return; }
    var s = K.game.state;
    refs["debug-overlay"].textContent = "seed " + s.seed + "\nmode " + s.mode + "\ncenter " + s.center +
      "\ntarget " + s.target + "\nhint " + s.hintWord + "\nparticles " + particles.length;
  }

  function init() {
    canvas = document.getElementById("effects"); ctx = canvas.getContext("2d");
    cacheRefs(); resize(); renderAll(); requestAnimationFrame(frame);
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
    renderOnce: function (dt) { K.game.update(dt); draw(Math.max(0, dt) / 1000); renderAll(); }
  };
}());
