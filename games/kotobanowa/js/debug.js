(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  function snapshot() {
    var s = K.game.state;
    return {
      screen: s.screen, mode: s.mode, center: s.center,
      neighbors: s.neighbors.slice(), target: s.target,
      quizAnswer: s.quizAnswer, choices: s.choices.slice(),
      disabledChoices: s.disabledChoices.slice(), score: s.score, rounds: s.rounds,
      hintWord: s.hintWord, message: s.message, now: Math.round(s.now),
      transitioning: s.transitioning, moveTo: s.moveTo, moveAt: s.moveAt,
      pendingNextAt: s.pendingNextAt, seed: s.seed
    };
  }
  function dump() {
    var s = snapshot(), lines = ["KOTOBANOWA", "screen: " + s.screen, "mode: " + (s.mode || "-")];
    if (s.mode === "quiz") {
      lines.push("center: " + (s.center || "???"), "clues: " + s.neighbors.join(" / "),
        "choices: " + s.choices.map(function (id) { return (s.disabledChoices.indexOf(id) >= 0 ? "x" : "o") + " " + id; }).join(" | "),
        "answer: " + s.quizAnswer);
    } else {
      lines.push("center: " + s.center, "ring: " + s.neighbors.join(" - "));
      if (s.target) { lines.push("target: " + s.target, "path: " + K.game.findPath(s.center, s.target).join(" -> ")); }
    }
    lines.push("score: " + s.score + " / rounds: " + s.rounds);
    return lines.join("\n");
  }

  function dragWord(id, toX, toY, options) {
    options = options || {};
    var element = K.game.state.mode === "quiz" ?
      document.querySelector('.choice-button[data-word="' + id + '"]') : K.renderer.getNode(id);
    if (!element || !element.isConnected) { return false; }
    var rect = element.getBoundingClientRect();
    var startX = rect.left + rect.width / 2, startY = rect.top + rect.height / 2;
    var pointerId = 9876;
    function dispatch(type, x, y, buttons) {
      var event = new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: pointerId, pointerType: "mouse",
        isPrimary: true, button: 0, buttons: buttons, clientX: x, clientY: y
      });
      if (type === "pointerup" && (Number.isFinite(options.vx) || Number.isFinite(options.vy))) {
        Object.defineProperty(event, "__kotobaVelocity", {
          value: { vx: Number(options.vx) || 0, vy: Number(options.vy) || 0 }
        });
      }
      element.dispatchEvent(event);
    }
    dispatch("pointerdown", startX, startY, 1);
    dispatch("pointermove", Number(toX), Number(toY), 1);
    if (options.release !== false) { dispatch("pointerup", Number(toX), Number(toY), 0); }
    return true;
  }

  window.__game = {
    getState: snapshot,
    dump: dump,
    step: function (ms) { K.renderer.renderOnce(Number(ms) || 0); return snapshot(); },
    jumpTo: K.game.jumpTo,
    setMode: K.game.setMode,
    tapWord: function (id) { return K.game.tapWord(id, false); },
    dragWord: dragWord,
    iconDataURL: function (name) { return K.icons.dataURL(name); },
    validateGraph: K.game.validateGraph,
    findPath: K.game.findPath
  };
  window.__renderOnce = function (dt) { K.renderer.renderOnce(Number(dt) || 16.67); };
}());
