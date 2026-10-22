/* global document */
// Next and Back, and the Computer / Tablet / Phone list for the tour. Colours follow the visitor's own setting.
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
  var pick = document.getElementById("device");
  pick.parentNode.hidden = false;
  pick.addEventListener("change", function () {
    root.setAttribute("data-device", pick.value);
  });
  // boot.js already chose the first view; this only shows it in the list.
  pick.value = root.getAttribute("data-device");
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
  // Each screen with prepared pictures: tap a numbered area to open the next prepared picture or
  // read a one-line note. Every tap lands on a picture the page already holds.
  panels.forEach(function (panel) {
    var figs = Array.prototype.slice.call(panel.querySelectorAll(".shot[data-state]"));
    var walk = panel.querySelector(".walk");
    if (!figs.length || !walk) return;
    var prompt = walk.querySelector(".prompt");
    var prev = walk.querySelector(".prev");
    var skip = walk.querySelector(".skip");
    var current = figs[0].getAttribute("data-state");
    var history = [];
    function open(state) {
      current = state;
      var said = null;
      figs.forEach(function (f) {
        var on = f.getAttribute("data-state") === state;
        f.classList.toggle("cur", on);
        if (on && said === null) said = f.getAttribute("data-prompt");
      });
      prompt.textContent = said || "";
      prev.hidden = history.length === 0;
    }
    walk.hidden = false;
    open(current);
    panel.addEventListener("click", function (e) {
      var hot = e.target.closest ? e.target.closest(".hot") : null;
      if (!hot) return;
      var to = hot.getAttribute("data-go");
      var say = hot.getAttribute("data-say");
      if (to === "next") show(i + 1);
      else if (to) {
        history.push(current);
        open(to);
      } else if (say) prompt.textContent = say;
    });
    prev.addEventListener("click", function () {
      if (history.length) open(history.pop());
    });
    skip.addEventListener("click", function () {
      show(i + 1);
    });
  });
  // The arrow keys belong to the device list and to anything being typed in; browser shortcuts such
  // as Alt+Left are left alone too.
  function keepsKeys(t) {
    var tag = t && t.tagName;
    return (
      tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" || !!(t && t.isContentEditable)
    );
  }
  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (keepsKeys(e.target)) return;
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
