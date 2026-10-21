/* global document */
// Next and Back for the tour. Nothing is stored and nothing is sent anywhere. Without this script
// the page is a plain scrolling list of the same panels.
(function () {
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  var steps = document.querySelector(".steps");
  var count = document.getElementById("count");
  var back = document.getElementById("back");
  var next = document.getElementById("next");
  var i = 0;
  document.documentElement.classList.add("js");
  steps.hidden = false;
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
