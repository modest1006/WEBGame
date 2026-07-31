(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var context = null;
  var muted = false;

  function unlock() {
    try {
      if (!context) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { context = new AC(); }
      }
      if (context && context.state === "suspended") { context.resume(); }
    } catch (ignore) {}
  }

  function tone(freq, start, duration, type, volume) {
    if (muted || !context) { return; }
    try {
      var o = context.createOscillator();
      var g = context.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, context.currentTime + start);
      g.gain.setValueAtTime(0.0001, context.currentTime + start);
      g.gain.exponentialRampToValueAtTime(volume || 0.08, context.currentTime + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
      o.connect(g); g.connect(context.destination);
      o.start(context.currentTime + start); o.stop(context.currentTime + start + duration + 0.02);
    } catch (ignore) {}
  }

  function play(kind) {
    unlock();
    if (kind === "tap") {
      tone(330, 0, 0.12, "sine", 0.07); tone(440, 0.05, 0.10, "sine", 0.045);
    } else if (kind === "grab") {
      tone(390, 0, 0.09, "sine", 0.045); tone(520, 0.035, 0.09, "sine", 0.035);
    } else if (kind === "return") {
      tone(360, 0, 0.08, "sine", 0.025); tone(300, 0.055, 0.11, "triangle", 0.018);
    } else if (kind === "snap") {
      tone(620, 0, 0.07, "sine", 0.035); tone(830, 0.035, 0.1, "sine", 0.025);
    } else if (kind === "arrive") {
      tone(660, 0, 0.16, "sine", 0.055); tone(880, 0.08, 0.2, "sine", 0.055);
    } else if (kind === "wrong") {
      tone(260, 0, 0.12, "sine", 0.035);
    } else if (kind === "fanfare") {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.3, "triangle", 0.06); });
    }
  }

  K.audio = {
    unlock: unlock,
    play: play,
    toggle: function () {
      muted = !muted;
      return muted;
    },
    isMuted: function () { return muted; }
  };
}());
