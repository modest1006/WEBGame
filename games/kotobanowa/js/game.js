(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var query = new URLSearchParams(location.search);
  var seed = Number(query.get("seed")) || 20260731;
  var randomState = seed >>> 0;
  function random() {
    randomState += 0x6D2B79F5;
    var t = randomState;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function pick(list) { return list[Math.floor(random() * list.length)]; }
  function shuffled(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  var state = {
    screen: "title", mode: null, center: "いぬ", neighbors: [],
    target: null, quizAnswer: null, choices: [], disabledChoices: [],
    score: 0, rounds: 0, now: 0, lastAction: 0, hintWord: null,
    transitioning: false, moveTo: null, moveAt: null, message: "", pendingNextAt: null, seed: seed
  };

  function findPath(from, to) {
    if (!K.WORDS[from] || !K.WORDS[to]) { return []; }
    var queue = [from], previous = {}; previous[from] = null;
    while (queue.length) {
      var id = queue.shift();
      if (id === to) {
        var path = [];
        while (id !== null) { path.unshift(id); id = previous[id]; }
        return path;
      }
      K.WORDS[id].neighbors.forEach(function (next) {
        if (!Object.prototype.hasOwnProperty.call(previous, next)) {
          previous[next] = id; queue.push(next);
        }
      });
    }
    return [];
  }

  function validateGraph() {
    var asymmetric = [], missing = [];
    K.WORD_IDS.forEach(function (id) {
      K.WORDS[id].neighbors.forEach(function (n) {
        if (!K.WORDS[n]) { missing.push(id + "->" + n); }
        else if (K.WORDS[n].neighbors.indexOf(id) < 0) { asymmetric.push(id + "->" + n); }
      });
    });
    var visited = {};
    if (K.WORD_IDS.length) {
      var queue = [K.WORD_IDS[0]]; visited[queue[0]] = true;
      while (queue.length) {
        K.WORDS[queue.shift()].neighbors.forEach(function (n) {
          if (!visited[n]) { visited[n] = true; queue.push(n); }
        });
      }
    }
    var quizEligible = K.WORD_IDS.filter(function (id) { return K.WORDS[id].neighbors.length >= 3; });
    return {
      wordCount: K.WORD_IDS.length,
      connected: Object.keys(visited).length === K.WORD_IDS.length,
      visitedCount: Object.keys(visited).length,
      asymmetricEdges: asymmetric,
      asymmetricEdgeCount: asymmetric.length,
      missingWords: missing,
      quizEligibleCount: quizEligible.length,
      valid: missing.length === 0 && asymmetric.length === 0 && Object.keys(visited).length === K.WORD_IDS.length
    };
  }

  function setCenter(id) {
    state.center = id;
    state.neighbors = K.WORDS[id].neighbors.slice();
    state.hintWord = null;
    state.lastAction = state.now;
  }

  function startQuest() {
    state.target = pick(K.WORD_IDS);
    var candidates = K.WORD_IDS.filter(function (id) {
      var d = findPath(id, state.target).length - 1;
      return d >= 2 && d <= 4;
    });
    setCenter(pick(candidates));
  }

  function startQuiz() {
    var eligible = K.WORD_IDS.filter(function (id) { return K.WORDS[id].neighbors.length >= 3; });
    var answer = pick(eligible);
    var forbidden = K.WORDS[answer].neighbors.concat([answer]);
    var dummyPool = K.WORD_IDS.filter(function (id) { return forbidden.indexOf(id) < 0; });
    state.quizAnswer = answer;
    state.center = null;
    state.neighbors = K.WORDS[answer].neighbors.slice();
    state.choices = shuffled([answer].concat(shuffled(dummyPool).slice(0, 2)));
    state.disabledChoices = [];
    state.pendingNextAt = null;
    state.message = "どの ことばかな？";
    state.lastAction = state.now;
  }

  function setMode(mode) {
    if (["walk", "quest", "quiz"].indexOf(mode) < 0) { throw new Error("Unknown mode: " + mode); }
    state.screen = "game"; state.mode = mode; state.score = 0; state.rounds = 0;
    state.message = ""; state.target = null; state.quizAnswer = null; state.transitioning = false;
    state.moveTo = null; state.moveAt = null; state.pendingNextAt = null; state.disabledChoices = [];
    if (mode === "walk") { setCenter("いぬ"); }
    if (mode === "quest") { startQuest(); }
    if (mode === "quiz") { startQuiz(); }
    K.renderer.renderAll();
  }

  function tapWord(id, fromDebug) {
    if (!K.WORDS[id] || state.transitioning || (K.renderer.isBusy && K.renderer.isBusy())) { return false; }
    state.lastAction = state.now; state.hintWord = null;
    if (state.mode === "quiz") {
      if (state.neighbors.indexOf(id) >= 0 && state.choices.indexOf(id) < 0) {
        K.audio.play("tap"); K.audio.speak(K.WORDS[id].label); return true;
      }
      if (state.choices.indexOf(id) < 0 || state.disabledChoices.indexOf(id) >= 0 || state.pendingNextAt !== null) { return false; }
      K.audio.play("tap"); K.audio.speak(K.WORDS[id].label);
      if (id === state.quizAnswer) {
        state.center = id; state.score += 1; state.rounds += 1;
        state.message = "やったね！"; state.pendingNextAt = state.now + 1800;
        K.audio.play("fanfare");
        K.renderer.confetti(K.WORDS[id].emoji); K.renderer.renderAll();
        return true;
      }
      state.disabledChoices.push(id); K.audio.play("wrong"); K.renderer.renderAll();
      K.renderer.shakeChoice(id); return false;
    }
    if (state.neighbors.indexOf(id) < 0 && !fromDebug) { return false; }
    K.audio.play("tap"); K.audio.speak(K.WORDS[id].label);
    state.transitioning = true; state.moveTo = id; state.moveAt = state.now + 400;
    K.renderer.flyToCenter(id, function () {});
    return true;
  }

  function jumpTo(id) {
    if (!K.WORDS[id]) { return false; }
    if (state.mode === "quiz") { state.mode = "walk"; state.quizAnswer = null; state.choices = []; }
    setCenter(id); state.transitioning = false; state.moveTo = null; state.moveAt = null;
    K.renderer.renderAll(); return true;
  }

  function update(ms) {
    state.now += Math.max(0, Number(ms) || 0);
    if (state.moveAt !== null && state.now >= state.moveAt) {
      var arrived = state.moveTo;
      state.moveAt = null; state.moveTo = null; setCenter(arrived); state.transitioning = false;
      document.getElementById("app").classList.remove("spin-world");
      K.audio.play("arrive"); K.audio.speak(K.WORDS[arrived].label);
      if (state.mode === "quest" && arrived === state.target) {
        state.score += 1; state.rounds += 1; state.message = "やったね！";
        state.pendingNextAt = state.now + 2000; K.audio.play("fanfare");
        K.renderer.confetti(K.WORDS[arrived].emoji);
      }
      K.renderer.renderAll();
    }
    if (state.mode === "quest" && state.screen === "game" && state.target && state.center !== state.target &&
        state.now - state.lastAction >= 15000) {
      var path = findPath(state.center, state.target);
      state.hintWord = path.length > 1 ? path[1] : null;
    }
    if (state.pendingNextAt !== null && state.now >= state.pendingNextAt) {
      state.pendingNextAt = null; state.message = "";
      if (state.mode === "quest") { startQuest(); }
      if (state.mode === "quiz") { startQuiz(); }
      K.renderer.renderAll();
    }
  }

  var validation = validateGraph();
  console.assert(validation.asymmetricEdgeCount === 0, "Graph edges must be symmetric", validation);
  console.assert(validation.connected, "Graph must be connected", validation);
  if (!validation.valid) { throw new Error("ことばグラフの検証に失敗しました"); }

  K.game = {
    state: state, random: random, pick: pick, findPath: findPath, validateGraph: validateGraph,
    setMode: setMode, tapWord: tapWord, jumpTo: jumpTo, update: update,
    title: function () {
      state.screen = "title"; state.mode = null; state.pendingNextAt = null;
      state.transitioning = false; state.moveAt = null; state.moveTo = null; K.renderer.renderAll();
    },
    randomJump: function () {
      var choices = K.WORD_IDS.filter(function (id) { return id !== state.center; });
      var id = pick(choices); document.getElementById("app").classList.add("spin-world");
      state.transitioning = true; state.moveTo = id; state.moveAt = state.now + 480;
    }
  };
}());
