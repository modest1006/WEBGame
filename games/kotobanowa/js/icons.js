(function () {
  "use strict";
  var K = window.Kotobanowa = window.Kotobanowa || {};
  var canvases = {}, urls = {}, images = {};

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fillStroke(ctx, fill, stroke, width) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  }

  function circle(ctx, x, y, radius, fill, stroke, width) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    fillStroke(ctx, fill, stroke, width);
  }

  function drawShirobai(canvas) {
    var ctx = canvas.getContext("2d");
    var ink = "#202938", navy = "#1e4d82", blue = "#3b82c4";
    ctx.clearRect(0, 0, 256, 256);
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    circle(ctx, 62, 190, 31, ink, ink, 4);
    circle(ctx, 62, 190, 18, "#dbe7f0", ink, 7);
    circle(ctx, 62, 190, 6, blue, ink, 4);
    circle(ctx, 196, 190, 31, ink, ink, 4);
    circle(ctx, 196, 190, 18, "#dbe7f0", ink, 7);
    circle(ctx, 196, 190, 6, blue, ink, 4);

    ctx.strokeStyle = navy; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(62, 188); ctx.lineTo(111, 142); ctx.lineTo(156, 188);
    ctx.lineTo(196, 188); ctx.moveTo(111, 142); ctx.lineTo(174, 142); ctx.stroke();

    roundedRect(ctx, 31, 112, 72, 48, 11);
    fillStroke(ctx, "#f9fbff", ink, 8);
    roundedRect(ctx, 52, 92, 29, 17, 7);
    fillStroke(ctx, "#ef404d", ink, 6);
    ctx.fillStyle = "#ff9aa1";
    roundedRect(ctx, 58, 96, 14, 5, 2); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(65, 151);
    ctx.quadraticCurveTo(91, 126, 124, 128);
    ctx.lineTo(151, 106);
    ctx.quadraticCurveTo(184, 104, 203, 130);
    ctx.lineTo(221, 147);
    ctx.quadraticCurveTo(228, 157, 213, 166);
    ctx.lineTo(102, 168);
    ctx.quadraticCurveTo(76, 169, 65, 151);
    ctx.closePath();
    fillStroke(ctx, "#f8fbff", ink, 9);

    ctx.strokeStyle = blue; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(80, 151); ctx.quadraticCurveTo(137, 144, 205, 151); ctx.stroke();
    ctx.strokeStyle = "#8fc7ec"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(111, 133); ctx.quadraticCurveTo(151, 117, 184, 124); ctx.stroke();

    roundedRect(ctx, 92, 107, 67, 20, 9);
    fillStroke(ctx, "#27313e", ink, 6);
    roundedRect(ctx, 107, 147, 55, 31, 9);
    fillStroke(ctx, "#dfe8ef", ink, 7);
    circle(ctx, 136, 162, 8, "#f8fbff", ink, 4);

    ctx.strokeStyle = "#dfe8ef"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(188, 131); ctx.lineTo(199, 187); ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(181, 116); ctx.lineTo(210, 114); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(112, 83); ctx.quadraticCurveTo(130, 72, 151, 82);
    ctx.lineTo(164, 118); ctx.lineTo(112, 118); ctx.closePath();
    fillStroke(ctx, navy, ink, 8);
    ctx.strokeStyle = "#f8fbff"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(124, 87); ctx.lineTo(137, 113); ctx.stroke();
    ctx.strokeStyle = navy; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(148, 88); ctx.lineTo(177, 114); ctx.lineTo(196, 113); ctx.stroke();
    circle(ctx, 197, 113, 7, "#f2c7a5", ink, 4);

    circle(ctx, 136, 59, 26, "#f3c49d", ink, 8);
    ctx.beginPath();
    ctx.arc(136, 54, 29, Math.PI, Math.PI * 2);
    ctx.lineTo(164, 61);
    ctx.quadraticCurveTo(139, 68, 108, 59);
    ctx.closePath();
    fillStroke(ctx, "#f8fbff", ink, 8);
    ctx.beginPath();
    ctx.moveTo(114, 54); ctx.quadraticCurveTo(138, 47, 160, 55);
    ctx.lineTo(156, 64); ctx.quadraticCurveTo(136, 59, 116, 64); ctx.closePath();
    fillStroke(ctx, "#70b6df", ink, 5);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(126, 39, 10, 5, -0.25, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(150, 132, 18, 5, -0.18, 0, Math.PI * 2); ctx.fill();
  }

  function init() {
    if (urls.shirobai) { return; }
    var canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    drawShirobai(canvas);
    canvases.shirobai = canvas;
    urls.shirobai = canvas.toDataURL("image/png");
    var image = new Image();
    image.src = urls.shirobai;
    images.shirobai = image;
  }

  function createImage(name) {
    init();
    if (!urls[name]) { return null; }
    var image = document.createElement("img");
    image.className = "word-icon";
    image.src = urls[name];
    image.alt = "";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    return image;
  }

  K.icons = {
    init: init,
    createImage: createImage,
    dataURL: function (name) { init(); return urls[name] || null; },
    getImage: function (name) { init(); return images[name] || null; },
    getCanvas: function (name) { init(); return canvases[name] || null; }
  };
}());
