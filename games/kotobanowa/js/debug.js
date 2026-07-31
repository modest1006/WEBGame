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
  window.__game = {
    getState: snapshot,
    dump: dump,
    step: function (ms) { K.renderer.renderOnce(Number(ms) || 0); return snapshot(); },
    jumpTo: K.game.jumpTo,
    setMode: K.game.setMode,
    tapWord: function (id) { return K.game.tapWord(id, false); },
    validateGraph: K.game.validateGraph,
    findPath: K.game.findPath
  };
  window.__renderOnce = function (dt) { K.renderer.renderOnce(Number(dt) || 16.67); };
}());
