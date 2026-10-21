/* global document */
// Next and Back, the Computer / Tablet / Phone switch and the Light / Dark toggle for the tour.
// The choices live only in this page: nothing is stored and nothing is sent anywhere. Without this
// script the page is a plain scrolling list of the same panels with every size shown.
(function () {
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  var steps = document.querySelector(".steps");
  var count = document.getElementById("count");
  var back = document.getElementById("back");
  var next = document.getElementById("next");
  var i = 0;
  var root = document.documentElement;
  steps.hidden = false;
  var deviceButtons = Array.prototype.slice.call(document.querySelectorAll("button[data-device]"));
  var themeButtons = Array.prototype.slice.call(document.querySelectorAll("button[data-theme]"));
  document.querySelector(".switch").hidden = false;
  function setDevice(d) {
    root.setAttribute("data-device", d);
    deviceButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-device") === d));
    });
  }
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    themeButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme") === t));
    });
  }
  deviceButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      setDevice(b.getAttribute("data-device"));
    });
  });
  themeButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      setTheme(b.getAttribute("data-theme"));
    });
  });
  // boot.js already chose the first view; this only marks the buttons.
  setDevice(root.getAttribute("data-device"));
  setTheme(root.getAttribute("data-theme"));
  function show(n) {
    i = Math.max(0, Math.min(panels.length - 1, n));
    panels.forEach(function (p, k) {
      p.classList.toggle("on", k === i);
    });
    count.textContent = i + 1 + " of " + panels.length;
    back.disabled = i === 0;
    next.disabled = i === panels.length - 1;
  }
  back.addEventListener("click", function () {
    show(i - 1);
  });
  next.addEventListener("click", function () {
    show(i + 1);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") show(i + 1);
    if (e.key === "ArrowLeft") show(i - 1);
  });
  var x0 = null;
  document.addEventListener("touchstart", function (e) {
    x0 = e.touches[0].clientX;
  });
  document.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (dx < -50) show(i + 1);
    if (dx > 50) show(i - 1);
  });
  show(0);
})();
