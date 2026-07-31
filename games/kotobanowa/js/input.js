(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  function init() {
    document.addEventListener("pointerdown", function (event) {
      var button = event.target.closest("button");
      if (!button) { return; }
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
        K.audio.play("tap"); K.audio.speak(K.WORDS[K.game.state.center].label); return;
      }
      if (button.dataset.word) { K.game.tapWord(button.dataset.word, false); }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && K.game.state.screen === "game") { K.game.title(); }
    });
    document.addEventListener("touchmove", function (event) { event.preventDefault(); }, { passive: false });
  }
  K.input = { init: init };
}());
