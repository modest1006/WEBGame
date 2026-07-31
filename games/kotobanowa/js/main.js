(function () {
  "use strict";
  function start() {
    window.Kotobanowa.icons.init();
    window.Kotobanowa.renderer.init();
    window.Kotobanowa.input.init();
    if (new URLSearchParams(location.search).get("debug") === "1") {
      document.getElementById("debug-overlay").classList.remove("hidden");
    }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); }
  else { start(); }
}());
