/* global document, window */
// Runs first, before the page is drawn, so only the picture for the chosen size and colours is
// requested. The first view follows the screen width and the visitor's colour setting. Nothing is
// stored and nothing is sent anywhere.
(function () {
  var root = document.documentElement;
  var width = window.innerWidth;
  root.classList.add("js");
  root.setAttribute("data-device", width < 700 ? "phone" : width <= 1100 ? "tablet" : "computer");
  root.setAttribute(
    "data-theme",
    window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
})();
