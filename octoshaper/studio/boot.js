// Runs before the studio, as a classic script so that it works in browsers too old for
// the studio's modules. It checks what the studio needs and, if something is missing or
// the studio fails while starting, replaces the loading screen with a plain explanation
// instead of a blank page. app.js calls window.octoBoot.done() once it is running.
(function () {
  'use strict';
  var started = false, shown = false;

  function webgl2() {
    try { var c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
  }
  function storage() {
    try { var k = 'octo.probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }

  var missing = [];
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') missing.push('WebAssembly');
  if (!('noModule' in document.createElement('script'))) missing.push('JavaScript modules');
  if (typeof Promise === 'undefined' || !Promise.allSettled || !Object.fromEntries || !String.prototype.matchAll) missing.push('a recent JavaScript');
  var gl = webgl2();
  if (!gl) missing.push('WebGL 2');

  var BROWSERS = 'OctoShaper Studio works in recent versions of Chrome, Edge, Firefox and Safari (16.4 or later) on a desktop or laptop.';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function show(title, html) {
    if (shown) return;
    shown = true;
    var go = function () {
      var el = document.getElementById('boot');
      if (!el) return;
      el.className = 'boot boot-failed';
      el.innerHTML = '<img class="boot-logo" src="logo.svg" alt="">' +
        '<h1>' + esc(title) + '</h1>' + html +
        '<p class="boot-links"><a href="https://curioustrove.com/octoshaper/">About OctoShaper</a> · ' +
        '<a href="https://curioustrove.itch.io/octoshaper/community" target="_blank" rel="noopener">Ask on the forum</a></p>';
      document.body.classList.add('boot-stopped');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }

  function unsupported() {
    var why = missing.indexOf('WebGL 2') >= 0 && missing.length === 1
      ? '<p>Your browser has WebGL 2 turned off or not available, and the 3D view needs it. It can be off when hardware acceleration is disabled in the browser’s settings, on some virtual machines, or with old graphics drivers.</p>'
      : '<p>This browser is missing ' + esc(missing.join(', ')) + ', which the studio needs.</p>';
    show('This browser can’t run OctoShaper Studio', why + '<p>' + BROWSERS + '</p>');
  }

  function failed(e) {
    if (started) return;
    var msg = e && (e.message || e.reason && (e.reason.message || e.reason)) || e;
    show('OctoShaper Studio could not start',
      '<p>Something went wrong while loading the studio. Reloading the page usually fixes it; if it keeps happening, try another browser.</p>' +
      '<p class="boot-detail">' + esc(String(msg || 'unknown error').slice(0, 300)) + '</p>' +
      '<p><button type="button" onclick="location.reload()">Reload</button></p>' +
      '<p class="boot-small">' + BROWSERS + '</p>');
  }

  window.octoBoot = {
    ok: missing.length === 0,
    missing: missing,
    storage: storage(),
    done: function () {
      started = true;
      var el = document.getElementById('boot');
      if (el && !shown) el.remove();
    },
    fail: failed,
  };

  if (missing.length) { unsupported(); return; }
  window.addEventListener('error', function (e) { if (!started) failed(e.error || e); });
  window.addEventListener('unhandledrejection', function (e) { if (!started) failed(e.reason); });
  // a very slow connection: say that it is still coming
  setTimeout(function () {
    if (started || shown) return;
    var t = document.querySelector('#boot .boot-text');
    if (t) t.textContent = 'Still loading OctoShaper Studio… this takes longer on a slow connection.';
  }, 12000);
})();
