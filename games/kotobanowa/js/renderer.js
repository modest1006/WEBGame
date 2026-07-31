(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var canvas, ctx, width = 0, height = 0, dpr = 1, lastTime = 0;
  var particles = [], decorations = [];
  var refs = {};

  function cacheRefs() {
    ["app", "title-screen", "game-screen", "word-stage", "neighbors", "center-word", "links",
      "target-card", "target-emoji", "target-label", "quiz-choices", "random-button",
      "mode-badge", "message", "debug-overlay"].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
  }
  function wordContent(element, word, question) {
    element.querySelector(".word-emoji").textContent = question ? "❓" : word.emoji;
    element.querySelector(".word-label").textContent = question ? "だれかな？" : word.label;
  }
  function nodeButton(id, index, count) {
    var word = K.WORDS[id], button = document.createElement("button");
    button.className = "word-node neighbor-node";
    button.dataset.word = id;
    button.setAttribute("aria-label", word.label);
    button.style.setProperty("--i", index);
    button.style.setProperty("--delay", (index * 50) + "ms");
    button.style.setProperty("--breath", (3.2 + K.game.random() * 1.8).toFixed(2) + "s");
    var angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    button.style.setProperty("--x", (50 + Math.cos(angle) * 36) + "%");
    button.style.setProperty("--y", (50 + Math.sin(angle) * 42) + "%");
    button.innerHTML = '<span class="word-emoji"></span><span class="word-label"></span>';
    wordContent(button, word, false);
    if (K.game.state.hintWord === id) { button.classList.add("hint"); }
    return button;
  }
  function renderLinks(count) {
    var svg = refs.links; svg.innerHTML = "";
    for (var i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + i * Math.PI * 2 / count;
      var x = 50 + Math.cos(angle) * 36, y = 50 + Math.sin(angle) * 42;
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "50%"); line.setAttribute("y1", "50%");
      line.setAttribute("x2", x + "%"); line.setAttribute("y2", y + "%");
      svg.appendChild(line);
    }
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
    if (s.screen === "title") { return; }
    refs["mode-badge"].textContent = s.mode === "walk" ? "🐾 さんぽ" : s.mode === "quest" ? "🎯 めざせ" : "❓ だれかな";
    refs["random-button"].classList.toggle("hidden", s.mode !== "walk");
    refs["target-card"].classList.toggle("hidden", s.mode !== "quest");
    refs["quiz-choices"].classList.toggle("hidden", s.mode !== "quiz");
    refs["word-stage"].classList.toggle("quiz-stage", s.mode === "quiz");
    refs.message.textContent = s.message;
    if (s.target) {
      refs["target-emoji"].textContent = K.WORDS[s.target].emoji;
      refs["target-label"].textContent = K.WORDS[s.target].label;
    }
    refs.neighbors.innerHTML = "";
    s.neighbors.forEach(function (id, i) { refs.neighbors.appendChild(nodeButton(id, i, s.neighbors.length)); });
    renderLinks(s.neighbors.length);
    if (s.mode === "quiz") {
      wordContent(refs["center-word"], s.center ? K.WORDS[s.center] : { emoji: "", label: "" }, !s.center);
      refs["center-word"].classList.toggle("revealed", !!s.center);
      renderChoices();
    } else {
      wordContent(refs["center-word"], K.WORDS[s.center], false);
      refs["center-word"].classList.remove("revealed");
    }
    updateDebug();
  }
  function flyToCenter(id, done) {
    var source = refs.neighbors.querySelector('[data-word="' + id + '"]');
    if (!source) { done(); return; }
    source.classList.add("squash");
    var a = source.getBoundingClientRect(), b = refs["center-word"].getBoundingClientRect();
    var clone = source.cloneNode(true);
    clone.className = "word-node flying-node";
    clone.style.left = a.left + "px"; clone.style.top = a.top + "px";
    clone.style.width = a.width + "px"; clone.style.height = a.height + "px";
    document.body.appendChild(clone);
    requestAnimationFrame(function () {
      clone.style.transform = "translate(" + (b.left + b.width / 2 - a.left - a.width / 2) + "px," +
        (b.top + b.height / 2 - a.top - a.height / 2) + "px) scale(1.35)";
      clone.style.opacity = "0.35";
    });
    setTimeout(function () { clone.remove(); done(); }, 420);
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
    decorations.forEach(function (d, i) {
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
      else { ctx.fillStyle = p.color; if (Math.floor(p.age * 8) % 2) ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * 0.66);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.7, 0, 6.29); ctx.fill(); } }
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
    init: init, renderAll: renderAll, flyToCenter: flyToCenter, shakeChoice: shakeChoice,
    confetti: confetti, draw: draw,
    renderOnce: function (dt) { K.game.update(dt); draw(Math.max(0, dt) / 1000); renderAll(); }
  };
}());
